'use strict';

/**
 * Configurações das fontes de guias (E6). Ficam em "meus-dados" (não são apagadas ao limpar o cache).
 * Tudo que vem da tela passa por sanitize(): só endereços https, tamanhos limitados.
 */
const DEFAULTS = Object.freeze({
  powerpyx: true, // guia principal (tabela de troféus do PowerPyx)
  web: true, // busca em outras páginas pela internet
  translate: true, // traduzir os guias para o português ao abrir
  fontScale: 'normal', // pequena | normal | grande | enorme
  density: 'normal', // compacta | normal | confortavel
  defaultFilter: 'missing', // ao abrir um jogo: missing (não alcançadas) | all
  progressCollapsed: false, // barra de pesquisa começa recolhida
  summaryOpen: false, // resumo para platinar já aberto
  groupDlc: true, // lista separada em caixas por jogo base/DLC
  startView: 'last', // ao abrir o programa: last (último jogo) | search (tela de busca)
  colorIcons: false, // ícones coloridos também nas conquistas não alcançadas
  radioMode: 'never', // never | auto (toca ao abrir) | remember (volta a tocar se estava tocando)
  radioHidden: false, // esconde o player da rádio
  radioPauseMinimized: false, // pausa a rádio ao minimizar
  radioDuck: false, // baixa o volume ao abrir um vídeo (YouTube)
  guideLang: 'pt', // pt | en | both: idioma dos guias
  sourceOrder: [], // ordem de prioridade das fontes de guia (nomes)
  ignoreWords: [], // palavras extras a ignorar nos nomes dos jogos
  dlcExophase: true, // usar o Exophase para separar jogo base/DLC
  autoUpdate: true, // procurar atualizações sozinho
  updateChannel: 'beta', // beta (inclui pré-lançamentos) | stable
  cacheDays: 30, // 7 | 30 | 90
  cacheMaxMb: 0, // 0 = sem limite
  clearOnExit: false, // apaga o cache ao fechar
  alwaysFresh: [], // tipos que nunca usam o cache: percent, library, hltb, guides, maps, dlc
  hideDemos: false, // esconde demos, ferramentas e trilhas na busca
  diagMode: false, // registro detalhado em arquivo
  noCache: false, // true = não guarda mais nada novo no cache (suas anotações e correções continuam salvas)
  custom: [], // [{ id, name, template, enabled }]
  mapsOff: [], // sites de mapas de fábrica que o usuário desligou
  mapsCustom: [], // outros sites de mapa: [{ id, name, template, enabled }]
  preferredOff: [], // sites preferidos que o usuário desligou
  blocked: [], // sites que o usuário não quer usar (além dos bloqueados de fábrica)
  autoBlocked: [], // [{ host, at }] sites bloqueados pelo próprio programa por exigirem verificação anti-robô
  status: {}, // { <id ou site>: { found, fail, at } }
});

/** Sites de guia que o programa consulta primeiro (além do PowerPyx). Testados em páginas reais. */
const PREFERRED = Object.freeze([
  { host: 'ign.com', label: 'IGN Wiki', hint: 'wikis com lista de conquistas e como conseguir' },
  { host: 'gamefaqs.gamespot.com', label: 'GameFAQs', hint: 'guias escritos por jogadores, bem detalhados' },
  { host: 'fextralife.com', label: 'Fextralife Wiki', hint: 'wikis de RPGs, costumam incluir as DLCs' },
  { host: 'game8.co', label: 'Game8', hint: 'lista curta com link para guias específicos' },
  { host: 'gamepressure.com', label: 'Gamepressure', hint: 'guia de troféus completo, com passo a passo' },
  { host: 'strategywiki.org', label: 'StrategyWiki', hint: 'wiki aberta, com tabela de conquistas e descrições' },
  { host: 'progameguides.com', label: 'Pro Game Guides', hint: 'listas de conquistas com dicas diretas' },
  { host: 'gamerant.com', label: 'Game Rant', hint: 'guias de conquistas para jogos recentes' },
  { host: 'fandom.com', label: 'Fandom Wiki', hint: 'wikis de comunidade, muitas com página de conquistas' },
]);

