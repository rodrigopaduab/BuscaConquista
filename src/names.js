'use strict';

/** Tira palavras de edição do nome do jogo para as buscas ("X — Remastered", "X Ultimate Edition" -> "X"). */

const WORDS = [
  'game of the year', 'goty', 'super deluxe', 'digital deluxe', 'deluxe', 'ultimate', 'complete', 'definitive', 'enhanced', 'special', 'standard',
  'gold', 'platinum', 'premium', 'legendary', 'anniversary', 'collector\'?s', 'royal', 'expanded', 'extended', 'limited', 'launch',
  'remastered', 'remaster', 'remake', 'redux', 'reloaded', 'hd', 'final cut', 'director\'?s cut', 'next[- ]gen', 'pc',
].join('|');
// uma ou mais palavras de edição (com "edition/version/collection/bundle" opcional) no fim do nome, após separador ou espaço
const tailFor = (extra) => new RegExp(`(?:\\s*[-–—:|]\\s*|\\s+|\\s*\\()(?:the\\s+)?(?:(?:${WORDS}${extra})\\s*)+(?:edition|version|collection|bundle|pack)?\\s*\\)?\\s*$`, 'i');
const TAIL = tailFor('');
const TAIL_EDITION = /(?:\s*[-–—:|]\s*|\s+)(?:edition|version)\s*$/i;

/** extra: palavras que o usuário quer ignorar também (Configurações). */
function cleanGameName(name, extra = []) {
  const words = (Array.isArray(extra) ? extra : []).map((w) => String(w).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  const tail = words.length ? tailFor('|' + words.join('|')) : TAIL;
  let s = String(name || '').replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) {
    const next = s.replace(tail, '').replace(TAIL_EDITION, '').replace(/[\s\-–—:|(]+$/, '').trim();
    if (next === s) break;
    if (next.length < 3) break; // nunca apaga o nome inteiro
    s = next;
  }
  return s;
}

module.exports = { cleanGameName };
