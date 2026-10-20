'use strict';

/** Tempo para zerar (HowLongToBeat). O site não tem API oficial; lemos o texto da página de busca. */

const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };

function normalizeTitle(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\b(the )?(definitive|complete|goty|game of the year|deluxe|ultimate|remastered|enhanced|director'?s cut) (edition|cut)\b/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean)
    .map((w) => ROMAN[w] || w)
    .join(' ');
}

const TIME = String.raw`(--|[\d.,½¼¾]+(?: [\d½¼¾]+)?[ \t]*(?:Hours?|Mins?|h\b))`; // sem "\s+\s*" juntos: isso travava (backtracking) com muitos espaços

/** "31½ Hours" -> 31.5 ; "45 Mins" -> 0.75 ; "--" -> null */
function parseHours(raw) {
  const text = String(raw || '').trim();
  if (!text || text === '--') return null;
  let n = parseFloat(text.replace(',', '.')) || 0;
  if (text.includes('½')) n += 0.5;
  if (text.includes('¼')) n += 0.25;
  if (text.includes('¾')) n += 0.75;
  if (/min/i.test(text)) n /= 60;
  return n > 0 ? Math.round(n * 10) / 10 : null;
}

const AFTER = new RegExp(String.raw`^\s*${TIME}\s*Main \+ Extra\s*${TIME}\s*Completionist\s*${TIME}`);

/**
 * Lê o texto da página de busca e devolve [{ name, story, extra, full }].
 * Anda por "Main Story" com indexOf e lê só uma janela curta depois dele (rápido mesmo em páginas enormes).
 */
function parseHltbText(text) {
  const out = [];
  const t = String(text || '');
  let from = 0;
  let i;
  while ((i = t.indexOf('Main Story', from)) >= 0) {
    from = i + 10;
    const m = AFTER.exec(t.slice(from, from + 220));
    if (!m) continue;
    const lineStart = t.lastIndexOf('\n', i - 1) + 1;
    let name = t.slice(Math.max(lineStart, i - 300), i).split('Add to Profile').pop().trim();
    if (!name) {
      const before = t.slice(Math.max(0, lineStart - 600), lineStart).split('\n').map((l) => l.trim()).filter(Boolean);
      name = before.length ? before[before.length - 1] : '';
    }
    out.push({ name, story: parseHours(m[1]), extra: parseHours(m[2]), full: parseHours(m[3]) });
    from += m[0].length;
  }
  return out;
}

/** Escolhe o resultado que corresponde ao jogo (igual > começa com > primeiro). */
function pickMatch(results, gameName) {
  if (!results.length) return null;
  const want = normalizeTitle(gameName);
  const exact = results.find((r) => normalizeTitle(r.name) === want);
  if (exact) return { ...exact, approx: false };
  const starts = results.find((r) => normalizeTitle(r.name).startsWith(want) && !/dlc|expansion|pack/i.test(r.name));
  return { ...(starts || results[0]), approx: true };
}

module.exports = { normalizeTitle, parseHours, parseHltbText, pickMatch };
