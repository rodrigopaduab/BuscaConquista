'use strict';

const { nullCache } = require('./cache');

const API = 'https://api.steampowered.com';
const STORE = 'https://store.steampowered.com';

const HOUR = 60 * 60 * 1000;
const TTL = {
  library: 5 * 60 * 1000, // biblioteca muda quando você joga
  schema: 7 * 24 * HOUR, // nomes/descrições/ícones quase nunca mudam
  percent: 24 * HOUR, // % global atualizada uma vez por dia
};

const RARE_PERCENT = 10; // abaixo disso a Steam destaca em dourado

class SteamError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SteamError';
    this.code = code;
  }
}

/** Aceita link do perfil (/profiles/ID ou /id/apelido), SteamID de 17 dígitos ou apelido. */
function parseProfileInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (/^\d{17}$/.test(text)) return { type: 'id', steamId: text };
  let m = text.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return { type: 'id', steamId: m[1] };
  m = text.match(/steamcommunity\.com\/id\/([A-Za-z0-9_-]{2,32})/i);
  if (m) return { type: 'vanity', vanity: m[1] };
  if (/^[A-Za-z0-9_-]{2,32}$/.test(text)) return { type: 'vanity', vanity: text };
  return null;
}

/** Junta nomes PT/EN, % global e progresso do jogador em uma lista única. */
/**
 * A página pública de conquistas da comunidade Steam traz, dentro do HTML, todas as conquistas com a descrição
 * completa, inclusive as ocultas (que a Web API devolve sem descrição). Devolve { apiName: { name, description, hidden } }.
 */
function parseCommunityAchievements(html) {
  const out = {};
  // O JSON vem dentro de uma string do HTML: aspas de fora = \", aspas de dentro do texto = \\\".
  const text = String(html || '').replace(/\\\\\\"/g, '\u0001').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const un = (v) => JSON.parse('"' + v.replace(/\u0001/g, '\\"') + '"');
  const re = /"api_name":"((?:[^"\\]|\\.)*)","name":"((?:[^"\\]|\\.)*)","description":"((?:[^"\\]|\\.)*)","hidden":(true|false)/g;
  let m;
  while ((m = re.exec(text))) {
    try {
      out[un(m[1])] = { name: un(m[2]), description: un(m[3]), hidden: m[4] === 'true' };
    } catch (_) { /* entrada ilegível: ignora */ }
  }
  return out;
}

function mergeAchievements({ pt = [], en = [], percentages = [], player = [], community = {} }) {
  const ptBy = new Map(pt.map((a) => [a.name, a]));
  const enBy = new Map(en.map((a) => [a.name, a]));
  const pctBy = new Map(percentages.map((p) => [p.name, parseFloat(p.percent)]));
  const plBy = new Map(player.map((p) => [p.apiname, p]));
  const names = [...new Set([...pt.map((a) => a.name), ...en.map((a) => a.name)])];

  const list = names.map((apiName) => {
    const a = ptBy.get(apiName) || {};
    const e = enBy.get(apiName) || {};
    const p = plBy.get(apiName);
    const pct = pctBy.get(apiName);
    return {
      apiName,
      namePt: a.displayName || e.displayName || apiName,
      nameEn: e.displayName || a.displayName || apiName,
      descPt: a.description || ((community.pt || {})[apiName] || {}).description || '',
      descEn: e.description || ((community.en || {})[apiName] || {}).description || '',
      hidden: Boolean(a.hidden || e.hidden),
      icon: a.icon || e.icon || '',
      iconGray: a.icongray || e.icongray || '',
      percent: Number.isFinite(pct) ? pct : null,
      achieved: Boolean(p && Number(p.achieved) === 1),
      unlockTime: p && p.unlocktime ? p.unlocktime : null,
    };
  });

  // Mesma ordem da Steam: mais comuns primeiro; sem % vão para o fim.
  list.sort((x, y) => {
    if (x.percent == null && y.percent == null) return x.namePt.localeCompare(y.namePt, 'pt-BR');
    if (x.percent == null) return 1;
    if (y.percent == null) return -1;
    return y.percent - x.percent || x.namePt.localeCompare(y.namePt, 'pt-BR');
  });
  return list;
}

