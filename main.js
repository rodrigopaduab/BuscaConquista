'use strict';

const { app, BrowserWindow, ipcMain, shell, safeStorage, Menu, net, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createCache } = require('./src/cache');
const { createConfigStore } = require('./src/config');
const { createSteamClient, SteamError } = require('./src/steam');
const { nullCache } = require('./src/cache');
const { isTheme } = require('./src/themes');
const { classifyAuto, categoryOf, isValidOverride, CATEGORIES } = require('./src/classify');
const { parseHltbText, pickMatch } = require('./src/hltb');
const guidesLib = require('./src/guides');
const translateLib = require('./src/translate');
const settingsLib = require('./src/settings');
const crypto = require('crypto');
const { DATE_SCRIPT } = require('./src/page-scripts');

// Modo de desenvolvimento (testes automáticos e capturas de tela). Nunca ativo no uso normal.
const DEV_MOCK = process.env.BUSCACONQUISTA_MOCK === '1';

let win = null;
let config;
let steam;
let cache; // dados que podem ser refeitos (pasta cache)
let store; // dados SEUS (correções e tempos digitados): pasta meus-dados, que a limpeza do cache não apaga
let steamFetch = globalThis.fetch;
let rawCacheRef = null; // cache sem as regras de configuração (usado ao fechar e para limpar)
let settingsMemo = null;

const NOTES_MAX = 8000;
const notesKey = (id) => `anotacoes/${id}`;
const notesOf = (id) => (store && (store.getStale(notesKey(id)) || {}).notes) || {};
/** O arquivo do cache (ex.: guias3/2054970) pertence a um jogo que tem anotações? */
function hasNotesFor(key) {
  const k = cacheSummary.parseKey(key);
  return !!(k.appid && store && Object.keys(notesOf(k.appid)).length);
}

/* ---------- registro de diagnóstico (Configurações > Ferramentas) ---------- */

const diagLines = [];
let dataDirPath = '';
function dlog(kind, text) {
  const line = `${new Date().toISOString()} [${kind}] ${String(text).slice(0, 400)}`;
  diagLines.push(line);
  if (diagLines.length > 1500) diagLines.splice(0, diagLines.length - 1500);
  try { if (dataDirPath && settingsMemo && settingsMemo.diagMode) fs.appendFile(path.join(dataDirPath, 'diagnostico.log'), line + '\n', () => {}); } catch (_) { /* sem disco: segue */ }
}

/* ---------- limites do cache ---------- */

const KIND_FRESH = { percent: ['steam/percent'], library: ['steam/library'], hltb: ['hltb'], guides: ['guias3', 'guias-web'], maps: ['mapas'], dlc: ['dlc4', 'origens-web2', 'origens-web3'] };
let setsSincePrune = 0;

/** Passou do limite de espaço: apaga os jogos usados há mais tempo (menos os que têm anotações) e depois o que não é de jogo. */
function pruneCache(rawCache, maxMb) {
  const limit = maxMb * 1048576;
  const entries = rawCache.list();
  let total = entries.reduce((n, e) => n + e.bytes, 0);
  if (total <= limit) return 0;
  const units = new Map();
  for (const e of entries) {
    const k = cacheSummary.parseKey(e.key);
    const id = k.appid ? 'g' + k.appid : 'x' + e.key;
    if (k.appid && Object.keys(notesOf(k.appid)).length) continue;
    const u = units.get(id) || { keys: [], bytes: 0, lastAt: 0 };
    u.keys.push(e.key); u.bytes += e.bytes; u.lastAt = Math.max(u.lastAt, e.savedAt || 0);
    units.set(id, u);
  }
  let removed = 0;
  for (const u of [...units.values()].sort((a, b) => a.lastAt - b.lastAt)) {
    if (total <= limit) break;
    for (const key of u.keys) rawCache.remove(key);
    total -= u.bytes; removed += u.keys.length;
  }
  return removed;
}

/* ---------- lixeira de anotações (30 dias) ---------- */

const TRASH_DAYS = 30;
const trashKey = (id) => `lixeira/${id}`;
function trashPush(id, apiName, text) {
  const cur = store.getStale(trashKey(id)) || { items: [] };
  const now = Date.now();
  const items = [{ apiName, text, at: now }, ...cur.items.filter((x) => x.apiName !== apiName)].filter((x) => now - x.at < TRASH_DAYS * 864e5).slice(0, 100);
  store.set(trashKey(id), { items });
}
function trashAll() {
  const now = Date.now();
  const out = [];
  for (const e of store.list()) {
    const m = /^lixeira\/(\d+)$/.exec(e.key);
    if (!m) continue;
    for (const it of (e.value && e.value.items) || []) if (now - it.at < TRASH_DAYS * 864e5) out.push({ appid: Number(m[1]), ...it });
  }
  return out.sort((a, b) => b.at - a.at);
}

function setup() {
  // Pasta do programa: Documentos\BuscaConquistaCache
  // Pasta de dados: a escolhida em Configurações (guardada em local.json, fora da pasta de dados), ou Documentos\BuscaConquistaCache.
  let chosen = null;
  try { const p = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'local.json'), 'utf8')); if (p && typeof p.dataDir === 'string' && fs.existsSync(p.dataDir)) chosen = p.dataDir; } catch (_) { /* sem escolha */ }
  const dataDir = process.env.BUSCACONQUISTA_DATA_DIR || chosen || path.join(app.getPath('documents'), 'BuscaConquistaCache');
  dataDirPath = dataDir;
  config = createConfigStore({ dir: dataDir, safeStorage });
  const rawCache = createCache(path.join(dataDir, 'cache'));
  store = createCache(path.join(dataDir, 'meus-dados'));
  // Jogos com anotações suas ficam guardados no cache pelo dobro do tempo.
  // Regras de cache (Configurações > Cache): não salvar, duração, "sempre atualizar" e limite de espaço.
  cache = {
    ...rawCache,
    get: (key, ttl) => {
      const cfg = loadSettings();
      const kind = cacheSummary.parseKey(key).kind;
      if (cfg.alwaysFresh.some((k) => (KIND_FRESH[k] || []).includes(kind))) return undefined;
      const scaled = ttl == null ? ttl : (ttl * cfg.cacheDays) / 30;
      return rawCache.get(key, hasNotesFor(key) ? scaled * 2 : scaled);
    },
    set: (key, value) => {
      const cfg = loadSettings();
      if (cfg.noCache) return undefined;
      const r = rawCache.set(key, value);
      if (cfg.cacheMaxMb && ++setsSincePrune >= 15) { setsSincePrune = 0; try { pruneCache(rawCache, cfg.cacheMaxMb); } catch (_) { /* tenta de novo depois */ } }
      return r;
    },
  };
  rawCacheRef = rawCache;

  if (DEV_MOCK) {
    steamFetch = require('./dev/mock-steam').createMockFetch();
    if (!config.getPublic().configured) {
      config.save({ steamId: '76561198000000001', profileInput: 'rodrigo', personaName: 'Rodrigo (teste)', avatar: '', apiKey: 'MOCKKEY' });
    }
  }

  steam = createSteamClient({ fetch: steamFetch, getApiKey: () => config.getApiKey(), cache });
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      if (err instanceof SteamError) return { ok: false, error: { code: err.code, message: err.message } };
      console.error(err);
      dlog('erro', `${channel}: ${err && err.message}`);
      return { ok: false, error: { code: 'UNKNOWN', message: 'Erro inesperado: ' + (err && err.message) } };
    }
  });
}

function requireSteamId() {
  const id = config.getSteamId();
  if (!id) throw new SteamError('NOT_CONFIGURED', 'Faça o login primeiro.');
  return id;
}

/**
 * Abre uma página numa janela escondida (como um navegador de verdade, então sites montados com JavaScript funcionam)
 * e devolve o texto visível, os links e o título. waitFor: expressão regular que indica "página pronta".
 */
const blockedSessions = new Set();

/** Nas janelas escondidas só carregamos o próprio site (HTML e scripts dele): sem propaganda, imagens, fontes ou rastreadores. */
function limitThirdParty(ses) {
  if (blockedSessions.has(ses)) return;
  blockedSessions.add(ses);
  const root = (host) => host.split('.').slice(-2).join('.');
  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      if (details.resourceType === 'mainFrame') return callback({});
      if (['image', 'media', 'font', 'ping'].includes(details.resourceType)) return callback({ cancel: true });
      const target = new URL(details.url);
      const from = new URL(details.frame ? details.frame.url : details.referrer || details.url);
      callback({ cancel: root(target.hostname) !== root(from.hostname) && !/^data:|^blob:/.test(details.url) });
    } catch (_) {
      callback({});
    }
  });
}

/**
 * Abre uma página numa janela escondida (como um navegador de verdade, então sites montados com JavaScript funcionam)
 * e devolve o texto visível, os links e o título. waitFor: expressão regular que indica "página pronta".
 * Se algo falhar, devolve { ok: false, reason } para o diagnóstico.
 */
