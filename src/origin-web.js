'use strict';

/** Descobre, num site de conquistas (Exophase), quais conquistas pertencem a cada DLC. */

const { norm, groupLabel, matchStoreLabel } = require('./origin');

/** Roda dentro da página: devolve os grupos (jogo base + um por DLC) com os nomes das conquistas. */
const EXTRACT_GROUPS = `(() => {
  const aw = document.getElementById('awards');
  if (!aw) return null;
  const groups = [];
  let cur = { title: '', names: [] };
  groups.push(cur);
  for (const el of aw.children) {
    if (/^H[1-6]$/.test(el.tagName)) { cur = { title: el.innerText.trim(), names: [] }; groups.push(cur); continue; }
    const lis = el.tagName === 'UL' ? el.querySelectorAll(':scope > li') : [];
    for (const li of lis) {
      const n = li.innerText.split('\\n').map((s) => s.trim()).filter(Boolean)[0];
      if (n) cur.names.push(n);
    }
  }
  return { title: document.title, groups };
})()`;

const slugOf = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`´]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const isGameList = (url) => /^https:\/\/www\.exophase\.com\/game\/[a-z0-9-]+-steam\/achievements\/?$/i.test(url);

/** Transforma os grupos do site em { apiName: 'base' | 'Nome da DLC' }. Só vale se o site realmente separa DLCs. */
function originsFromGroups(data, achievements, gameName, storeLabels) {
  const groups = (data && data.groups) || [];
  const dlcGroups = groups.filter((g) => g.title && g.names.length);
  if (!dlcGroups.length) return null;
  const byName = new Map();
  for (const g of groups) {
    const label = g.title ? matchStoreLabel(groupLabel(g.title, gameName), storeLabels) : 'base';
    for (const n of g.names) if (!byName.has(norm(n))) byName.set(norm(n), label);
  }
  const origins = {};
  let hits = 0;
  for (const a of achievements) {
    const o = byName.get(norm(a.nameEn));
    if (o) { origins[a.apiName] = o; hits += 1; }
  }
  return hits >= Math.max(3, Math.floor(achievements.length * 0.5)) ? origins : null; // a lista do site precisa bater com a da Steam
}

/**
 * Procura a página do jogo no Exophase (primeiro pelo endereço esperado, depois por busca) e devolve
 * { url, origins } ou null. getPage(url, opts) é o leitor de páginas do programa.
 */
async function exophaseOrigins({ name, achievements, storeLabels = [], getPage, searchLinks }) {
  const tried = new Set();
  const why = []; // diagnóstico mostrado ao usuário quando não der certo
  const attempt = async (url) => {
    if (tried.has(url)) return null;
    tried.add(url);
    const page = await getPage(url, { extract: EXTRACT_GROUPS, waitFor: /Total Achievements|Achievements Earned/i, timeoutMs: 25000 }).catch(() => null);
    if (!page || !page.ok) { why.push(page && page.antiBot ? 'o Exophase pediu verificação anti-robô' : 'não consegui abrir a página do Exophase'); return null; }
    if (!page.extra) { why.push('a página do Exophase não tem lista de conquistas'); return null; }
    const origins = originsFromGroups(page.extra, achievements, name, storeLabels);
    if (!origins) { why.push('o Exophase não separa as conquistas desse jogo por DLC (ou a lista não bate com a da Steam)'); return null; }
    return { url, origins };
  };
  const slugs = [...new Set([slugOf(name), slugOf(String(name).split(/\s*[:\-–—]\s*/)[0])].filter(Boolean))];
  for (const slug of slugs) {
    const hit = await attempt(`https://www.exophase.com/game/${slug}-steam/achievements/`);
    if (hit) return { ...hit, why };
  }
  const links = (await searchLinks(`site:exophase.com/game "${name}" achievements steam`).catch(() => [])).filter(isGameList).slice(0, 3);
  for (const url of links) {
    const hit = await attempt(url.endsWith('/') ? url : url + '/');
    if (hit) return { ...hit, why };
  }
  return { url: null, origins: null, why: [...new Set(why)].length ? [...new Set(why)] : ['não encontrei o jogo no Exophase'] };
}

module.exports = { EXTRACT_GROUPS, slugOf, isGameList, originsFromGroups, exophaseOrigins };