/** Sites de mapas interativos de fábrica. "template" abre direto; "search" acha a página pela busca (endereços com código). */
const MAP_SOURCES = Object.freeze([
  { id: 'mapgenie', label: 'MapGenie', hint: 'mapas interativos com marcadores de itens, chefes e colecionáveis', template: 'https://mapgenie.io/{slug}' },
  { id: 'ign-maps', label: 'IGN Maps', hint: 'mapas interativos da IGN', template: 'https://www.ign.com/maps/{slug}' },
  { id: 'fextralife-map', label: 'Fextralife Mapa', hint: 'mapa interativo da wiki do jogo (RPGs principalmente)', template: 'https://{junto}.wiki.fextralife.com/Interactive+Map' },
  { id: 'gamepressure-map', label: 'Gamepressure Mapas', hint: 'mapas interativos por região', search: { host: 'gamepressure.com', path: /interactive-maps?/i } },
]);

const MAX_CUSTOM = 10;
const MAX_BLOCKED = 50;
const TOKENS = ['{slug}', '{nome}', '{id}', '{junto}'];

/** "https://www.Site.com/abc" -> "site.com" (ou null). */
function normalizeHost(input) {
  let t = String(input || '').trim().toLowerCase();
  if (!t) return null;
  if (!/^https?:\/\//.test(t)) t = 'https://' + t;
  try {
    const host = new URL(t).hostname.replace(/^www\./, '');
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch (_) {
    return null;
  }
}

/** Modelo de endereço: precisa ser https e ter {slug}, {nome} ou {id}. Devolve o modelo limpo ou null. */
function validTemplate(raw) {
  const t = String(raw || '').trim();
  if (t.length > 300 || !/^https:\/\//i.test(t)) return null;
  if (!TOKENS.some((k) => t.includes(k))) return null;
  try {
    const u = new URL(t.replace(/\{slug\}|\{nome\}|\{id\}|\{junto\}/g, 'x'));
    return u.protocol === 'https:' && /\./.test(u.hostname) ? t : null;
  } catch (_) {
    return null;
  }
}

function sanitizeCustom(list) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (out.length >= MAX_CUSTOM) break;
    const template = validTemplate(c && c.template);
    if (!template) continue;
    const name = String(c.name || '').trim().slice(0, 40) || normalizeHost(template.replace(/\{[a-z]+\}/g, 'x')) || 'Fonte';
    const id = String(c.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'f' + Math.random().toString(36).slice(2, 8);
    if (out.some((x) => x.id === id)) continue;
    out.push({ id, name, template, enabled: c.enabled !== false });
  }
  return out;
}

function sanitize(input) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {
    powerpyx: src.powerpyx !== false,
    web: src.web !== false,
    translate: src.translate !== false,
    noCache: src.noCache === true,
    radioMode: ['never', 'auto', 'remember'].includes(src.radioMode) ? src.radioMode : 'never',
    radioHidden: src.radioHidden === true,
    radioPauseMinimized: src.radioPauseMinimized === true,
    radioDuck: src.radioDuck === true,
    guideLang: ['pt', 'en', 'both'].includes(src.guideLang) ? src.guideLang : (src.translate === false ? 'en' : 'pt'),
    sourceOrder: (Array.isArray(src.sourceOrder) ? src.sourceOrder : []).map((x) => String(x).slice(0, 60)).filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 40),
    ignoreWords: (Array.isArray(src.ignoreWords) ? src.ignoreWords : []).map((x) => String(x).replace(/\s+/g, ' ').trim().slice(0, 30)).filter((x, i, a) => x.length >= 2 && a.indexOf(x) === i).slice(0, 30),
    dlcExophase: src.dlcExophase !== false,
    cacheDays: [7, 30, 90].includes(Number(src.cacheDays)) ? Number(src.cacheDays) : 30,
    cacheMaxMb: [0, 100, 250, 500, 1000].includes(Number(src.cacheMaxMb)) ? Number(src.cacheMaxMb) : 0,
    clearOnExit: src.clearOnExit === true,
    alwaysFresh: (Array.isArray(src.alwaysFresh) ? src.alwaysFresh : []).filter((x, i, a) => ['percent', 'library', 'hltb', 'guides', 'maps', 'dlc'].includes(x) && a.indexOf(x) === i),
    autoUpdate: src.autoUpdate !== false,
    updateChannel: src.updateChannel === 'stable' ? 'stable' : 'beta',
    hideDemos: src.hideDemos === true,
    diagMode: src.diagMode === true,
    fontScale: ['pequena', 'normal', 'grande', 'enorme'].includes(src.fontScale) ? src.fontScale : 'normal',
    density: ['compacta', 'normal', 'confortavel'].includes(src.density) ? src.density : 'normal',
    defaultFilter: src.defaultFilter === 'all' ? 'all' : 'missing',
    progressCollapsed: src.progressCollapsed === true,
    summaryOpen: src.summaryOpen === true,
    groupDlc: src.groupDlc !== false,
    startView: src.startView === 'search' ? 'search' : 'last',
    colorIcons: src.colorIcons === true,
    custom: [],
    preferredOff: [],
    blocked: [],
    autoBlocked: [],
    status: {},
  };
  out.translate = out.guideLang !== 'en'; // "translate" continua valendo para o resto do programa
  out.custom = sanitizeCustom(src.custom);
  out.mapsOff = (Array.isArray(src.mapsOff) ? src.mapsOff : []).filter((id, i, a) => MAP_SOURCES.some((m) => m.id === id) && a.indexOf(id) === i);
  if (src.mapgenie === false && !out.mapsOff.includes('mapgenie')) out.mapsOff.push('mapgenie');
  out.mapsCustom = sanitizeCustom(src.mapsCustom);
  for (const h of Array.isArray(src.preferredOff) ? src.preferredOff : []) {
    if (PREFERRED.some((p) => p.host === h) && !out.preferredOff.includes(h)) out.preferredOff.push(h);
  }
  for (const b of Array.isArray(src.blocked) ? src.blocked : []) {
    const h = normalizeHost(b);
    if (h && !isDefaultBlocked(h) && !out.blocked.includes(h) && out.blocked.length < MAX_BLOCKED) out.blocked.push(h); // os de fábrica já valem sempre: não duplica na lista do usuário
  }
  for (const a of Array.isArray(src.autoBlocked) ? src.autoBlocked : []) {
    const h = normalizeHost(a && a.host);
    if (h && !isDefaultBlocked(h) && !out.autoBlocked.some((x) => x.host === h) && out.autoBlocked.length < 30) out.autoBlocked.push({ host: h, at: Number(a.at) || 0 });
  }
  const st = src.status && typeof src.status === 'object' ? src.status : {};
  for (const k of Object.keys(st).slice(0, 80)) {
    const v = st[k] || {};
    out.status[String(k).slice(0, 60)] = { found: Number(v.found) || 0, fail: Number(v.fail) || 0, at: Number(v.at) || 0 };
  }
  return out;
}