const cacheSummary = require('./src/cache-summary');
const originLib = require('./src/origin');
const { cleanGameName } = require('./src/names');
const originSearch = require('./src/origin-search');
const originWeb = require('./src/origin-web');
const mapsLib = require('./src/maps');
const updaterLib = require('./src/updater');
const APP_VERSION = require('./package.json').version; // a versão do código em uso (a de uma atualização baixada, se for o caso)
const pageWindows = new Set();
let searchGen = 0;

async function getPageText(url, opts = {}) {
  const t0 = Date.now();
  const r = await getPageTextRaw(url, opts);
  dlog('pagina', `${url} -> ${r && r.ok ? `ok (${String(r.text || '').length} letras)` : 'falhou: ' + ((r && (r.reason || (r.antiBot && 'anti-robô'))) || '?')} ${Date.now() - t0} ms`);
  return r;
}

async function getPageTextRaw(url, { waitFor = null, timeoutMs = 30000, partition = 'persist:paginas', extract = null, names = null } = {}) {
  if (!/^https:\/\//i.test(url)) return { ok: false, reason: 'endereço inválido' };
  if (DEV_MOCK) return require('./dev/mock-pages').getPage(url, { names });
  const w = acquirePageWindow(partition);
  pageWindows.add(w);
  let loadError = '';
  try {
    w.loadURL(url).catch((err) => { loadError = String(err && err.message || err); });
    const deadline = Date.now() + timeoutMs;
    let page = null;
    let challengeSince = 0;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 300));
      if (w.isDestroyed()) break;
      try {
        page = await w.webContents.executeJavaScript(`({
          ready: document.readyState,
          title: document.title || '',
          text: document.body ? document.body.innerText.slice(0, 600000) : '',
          links: [...document.querySelectorAll('a[href]')].slice(0, 800).map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 120) })),
        })`);
      } catch (_) { continue; }
      if (guidesLib.isAntiBotPage(page)) {
        challengeSince = challengeSince || Date.now();
        if (Date.now() - challengeSince > 12000) return { ok: false, antiBot: true, reason: 'o site pede verificação anti-robô' };
        continue;
      }
      challengeSince = 0;
      if (waitFor ? waitFor.test(page.text) : (page.text.length > 1500 && page.ready !== 'loading')) break;
    }
    if (!page) return { ok: false, reason: loadError || 'a página não respondeu' };
    let extra = null;
    if (extract) { try { extra = await w.webContents.executeJavaScript(extract); } catch (err) { extra = null; } }
    let dateInfo = null;
    try { dateInfo = await w.webContents.executeJavaScript(DATE_SCRIPT); } catch (_) { dateInfo = null; }
    return { ok: true, ...page, extra, date: dateInfo && dateInfo.date || null, dateKind: dateInfo && dateInfo.kind || null };
  } finally {
    pageWindows.delete(w);
    releasePageWindow(partition, w);
  }
}

/** Janelas escondidas reaproveitadas: abrir uma janela nova a cada página custa ~1–2 s. */
const idleWindows = new Map();
function acquirePageWindow(partition) {
  const idle = idleWindows.get(partition);
  idleWindows.delete(partition);
  if (idle && !idle.isDestroyed()) return idle;
  const w = new BrowserWindow({
    show: false, width: 1100, height: 800,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition, backgroundThrottling: false },
  });
  limitThirdParty(w.webContents.session);
  try { w.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); } catch (_) { /* versão sem suporte */ }
  return w;
}
function releasePageWindow(partition, w) {
  if (w.isDestroyed()) return;
  if (idleWindows.has(partition)) { w.destroy(); return; }
  w.loadURL('about:blank').catch(() => {});
  idleWindows.set(partition, w);
}
/** Deixa uma janela pronta desde o início, para a primeira busca não ficar parada. */
function prewarmPageWindow() {
  if (DEV_MOCK) return;
  try { const w = acquirePageWindow('persist:paginas'); w.loadURL('about:blank').catch(() => {}); idleWindows.set('persist:paginas', w); } catch (_) { /* sem pré-aquecer */ }
}

/** Fecha as páginas escondidas abertas pela busca (usado ao reiniciar). */
function cancelPageLoads() {
  searchGen += 1;
  for (const w of idleWindows.values()) { try { w.destroy(); } catch (_) { /* ok */ } }
  idleWindows.clear();
  for (const w of [...pageWindows]) { try { if (!w.isDestroyed()) w.destroy(); } catch (_) { /* já fechou */ } }
  pageWindows.clear();
}

/** Procura o tempo no HowLongToBeat (a página de busca monta os resultados com JavaScript). */
async function lookupHltb(name) {
  if (!name) return { error: 'sem nome' };
  if (DEV_MOCK) return { name, story: 31.5, extra: 56.5, full: 94, approx: false, source: 'HowLongToBeat' };
  const page = await getPageText('https://howlongtobeat.com/?q=' + encodeURIComponent(name), { waitFor: /Main Story|We Found 0|No results/i, partition: 'persist:hltb' });
  const match = page && page.ok ? pickMatch(parseHltbText(page.text), name) : null;
  if (!match) return { error: 'Não encontrado no HowLongToBeat.' };
  return { ...match, source: 'HowLongToBeat' };
}

const imageMemo = new Map();

