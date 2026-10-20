'use strict';

/**
 * Guias da internet (Etapa 3). Este módulo é "puro": quem busca as páginas é o main.js (getPage),
 * o que permite testar tudo com páginas de mentira.
 *
 * Fontes: cada uma sabe (1) achar a página do guia do jogo e (2) devolver o texto dela.
 * Por enquanto: PowerPyx (guia de troféus/conquistas). Outras entram em Configurações (Etapa 6).
 */

const { scoreSteam } = require('./classify');
const { cleanGameName } = require('./names');
const { POWERPYX_EXTRACT, buildExtractMany, toIsoDate } = require('./page-scripts');

const MAX_SNIPPET = 480;
/** Texto que é só raridade/tipo do troféu ("Silver", "Prata", "Gold 12%", "Ultra Rare") não ensina nada: descartar. */
const RARITY_WORDS = /\b(bronze|silver|gold|platinum|prata|ouro|platina|common|uncommon|rare|very rare|ultra rare|epic|legendary|comum|raro|epico|lendario|trophy|trophies|achievement|rarity|tier|points?|pts|gs|g|hidden|secret|difficulty|easy|medium|hard|none|n a|n\/a)\b/g;
function isRarityOnly(text) {
  const t = norm(text).replace(RARITY_WORDS, ' ').replace(/[\d.,%/()\[\]:;|·•\-–—+*]+/g, ' ').replace(/\s+/g, ' ').trim();
  return !t;
}
/** O trecho serve se tem mídia ou algum texto que não seja só raridade. */
const usefulSnippet = (sn) => !!sn && ((sn.parts || []).some((p) => p.t !== 'text' && p.t !== 'link') || !isRarityOnly(((sn.parts || []).filter((p) => p.t === 'text').map((p) => p.v).join(' ')) || sn.text || ''));

const MAX_PER_SOURCE = 10; // sem limite prático: mais informação é melhor