/** Endereços de uma fonte personalizada para um jogo: um por variação do nome. */
function expandTemplate(template, game, variants, slugify) {
  const urls = [];
  for (const v of variants) {
    const url = template.replace(/\{slug\}/g, slugify(v)).replace(/\{nome\}/g, encodeURIComponent(v)).replace(/\{junto\}/g, slugify(v).replace(/-/g, '')).replace(/\{id\}/g, String(game.appid || ''));
    if (/^https:\/\//.test(url) && !urls.includes(url) && !/\/\/-|--$/.test(url)) urls.push(url);
  }
  return urls;
}

/** Sites que o programa já bloqueia de fábrica (mantém igual à lista em guides.js). */
const DEFAULT_BLOCKED = ['bing.com', 'microsoft.com', 'google.com', 'youtube.com', 'youtu.be', 'facebook.com', 'x.com', 'twitter.com', 'instagram.com', 'pinterest.com', 'tiktok.com', 'reddit.com', 'steamcommunity.com', 'steampowered.com', 'wikipedia.org', 'trueachievements.com', 'truesteamachievements.com', 'gamerguides.com', 'xboxachievements.com', 'playstationtrophies.org', 'powerpyx.com', 'steamhunters.com', 'psnprofiles.com', 'trophieshunter.com', 'keengamer.com', 'ludo.guide'];
const isDefaultBlocked = (host) => DEFAULT_BLOCKED.some((d) => host === d || host.endsWith('.' + d));

module.exports = { DEFAULT_BLOCKED, isDefaultBlocked, PREFERRED, MAP_SOURCES, DEFAULTS, sanitize, normalizeHost, validTemplate, expandTemplate, MAX_CUSTOM };