/** Baixa uma imagem pelo processo principal (sem as regras da página) e devolve como data URL, com diagnóstico. */
async function fetchImageFor(urls) {
  const tried = [];
  for (const raw of Array.isArray(urls) ? urls.slice(0, 10) : []) {
    let u;
    try { u = new URL(String(raw)); } catch (_) { continue; }
    if (u.protocol !== 'https:' || !/(^|\.)(steamstatic\.com|akamaihd\.net|steamcommunity\.com|steampowered\.com)$/.test(u.hostname)) continue;
    if (imageMemo.has(u.href)) return { ok: true, dataUrl: imageMemo.get(u.href), url: u.href, tried };
    try {
      const res = await net.fetch(u.href);
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) { tried.push(`${u.hostname}: HTTP ${res.status} ${type}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 2_000_000) { tried.push(`${u.hostname}: grande demais`); continue; }
      const dataUrl = `data:${type};base64,${buf.toString('base64')}`;
      if (imageMemo.size >= 40) imageMemo.delete(imageMemo.keys().next().value); // não deixa a memória crescer sem limite
      imageMemo.set(u.href, dataUrl);
      return { ok: true, dataUrl, url: u.href, tried };
    } catch (err) {
      tried.push(`${u.hostname}: ${err && err.message}`);
    }
  }
  return { ok: false, tried };
}

/** Manda o andamento da pesquisa de guias para a tela (barra de progresso com os sites). */
const sendProgress = (appid, evt) => { try { if (win && !win.isDestroyed()) win.webContents.send('guides:progress', { appid, ...evt }); } catch (_) { /* janela fechando */ } };
const MOCK_DELAY = Number(process.env.BUSCACONQUISTA_MOCK_DELAY || 0);
const slowGetPage = (url, opts) => (MOCK_DELAY ? new Promise((r) => setTimeout(r, MOCK_DELAY)).then(() => getPageText(url, opts)) : getPageText(url, opts));

const loadSettings = () => settingsMemo || (settingsMemo = settingsLib.sanitize(store.getStale('configuracoes/fontes') || settingsLib.DEFAULTS));
const saveSettings = (v) => { const clean = settingsLib.sanitize(v); store.set('configuracoes/fontes', clean); settingsMemo = clean; return clean; };
const cleanName = (n) => cleanGameName(n, loadSettings().ignoreWords);
/** Guarda se cada fonte/site funcionou na última vez (aparece em Configurações). */
function recordStatus(key, found) {
  const st = loadSettings();
  const prev = st.status[key] || { found: 0, fail: 0, at: 0 };
  st.status[key] = found > 0 ? { found, fail: 0, at: Date.now() } : { found: prev.found, fail: prev.fail + 1, at: Date.now() };
  const keys = Object.keys(st.status);
  if (keys.length > 80) delete st.status[keys[0]];
  saveSettings(st);
}

function registerIpc() {
  ipcMain.handle('image:fetch', (_e, urls) => fetchImageFor(urls));
  // Capa do jogo: pergunta à loja da Steam qual é o endereço real da imagem (jogos novos usam um caminho com código).
  ipcMain.handle('game:cover', async (_e, appid) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, tried: ['jogo inválido'] };
    const urls = [];
    if (!DEV_MOCK) {
      try {
        const res = await net.fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&l=english`);
        const json = await res.json();
        const info = json && json[id] && json[id].data;
        if (info && info.header_image) urls.push(info.header_image);
        if (info && info.capsule_image) urls.push(info.capsule_image);
      } catch (_) { /* segue para os endereços fixos */ }
    }
    for (const host of ['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'shared.cloudflare.steamstatic.com']) {
      urls.push(`https://${host}/store_item_assets/steam/apps/${id}/header.jpg`);
    }
    urls.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`, `https://cdn.akamai.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`);
    return fetchImageFor(urls);
  });
  handle('config:get', () => ({ ...config.getPublic(), version: APP_VERSION }));

  handle('config:save', async ({ profile, apiKey } = {}) => {
    const key = String(apiKey || '').trim() || config.getApiKey();
    if (!key) throw new SteamError('MISSING_KEY', 'Informe a chave da Steam Web API.');
    // Valida tudo ANTES de salvar, usando a chave digitada e sem gravar cache.
    const probe = createSteamClient({ fetch: steamFetch, getApiKey: () => key, cache: nullCache });
    const steamId = await probe.resolveSteamId(profile);
    const summary = await probe.getPlayerSummary(steamId);
    await probe.getOwnedGames(steamId); // falha com PRIVATE_PROFILE se os jogos não forem públicos
    config.save({
      steamId,
      profileInput: String(profile || '').trim(),
      personaName: summary.personaName,
      avatar: summary.avatar,
      apiKey: String(apiKey || '').trim() || undefined,
    });
    return config.getPublic();
  });

  handle('config:setTheme', (theme) => {
    if (!isTheme(theme)) throw new SteamError('BAD_INPUT', 'Tema inválido.');
    config.setTheme(theme);
    return config.getPublic();
  });

  handle('games:last', async () => {
    const steamId = requireSteamId();
    const games = await steam.getOwnedGames(steamId);
    return { game: await steam.getLastPlayed(steamId), libraryCount: games.length };
  });

  handle('games:search', async (query) => {
    const res = await steam.searchGames(requireSteamId(), String(query || ''));
    if (!loadSettings().hideDemos) return res;
    const junk = /\b(demo|playtest|beta test|dedicated server|sdk|soundtrack|ost|benchmark|level editor|mod tools|authoring tools|server)\b/i;
    return { library: res.library.filter((g) => !junk.test(g.name)), store: res.store.filter((g) => !junk.test(g.name)) };
  });

  handle('game:load', async (appid) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    const game = await steam.loadGame(requireSteamId(), id);
    // O nome do esquema às vezes é interno ("Charm", "ValveTestApp72850"): prefere o nome da sua biblioteca, senão o da loja.
    if (!DEV_MOCK) {
      let real = null;
      try { const owned = await steam.getOwnedGames(requireSteamId()); const g = owned.find((o) => o.appid === id); if (g && g.name && !/^App \d+$/i.test(g.name)) real = g.name; } catch (_) { /* segue */ }
      if (!real) {
        const key = `nomes/${id}`;
        real = cache.get(key, 90 * 24 * 3600 * 1000);
        if (!real) {
          try {
            const res = await net.fetch(`https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic&l=english`);
            const json = await res.json();
            real = json && json[id] && json[id].data && json[id].data.name;
            if (real) cache.set(key, real);
          } catch (_) { /* fica com o nome da Steam API */ }
        }
      }
      if (real) game.name = real;
    }
    const classDoc = store.getStale(`classificacoes/${id}`) || {};
    const overrides = classDoc.overrides || {};
    const origins = classDoc.origins || {};
    const notes = notesOf(id);
    game.achievements = game.achievements.map((a) => {
      const auto = classifyAuto(a);
      const override = Object.prototype.hasOwnProperty.call(overrides, a.apiName) ? overrides[a.apiName] : null;
      return { ...a, auto, override, note: notes[a.apiName] || '', originOverride: origins[a.apiName] || null, category: categoryOf(auto, override) };
    });
    game.searchName = cleanName(game.name);
    return game;
  });

  // Guias da internet: trechos por conquista + palpite de categoria (guardado por 30 dias).
  handle('guides:load', async ({ appid, name: rawName, achievements } = {}) => {
    const name = cleanName(rawName);
    const gen = searchGen;
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0 || !Array.isArray(achievements)) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    const list = achievements.slice(0, 600).map((a) => ({ apiName: String(a.apiName), nameEn: String(a.nameEn || ''), namePt: String(a.namePt || ''), descEn: String(a.descEn || ''), descPt: String(a.descPt || '') }));
    const key = `guias3/${id}`;
    if (!loadSettings().powerpyx) return { sources: [], byAchievement: {}, attempts: ['PowerPyx desligado em Configurações'] };
    let built = cache.get(key, 30 * 24 * 3600 * 1000);
    if (built && (!built.sv || built.sv < 3 || !built.summaries || built.summaries.some((x) => x.v !== guidesLib.SUMMARY_VERSION))) built = null; // guardado antes dos resumos (ou com regra antiga): busca de novo
    if (!built) {
      const attempts = [];
      built = await guidesLib.buildGuides({ game: { appid: id, name: String(name || '') }, achievements: list, getPage: (url, opts) => slowGetPage(url, opts), attempts, onProgress: (e) => { if (gen === searchGen) sendProgress(id, e); } });
      built.attempts = attempts;
      attempts.forEach((a) => dlog('guia', a));
      console.log('[guias]', JSON.stringify(attempts));
      built.sv = 3; // 3 = sem trechos que são só raridade (Prata, Gold...)
      if (gen === searchGen) recordStatus('powerpyx', built.sources.length);
      if (built.sources.length && gen === searchGen) cache.set(key, built); // não guarda "nada encontrado" (pode ser falha de internet)
    }
    const byAchievement = {};
    for (const a of list) {
      const entry = built.byAchievement[a.apiName];
      if (!entry) continue;
      const guideOrigin = entry.snippets.map((x) => originLib.sectionOrigin(x.section, name)).find(Boolean) || null;
      const keep = entry.snippets.filter(guidesLib.usefulSnippet);
      if (!keep.length) continue;
      byAchievement[a.apiName] = { snippets: keep.map(({ text, ...rest }) => rest), guideOrigin, ...guidesLib.combineClassification(a, { snippets: keep }) };
    }
    return { sources: built.sources, byAchievement, attempts: built.attempts || [], summaries: built.summaries || [] };
  });

  // Outras fontes: para conquistas sem explicação completa, busca na web (guardado por 30 dias; "nada achado" por 3).
  handle('guides:fallback', async ({ appid, name: rawName, targets, needSummary: askSummary } = {}) => {
    const name = cleanName(rawName);
    const gen = searchGen;
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0 || !Array.isArray(targets)) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    const key = `guias-web/${id}`;
    const saved = cache.getStale(key) || { found: {}, tried: {} };
    saved.summaries = (saved.summaries || []).filter((x) => x.v === guidesLib.SUMMARY_VERSION); // descarta resumos da regra antiga
    for (const [api, arr] of Object.entries(saved.found || {})) { // descarta trechos antigos que são só raridade (Prata, Gold...) e refaz a busca dessas conquistas
      const keep = (arr || []).filter(guidesLib.usefulSnippet);
      if (keep.length) saved.found[api] = keep; else { delete saved.found[api]; if (saved.tried) delete saved.tried[api]; }
    }
    const now = Date.now();
    const list = targets.slice(0, 600).map((t) => ({ apiName: String(t.apiName), nameEn: String(t.nameEn || ''), needsSearch: !!t.needsSearch, optional: !!t.optional, descEn: String(t.descEn || '').slice(0, 400) }));
    const todo = list.filter((t) => !saved.found[t.apiName] && !(saved.tried[t.apiName] && now - saved.tried[t.apiName] < 3 * 24 * 3600 * 1000));
    const attempts = [];
    const blockedNow = [];
    const cfg = loadSettings();
    const customOn = cfg.custom.filter((c) => c.enabled);
    if (!cfg.web && !customOn.length) return { byAchievement: {}, attempts: ['Busca em outras fontes desligada em Configurações'] };
    const needSummary = !!askSummary && !(saved.summaries || []).length && !(saved.summaryTried && now - saved.summaryTried < 3 * 24 * 3600 * 1000);
    if (todo.length || needSummary) { // conquistas já obtidas (optional) só aproveitam as páginas dos sites preferidos e das fontes do usuário
      const variants = guidesLib.nameVariants(String(name || '')).slice(0, 3);
      const seeds = [];
      for (const c of customOn) for (const url of settingsLib.expandTemplate(c.template, { appid: id }, variants, guidesLib.slugify)) seeds.push({ url, label: c.name, id: c.id });
      const result = await guidesLib.webFallback({
        game: { appid: id, name: String(name || '') }, targets: todo, needSummary, attempts, seeds, blocked: cfg.blocked, useSearch: cfg.web, preferred: settingsLib.PREFERRED.filter((p) => !cfg.preferredOff.includes(p.host)), maxPages: 8 + seeds.length + 4,
        getPage: (url, opts) => slowGetPage(url, opts), onProgress: (e) => { if (gen === searchGen) sendProgress(id, e); },
        onResult: (api, sn) => { (saved.found[api] = saved.found[api] || []).push({ ...sn, text: undefined }); },
      });
      if (needSummary && !(result.summaries || []).length) saved.summaryTried = now;
      saved.summaries = [...(saved.summaries || []).filter((x) => !(result.summaries || []).some((y) => y.url === x.url)), ...(result.summaries || [])];
      // status por fonte personalizada e por site
      for (const c of customOn) recordStatus(c.id, (result.pagesLog || []).filter((p) => seeds.some((sd) => sd.id === c.id && sd.url === p.url)).reduce((n, p) => n + p.found, 0));
      for (const p of result.pagesLog || []) { if (!seeds.some((sd) => sd.url === p.url)) { try { recordStatus(new URL(p.url).hostname.replace(/^www\./, ''), p.found); } catch (_) { /* ignora */ } } }
      // sites com verificação anti-robô: vão sozinhos para os bloqueados (e a fonte própria é desligada)
      for (const host of result.antiBotHosts || []) {
        const st = loadSettings();
        if (settingsLib.isDefaultBlocked(host) || st.blocked.includes(host)) continue;
        st.blocked.push(host);
        st.autoBlocked.push({ host, at: Date.now() });
        st.custom = st.custom.map((c) => (c.template.includes(host) ? { ...c, enabled: false } : c));
        saveSettings(st);
        blockedNow.push(host);
      }
      if (gen === searchGen) { for (const t of todo) saved.tried[t.apiName] = now; cache.set(key, saved); } // busca cancelada não grava
      console.log('[guias-web]', JSON.stringify(attempts));
    }
    const byAchievement = {};
    for (const t of list) if (saved.found[t.apiName]) byAchievement[t.apiName] = saved.found[t.apiName];
    attempts.forEach((a) => dlog('guia', a));
    return { byAchievement, attempts, blockedNow, summaries: saved.summaries || [] };
  });

  handle('settings:get', () => loadSettings());
  // Rascunho: devolve as configurações já validadas, sem gravar (o botão Salvar grava).
  handle('settings:sanitize', (data) => {
    const cur = loadSettings();
    const next = { ...settingsLib.sanitize(data), status: cur.status };
    next.autoBlocked = cur.autoBlocked.filter((a) => next.blocked.includes(a.host));
    return next;
  });
  // Padrão de fábrica: mantém só o histórico de sites que o programa mesmo escreve.
  handle('settings:reset', () => {
    const cur = loadSettings();
    return saveSettings({ ...settingsLib.sanitize({}), status: cur.status, autoBlocked: [] });
  });
  handle('settings:save', (data) => {
    const cur = loadSettings();
    const next = { ...settingsLib.sanitize(data), status: cur.status }; // o status só é escrito pelo programa
    next.autoBlocked = cur.autoBlocked.filter((a) => next.blocked.includes(a.host)); // tirou da lista -> deixa de ser automático
    return saveSettings(next);
  });
  // Limpa só o que pode ser refeito (guias, traduções, tempos, nomes); as suas correções ficam.
  // Tela de Cache: o que está salvo (por jogo) e apagar. Nunca mexe em "meus-dados" (suas correções e configurações).
  handle('cache:list', () => {
    const sum = cacheSummary.summarize(cache.list());
    for (const g of sum.games) g.notes = Object.keys(notesOf(g.appid)).length;
    return sum;
  });
  handle('cache:delete', (scope = {}) => {
    const keys = cacheSummary.keysFor(cache.list(), scope);
    for (const k of keys) cache.remove(k);
    return { removed: keys.length };
  });
  // Rádio GameFM (AzuraCast): o que está tocando agora. Consulta curta e guardada por 15 s.
  let radioLast = { at: 0, data: null };
  handle('radio:now', async () => {
    if (radioLast.data && Date.now() - radioLast.at < 15000) return radioLast.data;
    try {
      const res = await net.fetch('https://azura12.instainternet.com/api/nowplaying/gamefm');
      const j = await res.json();
      const song = (j && j.now_playing && j.now_playing.song) || {};
      const data = { title: String(song.title || '').slice(0, 120), artist: String(song.artist || '').slice(0, 120), listeners: Number(j && j.listeners && j.listeners.current) || 0 };
      radioLast = { at: Date.now(), data };
      return data;
    } catch (_) { return radioLast.data || { title: '', artist: '', listeners: 0 }; }
  });


  // ---------- lixeira ----------
  handle('trash:list', () => {
    const names = new Map();
    for (const e of cache.list()) {
      const k = cacheSummary.parseKey(e.key);
      if (k.kind === 'steam/schema' && e.value && e.value.gameName) names.set(k.appid, String(e.value.gameName));
      if (k.kind === 'nomes' && typeof e.value === 'string') names.set(k.appid, e.value);
    }
    return trashAll().map((t) => ({ ...t, game: names.get(t.appid) || `Jogo ${t.appid}` }));
  });
  handle('trash:restore', ({ appid, apiName } = {}) => {
    const id = Number(appid);
    const cur = store.getStale(trashKey(id)) || { items: [] };
    const item = cur.items.find((x) => x.apiName === apiName);
    if (!item) throw new SteamError('NOT_FOUND', 'Essa anotação não está mais na lixeira.');
    const notes = { ...notesOf(id) };
    if (!notes[apiName]) notes[apiName] = item.text; else notes[apiName] += '\n\n' + item.text;
    store.set(notesKey(id), { notes });
    const items = cur.items.filter((x) => x.apiName !== apiName);
    if (items.length) store.set(trashKey(id), { items }); else store.remove(trashKey(id));
    return { ok: true };
  });
  handle('trash:empty', () => { for (const e of store.list()) if (e.key.startsWith('lixeira/')) store.remove(e.key); return { ok: true }; });

  // ---------- exportar / importar seus dados ----------
  handle('data:export', async () => {
    const entries = store.list().filter((e) => /^(anotacoes|classificacoes|lixeira)\//.test(e.key) || e.key === 'configuracoes/fontes')
      .map((e) => ({ key: e.key, value: e.key === 'configuracoes/fontes' ? { ...e.value, status: {}, autoBlocked: [] } : e.value }));
    const file = await dialog.showSaveDialog(win, { title: 'Exportar meus dados', defaultPath: path.join(app.getPath('documents'), `BuscaConquista-meus-dados-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'Dados do BuscaConquista', extensions: ['json'] }] });
    if (file.canceled || !file.filePath) return { canceled: true };
    fs.writeFileSync(file.filePath, JSON.stringify({ app: 'BuscaConquista', version: 1, exportedAt: new Date().toISOString(), entries }, null, 2));
    return { path: file.filePath, count: entries.length };
  });
  handle('data:import', async () => {
    const pick = await dialog.showOpenDialog(win, { title: 'Importar meus dados', properties: ['openFile'], filters: [{ name: 'Dados do BuscaConquista', extensions: ['json'] }] });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    let data;
    try { data = JSON.parse(fs.readFileSync(pick.filePaths[0], 'utf8')); } catch (_) { throw new SteamError('BAD_FILE', 'Não consegui ler esse arquivo.'); }
    if (!data || data.app !== 'BuscaConquista' || !Array.isArray(data.entries)) throw new SteamError('BAD_FILE', 'Esse arquivo não é uma exportação do BuscaConquista.');
    let merged = 0;
    for (const e of data.entries.slice(0, 5000)) {
      if (!e || typeof e.key !== 'string' || !e.value || typeof e.value !== 'object') continue;
      const key = e.key;
      if (key === 'configuracoes/fontes') { const cur = loadSettings(); saveSettings({ ...e.value, status: cur.status, autoBlocked: cur.autoBlocked }); merged += 1; continue; }
      const m = /^(anotacoes|classificacoes|lixeira)\/(\d+)$/.exec(key);
      if (!m) continue;
      const cur = store.getStale(key) || {};
      const plain = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
      if (m[1] === 'anotacoes') {
        const add = {};
        for (const [k, v] of Object.entries(plain(e.value.notes)).slice(0, 700)) if (typeof v === 'string' && v.trim()) add[String(k).slice(0, 120)] = v.slice(0, NOTES_MAX);
        store.set(key, { notes: { ...(cur.notes || {}), ...add } });
      } else if (m[1] === 'classificacoes') {
        const ov = {}; const og = {};
        for (const [k, v] of Object.entries(plain(e.value.overrides)).slice(0, 700)) if (isValidOverride(v)) ov[String(k).slice(0, 120)] = v;
        for (const [k, v] of Object.entries(plain(e.value.origins)).slice(0, 700)) if (typeof v === 'string' && v.trim() && v.length <= 80) og[String(k).slice(0, 120)] = v.trim();
        store.set(key, { ...cur, overrides: { ...(cur.overrides || {}), ...ov }, origins: { ...(cur.origins || {}), ...og } });
      } else {
        const items = (Array.isArray(e.value.items) ? e.value.items : []).filter((x) => x && typeof x.apiName === 'string' && typeof x.text === 'string').map((x) => ({ apiName: x.apiName.slice(0, 120), text: x.text.slice(0, NOTES_MAX), at: Number(x.at) || Date.now() }));
        store.set(key, { items: [...items, ...(cur.items || [])].filter((x, i, a) => a.findIndex((y) => y.apiName === x.apiName) === i).slice(0, 100) });
      }
      merged += 1;
    }
    return { merged, settings: loadSettings() };
  });

  // ---------- pasta de dados ----------
  handle('data:info', () => ({ dir: dataDirPath, isDefault: !fs.existsSync(path.join(app.getPath('userData'), 'local.json')) }));
  handle('data:chooseDir', async () => {
    const pick = await dialog.showOpenDialog(win, { title: 'Escolher a pasta dos dados (ex.: dentro do OneDrive)', properties: ['openDirectory', 'createDirectory'] });
    if (pick.canceled || !pick.filePaths[0]) return { canceled: true };
    const target = path.join(pick.filePaths[0], 'BuscaConquistaDados');
    if (path.resolve(target) === path.resolve(dataDirPath)) return { canceled: true };
    fs.mkdirSync(target, { recursive: true });
    // copia tudo o que é seu (perfil, anotações, correções); o cache é refeito sozinho na nova pasta
    for (const name of fs.readdirSync(dataDirPath)) {
      if (name === 'cache' || name === 'diagnostico.log') continue;
      fs.cpSync(path.join(dataDirPath, name), path.join(target, name), { recursive: true, force: false, errorOnExist: false });
    }
    fs.writeFileSync(path.join(app.getPath('userData'), 'local.json'), JSON.stringify({ dataDir: target }));
    return { dir: target, restart: true };
  });
  handle('data:resetDir', () => { try { fs.rmSync(path.join(app.getPath('userData'), 'local.json'), { force: true }); } catch (_) { /* ok */ } return { restart: true }; });
  handle('app:relaunch', () => { app.relaunch(); app.exit(0); return true; });

  // ---------- exportar a lista de conquistas que faltam ----------
  handle('export:missing', async ({ game, items, format } = {}) => {
    if (!game || !Array.isArray(items)) throw new SteamError('BAD_INPUT', 'Nada para exportar.');
    const title = String(game).slice(0, 120);
    const safe = title.replace(/[^\w\- ]+/g, '').trim() || 'jogo';
    const rows = items.slice(0, 700).map((i) => ({ name: String(i.name || ''), en: String(i.en || ''), desc: String(i.desc || ''), pct: i.pct == null ? '' : String(i.pct), origin: String(i.origin || ''), cat: String(i.cat || ''), note: String(i.note || '') }));
    const isPdf = format === 'pdf';
    const file = await dialog.showSaveDialog(win, { title: 'Exportar conquistas que faltam', defaultPath: path.join(app.getPath('documents'), `${safe} - conquistas que faltam.${isPdf ? 'pdf' : 'txt'}`), filters: [isPdf ? { name: 'PDF', extensions: ['pdf'] } : { name: 'Texto', extensions: ['txt'] }] });
    if (file.canceled || !file.filePath) return { canceled: true };
    if (!isPdf) {
      const text = [`${title} — conquistas que faltam (${rows.length})`, `Gerado em ${new Date().toLocaleDateString('pt-BR')}`, ''].concat(rows.flatMap((r, n) => [
        `${n + 1}. ${r.name}${r.en && r.en !== r.name ? ` (${r.en})` : ''}${r.origin && r.origin !== 'Jogo base' ? ` [${r.origin}]` : ''}${r.cat ? ` {${r.cat}}` : ''}${r.pct ? ` - ${r.pct}%` : ''}`,
        r.desc ? `   ${r.desc}` : null, r.note ? `   Minha anotação: ${r.note.replace(/\n/g, '\n   ')}` : null, '']).filter((x) => x !== null)).join('\n');
      fs.writeFileSync(file.filePath, text, 'utf8');
      return { path: file.filePath };
    }
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:12pt Segoe UI,Arial,sans-serif;color:#111;margin:0}h1{font-size:18pt;margin:0 0 4px}.sub{color:#555;margin-bottom:16px}.it{break-inside:avoid;border-bottom:1px solid #ccc;padding:8px 0}.n{font-weight:700}.m{color:#555;font-size:10pt}.note{background:#f3f0d8;padding:4px 8px;margin-top:4px;white-space:pre-wrap}</style><h1>${esc(title)}</h1><div class="sub">${rows.length} conquistas que faltam · ${new Date().toLocaleDateString('pt-BR')}</div>${rows.map((r, n) => `<div class="it"><div class="n">${n + 1}. ${esc(r.name)}${r.en && r.en !== r.name ? ` <span class="m">(${esc(r.en)})</span>` : ''}</div><div class="m">${[r.origin && r.origin !== 'Jogo base' ? r.origin : '', r.cat, r.pct ? r.pct + '% dos jogadores' : ''].filter(Boolean).map(esc).join(' · ')}</div>${r.desc ? `<div>${esc(r.desc)}</div>` : ''}${r.note ? `<div class="note">Minha anotação: ${esc(r.note)}</div>` : ''}</div>`).join('')}`;
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    try {
      await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const pdf = await w.webContents.printToPDF({ pageSize: 'A4', margins: { marginType: 'default' } });
      fs.writeFileSync(file.filePath, pdf);
    } finally { w.destroy(); }
    return { path: file.filePath };
  });

  // ---------- testar conexões e relatório de diagnóstico ----------
  handle('diag:test', async () => {
    const checks = [
      ['Steam (API)', 'https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/'],
      ['Steam (loja)', 'https://store.steampowered.com/api/appdetails?appids=220&filters=basic'],
      ['Steam (comunidade)', 'https://steamcommunity.com/'],
      ['HowLongToBeat', 'https://howlongtobeat.com/'],
      ['PowerPyx', 'https://www.powerpyx.com/', 'page'],
      ['Exophase', 'https://www.exophase.com/', 'page'],
      ['Bing (buscas)', 'https://www.bing.com/', 'page'],
      ['Google Tradutor', 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=hello'],
      ['Rádio GameFM (informações)', 'https://azura12.instainternet.com/api/nowplaying/gamefm'],
      ['Rádio GameFM (som)', 'https://azura12.instainternet.com/listen/gamefm/radio.mp3'],
    ];
    // sites que o programa lê por uma janela de navegador escondida: o teste usa o mesmo caminho (uma consulta simples seria barrada por 403 mesmo funcionando no programa)
    const viaPage = async (name, url) => {
      const t0 = Date.now();
      const page = await getPageText(url, { timeoutMs: 15000, waitFor: /./ }).catch(() => null);
      const ms = Date.now() - t0;
      if (page && page.ok) return { name, ok: true, status: 200, ms, note: '' };
      if (page && page.antiBot) return { name, ok: false, status: 403, ms, note: 'pediu verificação anti-robô' };
      return { name, ok: false, status: 0, ms, note: page && page.reason ? String(page.reason).slice(0, 80) : 'não abriu' };
    };
    const one = async ([name, url, via]) => {
      if (via === 'page') return viaPage(name, url);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 10000);
      const t0 = Date.now();
      try {
        const res = await net.fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const ms = Date.now() - t0;
        try { ctl.abort(); } catch (_) { /* não baixa o corpo (a rádio é um fluxo sem fim) */ }
        const ok = res.status >= 200 && res.status < 400;
        const guard = [403, 429, 503].includes(res.status); // costuma ser o site pedindo verificação anti-robô
        return { name, ok, status: res.status, ms, note: ok ? '' : guard ? 'respondeu, mas pode estar bloqueando acesso automático' : 'resposta de erro' };
      } catch (err) {
        return { name, ok: false, status: 0, ms: Date.now() - t0, note: ctl.signal.aborted && Date.now() - t0 >= 9900 ? 'não respondeu em 10 s' : 'sem conexão' };
      } finally { clearTimeout(timer); }
    };
    const results = await Promise.all(checks.map(one));
    for (const r of results) dlog('teste', `${r.name}: ${r.ok ? 'ok' : 'FALHOU'} (${r.status}) ${r.ms} ms ${r.note}`);
    return results;
  });
  handle('diag:report', async () => {
    const cfg = loadSettings();
    const safeCfg = { ...cfg, status: undefined, custom: cfg.custom.map((c) => c.name), blocked: cfg.blocked };
    const head = [
      `BuscaConquista ${APP_VERSION} — relatório de diagnóstico`,
      `Gerado em ${new Date().toISOString()}`,
      `Sistema: ${process.platform} ${process.arch}, Electron ${process.versions.electron}, Chromium ${process.versions.chrome}`,
      `Pasta de dados: ${dataDirPath}`,
      `Configurações (sem chave nem perfil): ${JSON.stringify(safeCfg)}`,
      '', '--- registro recente ---',
    ];
    const file = await dialog.showSaveDialog(win, { title: 'Salvar relatório de diagnóstico', defaultPath: path.join(app.getPath('documents'), `BuscaConquista-diagnostico-${new Date().toISOString().slice(0, 10)}.txt`), filters: [{ name: 'Texto', extensions: ['txt'] }] });
    if (file.canceled || !file.filePath) return { canceled: true };
    fs.writeFileSync(file.filePath, head.concat(diagLines).join('\n'), 'utf8');
    return { path: file.filePath, lines: diagLines.length };
  });

  handle('update:state', () => updateView());
  handle('update:check', async () => { await runUpdateCheck(); return updateView(); });
  handle('update:apply', () => {
    if (updater.getState().status !== 'ready') throw new SteamError('NO_UPDATE', 'Não há atualização pronta.');
    app.relaunch(); app.exit(0); return true;
  });
  handle('app:changelog', () => require('./src/changelog'));
  handle('guides:cancel', () => { cancelPageLoads(); return { ok: true }; });

  // Tradução do texto dos guias (EN -> PT-BR). Cada texto traduzido fica guardado por 90 dias.
  handle('translate:texts', async ({ texts } = {}) => {
    if (!Array.isArray(texts) || texts.length > 200) throw new SteamError('BAD_INPUT', 'Texto inválido.');
    const clean = texts.map((t) => String(t).slice(0, 20000));
    const keys = clean.map((t) => 'traducao/' + crypto.createHash('sha1').update(t).digest('hex'));
    const result = keys.map((k) => cache.get(k, 90 * 24 * 3600 * 1000));
    const todoIdx = result.map((r, i) => (r == null ? i : -1)).filter((i) => i >= 0);
    if (todoIdx.length) {
      const fetchFn = DEV_MOCK ? async (u) => ({ ok: true, json: async () => [[['[PT] ' + decodeURIComponent(u.split('&q=')[1]), '']]] }) : (u) => net.fetch(u);
      let done;
      try { done = await translateLib.translateMany(todoIdx.map((i) => clean[i]), fetchFn); }
      catch (err) { throw new SteamError('TRANSLATE_FAILED', 'Não foi possível traduzir agora (' + String(err.message || err) + ').'); }
      todoIdx.forEach((i, n) => { result[i] = done[n]; cache.set(keys[i], done[n]); });
    }
    return { texts: result };
  });

  // Correção manual (lápis): categoria, 'none' (nenhuma) ou null (voltar ao palpite automático).
  handle('class:set', ({ appid, apiName, value } = {}) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0 || typeof apiName !== 'string' || !apiName) throw new SteamError('BAD_INPUT', 'Conquista inválida.');
    if (!isValidOverride(value)) throw new SteamError('BAD_INPUT', 'Categoria inválida.');
    const key = `classificacoes/${id}`;
    const data = store.getStale(key) || { overrides: {} };
    data.overrides = data.overrides || {};
    if (value === null) delete data.overrides[apiName];
    else data.overrides[apiName] = value;
    store.set(key, data);
    return { ok: true, categories: CATEGORIES };
  });

  // Jogo base x DLCs: (1) DLCs da loja Steam, julgadas por conteúdo jogável x só itens/trilha;
  // (2) site de conquistas (Exophase) que já separa as DLCs; (3) palpites pelo texto. Guardado por 30 dias.
  handle('dlc:list', async ({ appid, name: rawName, achievements } = {}) => {
    const name = cleanName(rawName);
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    const list = (Array.isArray(achievements) ? achievements : []).slice(0, 600).map((a) => ({ apiName: String(a.apiName), nameEn: String(a.nameEn || ''), descEn: String(a.descEn || '') }));
    const TTL = 30 * 24 * 3600 * 1000;
    const finish = (dlcs, web, why) => {
      const playable = dlcs.filter((d) => d.kind !== 'itens');
      const lab = (d) => originLib.dlcLabel(d.name, name);
      const targets = originLib.dlcTargets(playable.filter((d) => !originLib.isPassName(lab(d))), name);
      const origins = {};
      for (const a of list) {
        const o = originLib.detectOrigin(a, targets);
        if (o) origins[a.apiName] = o;
      }
      const webOrigins = web ? web.origins : {};
      // com o site de conquistas, as DLCs são as que ele lista; sem ele, as da loja (sem "Season Pass" e afins)
      const labels = web
        ? [...new Set(Object.values(webOrigins).filter((o) => o !== 'base'))]
        : playable.map(lab).filter((l) => !originLib.isPassName(l));
      return {
        dlcs: labels.map((label) => ({ label })),
        ignored: dlcs.filter((d) => d.kind === 'itens').map(lab),
        withAch: dlcs.filter((d) => d.hasAch).map(lab), // a Steam marca "Steam Achievements" nelas
        origins,
        webOrigins,
        web: web ? { url: web.url, host: 'Exophase' } : null,
        why: web ? [] : (why || []),
      };
    };
    if (DEV_MOCK) {
      const lasts = list.slice(-3);
      const r = finish([{ id: 1, name: `${name} Mock Expansion`, kind: 'jogavel' }, { id: 2, name: `${name} Mock Soundtrack`, kind: 'itens' }], null, ['teste']);
      for (const l of lasts) r.origins[l.apiName] = 'Mock Expansion';
      r.dlcs = [{ label: 'Mock Expansion' }];
      r.ignored = ['Mock Soundtrack'];
      return r;
    }
    const gen = searchGen; // se a busca for reiniciada, esta para de mexer na tela e de gravar
    const step = (label, site) => { if (gen === searchGen) sendProgress(id, { phase: 'dlc', label, site: site || null }); };
    // (1) DLCs da loja Steam (30 dias; só guarda se a loja respondeu)
    const key = `dlc4/${id}`;
    let store = cache.get(key, TTL);
    if (!store) {
      step('Consultando a loja Steam (DLCs do jogo)', 'store.steampowered.com');
      const get = async (appid2) => {
        const res = await net.fetch(`https://store.steampowered.com/api/appdetails?appids=${appid2}&filters=basic,price_overview,categories&cc=us&l=english`);
        const json = await res.json();
        return json && json[appid2] && json[appid2].success ? json[appid2].data : null;
      };
      const dlcs = [];
      let storeOk = false;
      try {
        const data = await get(id);
        storeOk = !!data;
        const ids = ((data && data.dlc) || []).slice(0, 40);
        for (let i = 0; i < ids.length; i += 5) {
          const got = await Promise.all(ids.slice(i, i + 5).map((x) => get(x).catch(() => null)));
          got.forEach((d, j) => {
            if (!d || !d.name) return;
            const hasAch = (d.categories || []).some((c) => c.id === 22); // 22 = Steam Achievements
            const verdict = originLib.classifyDlc({ name: d.name, short: d.short_description || '', priceCents: (d.price_overview && d.price_overview.final) || 0, hasAchievements: hasAch });
            dlcs.push({ id: ids[i + j], name: d.name, kind: verdict.kind, hasAch });
          });
        }
      } catch (_) { storeOk = false; }
      store = { dlcs };
      if (storeOk) cache.set(key, store);
    }
    // (2) site de conquistas que separa por DLC (30 dias se achou; 1 dia se não achou, para tentar de novo logo)
    const wkey = `origens-web2/${id}`;
    let w = cache.get(wkey, TTL);
    if (w && w.v !== 3) w = null; // 3 = nomes de DLC sem o nome do jogo
    if (!w || (!w.web && Date.now() - (w.at || 0) > 24 * 3600 * 1000)) {
      const storeLabels = store.dlcs.filter((d) => d.kind !== 'itens').map((d) => originLib.dlcLabel(d.name, name)).filter((l) => !originLib.isPassName(l));
      let res = null;
      try {
        if (!loadSettings().dlcExophase) throw new Error('desligado');
        step('Consultando o Exophase (conquistas por DLC)', 'exophase.com');
        res = await originWeb.exophaseOrigins({
          name: String(name || ''), achievements: list, storeLabels, getPage: (url, opts) => getPageText(url, opts),
          searchLinks: async (q) => {
            const page = await getPageText('https://www.bing.com/search?q=' + encodeURIComponent(q), { waitFor: /./ });
            return page && page.ok ? guidesLib.candidateLinks(page.links, { skip: [] }) : [];
          },
        });
      } catch (err) { res = { url: null, origins: null, why: [err && err.message === 'desligado' ? 'o Exophase está desligado em Configurações' : 'erro ao consultar o Exophase'] }; }
      w = { at: Date.now(), web: res && res.origins ? { url: res.url, origins: res.origins } : null, why: (res && res.why) || [] };
      if (loadSettings().dlcExophase) cache.set(wkey, { ...w, v: 3 });
    }
    // (3) pesquisa direta na internet: cada site que separa as conquistas por DLC vira um voto (30 dias; 1 dia se nada serviu)
    let found = { votes: {}, log: [] };
    const skey = `origens-web3/${id}`;
    const playableLabels = store.dlcs.filter((d) => d.kind !== 'itens').map((d) => originLib.dlcLabel(d.name, name)).filter((l) => !originLib.isPassName(l));
    if (loadSettings().web && playableLabels.length) {
      const cached = cache.get(skey, TTL);
      if (cached && cached.v === 3 && (Object.keys(cached.votes || {}).length || Date.now() - (cached.at || 0) < 24 * 3600 * 1000)) found = cached;
      else {
        try {
          found = await originSearch.searchOrigins({
            name: String(name || ''), achievements: list, labels: playableLabels,
            skipHosts: [...settingsLib.DEFAULT_BLOCKED.filter((d) => d !== 'bing.com'), ...loadSettings().blocked], onStep: step, shouldStop: () => gen !== searchGen,
            getPage: (url, opts) => getPageText(url, opts),
            searchLinks: async (q) => {
              const page = await getPageText('https://www.bing.com/search?q=' + encodeURIComponent(q), { waitFor: /./ });
              return page && page.ok ? guidesLib.candidateLinks(page.links, { skip: [] }) : [];
            },
          });
          found.at = Date.now(); found.v = 3;
          if (gen === searchGen) cache.set(skey, found);
        } catch (err) { found = { votes: {}, log: ['erro na pesquisa de DLCs: ' + (err && err.message)] }; }
      }
      (found.log || []).forEach((l) => dlog('dlc', l));
    }
    const out = finish(store.dlcs, w.web, [...(w.why || []), ...(found.log || [])]);
    out.webVotes = found.votes || {};
    const extra = [...new Set(Object.values(out.webVotes).flat().map((v) => v.origin).filter((o) => o !== 'base' && o !== 'DLC'))].filter((l) => !out.dlcs.some((d) => d.label === l));
    out.dlcs = [...out.dlcs, ...extra.map((label) => ({ label }))];
    out.searchLog = found.log || [];
    return out;
  });

  // Recalcula as etiquetas (final, dificuldade, perdível, bugada) com todos os guias, inclusive os de reserva.
  handle('class:combine', ({ items } = {}) => {
    const out = {};
    const c = (v, n) => String(v || '').slice(0, n);
    for (const i of (Array.isArray(items) ? items : []).slice(0, 600)) {
      const a = { nameEn: c(i.nameEn, 200), descEn: c(i.descEn, 400), namePt: c(i.namePt, 200), descPt: c(i.descPt, 400) };
      const snippets = (Array.isArray(i.snippets) ? i.snippets : []).slice(0, 12).map((s) => ({
        source: c(s.source, 60), section: c(s.section, 160),
        votes: (Array.isArray(s.votes) ? s.votes : []).filter((v) => CATEGORIES.includes(v)),
        scores: s.scores && typeof s.scores === 'object' ? Object.fromEntries(Object.entries(s.scores).filter(([k, v]) => CATEGORIES.includes(k) && (v === 1 || v === 2))) : undefined,
      }));
      out[c(i.apiName, 120)] = guidesLib.combineClassification(a, { snippets });
    }
    return { classes: out };
  });

  // Votação: o site de conquistas, as seções/títulos de cada guia e o texto da conquista decidem juntos.
  handle('origin:vote', ({ name, labels, items } = {}) => {
    const clean = (v, n) => String(v || '').slice(0, n);
    const list = (Array.isArray(items) ? items : []).slice(0, 600).map((i) => ({
      apiName: clean(i.apiName, 120), nameEn: clean(i.nameEn, 200), descEn: clean(i.descEn, 400), web: i.web ? clean(i.web, 80) : null,
      snippets: (Array.isArray(i.snippets) ? i.snippets : []).slice(0, 12).map((s) => ({ source: clean(s.source, 60), section: clean(s.section, 160), title: clean(s.title, 200) })),
    }));
    const lab = (Array.isArray(labels) ? labels : []).slice(0, 60).map((l) => clean(l, 80));
    return { votes: originLib.voteOrigins(list, { labels: lab, name: cleanName(name) }) };
  });

  // Origem manual da conquista: 'base', o nome de uma DLC ou null (voltar ao automático).
  handle('origin:set', ({ appid, apiName, value } = {}) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0 || typeof apiName !== 'string' || !apiName) throw new SteamError('BAD_INPUT', 'Conquista inválida.');
    if (value !== null && (typeof value !== 'string' || !value.trim() || value.length > 80)) throw new SteamError('BAD_INPUT', 'Origem inválida.');
    const key = `classificacoes/${id}`;
    const data = store.getStale(key) || { overrides: {} };
    data.origins = data.origins || {};
    if (value === null) delete data.origins[apiName]; else data.origins[apiName] = value.trim();
    store.set(key, data);
    return { ok: true };
  });

  // Origem de várias conquistas de uma vez (modo "Organizar").
  handle('origin:setMany', ({ appid, apiNames, value } = {}) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0 || !Array.isArray(apiNames) || !apiNames.length || apiNames.length > 600) throw new SteamError('BAD_INPUT', 'Seleção inválida.');
    if (value !== null && (typeof value !== 'string' || !value.trim() || value.length > 80)) throw new SteamError('BAD_INPUT', 'Origem inválida.');
    const key = `classificacoes/${id}`;
    const data = store.getStale(key) || { overrides: {} };
    data.origins = data.origins || {};
    for (const n of apiNames) {
      if (typeof n !== 'string' || !n) continue;
      if (value === null) delete data.origins[n]; else data.origins[n] = value.trim();
    }
    store.set(key, data);
    return { ok: true, count: apiNames.length };
  });

  // Anotações por conquista (ficam em "meus-dados": não são apagadas ao limpar o cache).
  handle('notes:set', ({ appid, apiName, text } = {}) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0 || typeof apiName !== 'string' || !apiName) throw new SteamError('BAD_INPUT', 'Conquista inválida.');
    const clean = String(text || '').slice(0, NOTES_MAX);
    const notes = { ...notesOf(id) };
    if (!clean.trim() && notes[apiName]) trashPush(id, apiName, notes[apiName]); // apagou a anotação: vai para a lixeira por 30 dias
    if (clean.trim()) notes[apiName] = clean; else delete notes[apiName];
    if (Object.keys(notes).length) store.set(notesKey(id), { notes }); else store.remove(notesKey(id));
    return { count: Object.keys(notes).length };
  });

  // Tempo para zerar: HowLongToBeat (guardado por 30 dias).
  // Mapas interativos: sites de fábrica ligados + os do usuário. Só entram os que têm mapa para o jogo. Guardado por 30 dias.
  handle('map:find', async ({ appid, name: rawName } = {}) => {
    const name = cleanName(rawName);
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    const cfg = loadSettings();
    const variants = guidesLib.nameVariants(String(name || '')).slice(0, 3);
    const sources = [];
    for (const m of settingsLib.MAP_SOURCES.filter((x) => !cfg.mapsOff.includes(x.id))) {
      if (m.template) sources.push({ id: m.id, name: m.label, urls: settingsLib.expandTemplate(m.template, { appid: id }, variants, guidesLib.slugify) });
      else sources.push({ id: m.id, name: m.label, urls: [], search: m.search });
    }
    for (const c of cfg.mapsCustom.filter((x) => x.enabled)) sources.push({ id: c.id, name: c.name, urls: settingsLib.expandTemplate(c.template, { appid: id }, variants, guidesLib.slugify) });
    const sig = sources.map((x) => x.id + ':' + x.urls.join(',')).join('|');
    const key = `mapas/${id}`;
    // Só vale o mapa cujo endereço (ou título) cita o nome do jogo: evita o mapa de outro jogo (ex.: variante de uma palavra só, como "Rebirth").
    const rel = mapsLib.makeRelates(variants);
    const relates = rel.url;
    const titleRelates = rel.title;
    const hit = cache.get(key, 30 * 24 * 3600 * 1000);
    if (hit && hit.sig === sig && hit.v === 5 && (!hit.partial || Date.now() - (hit.at || 0) < 24 * 3600 * 1000)) return { list: hit.list }; // lista incompleta é refeita depois de 1 dia
    if (DEV_MOCK) return { list: [{ name: 'MapGenie', url: 'https://mock-maps.example/a' }, { name: 'IGN Maps', url: 'https://mock-maps.example/b' }, { name: 'Fextralife Mapa', url: 'https://mock-maps.example/c' }] };
    // Mesmo resultado sempre: um site que respondeu "não existe" (404) sai da lista; um que só falhou/recusou agora
    // (internet instável, anti-robô) mantém o que já tinha sido achado antes, em vez de sumir de uma busca para outra.
    const before = new Map((((cache.getStale(key) || {}).list) || []).filter((m) => relates(m.url)).map((m) => [m.name, m]));
    const list = [];
    let unsure = false;
    for (const src of sources) {
      let url = null;
      let srcUnsure = false;
      for (const u of src.urls) {
        try {
          const res = await net.fetch(u, { redirect: 'follow' });
          if (res.status === 200) { if (relates(res.url || u)) { url = u; break; } continue; } // 200 mas mandou para outra página (outro jogo / página inicial): não vale
          if (res.status !== 404) srcUnsure = true;
        } catch (_) { srcUnsure = true; }
      }
      if (!url && srcUnsure && src.urls.length) { // o site recusou a consulta direta: confere pelo título da página
        for (const u of src.urls) {
          const page = await getPageText(u, { timeoutMs: 15000 }).catch(() => null);
          if (page && page.ok) { srcUnsure = false; if (/map|mapa/i.test(page.title || '') && !/not found|404|n[ãa]o encontrad/i.test(page.title || '') && titleRelates(page.title)) { url = u; break; } }
        }
      }
      if (!url && src.search) { // endereço com código: acha pela busca (até 3 formas de perguntar, porque o Bing varia de uma vez para outra)
        const v0 = variants[1] || variants[0];
        const queries = [`${v0} interactive map site:${src.search.host}`, `${v0} interactive maps ${src.search.host}`, `${variants[0] || v0} map site:${src.search.host}`];
        let anyOk = false;
        for (const q of [...new Set(queries)]) {
          const page = await getPageText('https://www.bing.com/search?q=' + encodeURIComponent(q), { waitFor: /./ }).catch(() => null);
          if (page && page.ok) anyOk = true;
          const cands = page && page.ok ? guidesLib.candidateLinks(page.links, { skip: [] }).filter(relates) : [];
          url = cands.find((u) => { try { const x = new URL(u); return (x.hostname === src.search.host || x.hostname.endsWith('.' + src.search.host)) && src.search.path.test(x.pathname); } catch (_) { return false; } }) || null;
          if (url) break;
        }
        srcUnsure = !anyOk;
        if (!url && before.has(src.name)) url = before.get(src.name).url; // um mapa já achado não some: só não foi reencontrado agora
      }
      if (!url && srcUnsure && before.has(src.name)) url = before.get(src.name).url; // falhou agora: mantém o de antes
      if (!url && srcUnsure) unsure = true;
      dlog('mapa', `${src.name}: ${url || (srcUnsure ? 'não consegui conferir' : 'sem mapa para este jogo')}`);
      if (url) list.push({ name: src.name, url });
    }
    const missing = sources.some((x) => x.search && !list.some((m) => m.name === x.name));
    if (!unsure) cache.set(key, { v: 5, sig, list, at: Date.now(), partial: missing }); // com falha de rede não guarda; se um site de busca não foi achado, tenta de novo em 1 dia
    return { list };
  });

  // Página de mods do jogo no Nexus Mods (endereço por jogo: /games/<código>, ex.: skyrimspecialedition, witcher3).
  handle('mods:find', async ({ appid, name: rawName } = {}) => {
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    const fallback = (n) => 'https://www.bing.com/search?q=' + encodeURIComponent(`site:nexusmods.com/games ${n} mods`);
    const nm = String(rawName || '').replace(/[™®©]/g, '').trim();
    const nameForSearch = cleanName(nm) || nm;
    const key = `nexus/${id}`;
    const hit = cache.get(key, 30 * 24 * 3600 * 1000);
    if (hit && hit.v === 1) return hit.data;
    if (DEV_MOCK) return { url: 'https://mock-nexus.example/games/mock', exact: true };
    const ROMAN = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    const code = (t) => String(t || '').replace(/\b(II|III|IV|VI|VII|VIII|IX|V|X)\b/g, (m) => String(ROMAN[m])).replace(/^the\s+/i, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const parts = nm.split(/\s*[:\-–—]\s*/);
    const guesses = [...new Set([code(nm), code(cleanName(nm)), code(parts.slice(1).join(' ')), code(parts[0]), code(String(nameForSearch).split(':')[0])].filter((c) => c.length >= 4))].slice(0, 5);
    let unsure = false;
    for (const g of guesses) {
      const url = `https://www.nexusmods.com/games/${g}`;
      try {
        const res = await net.fetch(url, { redirect: 'follow' });
        if (res.status === 200) { const out = { url, exact: true }; cache.set(key, { v: 1, data: out }); return out; }
        if (res.status !== 404) unsure = true;
      } catch (_) { unsure = true; }
    }
    // a consulta direta falhou ou não achou: procura pela busca e confere pelo endereço
    const page = await getPageText('https://www.bing.com/search?q=' + encodeURIComponent(`site:nexusmods.com/games "${nameForSearch}"`), { waitFor: /./ }).catch(() => null);
    const links = page && page.ok ? guidesLib.candidateLinks(page.links, { skip: [] }) : [];
    const found = links.find((u) => /^https:\/\/www\.nexusmods\.com\/games\/[a-z0-9]+\/?(mods\/?)?$/i.test(u));
    if (found) { const out = { url: found.replace(/\/mods\/?$/, ''), exact: true }; cache.set(key, { v: 1, data: out }); return out; }
    const out = { url: fallback(nameForSearch), exact: false };
    if (!unsure && page && page.ok) cache.set(key, { v: 1, data: out });
    return out;
  });

  handle('time:get', async ({ appid, name: rawName } = {}) => {
    const name = cleanName(rawName);
    const id = Number(appid);
    if (!Number.isInteger(id) || id <= 0) throw new SteamError('BAD_INPUT', 'Jogo inválido.');
    let auto = cache.get(`hltb/${id}`, 30 * 24 * 3600 * 1000) || null;
    if (!auto) {
      auto = await lookupHltb(String(name || '')).catch((err) => ({ error: String(err && err.message) }));
      if (auto && auto.error && rawName && String(rawName) !== name) auto = await lookupHltb(String(rawName)).catch((err) => ({ error: String(err && err.message) })); // última tentativa com o nome completo
      if (auto && !auto.error) cache.set(`hltb/${id}`, auto);
      else auto = auto || { error: 'não encontrado' };
    }
    return { auto };
  });

  handle('shell:open', (url) => {
    // Só abre links https no navegador padrão.
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
    if (DEV_MOCK) {
      console.log('[dev] openExternal ' + url); // nos testes não abrimos o navegador de verdade
      return true;
    }
    shell.openExternal(url);
    return true;
  });
}

