'use strict';

/**
 * Separação jogo base / DLC por pesquisa na internet: para cada DLC jogável (lista da loja Steam) procura páginas
 * que listam as conquistas por seção e vê, em cada página, sob qual título cada conquista aparece.
 * Cada site que concorda vira um voto (peso próprio na votação de origin.js).
 */

const { norm, labelIn, isPassName } = require('./origin');

const BASE_HEAD = /\b(base game|main game|vanilla|core game|jogo base)\b/i;
const MAX_HEAD = 90; // título de seção: linha curta

/**
 * Lê o texto de uma página e devolve { origins: {apiName: 'base' | rótulo}, hits }.
 * Título de seção = linha curta (sem nome de conquista) que cita uma DLC da loja ou "base game".
 * Cada conquista fica na seção em que aparece; antes do primeiro título vale "sem seção" (não vota).
 */
function originsFromText(text, achievements, labels) {
  const real = (labels || []).filter((l) => !isPassName(l));
  const names = achievements.map((a) => ({ api: a.apiName, key: norm(a.nameEn) })).filter((n) => n.key.length >= 4);
  const lines = String(text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let section = null;
  const origins = {};
  for (const line of lines) {
    const n = norm(line);
    if (!n) continue;
    const hit = names.find((x) => (' ' + n + ' ').includes(' ' + x.key + ' ') && n.length <= x.key.length + 160);
    if (hit) {
      if (section && !origins[hit.api]) origins[hit.api] = section;
      continue;
    }
    if (line.length > MAX_HEAD) continue;
    const lab = labelIn(line, real);
    if (lab) section = lab;
    else if (BASE_HEAD.test(line)) section = 'base';
  }
  return { origins, hits: Object.keys(origins).length };
}

/** Uma página só vale se ela mesma separa: tem conquistas em pelo menos 2 seções, ou 3+ numa DLC. */
function usable(res, achievements) {
  const vals = Object.values(res.origins);
  const kinds = new Set(vals);
  const enough = res.hits >= Math.max(3, Math.floor(achievements.length * 0.15));
  return enough && (kinds.size >= 2 || (kinds.size === 1 && !kinds.has('base')));
}

/**
 * Pesquisa. getPage(url, opts) lê páginas; searchLinks(q) devolve links de resultados.
 * Devolve { votes: { apiName: [{ src, origin }] }, labels: [...], log: [...] }.
 */
// resultados do próprio buscador (imagens, vídeos, mapas...) não são páginas de conquistas
const ENGINE_HOSTS = ['bing.com', 'microsoft.com', 'msn.com', 'live.com', 'google.com', 'duckduckgo.com'];
const PSN_HOSTS = ['psnprofiles.com', 'playstationtrophies.org', 'truetrophies.com'];
const onHost = (url, list) => { try { const h = new URL(url).hostname.replace(/^www\./, ''); return list.some((x) => h === x || h.endsWith('.' + x)); } catch (_) { return false; } };

async function searchOrigins({ name, achievements, labels, getPage, searchLinks, maxPages = 6, maxQueries = 4, skipHosts = [], psn = true, onStep = () => {}, shouldStop = () => false }) {
  const log = [];
  const votes = {};
  const real = (labels || []).filter((l) => !isPassName(l));
  if (!real.length) return { votes, labels: [], log: ['sem DLCs jogáveis na loja: nada a procurar'] };
  const seen = new Set();
  const hosts = new Set();
  let pages = 0;
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };

  // lê uma página e, se ela separa por DLC, registra o voto (w = peso)
  const readOne = async (url, w) => {
    if (shouldStop()) return;
    const host = hostOf(url);
    seen.add(url);
    pages += 1;
    onStep(`Lendo ${host}`, host);
    const page = await getPage(url, { timeoutMs: 22000 }).catch(() => null);
    if (!page || !page.ok || !page.text) { log.push(`${host}: não abriu`); return; }
    const res = originsFromText(page.text, achievements, real);
    if (!usable(res, achievements)) { log.push(`${host}: não separa por DLC (${res.hits} conquistas achadas)`); return; }
    hosts.add(host);
    log.push(`${host}: separou ${res.hits} conquistas`);
    for (const [api, origin] of Object.entries(res.origins)) (votes[api] = votes[api] || []).push({ src: host, origin, w });
  };

  const stage = async (queries, accept, w, limit) => {
    for (const q of queries) {
      if (pages >= limit || shouldStop()) break;
      onStep(`Pesquisando na internet: ${q.replace(/"/g, '')}`, 'bing.com');
      const links = (await searchLinks(q).catch(() => [])).filter(accept);
      log.push(`busca "${q}": ${links.length} páginas`);
      for (const url of links.slice(0, 4)) {
        const host = hostOf(url);
        if (pages >= limit || shouldStop()) break;
        if (seen.has(url) || hosts.has(host) || skipHosts.some((h) => host === h || host.endsWith('.' + h))) continue;
        await readOne(url, w);
      }
    }
  };

  // 1) pesquisa geral na internet
  const general = [`"${name}" DLC achievements list by DLC`, ...real.slice(0, maxQueries - 1).map((l) => `"${name}" "${l}" achievements`)];
  await stage(general, (u) => !onHost(u, ENGINE_HOSTS) && !/exophase\.com|youtube\.com|reddit\.com|steamcommunity\.com\/(?!stats)/i.test(u), 2, maxPages);

  // 2) secundária: listas de troféus da PlayStation (a Sony separa jogo base e DLC em grupos), só se nada serviu acima
  const psnHosts = PSN_HOSTS.filter((h) => !skipHosts.some((x) => h === x || h.endsWith('.' + x))); // os bloqueados (anti-robô) ficam de fora
  if (psn && !hosts.size && psnHosts.length) {
    log.push('nenhum site separou: tentando as listas de troféus da PlayStation');
    onStep('Nenhum site separou: consultando as listas de troféus da PlayStation', null);
    const psnQ = psnHosts.flatMap((h) => [`"${name}" trophy list ${h.split('.')[0]}`, `site:${h} "${name}" trophies`]);
    await stage(psnQ, (u) => onHost(u, psnHosts) && !onHost(u, ENGINE_HOSTS), 3, pages + 5);
  }
  return { votes, labels: real, log };
}

module.exports = { originsFromText, usable, searchOrigins };
