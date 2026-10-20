'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyAuto, categoryOf, isValidOverride } = require('../src/classify');
const { parseHltbText, pickMatch, normalizeTitle, parseHours } = require('../src/hltb');

const ach = (nameEn, descEn, namePt = '', descPt = '') => ({ nameEn, descEn, namePt, descPt });

test('palpite automático: finais, dificuldade e perdíveis', () => {
  assert.equal(classifyAuto(ach('True Ending', 'Reached the true ending.')), 'ending');
  assert.equal(classifyAuto(ach('X', '', 'Final verdadeiro', 'Viu o final verdadeiro.')), 'ending');
  assert.equal(classifyAuto(ach('Nightmare', 'Complete the game on Hard mode.')), 'difficulty');
  assert.equal(classifyAuto(ach('X', '', 'X', 'Conclua o jogo sem morrer.')), 'difficulty');
  assert.equal(classifyAuto(ach('X', 'Do this only once.')), 'missable');
  assert.equal(classifyAuto(ach('X', '', 'X', 'Perdível: só dá uma vez.')), 'missable');
});

test('não confunde "Final" comum com final de história', () => {
  // vem do print do Dragon's Dogma 2: "Câmaras de Provação Final" não é um final
  assert.equal(classifyAuto(ach('Dogma Defied', 'Reached the end of the Final Trial Chambers without recovering your Loss Gauge.', 'Antagonista do Dogma', 'Você chegou ao fim das Câmaras de Provação Final sem recuperar sua Barra de Perda.')), null);
  assert.equal(classifyAuto(ach('Peace', 'Became Sovran of Vernworth.', 'Paz', 'Tornou-se Sobran de Vernworth.')), null);
  assert.equal(classifyAuto(ach('', '')), null);
});

test('a correção do usuário vale mais que o palpite', () => {
  assert.equal(categoryOf('ending', null), 'ending');
  assert.equal(categoryOf('ending', 'none'), null);
  assert.equal(categoryOf('ending', 'bugged'), 'bugged');
  assert.equal(categoryOf(null, 'missable'), 'missable');
  assert.equal(isValidOverride('bugged'), true);
  assert.equal(isValidOverride('xyz'), false);
  assert.equal(isValidOverride(null), true);
});

test('HowLongToBeat: lê o texto da página (com e sem quebras de linha)', () => {
  const flat = "We Found 2 Games\nDragon's Dogma II\nMain Story31½ HoursMain + Extra56½ HoursCompletionist94 Hours\nAdd to Profile\nDragon's Dogma II: Dark Arisen Expansion\nMain Story--Main + Extra23 HoursCompletionist56 Hours\nAdd to Profile";
  for (const text of [flat, flat.replace(/Hours(?=Main|Completionist)/g, 'Hours\n').replace('Main Story31', '\nMain Story\n31')]) {
    const results = parseHltbText(text);
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], { name: "Dragon's Dogma II", story: 31.5, extra: 56.5, full: 94 });
    assert.equal(results[1].story, null);
    const m = pickMatch(results, "Dragon's Dogma 2");
    assert.equal(m.full, 94);
    assert.equal(m.approx, false);
  }
  assert.equal(normalizeTitle("Dragon's Dogma II"), normalizeTitle("Dragon's Dogma 2"));
  assert.equal(parseHours('45 Mins'), 0.8);
  assert.equal(pickMatch([], 'x'), null);
  assert.equal(pickMatch(parseHltbText('A\nMain Story1 HoursMain + Extra2 HoursCompletionist3 Hours'), 'Outro').approx, true);
});