/* ---------- atualização automática (código do programa, pelas Releases do GitHub) ---------- */

let updater = null;
let updateEnabled = false;
const updateView = () => ({ ...updater.getState(), current: APP_VERSION, enabled: updateEnabled });
const sendUpdate = () => { try { if (win && !win.isDestroyed()) win.webContents.send('update:state', updateView()); } catch (_) { /* janela fechando */ } };

function setupUpdater() {
  const pkg = require('./package.json');
  updateEnabled = !DEV_MOCK && (app.isPackaged || process.env.BUSCACONQUISTA_UPDATE_TEST === '1');
  updater = updaterLib.createUpdater({
    repo: updateEnabled ? (process.env.BUSCACONQUISTA_UPDATE_REPO || pkg.updateRepo || '') : '',
    currentVersion: APP_VERSION,
    electronMajor: Number(String(process.versions.electron).split('.')[0]),
    dir: path.join(app.getPath('userData'), 'atualizacoes'),
    fetchFn: (url, opts) => net.fetch(url, opts),
    running: global.__buscaRunning || null,
    apiBase: process.env.BUSCACONQUISTA_UPDATE_API || undefined,
  });
}
async function runUpdateCheck() {
  const st = await updater.check({ channel: loadSettings().updateChannel });
  dlog('update', `${st.status}${st.version ? ' ' + st.version : ''}${st.error ? ' — ' + st.error : ''}`);
  sendUpdate();
  return st;
}
function scheduleUpdateChecks() {
  if (!updateEnabled) return;
  const auto = () => { if (loadSettings().autoUpdate) runUpdateCheck().catch(() => {}); };
  setTimeout(auto, 8000);
  setInterval(auto, 6 * 3600 * 1000).unref();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#16202c',
    title: 'BuscaConquista',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // a rádio pode tocar sozinha ao abrir (opção em Configurações)
    },
  });
  // As janelas escondidas de busca também contam como janelas abertas: sem fechá-las, o programa continuaria rodando.
  win.on('closed', () => { win = null; cancelPageLoads(); app.quit(); });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.once('did-finish-load', () => { try { if (typeof global.__buscaBootOk === 'function') global.__buscaBootOk(); } catch (_) { /* sem marcar */ } }); // a atualização abriu bem
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.env.BUSCACONQUISTA_CLOSE_TEST) setTimeout(() => { if (win) win.close(); }, 4000); // teste: fechar a janela sozinha

  if (process.env.BUSCACONQUISTA_SHOTS) {
    win.webContents.once('did-finish-load', () => {
      require('./dev/shots').run(win, process.env.BUSCACONQUISTA_SHOTS).finally(() => app.quit());
    });
  }
}

// O Windows pergunta sobre o firewall quando um programa abre portas de rede para receber conexões. O Chromium faz isso
// sozinho em dois casos: descoberta de dispositivos (Cast/mDNS/SSDP) e WebRTC (as mensagens "stun..." do console).
// O programa não usa nada disso, então desligamos para o aviso não aparecer.
app.commandLine.appendSwitch('disable-features', 'MediaRouter,DialMediaRouteProvider,WebRtcHideLocalIpsWithMdns,CastMediaRouteProvider');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('disable-background-networking');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    setup();
    setupUpdater();
    registerIpc();
    createWindow();
    scheduleUpdateChecks();
    prewarmPageWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    cancelPageLoads();
    try { if (rawCacheRef && loadSettings().clearOnExit) rawCacheRef.clear(''); } catch (_) { /* nada a apagar */ }
  });
}