function norm(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
const strip = (text) => norm(text).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function slugify(name) {
  return norm(name).replace(/'/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Palavras-chave dentro de um trecho de guia (em inglês, como as fontes). Devolve categorias detectadas. */
// [categoria, fortes (2 pontos: dizem claramente), fracos (1 ponto: só sugerem)]
const GUIDE_RULES = [
  ['bugged',
    [/\bglitch(ed|y)?\b/, /\bbugg?(ed|y)\b/, /\bnot (unlocking|popping|registering|counting)\b/, /\bdoes(n't| not) (unlock|pop|register|trigger|count)\b/, /\bfail(s|ed)? to (unlock|pop|trigger|register)\b/, /\bknown (bug|issue)\b/],
    [/\bbug\b/, /\bworkaround\b/, /\bpatch(ed)?\b/]],
  ['missable',
    [/\bmissable\b/, /\bpoint of no return\b/, /\bcan(not|'t) be (obtained|earned|done|completed|repeated|redone|missed) (later|again|after)/, /\b(permanently|forever) (missed|locked|lost|unavailable)\b/, /\bonly (one|1) (chance|try|opportunity)\b/, /\bno way (back|to go back)\b/, /\bcannot (go|return) back\b/, /\bmiss(ed|ing)? (it|this|them) (you|and|,)/, /\bif you miss\b/, /\bcan be missed\b/],
    [/\bone[- ]time\b/, /\bbefore (you )?(leave|progress|advance|continue|finish|complete|start|talk|enter)\b/, /\bmiss(ed|ing)? (it|this|them)\b/, /\blimited[- ]time\b/, /\bcan(not|'t) be (obtained|earned|done|completed)\b/]],
  ['ending',
    [/\b(true|good|bad|secret|hidden|normal|alternate|alternative|golden|final) ending\b/, /\bendings?\b.*\b(all|every|each|different|unlock|see|get|obtain)\b/, /\b(all|every|each|different|see|get|obtain|unlock)\b.*\bendings?\b/, /\bnew game ?\+? (only|required)\b/],
    [/\bending\b/, /\bcredits\b/]],
  ['difficulty',
    [/\b(on|in) (hard|expert|master|nightmare|insane|legendary|brutal|veteran|hardest)( mode| difficulty)?\b/, /\b(hard|nightmare|insane|veteran|legendary|brutal|hardest) (mode|difficulty)\b/, /\bdifficulty (setting|mode|level|is|must|trophies|specific)\b/, /\bany difficulty\b/, /\bwithout (dying|taking damage|getting hit)\b/, /\bpermadeath\b/, /\bironman\b/],
    [/\bdifficulty\b/, /\b(hard|easy)\b/, /\bchallenging\b/]],
];

/** Pontos por categoria num trecho: { categoria: 1 | 2 }. */
function scoreText(text) {
  const t = norm(text).slice(0, 4000); // regras com ".*" ficam lentas em textos enormes; um trecho de guia nunca precisa de mais que isso
  const out = {};
  for (const [cat, strong, weak] of GUIDE_RULES) {
    if (strong.some((re) => re.test(t))) out[cat] = 2;
    else if (weak.some((re) => re.test(t))) out[cat] = 1;
  }
  return out;
}

function classifyText(text) {
  return Object.keys(scoreText(text));
}

/** Título da seção do guia ("Missable Trophies", "Glitched Trophies") conta como pista forte. */
const SECTION_CATS = [['missable', /missable|point of no return/i], ['bugged', /glitch|bugg?ed|known issues/i], ['ending', /\bendings?\b/i], ['difficulty', /difficulty|hard mode|nightmare/i]];
function scoreSection(section) {
  const out = {};
  for (const [cat, re] of SECTION_CATS) if (re.test(String(section || ''))) out[cat] = 2;
  return out;
}

/**
 * Trechos de uma página que falam da conquista (procura o nome em inglês no texto).
 * Prefere linhas que COMEÇAM com o nome ("Peace – Become Sovran...") e as que citam troféu/conquista.
 */
function findSnippets(pageText, achievement) {
  const name = strip(achievement.nameEn);
  if (name.length < 4) return [];
  const re = new RegExp(`(^| )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
  const lines = String(pageText || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const scored = [];
  lines.forEach((line, i) => {
    const plain = strip(line);
    if (!re.test(plain)) return;
    if (line.length > 2500) return; // texto corrido gigante: provavelmente menu/lista
    let score = 1;
    if (plain.startsWith(name)) score += 3;
    if (new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ?(-|–|—|:|>|\\()`).test(norm(line))) score += 2;
    if (/trophy|achievement|trofeu|conquista/.test(plain)) score += 1;
    if (line.length < 60 && lines[i + 1]) { score += 0; }
    // quanto mais curto o contexto em torno do nome, mais provável de ser a explicação da conquista
    if (line.length > 900) score -= 1;
    let text = line;
    if (line.length < 70 && lines[i + 1] && !/^[A-Z][^.!?]{0,40}$/.test(lines[i + 1])) text += ' ' + lines[i + 1];
    scored.push({ score, i, text });
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const out = [];
  for (const s of scored) {
    const text = s.text.length > MAX_SNIPPET ? s.text.slice(0, MAX_SNIPPET - 1).trimEnd() + '…' : s.text;
    if (out.some((o) => o === text)) continue;
    out.push(text);
    if (out.length >= MAX_PER_SOURCE) break;
  }
  return out;
}

/* ---------- fontes ---------- */

const SOURCES = [
  {
    id: 'powerpyx',
    name: 'PowerPyx',
    extract: POWERPYX_EXTRACT, // lê a tabela do guia (explicação curta + detalhes, imagens, vídeos)
    // Endereços do guia: tenta o padrão do site e, se não existir, a busca do site.
    guessUrls: (game) => {
      const slug = slugify(game.name);
      return slug ? [`https://www.powerpyx.com/${slug}-trophy-guide-roadmap/`] : [];
    },
    searchUrl: (game) => 'https://www.powerpyx.com/?s=' + encodeURIComponent(game.name),
    isGuideLink: (href, game) => {
      if (!/powerpyx\.com\/[^/?#]+-(trophy-guide(-roadmap)?|achievement-guide(-roadmap)?)\/?$/i.test(href)) return false;
      // palavra inteira: "wild hunt" não pode casar com "monster-hunter-wilds"
      const want = slugify(game.name).split('-').filter((w) => w.length > 1 || /^\d$/.test(w));
      const slug = (href.toLowerCase().match(/powerpyx\.com\/([^/?#]+)/) || [])[1] || '';
      const got = new Set(slug.split('-'));
      return want.length > 0 && want.every((w) => got.has(w));
    },
  },
];

/**
 * Procura a página do guia do jogo em uma fonte. getPage(url) -> { ok, text, links:[{href,text}], title } ou null.
 */
/** Variações do nome para achar o guia: sem "Special Edition", sem "The", só o que vem depois de ":" etc. */
function nameVariants(name) {
  const base = cleanGameName(name); // as buscas sempre ignoram edição/remaster/remake
  const noEdition = base;
  const noThe = noEdition.replace(/^the\s+/i, '');
  const afterColon = noEdition.includes(':') ? noEdition.split(':').slice(1).join(':').trim() : '';
  const beforeColon = noEdition.includes(':') ? noEdition.split(':')[0].trim() : '';
  // Siglas e números que os sites escrevem diferente: "Grand Theft Auto IV" -> "GTA 4".
  const ROMAN = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  const digits = noThe.replace(/\b(II|III|IV|VI|VII|VIII|IX|V|X)\b/g, (m) => String(ROMAN[m]));
  const short = digits.replace(/^grand theft auto\b/i, 'GTA');
  const oneWord = afterColon && !/\s/.test(afterColon) && afterColon.length >= 5 ? afterColon : ''; // "Skyrim": costuma ser o nome nos guias
  const out = [base, oneWord, beforeColon, noThe, short, digits, afterColon].filter((v) => v && v.length >= 3);
  const uniq = [];
  for (const v of out) if (!uniq.some((u) => u.toLowerCase() === v.toLowerCase())) uniq.push(v);
  return uniq.slice(0, 4);
}

async function findGuidePage(source, game, getPage, attempts = [], onProgress = () => {}) {
  for (const v of nameVariants(game.name)) {
    if (v !== game.name) attempts.push(`${source.name}: tentando o nome "${v}"`);
    const found = await findGuidePageFor(source, { ...game, name: v }, getPage, attempts, onProgress);
    if (found) return found;
  }
  return null;
}

async function findGuidePageFor(source, game, getPage, attempts = [], onProgress = () => {}) {
  const note = (url, page, extra = '') => attempts.push(`${source.name}: ${url} -> ${page ? (page.ok ? `ok, título "${String(page.title).slice(0, 60)}", ${String(page.text || '').length} letras, ${(page.links || []).length} links` : 'falhou: ' + (page.reason || '?')) : 'sem resposta'}${extra}`);
  for (const url of source.guessUrls(game)) {
    onProgress({ phase: 'principal', label: `Consultando ${source.name}`, site: hostOf(url) });
    const page = await getPage(url, { extract: source.extract }).catch(() => null);
    note(url, page);
    if (page && page.ok && page.text && !/page not found|404|nothing found/i.test(page.title || '') && page.text.length > 2000) {
      return { url, text: page.text, extra: page.extra || null, date: toIsoDate(page.date), dateKind: page.dateKind || null };
    }
  }
  const searchUrl = source.searchUrl(game);
  onProgress({ phase: 'principal', label: `Procurando o guia no ${source.name}`, site: hostOf(searchUrl) });
  const search = await getPage(searchUrl).catch(() => null);
  note(searchUrl, search);
  if (search && search.links) {
    const hit = search.links.find((l) => source.isGuideLink(l.href, game));
    attempts.push(`${source.name}: ${hit ? 'link do guia na busca: ' + hit.href : 'nenhum link de guia na busca'}`);
    if (hit) {
      onProgress({ phase: 'principal', label: `Abrindo o guia do ${source.name}`, site: hostOf(hit.href) });
      const page = await getPage(hit.href, { extract: source.extract }).catch(() => null);
      note(hit.href, page);
      if (page && page.ok && page.text) return { url: hit.href, text: page.text, extra: page.extra || null, date: toIsoDate(page.date), dateKind: page.dateKind || null };
    }
  }
  return null;
}

/* ---------- guias estruturados (tabela com explicação curta + detalhes) ---------- */

const TIER_TOKENS = /\[(BRONZE|SILVER|GOLD|PLATINUM)\]/gi;
const cleanText = (t) => String(t || '').replace(TIER_TOKENS, ' ').replace(/\s+/g, ' ').trim();

/** Tipo do trecho de texto: dica, nota, aviso ou texto comum (só quando o guia marca com "Tip:", "Note:"...). */
function textKind(text) {
  const t = norm(text);
  if (/^(pro[- ]?tips?|tips?|hints?|dicas?)\s*[:!–-]/.test(t)) return 'tip';
  if (/^(notes?|nota|obs)\s*[:!–-]/.test(t)) return 'note';
  if (/^(warning|warnings|important|attention|caution|aviso|atencao)\s*[:!–-]/.test(t)) return 'warning';
  return 'text';
}

function normalizeParts(rawParts) {
  const out = [];
  for (const p of rawParts || []) {
    if (!p) continue;
    if (p.t === 'text') {
      const v = cleanText(p.v);
      if (v) out.push({ t: 'text', kind: textKind(v), v });
    } else if ((p.t === 'img' || p.t === 'video' || p.t === 'link') && /^https:\/\//.test(String(p.url || ''))) {
      if (!out.some((o) => o.t === p.t && o.url === p.url)) out.push(p.t === 'link' ? { t: 'link', v: cleanText(p.v), url: p.url, ...(p.map ? { map: true } : {}) } : { t: p.t, url: p.url });
    }
  }
  return out;
}

/** "Refer to X" (o guia manda ver outra conquista): traz também o detalhe de X. */
function resolveReferences(parts, entries, self) {
  const out = [];
  for (const p of parts) {
    out.push(p);
    if (p.t !== 'text') continue;
    const m = /^(refer to|see|veja)\b\s*(.*)$/i.exec(p.v);
    if (!m) continue;
    const target = entries.find((e) => e !== self && e.name && strip(m[2]).includes(strip(e.name)));
    if (target) {
      const targetParts = normalizeParts(target.parts).filter((tp) => !(tp.t === 'text' && /^(refer to|see|veja)\b/i.test(tp.v)));
      if (targetParts.length) out.push({ t: 'text', kind: 'note', v: `Nota: o guia usa o mesmo passo a passo de "${target.name}":` }, ...targetParts);
    }
  }
  return out;
}

function findEntry(entries, achievement) {
  const want = strip(achievement.nameEn);
  if (!want) return null;
  return entries.find((e) => strip(e.name) === want) || null;
}

/** Entrada do guia para uma conquista: ignora a explicação curta (já temos a da Steam) e usa a completa. */
function entrySnippet(entries, entry, source, url, date = null, dateKind = null) {
  let parts = resolveReferences(normalizeParts(entry.parts), entries, entry);
  const hasDetail = parts.some((p) => p.t === 'text');
  let short = false;
  if (!hasDetail) {
    const desc = cleanText(entry.desc);
    if (desc) { parts = [{ t: 'text', kind: 'text', v: desc }, ...parts]; short = true; }
  }
  if (!parts.length) return null;
  if (!parts.some((p) => p.t !== 'text' && p.t !== 'link') && isRarityOnly(parts.filter((p) => p.t === 'text').map((p) => p.v).join(' '))) return null;
  const votes = classifyText(parts.filter((p) => p.t === 'text').map((p) => p.v).join('\n'));
  return { source, url, date, dateKind, short, section: entry.section || '', parts, text: parts.filter((p) => p.t === 'text').map((p) => p.v).join('\n'), votes, scores: scoreText(parts.filter((p) => p.t === 'text').map((p) => p.v).join('\n')) };
}

/**
 * Monta os guias de um jogo: { sources:[{id,name,url}], byAchievement:{ apiName:{ snippets:[{source,url,short,parts,text,votes}] } } }
 */
async function buildGuides({ game, achievements, getPage, sources = SOURCES, attempts = [], onProgress = () => {} }) {
  const found = [];
  for (const source of sources) {
    const page = await findGuidePage(source, game, getPage, attempts, onProgress).catch((err) => { attempts.push(`${source.name}: erro ${err && err.message}`); return null; });
    if (page) found.push({ source, ...page });
  }
  const byAchievement = {};
  for (const a of achievements) {
    const snippets = [];
    for (const f of found) {
      const entries = f.extra && Array.isArray(f.extra.entries) ? f.extra.entries : null;
      if (entries && entries.length) {
        const entry = findEntry(entries, a);
        const sn = entry && entrySnippet(entries, entry, f.source.name, f.url, f.date, f.dateKind);
        if (sn) snippets.push(sn);
      } else {
        // fonte sem tabela estruturada: procura o nome no texto da página
        for (const text of findSnippets(f.text, a)) {
          if (isRarityOnly(text)) continue;
          snippets.push({ source: f.source.name, url: f.url, date: f.date || null, dateKind: f.dateKind || null, short: false, parts: [{ t: 'text', kind: textKind(text), v: text }], text, votes: classifyText(text), scores: scoreText(text) });
        }
      }
    }
    if (snippets.length) byAchievement[a.apiName] = { snippets };
  }
  const summaries = [];
  for (const f of found) {
    const sm = extractSummary(f.text);
    if (sm) summaries.push({ source: f.source.name, url: f.url, date: f.date || null, dateKind: f.dateKind || null, ...sm });
  }
  return { sources: found.map((f) => ({ id: f.source.id, name: f.source.name, url: f.url, date: f.date || null, dateKind: f.dateKind || null })), byAchievement, summaries };
}

/* ---------- resumo para platinar (dificuldade, tempo, quantas jogadas...) ---------- */

const FACT_LABELS = [
  [/does (the )?difficulty affect/i, 'A dificuldade afeta as conquistas?'],
  [/(estimated )?(trophy |achievement )?difficulty/i, 'Dificuldade'],
  [/(amount of )?time to (platinum|100|complete)|approximate (amount of )?time|estimated time|completion time|how long/i, 'Tempo estimado'],
  [/missable/i, 'Perdíveis'],
  [/online (trophies|achievements)/i, 'Conquistas online'],
  [/glitch|buggy|bugged/i, 'Bugadas'],
  [/hardest/i, 'Mais difíceis'],
  [/(minimum )?playthroughs?/i, 'Jogadas mínimas'],
  [/free[- ]?roam|level select|chapter select/i, 'Mundo livre depois da história'],
  [/point of no return/i, 'Ponto sem volta'],
  [/manual saves?|supports .*saves?/i, 'Salvamento manual'],
];

const SUMMARY_VERSION = 2;
const NAV_WORDS = /privacy|privacidade|cookie|consent|terms of (use|service)|termos de uso|subscribe|newsletter|sign in|log ?in|all rights reserved|copyright|advertis/i;

/** Parece um parágrafo de verdade (frases), e não um menu, rodapé ou lista de links? */
function looksLikeProse(line) {
  const l = String(line || '').trim();
  if (l.length < 80 || l.length > 1500) return false;
  if ((l.match(/[•|»›·]/g) || []).length > 1) return false;
  if (NAV_WORDS.test(l)) return false;
  const words = l.split(/\s+/);
  if (words.length < 14) return false;
  const caps = words.filter((w) => /^[A-ZÀ-Ý]/.test(w)).length;
  if (caps / words.length > 0.45) return false; // "Notícias Críticas Guias de jogos..." (lista de menus)
  return (l.match(/[.!?](\s|$)/g) || []).length >= 2;
}

/**
 * Tira do texto de um guia o "quadro de resumo" (dificuldade, tempo, jogadas...) e a introdução.
 * Só vale se tiver pelo menos 2 itens do quadro, ou uma introdução em frases de verdade; senão null.
 */
function extractSummary(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const facts = [];
  const seen = new Set();
  let introAt = -1;
  for (let i = 0; i < Math.min(lines.length, 140); i++) {
    const line = lines[i];
    if (/^(introduction|overview|summary|introdução)$/i.test(line)) { introAt = i; break; }
    const m = /^([^:]{3,70}):\s*(.{1,})$/.exec(line);
    if (!m || NAV_WORDS.test(line)) continue;
    const hit = FACT_LABELS.find(([re]) => re.test(m[1]));
    if (!hit || seen.has(hit[1])) continue;
    seen.add(hit[1]);
    facts.push({ label: hit[1], value: m[2].trim().slice(0, 600) });
  }
  const paras = [];
  if (introAt >= 0) {
    for (let i = introAt + 1; i < Math.min(lines.length, introAt + 12) && paras.length < 2; i++) {
      const l = lines[i];
      if (/^(step \d|roadmap|trophy guide|tips|table of contents)/i.test(l)) break;
      if (looksLikeProse(l)) paras.push(l);
    }
  }
  const intro = paras.join('\n').slice(0, 1400);
  if (facts.length < 2 && intro.length < 250) return null;
  return { v: SUMMARY_VERSION, facts, intro };
}

/* ---------- outras fontes: busca na web (Bing) para o que o guia principal não explica ---------- */

const SKIP_HOSTS = [
  'bing.com', 'microsoft.com', 'google.com', 'youtube.com', 'youtu.be', 'facebook.com', 'x.com', 'twitter.com', 'instagram.com',
  'pinterest.com', 'tiktok.com', 'reddit.com', 'steamcommunity.com', 'steampowered.com', 'wikipedia.org',
  'trueachievements.com', 'truesteamachievements.com', 'gamerguides.com', 'xboxachievements.com', 'playstationtrophies.org', 'steamhunters.com', 'psnprofiles.com', 'trophieshunter.com', 'keengamer.com', 'ludo.guide', // pedem verificação anti-robô (Cloudflare)
  'powerpyx.com', // já é a fonte principal
];
const PRETTY_HOSTS = {
  'game8.co': 'Game8', 'powerpyx.com': 'PowerPyx', 'ggrecon.com': 'GGRecon', 'gamepressure.com': 'GamePressure',
  'xboxachievements.com': 'XboxAchievements', 'playstationtrophies.org': 'PlayStationTrophies', 'siliconera.com': 'Siliconera',
  'gamefaqs.gamespot.com': 'GameFAQs', 'fextralife.com': 'Fextralife', 'ign.com': 'IGN', 'gamerant.com': 'GameRant',
  'strategywiki.org': 'StrategyWiki', 'progameguides.com': 'Pro Game Guides', 'fandom.com': 'Fandom',
};

/** Página de "verificação anti-robô" (Cloudflare e parecidos), nos idiomas mais comuns. */
function isAntiBotPage(page) {
  const head = String((page && page.title) || '') + ' ' + String((page && page.text) || '').slice(0, 400);
  return /just a moment|um momento|verifying you are human|verificando se voc|attention required|access denied|checking your browser|verifique se voc[eê] [eé] humano|enable javascript and cookies to continue|confirm you are human/i.test(head) && String((page && page.text) || '').length < 2500;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { return ''; }
}

function sourceNameFor(url) {
  const host = hostOf(url);
  const key = Object.keys(PRETTY_HOSTS).find((k) => host === k || host.endsWith('.' + k));
  return key ? PRETTY_HOSTS[key] : host;
}

/** Os resultados do Bing são links de redirecionamento (bing.com/ck/a?...&u=a1<base64>); isto devolve o endereço real. */
function decodeBingUrl(href) {
  try {
    const u = new URL(href);
    if (!/(^|\.)bing\.com$/.test(u.hostname)) return href;
    const enc = u.searchParams.get('u');
    if (!enc) return null;
    const b64 = enc.replace(/^a1/, '').replace(/-/g, '+').replace(/_/g, '/');
    const real = Buffer.from(b64, 'base64').toString('utf8');
    return /^https:\/\//.test(real) ? real : null;
  } catch (_) {
    return null;
  }
}

function candidateLinks(links, { skip = SKIP_HOSTS } = {}) {
  const seen = new Set();
  const out = [];
  for (const l of links || []) {
    if (!l || !l.href || !(l.text || '').trim()) continue;
    const real = /bing\.com\/ck\/a/.test(l.href) ? decodeBingUrl(l.href) : l.href;
    if (!real || !/^https:\/\//.test(real)) continue;
    const host = hostOf(real);
    if (!host || skip.some((h) => host === h || host.endsWith('.' + h))) continue;
    if (/\.(pdf|jpe?g|png|gif|webp)(\?|$)/i.test(real)) continue;
    const key = real.split('#')[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

const searchUrlFor = (game, name) => 'https://www.bing.com/search?q=' + encodeURIComponent(`"${game}" "${name}" achievement guide`);

/**
 * Para conquistas que o guia principal não explica: busca na web, abre as páginas mais promissoras (uma vez cada)
 * e extrai a seção de TODAS as conquistas procuradas que aparecerem nela.
 * targets: [{ apiName, nameEn }]. onResult(apiName, snippet) é chamado a cada achado. Devolve { found, pages }.
 */
async function webFallback({ game, targets, needSummary = false, getPage, onResult = () => {}, maxPages = 8, maxPerAchievement = 8, perNameSearch = 10, attempts = [], seeds = [], blocked = [], useSearch = true, preferred = [], onProgress = () => {} }) {
  const wanted = targets.filter((t) => strip(t.nameEn).length >= 4);
  const perName = useSearch ? wanted.filter((x) => x.needsSearch).slice(0, perNameSearch) : [];
  let done = 0;
  let total = seeds.length + (useSearch ? (preferred.length ? 1 : 0) + 3 + (needSummary ? 1 : 0) + perName.length : 0) + 4;
  const tick = (phase, label, site, detail) => onProgress({ phase, label, site, detail, done, total });
  const vs = nameVariants(game.name);
  game = { ...game, name: vs[1] || vs[0] || game.name };
  const skipHosts = [...SKIP_HOSTS, ...blocked];
  const labels = new Map(seeds.map((sd) => [sd.url, sd.label]));
  const counts = {};
  let found = 0;
  let pagesRead = 0;
  const pagesLog = [];
  const summaries = [];
  const antiBotHosts = new Set();
  const opened = new Set(); // cada página só é aberta uma vez
  const stillWanted = () => wanted.filter((t) => (counts[t.apiName] || 0) < maxPerAchievement);
  const needMore = () => stillWanted().some((t) => !t.optional) || (needSummary && !summaries.length);

  // Pesquisa no Bing e devolve os endereços (guardando os votos de cada um)
  const search = async (query, label, detail, site = 'bing.com') => {
    tick('busca', label, site, detail);
    const page = await getPage('https://www.bing.com/search?q=' + encodeURIComponent(query), { waitFor: /./ }).catch(() => null);
    done += 1;
    return { page, urls: page && page.ok ? candidateLinks(page.links, { skip: skipHosts }) : [] };
  };

  // Abre as páginas (na ordem dada), sem repetir, até achar tudo ou esgotar o limite de páginas
  const readPages = async (urls, always = false) => {
    for (const url of urls) {
      if (opened.has(url)) continue;
      // sites preferidos e fontes do usuário são lidos sempre (para mostrar mais de um guia, até em conquistas já obtidas);
      // as buscas gerais só continuam enquanto faltar explicação para alguma conquista não obtida
      const goOn = always ? (stillWanted().length > 0 || (needSummary && !summaries.length)) : needMore();
      if (pagesRead >= maxPages || !goOn) break;
      opened.add(url);
      pagesRead += 1;
      total = Math.max(total, done + 1);
      const todo = stillWanted();
      tick('paginas', 'Lendo as páginas encontradas', hostOf(url));
      const page = await getPage(url, todo.length ? { extract: buildExtractMany(todo.map((t) => t.nameEn)), names: todo.map((t) => t.nameEn) } : {}).catch(() => null);
      const results = page && page.ok && page.extra && page.extra.results ? page.extra.results : {};
      attempts.push(`${url} -> ${page && page.ok ? Object.keys(results).length + ' conquistas encontradas' : 'falhou: ' + ((page && page.reason) || 'sem resposta')}`);
      if (page && page.antiBot) antiBotHosts.add(hostOf(url));
      done += 1;
      pagesLog.push({ url, ok: !!(page && page.ok), antiBot: !!(page && page.antiBot), found: page && page.ok ? Object.keys(results).length : 0 });
      if (!page || !page.ok) continue;
      const date = toIsoDate(page.date);
      const sm = extractSummary(page.text);
      if (sm) summaries.push({ source: labels.get(url) || sourceNameFor(url), url, date, dateKind: page.dateKind || null, ...sm });
      for (const t of todo) {
        const r = results[t.nameEn];
        if (!r || (counts[t.apiName] || 0) >= maxPerAchievement) continue;
        const parts = normalizeParts(r.parts);
        if (!parts.some((p) => p.t === 'text')) continue;
        const text = parts.filter((p) => p.t === 'text').map((p) => p.v).join('\n');
        if (t.descEn && strip(text) === strip(t.descEn)) continue; // só repete a descrição da Steam
        if (!parts.some((p) => p.t !== 'text' && p.t !== 'link') && isRarityOnly(text)) continue; // só raridade (Prata, Gold...)
        const sn = { source: labels.get(url) || sourceNameFor(url), url, title: String(page.title || '').slice(0, 160), date, dateKind: page.dateKind || null, short: false, parts, votes: classifyText(text), scores: scoreText(text) };
        counts[t.apiName] = (counts[t.apiName] || 0) + 1;
        found += 1;
        onResult(t.apiName, sn);
      }
    }
  };
  const byVotes = (votes) => [...votes.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);

  // Etapa 1: as fontes do usuário e os sites preferidos (uma única busca para todos os preferidos)
  const first = new Map();
  for (const sd of seeds) first.set(sd.url, 100);
  if (useSearch && preferred.length) {
    const gotHosts = new Set();
    const hostsAll = preferred.map((p) => p.host);
    // várias buscas combinadas (até 5 sites cada, com "site:"), em vez de uma busca por site
    for (let i = 0; i < preferred.length; i += 5) {
      const group = preferred.slice(i, i + 5);
      const hosts = group.map((p) => p.host);
      const names = group.map((p) => p.label).join(', ');
      const { page, urls } = await search(`${game.name} achievements guide (${hosts.map((h) => 'site:' + h).join(' OR ')})`, 'Procurando nos sites preferidos', names, hosts[0]);
      const perHost = {};
      for (const u of urls) {
        const h = hosts.find((x) => hostOf(u) === x || hostOf(u).endsWith('.' + x));
        if (!h) continue;
        const limit = hostsAll.indexOf(h) < 4 ? 2 : 1; // os 4 primeiros (mais completos) podem dar 2 páginas; os demais, 1
        if ((perHost[h] || 0) >= limit) continue;
        perHost[h] = (perHost[h] || 0) + 1; gotHosts.add(h);
        first.set(u, Math.max(first.get(u) || 0, 50 - perHost[h] - hostsAll.indexOf(h) * 0.01));
      }
      attempts.push(`busca nos preferidos (${names}): ${page && page.ok ? urls.length + ' páginas' : 'falhou: ' + ((page && page.reason) || 'sem resposta')}`);
    }
    attempts.push(`preferidos encontrados: ${[...gotHosts].join(', ') || 'nenhum'}`);
    // sites que a busca combinada não trouxe: uma busca só para eles (só os 4 primeiros, para não alongar demais)
    for (const p of preferred.filter((x) => !gotHosts.has(x.host)).slice(0, 4)) {
      const r = await search(`${game.name} achievements guide ${p.label}`, `Procurando no ${p.label}`, null, p.host);
      const mine = r.urls.filter((u) => hostOf(u) === p.host || hostOf(u).endsWith('.' + p.host)).slice(0, 1);
      attempts.push(`busca ${p.label}: ${r.page && r.page.ok ? mine.length + ' páginas' : 'falhou: ' + ((r.page && r.page.reason) || 'sem resposta')}`);
      mine.forEach((u, i) => first.set(u, Math.max(first.get(u) || 0, 49 - i)));
    }
  }
  await readPages(byVotes(first), true);

  // Etapa 2: só se ainda falta algo, buscas gerais (páginas que listam muitas conquistas de uma vez)
  const votes = new Map();
  const addVotes = (urls, weight) => urls.slice(0, 5).forEach((u, i) => votes.set(u, (votes.get(u) || 0) + weight - i * 0.1));
  if (useSearch && needMore()) {
    const queries = [`"${game.name}" achievements guide`, `"${game.name}" all achievements how to unlock`, `"${game.name}" DLC achievements guide`];
    if (needSummary && !summaries.length) queries.unshift(`"${game.name}" platinum trophy guide roadmap difficulty`);
    for (const q of queries) {
      if (!needMore()) break;
      const r = await search(q, 'Pesquisando na internet', /platinum/.test(q) ? 'como platinar o jogo' : 'guias gerais do jogo');
      attempts.push(`busca geral "${q}": ${r.page && r.page.ok ? Math.min(5, r.urls.length) + ' páginas candidatas' : 'falhou: ' + ((r.page && r.page.reason) || 'sem resposta')}`);
      addVotes(r.urls.filter((u) => !opened.has(u)), /platinum/.test(q) ? 3 : 2);
      await readPages(byVotes(votes)); // lê já, antes de gastar outra busca
      votes.clear();
    }
  }

  // Etapa 3: busca por conquista, só para as que continuam sem explicação
  if (useSearch) {
    for (const t of perName) {
      if (pagesRead >= maxPages) break;
      if ((counts[t.apiName] || 0) >= 1) continue;
      const r = await search(`"${game.name}" "${t.nameEn}" achievement guide`, 'Pesquisando na internet', `como conseguir ${t.nameEn}`);
      attempts.push(`busca "${t.nameEn}": ${r.page && r.page.ok ? Math.min(5, r.urls.length) + ' páginas candidatas' : 'falhou: ' + ((r.page && r.page.reason) || 'sem resposta')}`);
      addVotes(r.urls.filter((u) => !opened.has(u)), 1);
      await readPages(byVotes(votes));
      votes.clear();
    }
  }
  return { found, pages: pagesRead, pagesLog, antiBotHosts: [...antiBotHosts], summaries };
}

/**
 * Junta as opiniões: Steam (nome/descrição) tem prioridade; depois as fontes dos guias.
 * Devolve { category, origin: 'steam'|'guia'|null, guideCategory, diverge, details }
 */
const CAT_PRIORITY = ['bugged', 'missable', 'ending', 'difficulty'];

function combineClassification(achievement, guideEntry) {
  const total = {}; const who = {};
  const add = (cat, pts, src) => { total[cat] = (total[cat] || 0) + pts; (who[cat] = who[cat] || []).push(src); };
  const steamScores = scoreSteam(achievement);
  for (const [c, pts] of Object.entries(steamScores)) add(c, pts, 'Steam');
  const perSource = new Map(); // um voto por site: vale a pista mais forte dele
  for (const sn of (guideEntry && guideEntry.snippets) || []) {
    const sc = { ...(sn.scores || Object.fromEntries((sn.votes || []).map((v) => [v, 2]))) };
    for (const [c, pts] of Object.entries(scoreSection(sn.section))) sc[c] = Math.max(sc[c] || 0, pts);
    const cur = perSource.get(sn.source) || {};
    for (const [c, pts] of Object.entries(sc)) cur[c] = Math.max(cur[c] || 0, pts);
    perSource.set(sn.source, cur);
  }
  for (const [src, sc] of perSource) for (const [c, pts] of Object.entries(sc)) add(c, pts, src);
  // só vira etiqueta com 2 pontos ou mais: uma pista clara, ou duas pistas fracas de fontes diferentes
  const ranked = Object.keys(total).filter((c) => total[c] >= 2)
    .sort((a, b) => total[b] - total[a] || CAT_PRIORITY.indexOf(a) - CAT_PRIORITY.indexOf(b));
  const categories = ranked.slice(0, 3);
  const guideSrc = (c) => (who[c] || []).filter((x) => x !== 'Steam');
  const category = categories[0] || null;
  const origin = category ? ((who[category] || []).includes('Steam') ? 'steam' : 'guia') : null;
  const guideCategory = categories.find((c) => guideSrc(c).length) || null;
  return {
    category, categories, origin, guideCategory, diverge: false,
    details: categories.map((c) => ({ category: c, sources: who[c], points: total[c] })),
  };
}

module.exports = { isRarityOnly, usefulSnippet, scoreText, scoreSection, SUMMARY_VERSION, looksLikeProse, extractSummary, isAntiBotPage, hostOf, nameVariants, SOURCES, webFallback, candidateLinks, decodeBingUrl, sourceNameFor, searchUrlFor, textKind, normalizeParts, slugify, classifyText, findSnippets, findGuidePage, buildGuides, combineClassification };
