'use strict';

/**
 * Classificação automática das conquistas, só pelo que a Steam informa (nome e descrição em PT e EN).
 * É um palpite: o lápis ao lado de cada conquista permite corrigir, e a correção fica salva.
 * (Na etapa 3 entram guias da internet para melhorar o palpite.)
 */

const CATEGORIES = ['ending', 'difficulty', 'missable', 'bugged'];
const CATEGORY_LABELS = { ending: 'Final', difficulty: 'Dificuldade', missable: 'Perdível', bugged: 'Bugada' };

function norm(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// [categoria, fortes (2 pontos), fracos (1 ponto)]
const RULES = [
  ['ending',
    [/\bendings?\b/, /\btrue end\b/, /\bfinais\b/, /\bfinal (bom|mau|ruim|verdadeiro|secreto|alternativo|normal|oculto|real|perfeito)\b/,
      /\b(obteve|alcancou|conseguiu|viu|desbloqueou|ver|veja|obtenha|alcance) (o|um|todos os|todas as) finais?\b/, /\bfinais? (a|b|c|d|e)\b/],
    []],
  ['difficulty',
    [/\bdifficulty\b/, /\bon (hard|easy|normal|expert|master|nightmare|insane|veteran)\b/, /\b(nightmare|insane|veteran|legendary|brutal|ironman|permadeath)( mode)?\b/, /\b(hard|casual) (mode|difficulty)\b/,
      /\b(without|no) (dying|deaths?|taking damage|getting hit)\b/, /\bnew game ?\+\b/, /\bdificuldade\b/, /\bmodo (dificil|casual|facil|pesadelo|veterano|lendario)\b/,
      /\bsem (morrer|sofrer dano|tomar dano|ser atingido)\b/, /\bnovo jogo ?\+\b/],
    [/\b(hard|easy|casual)\b/]],
  ['missable',
    [/\bmissable\b/, /\bpoint of no return\b/, /\bonly (once|one chance)\b/, /\b(cannot|can't|can not) be (obtained|earned|done|repeated|completed) (later|again|after)\b/,
      /\bperdivel\b/, /\bponto sem retorno\b/, /\bapenas uma vez\b/, /\buma unica vez\b/],
    [/\bone[- ]time\b/, /\bbefore\b/]],
];

/** Pontos só pelo que a Steam informa: { categoria: 1 | 2 }. */
function scoreSteam(a) {
  const text = norm([a.nameEn, a.descEn, a.namePt, a.descPt].filter(Boolean).join(' . '));
  const out = {};
  for (const [category, strong, weak] of RULES) {
    if (strong.some((re) => re.test(text))) out[category] = 2;
    else if (weak.some((re) => re.test(text))) out[category] = 1;
  }
  return out;
}

/** Palpite automático: 'ending' | 'difficulty' | 'missable' | null (só pistas claras; as fracas esperam um guia). */
function classifyAuto(a) {
  const sc = scoreSteam(a);
  for (const c of ['ending', 'difficulty', 'missable']) if (sc[c] >= 2) return c;
  return null;
}

/** Categoria final: a correção do usuário ('none' = nenhuma) vale mais do que o palpite. */
function categoryOf(auto, override) {
  if (override === 'none') return null;
  if (CATEGORIES.includes(override)) return override;
  return auto || null;
}

function isValidOverride(value) {
  return value === null || value === 'none' || CATEGORIES.includes(value);
}

module.exports = { scoreSteam, CATEGORIES, CATEGORY_LABELS, classifyAuto, categoryOf, isValidOverride };
