'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanGameName } = require('../src/names');

test('tira edições e remasters do nome', () => {
  const cases = {
    'The Witcher 3: Wild Hunt — Remastered': 'The Witcher 3: Wild Hunt',
    'Resident Evil 4 Remake': 'Resident Evil 4',
    'Dark Souls: Remastered': 'Dark Souls',
    'Cyberpunk 2077 Ultimate Edition': 'Cyberpunk 2077',
    'Skyrim Special Edition': 'Skyrim',
    'Fallout 4: Game of the Year Edition': 'Fallout 4',
    'Borderlands 3 Super Deluxe Edition': 'Borderlands 3',
    'Tomb Raider (Definitive Edition)': 'Tomb Raider',
    'Ghostrunner Complete Edition™': 'Ghostrunner',
    'Control Ultimate Edition': 'Control',
    'Elden Ring': 'Elden Ring',
    'Dragon\'s Dogma 2': 'Dragon\'s Dogma 2',
    'Hades': 'Hades',
    'Ultimate': 'Ultimate',
  };
  for (const [from, to] of Object.entries(cases)) assert.strictEqual(cleanGameName(from), to, from);
});

test('palavras extras do usuário também são ignoradas', () => {
  assert.strictEqual(cleanGameName('Foo Bar Reforged', ['Reforged']), 'Foo Bar');
  assert.strictEqual(cleanGameName('Foo Bar Reforged Ultimate Edition', ['reforged']), 'Foo Bar');
  assert.strictEqual(cleanGameName('Foo Bar Reforged'), 'Foo Bar Reforged');
});
