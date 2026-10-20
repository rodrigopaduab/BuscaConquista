'use strict';

/** Jogo base x DLCs: palpites a partir da loja Steam, do texto da conquista e das seções dos guias. */

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`´']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const FILLER = new Set(['dlc', 'expansion', 'pack', 'edition', 'bundle', 'season', 'pass', 'content', 'add', 'on', 'addon', 'soundtrack', 'digital', 'deluxe', 'trophies', 'trophy', 'achievements', 'achievement', 'guide', 'list', 'new', 'extra']);

/** "Elden Ring - Shadow of the Erdtree" + "Elden Ring" -> "Shadow of the Erdtree" (texto original, sem o nome do jogo). */
function dlcLabel(dlcName, gameName) {
  const orig = String(dlcName || '').trim();
  let s = orig;
  const g = String(gameName || '').trim();
  const cut = (text, prefix) => { // tira o nome do jogo do começo, ignorando ®/™, apóstrofos, maiúsculas e o tipo de traço
    const want = norm(prefix);
    if (!want) return text;
    let acc = '';
    for (let i = 0; i < text.length; i++) {
      acc += text[i];
      const got = norm(acc);
      if (got === want) return text.slice(i + 1);
      if (got.length > want.length || !want.startsWith(got)) break;
    }
    return text;
  };
  if (g) {
    const clean = (t) => t.replace(/[™®©]/g, '');
    const once = cut(clean(s), g);
    if (once !== clean(s)) s = once;
  }
  s = s.replace(/[™®©]/g, '').replace(/^[\s:\-–—|]+/, '').replace(/\s*\((?:dlc|expansion)\)\s*$/i, '').trim();
  return s || orig;
}

/** Nomes distintivos das DLCs: [{ label, key }] (key = texto normalizado para procurar nas conquistas). */
function dlcTargets(dlcs, gameName) {
  const out = [];
  for (const d of dlcs || []) {
    const label = dlcLabel(d.name, gameName);
    const key = norm(label).split(' ').filter((w) => !FILLER.has(w)).join(' ');
    if (key.length >= 5) out.push({ label, key });
  }
  return out;
}

/** 'DLC' ou o nome da DLC citada no texto da conquista; null = sem indício (jogo base). */
function detectOrigin(a, targets) {
  const text = ' ' + norm([a.nameEn, a.descEn].filter(Boolean).join(' . ')) + ' ';
  for (const t of targets || []) if (text.includes(' ' + t.key + ' ')) return t.label;
  if (/ (dlc|expansion|add on) /.test(text)) return 'DLC';
  return null;
}

const DLC_WORDS = /\b(dlc|expansion|add-?on|downloadable content)\b/i;
const BASE_WORDS = /\b(base game|main game|story|base)\b/i;

/** Título de seção de guia ("Shadow of the Erdtree DLC Trophies") -> nome da DLC, 'DLC', 'base' ou null. */
function sectionOrigin(section, gameName) {
  const s = String(section || '').trim();
  if (!s) return null;
  if (DLC_WORDS.test(s)) {
    const label = s.replace(DLC_WORDS, ' ').replace(/\b(trophies|trophy|achievements?|guide|list|roadmap|all)\b/gi, ' ').replace(/[\s:\-–—|()]+/g, ' ').trim();
    return label && norm(label) !== norm(gameName) ? label.slice(0, 60) : 'DLC';
  }
  return BASE_WORDS.test(s) && !DLC_WORDS.test(s) ? 'base' : null;
}

/* ---------- DLC com conteúdo jogável x só itens/trilha sonora ---------- */

const ONLY_ITEMS_NAME = /\b(soundtrack|ost|original score|artbook|art book|wallpapers?|ringtones?|making of|digital (?:art|book|comic)|comic|avatar|emoticons?|stickers?|supporter|donation)\b/i;
const ITEM_WORDS = /\b(skins?|cosmetics?|outfits?|costumes?|emotes?|themes?|pre-?order|bonus (?:content|items?)|credits|currency|coins?|booster|starter pack|weapon pack|item pack|gear pack|character pack|appearance|hairstyles?|paint|decals?|cheats?|trainer|digital)\b/gi;
const PLAY_WORDS = /\b(expansion|campaign|story|storyline|chapters?|quests?|missions?|adventure|episodes?|raids?|dungeons?|season|new (?:area|areas|region|regions|map|maps|zone|zones|island|world|worlds|mode|modes|characters?|enemies|bosses|playable|game)|hours? of|explore|battle|boss|ending)\b/gi;

/**
 * Julga se a DLC tem conteúdo jogável. Entrada: { name, short, priceCents }.
 * Devolve { kind: 'jogavel' | 'itens' | 'incerto', score }.
 */
function classifyDlc({ name = '', short = '', priceCents = 0, hasAchievements = false } = {}) {
  if (ONLY_ITEMS_NAME.test(name)) return { kind: 'itens', score: -9 }; // trilha sonora, artbook etc. nunca têm conquistas, mesmo que a loja marque
  if (hasAchievements) return { kind: 'jogavel', score: 9 }; // a própria Steam marca "Steam Achievements" na DLC
  const count = (re, t) => (String(t).match(re) || []).length;
  let play = count(PLAY_WORDS, name) * 3 + Math.min(count(PLAY_WORDS, short), 4);
  let items = count(ITEM_WORDS, name) * 3 + Math.min(count(ITEM_WORDS, short), 4);
  if (priceCents >= 1500) play += 2; else if (priceCents >= 700) play += 1; else if (priceCents > 0 && priceCents < 300) items += 1;
  const score = play - items;
  return { kind: score >= 2 ? 'jogavel' : score <= -1 ? 'itens' : 'incerto', score };
}

/** Título de grupo de um site de conquistas ("Jogo - DLC Achievements") -> nome da DLC. */
function groupLabel(title, gameName) {
  let s = String(title || '').slice(0, 300).trim().replace(/\s*achievements?\s*$/i, '').trim(); // títulos são curtos; o limite evita lentidão com texto enorme
  const cut = dlcLabel(s, gameName);
  if (cut !== s) return cut;
  const dash = s.lastIndexOf(' - ');
  if (dash > 0) return s.slice(dash + 3).trim();
  const colon = s.indexOf(': ');
  return colon > 0 ? s.slice(colon + 2).trim() : s;
}

/** Liga o rótulo de um grupo do site ao nome de uma DLC da loja (igual, ou um contido no outro); senão mantém o do site. */
function matchStoreLabel(label, storeLabels) {
  const a = norm(label);
  if (!a) return label;
  const cands = (storeLabels || []).filter((l) => !ONLY_ITEMS_NAME.test(l));
  const exact = cands.find((l) => norm(l) === a);
  if (exact) return exact;
  // senão, a mais parecida (a de tamanho mais próximo) entre as que contêm uma à outra
  const close = cands.filter((l) => { const b = norm(l); return b && Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)); })
    .sort((x, y) => Math.abs(norm(x).length - a.length) - Math.abs(norm(y).length - a.length));
  return close[0] || label;
}

/** Passes/pacotes não são uma origem útil ("Season Pass" reúne várias DLCs). */
const isPassName = (label) => /\b(season|expansion|battle) pass\b|^pass\b|\bbundle\b|\bcollection\b/i.test(String(label || ''));

/* ---------- votação: várias fontes decidem de onde é cada conquista ---------- */

/** Nome de DLC citado dentro de um título/seção (com ou sem a palavra "DLC"): rótulo da loja, ou null. */
function labelIn(text, labels) {
  const t = ' ' + norm(text) + ' ';
  if (t.trim().length < 5) return null;
  let best = null;
  for (const l of labels || []) {
    const k = norm(l);
    if (k.length >= 6 && t.includes(' ' + k + ' ') && (!best || k.length > norm(best).length)) best = l;
  }
  return best;
}

/**
 * Junta as pistas de uma conquista: { src, origin, w }.
 *  - site de conquistas (Exophase): peso 4
 *  - seção ou título de cada guia (um voto por site): peso 2
 *  - nome da DLC no texto da própria conquista: peso 1
 */
function evidenceFor(item, { labels = [], name = '' } = {}) {
  const ev = [];
  const real = (labels || []).filter((l) => !isPassName(l));
  if (item.web) ev.push({ src: 'Exophase', origin: item.web, w: 4 });
  const webSeen = new Set(item.web ? ['Exophase'] : []);
  for (const v of item.webVotes || []) { if (webSeen.has(v.src)) continue; webSeen.add(v.src); ev.push({ src: v.src, origin: v.origin, w: v.w || 2 }); } // pesquisa na internet: um voto por site (listas da PlayStation pesam mais)
  const seen = new Set();
  for (const sn of item.snippets || []) {
    const src = String(sn.source || sn.host || '?');
    if (seen.has(src)) continue;
    let o = labelIn(sn.section, real) || labelIn(sn.title, real);
    if (!o) {
      const s = sectionOrigin(sn.section, name);
      o = s ? (s === 'base' || s === 'DLC' ? s : matchStoreLabel(s, real)) : null;
    }
    if (o) { seen.add(src); ev.push({ src, origin: o, w: 2 }); }
  }
  const txt = detectOrigin({ nameEn: item.nameEn, descEn: item.descEn }, dlcTargets(real.map((l) => ({ name: l })), ''));
  if (txt) ev.push({ src: 'texto da conquista', origin: txt, w: 1 });
  return ev;
}

/** Soma os votos. Devolve { origin, votes, conflict } ('base' se ninguém apontou DLC). */
function decide(ev) {
  const sum = new Map();
  for (const e of ev) sum.set(e.origin, (sum.get(e.origin) || 0) + e.w);
  const specific = [...sum.keys()].filter((o) => o !== 'base' && o !== 'DLC');
  if (sum.has('DLC') && specific.length) { // "DLC" genérico reforça a DLC específica mais votada
    const top = specific.sort((a, b) => sum.get(b) - sum.get(a))[0];
    sum.set(top, sum.get(top) + sum.get('DLC')); sum.delete('DLC');
  }
  const ranked = [...sum.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { origin: 'base', votes: [], conflict: false };
  const webVote = ev.find((e) => e.src === 'Exophase');
  let origin = ranked[0][0];
  if (ranked[1] && ranked[1][1] === ranked[0][1] && webVote) origin = webVote.origin; // empate: o site de conquistas desempata
  return { origin, votes: ev, conflict: ranked.length > 1 };
}

function voteOrigins(items, ctx) {
  const out = {};
  for (const it of items || []) {
    const r = decide(evidenceFor(it, ctx));
    if (r.votes.length) out[it.apiName] = r;
  }
  return out;
}

module.exports = { voteOrigins, evidenceFor, decide, labelIn, isPassName, classifyDlc, groupLabel, matchStoreLabel, norm, dlcLabel, dlcTargets, detectOrigin, sectionOrigin };