function summarize(achievements) {
  const total = achievements.length;
  const achieved = achievements.filter((a) => a.achieved).length;
  const remaining = total - achieved;
  const remainingRare = achievements.filter(
    (a) => !a.achieved && a.percent != null && a.percent < RARE_PERCENT
  ).length;
  return { total, achieved, remaining, remainingRare };
}

/** Jogo jogado mais recentemente (usa a data da última sessão; sem data, o mais jogado). */
function pickLastPlayed(games) {
  games = Array.isArray(games) ? games.filter(Boolean) : [];
  const played = games.filter((g) => g.lastPlayed > 0).sort((a, b) => b.lastPlayed - a.lastPlayed);
  if (played.length) return played[0];
  const byTime = games.filter((g) => g.playtimeMinutes > 0).sort((a, b) => b.playtimeMinutes - a.playtimeMinutes);
  return byTime[0] || null;
}

/** Para comparar nomes: sem acento, ™/®, apóstrofo ou pontuação ("Marvel's Spider-Man" -> "marvels spider man"). */
function searchForm(s) {
  return normalizeText(s).replace(/[™®©’'`´]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeText(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function createSteamClient({ fetch: doFetch = globalThis.fetch, getApiKey = () => '', cache = nullCache, timeoutMs = 15000 } = {}) {
  function key() {
    const k = (getApiKey() || '').trim();
    if (!k) throw new SteamError('MISSING_KEY', 'Informe a chave da Steam Web API nas configurações.');
    return encodeURIComponent(k);
  }

  async function request(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    let text;
    try {
      res = await doFetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      text = await res.text();
    } catch (_) {
      throw new SteamError('NETWORK', 'Não foi possível falar com a Steam. Verifique sua conexão e tente de novo.');
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (_) {
      /* resposta que não é JSON (ex.: página HTML de "Forbidden") */
    }
    if (res.status === 429) {
      throw new SteamError('RATE_LIMIT', 'A Steam pediu para aguardar um pouco. Tente novamente em instantes.');
    }
    if (res.status >= 500) {
      throw new SteamError('NETWORK', 'A Steam está instável no momento. Tente novamente em instantes.');
    }
    return { status: res.status, ok: res.ok, json, text };
  }

  const invalidKey = () =>
    new SteamError('INVALID_KEY', 'A Steam não aceitou a chave da API. Confira se ela foi copiada por inteiro.');

  async function resolveSteamId(input) {
    const parsed = parseProfileInput(input);
    if (!parsed) {
      throw new SteamError('BAD_INPUT', 'Não entendi esse perfil. Cole o link do seu perfil Steam ou o SteamID de 17 dígitos.');
    }
    if (parsed.type === 'id') return parsed.steamId;
    const r = await request(
      `${API}/ISteamUser/ResolveVanityURL/v1/?key=${key()}&vanityurl=${encodeURIComponent(parsed.vanity)}`
    );
    if (r.status === 401 || r.status === 403) throw invalidKey();
    const resp = r.json && r.json.response;
    if (!resp) throw new SteamError('NETWORK', 'Resposta inesperada da Steam. Tente novamente.');
    if (resp.success !== 1) throw new SteamError('PROFILE_NOT_FOUND', 'Não encontrei esse perfil na Steam.');
    return resp.steamid;
  }

  async function getPlayerSummary(steamId) {
    const r = await request(`${API}/ISteamUser/GetPlayerSummaries/v2/?key=${key()}&steamids=${steamId}`);
    if (r.status === 401 || r.status === 403) throw invalidKey();
    const players = r.json && r.json.response && r.json.response.players;
    if (!players || !players.length) throw new SteamError('PROFILE_NOT_FOUND', 'Não encontrei esse perfil na Steam.');
    const p = players[0];
    return { steamId: p.steamid, personaName: p.personaname, avatar: p.avatarfull || p.avatar || '' };
  }

  const privateError = () =>
    new SteamError(
      'PRIVATE_PROFILE',
      'Não consegui ver seus jogos. Seu perfil e os detalhes dos jogos precisam estar com a visibilidade Público.'
    );

  async function getOwnedGames(steamId) {
    const cacheKey = `steam/library/${steamId}`;
    const cached = cache.get(cacheKey, TTL.library);
    if (cached) return cached;
    const r = await request(
      `${API}/IPlayerService/GetOwnedGames/v1/?key=${key()}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`
    );
    if (r.status === 401 || r.status === 403) throw invalidKey();
    const resp = r.json && r.json.response;
    if (!resp) throw new SteamError('NETWORK', 'Resposta inesperada da Steam. Tente novamente.');
    // Perfil privado devolve um objeto vazio; perfil público sem jogos devolve game_count: 0.
    if (resp.game_count === undefined) throw privateError();
    const games = (resp.games || []).map((g) => ({
      appid: g.appid,
      name: g.name || `App ${g.appid}`,
      playtimeMinutes: g.playtime_forever || 0,
      lastPlayed: g.rtime_last_played || 0,
    }));
    cache.set(cacheKey, games);
    return games;
  }

  async function storeSearch(term) {
    const one = async (t) => {
      try {
        const r = await request(`${STORE}/api/storesearch/?term=${encodeURIComponent(t)}&l=english&cc=br`);
        return (r.json && r.json.items) || [];
      } catch (_) { return []; }
    };
    // A busca da loja é exigente: tenta o texto como foi digitado, sem pontuação e só com as primeiras palavras.
    const clean = searchForm(term);
    const words = clean.split(' ');
    const variants = [...new Set([term.trim(), clean, words.length > 2 ? words.slice(0, 2).join(' ') : null].filter(Boolean))];
    const lists = await Promise.all(variants.map(one));
    const seen = new Map();
    for (const i of lists.flat()) {
      if (i && i.id && (!i.type || i.type === 'app') && !seen.has(i.id)) seen.set(i.id, { appid: i.id, name: i.name });
    }
    const score = (g) => {
      const n = searchForm(g.name);
      const hits = words.filter((w) => n.includes(w)).length;
      return (n === clean ? 0 : n.startsWith(clean) ? 1 : hits === words.length ? 2 : 3) * 10 + (words.length - hits);
    };
    return [...seen.values()].sort((a, b) => score(a) - score(b));
  }

  async function getSchema(appid, lang) {
    const cacheKey = `steam/schema/${appid}-${lang}`;
    const cached = cache.get(cacheKey, TTL.schema);
    if (cached) return cached;
    const r = await request(`${API}/ISteamUserStats/GetSchemaForGame/v2/?key=${key()}&appid=${appid}&l=${lang}`);
    if (r.status === 401 || r.status === 403) throw invalidKey();
    const game = (r.json && r.json.game) || {};
    const value = {
      gameName: game.gameName || '',
      achievements: (game.availableGameStats && game.availableGameStats.achievements) || [],
    };
    cache.set(cacheKey, value);
    return value;
  }

  /** Descrições das conquistas ocultas, pela página pública da comunidade (guardadas por 7 dias; falhar não é grave). */
  async function getCommunity(appid, lang) {
    const cacheKey = `steam/community/${appid}-${lang}`;
    const cached = cache.get(cacheKey, TTL.schema);
    if (cached) return cached;
    try {
      const res = await doFetch(`https://steamcommunity.com/achievements/${appid}?l=${lang}`, { headers: { Accept: 'text/html' } });
      if (res.status === 429 || res.status >= 500) return cache.getStale(cacheKey) || {};
      const parsed = parseCommunityAchievements(await res.text());
      cache.set(cacheKey, parsed);
      return parsed;
    } catch (_) {
      return cache.getStale(cacheKey) || {};
    }
  }

  async function getPercentages(appid) {
    const cacheKey = `steam/percent/${appid}`;
    const cached = cache.get(cacheKey, TTL.percent);
    if (cached) return cached;
    let list = [];
    try {
      const r = await request(`${API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`);
      list = (r.json && r.json.achievementpercentages && r.json.achievementpercentages.achievements) || [];
    } catch (err) {
      // sem % não é fatal: usa a última versão guardada, se houver
      const stale = cache.getStale(cacheKey);
      if (stale) return stale;
      if (err.code !== 'NETWORK') throw err;
      return [];
    }
    cache.set(cacheKey, list);
    return list;
  }

  async function getPlayerAchievements(steamId, appid) {
    const r = await request(
      `${API}/ISteamUserStats/GetPlayerAchievements/v1/?key=${key()}&steamid=${steamId}&appid=${appid}&l=brazilian`
    );
    const stats = r.json && r.json.playerstats;
    if (r.ok && stats && stats.success && Array.isArray(stats.achievements)) {
      return { available: true, achievements: stats.achievements };
    }
    const message = (stats && stats.error) || '';
    if (/not public/i.test(message)) throw privateError();
    if ((r.status === 401 || r.status === 403) && !stats) throw invalidKey();
    // Jogo que você não tem (ou sem estatísticas): mostramos tudo como "não alcançado".
    return { available: false, achievements: [] };
  }

  async function loadGame(steamId, appid) {
    const [pt, en, percentages, progress] = await Promise.all([
      getSchema(appid, 'brazilian'),
      getSchema(appid, 'english'),
      getPercentages(appid),
      // jogo que você não tem: a Steam às vezes responde "perfil não público"; se a biblioteca abre, o perfil é público e o jogo só não é seu
      getPlayerAchievements(steamId, appid).catch(async (err) => {
        if (!err || err.code !== 'PRIVATE_PROFILE') throw err;
        try { await getOwnedGames(steamId); } catch (_) { throw err; }
        return { available: false, achievements: [] };
      }),
    ]);
    if (!pt.achievements.length && !en.achievements.length) {
      throw new SteamError('NO_ACHIEVEMENTS', 'Este jogo não tem conquistas na Steam.');
    }
    let community = {};
    if ([...pt.achievements, ...en.achievements].some((a) => a.hidden && !a.description)) {
      const [cpt, cen] = await Promise.all([getCommunity(appid, 'brazilian'), getCommunity(appid, 'english')]);
      community = { pt: cpt, en: cen };
    }
    const achievements = mergeAchievements({
      pt: pt.achievements,
      en: en.achievements,
      percentages,
      player: progress.achievements,
      community,
    });
    return {
      appid,
      name: en.gameName || pt.gameName || `App ${appid}`,
      achievements,
      summary: summarize(achievements),
      progressAvailable: progress.available,
    };
  }

  /** Busca por nome: primeiro na sua biblioteca, depois na loja da Steam. */
  async function searchGames(steamId, query) {
    const q = searchForm(query);
    if (q.length < 2) return { library: [], store: [] };
    const qWords = q.split(' ');
    const owned = await getOwnedGames(steamId);
    const library = owned
      .filter((g) => { const n = searchForm(g.name); return qWords.every((w) => n.includes(w)); })
      .sort((a, b) => {
        const sa = searchForm(a.name).startsWith(q) ? 0 : 1;
        const sb = searchForm(b.name).startsWith(q) ? 0 : 1;
        return sa - sb || b.playtimeMinutes - a.playtimeMinutes;
      })
      .slice(0, 8);
    let store = [];
    try {
      const have = new Set(owned.map((g) => g.appid));
      store = (await storeSearch(query)).filter((g) => !have.has(g.appid)).slice(0, 8);
    } catch (_) {
      /* a busca na loja é um bônus: se falhar, mostramos só a biblioteca */
    }
    return { library, store };
  }

  return {
    resolveSteamId,
    getPlayerSummary,
    getOwnedGames,
    getLastPlayed: async (steamId) => pickLastPlayed(await getOwnedGames(steamId)),
    searchGames,
    loadGame,
  };
}

module.exports = {
  SteamError,
  RARE_PERCENT,
  parseProfileInput,
  mergeAchievements,
  parseCommunityAchievements,
  summarize,
  pickLastPlayed,
  normalizeText,
  createSteamClient,
};
