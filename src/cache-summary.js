'use strict';

/** Organiza o que está no cache por jogo, para a tela de Cache. */
const KIND_LABELS = {
  'steam/schema': 'Conquistas e textos da Steam',
  'steam/percent': '% global de jogadores',
  guias3: 'Guias principais (PowerPyx)',
  'guias-web': 'Guias de outros sites',
  hltb: 'Tempo para zerar',
  mapas: 'Mapa interativo',
  nomes: 'Nome do jogo',
  dlc4: 'DLCs do jogo (loja Steam)',
  'origens-web2': 'Divisão jogo base/DLC',
  'origens-web3': 'Divisão jogo base/DLC (pesquisa)',
};

/** "steam/schema/2050650-pt" -> { kind: 'steam/schema', appid: 2050650 }; entradas sem jogo -> { kind, appid: null }. */
function parseKey(key) {
  const parts = String(key).split('/');
  const kind2 = parts.slice(0, 2).join('/');
  if (kind2 === 'steam/schema' || kind2 === 'steam/percent') {
    const m = /^(\d+)/.exec(parts[2] || '');
    return { kind: kind2, appid: m ? Number(m[1]) : null };
  }
  if (kind2 === 'steam/library') return { kind: 'steam/library', appid: null };
  if (parts[0] === 'traducao') return { kind: 'traducao', appid: null };
  if (['guias3', 'guias-web', 'hltb', 'nomes', 'mapas', 'dlc4', 'origens-web2', 'origens-web3'].includes(parts[0]) && /^\d+$/.test(parts[1] || '')) return { kind: parts[0], appid: Number(parts[1]) };
  return { kind: parts[0] || 'outro', appid: null };
}

function summarize(entries) {
  const names = new Map();
  for (const e of entries) {
    const k = parseKey(e.key);
    if (k.kind === 'steam/library' && Array.isArray(e.value)) for (const g of e.value) if (g && g.appid && g.name) names.set(Number(g.appid), String(g.name));
  }
  for (const e of entries) {
    const k = parseKey(e.key);
    if (k.kind === 'nomes' && typeof e.value === 'string' && !names.has(k.appid)) names.set(k.appid, e.value);
  }
  for (const e of entries) {
    const k = parseKey(e.key);
    if (k.kind === 'steam/schema' && e.value && e.value.gameName && !names.has(k.appid)) names.set(k.appid, String(e.value.gameName));
  }
  const games = new Map();
  const shared = { traducao: { count: 0, bytes: 0, savedAt: 0 }, library: { count: 0, bytes: 0, savedAt: 0 }, other: { count: 0, bytes: 0, savedAt: 0 } };
  let bytes = 0;
  for (const e of entries) {
    bytes += e.bytes;
    const k = parseKey(e.key);
    if (k.appid) {
      const g = games.get(k.appid) || { appid: k.appid, name: names.get(k.appid) || `Jogo ${k.appid}`, items: [], bytes: 0, lastAt: 0 };
      g.items.push({ kind: k.kind, label: KIND_LABELS[k.kind] || k.kind, bytes: e.bytes, savedAt: e.savedAt });
      g.bytes += e.bytes;
      g.lastAt = Math.max(g.lastAt, e.savedAt);
      games.set(k.appid, g);
    } else {
      const bucket = k.kind === 'traducao' ? shared.traducao : k.kind === 'steam/library' ? shared.library : shared.other;
      bucket.count += 1; bucket.bytes += e.bytes; bucket.savedAt = Math.max(bucket.savedAt, e.savedAt);
    }
  }
  const list = [...games.values()].sort((a, b) => b.lastAt - a.lastAt);
  for (const g of list) g.items.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return { games: list, shared, bytes, files: entries.length };
}

/** Chaves que pertencem a um grupo de apagar. */
function keysFor(entries, scope) {
  const match = (fn) => entries.filter((e) => fn(parseKey(e.key), e.key)).map((e) => e.key);
  if (scope.type === 'game') return match((k) => k.appid === Number(scope.appid));
  if (scope.type === 'game-guides') return match((k) => k.appid === Number(scope.appid) && ['guias3', 'guias-web', 'origens-web2', 'origens-web3'].includes(k.kind));
  if (scope.type === 'guides') return match((k) => ['guias3', 'guias-web', 'traducao', 'hltb', 'nomes'].includes(k.kind));
  if (scope.type === 'translations') return match((k) => k.kind === 'traducao');
  if (scope.type === 'library') return match((k) => k.kind === 'steam/library');
  if (scope.type === 'all') return match(() => true);
  return [];
}

module.exports = { parseKey, summarize, keysFor, KIND_LABELS };
