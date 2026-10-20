'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { dlcLabel, dlcTargets, detectOrigin, sectionOrigin } = require('../src/origin');

test('nome da DLC sem o nome do jogo', () => {
  assert.strictEqual(dlcLabel('ELDEN RING Shadow of the Erdtree', 'ELDEN RING'), 'Shadow of the Erdtree');
  assert.strictEqual(dlcLabel('Game - Season Pass (DLC)', 'Game'), 'Season Pass');
});
test('detecta DLC pelo nome citado ou pela palavra DLC', () => {
  const t = dlcTargets([{ id: 1, name: 'ELDEN RING Shadow of the Erdtree' }, { id: 2, name: 'ELDEN RING Digital Soundtrack' }], 'ELDEN RING');
  assert.strictEqual(t.length, 1);
  assert.strictEqual(detectOrigin({ nameEn: 'Messmer', descEn: 'Defeat the boss in Shadow of the Erdtree' }, t), 'Shadow of the Erdtree');
  assert.strictEqual(detectOrigin({ nameEn: 'X', descEn: 'Complete the DLC story' }, t), 'DLC');
  assert.strictEqual(detectOrigin({ nameEn: 'X', descEn: 'Beat the first boss' }, t), null);
});
test('seção de guia', () => {
  assert.strictEqual(sectionOrigin('Shadow of the Erdtree DLC Trophies', 'Elden Ring'), 'Shadow of the Erdtree');
  assert.strictEqual(sectionOrigin('DLC Trophies', 'Elden Ring'), 'DLC');
  assert.strictEqual(sectionOrigin('Base Game Trophies', 'Elden Ring'), 'base');
  assert.strictEqual(sectionOrigin('Missable Trophies', 'Elden Ring'), null);
});

test('datas: ISO com milissegundos e M/D/AAAA', () => {
  const { toIsoDate, _fns } = require('../src/page-scripts');
  assert.strictEqual(toIsoDate('2026-05-13T15:47:00.000Z'), '2026-05-13');
  assert.strictEqual(toIsoDate('2/13/2025'), '2025-02-13');
  assert.strictEqual(toIsoDate('Sept. 3, 2024'), '2024-09-03');
  assert.ok(_fns.pageDate.toString().includes('\\/'));
});

test('DLC jogável x só itens', () => {
  const { classifyDlc } = require('../src/origin');
  assert.strictEqual(classifyDlc({ name: 'Game Original Soundtrack' }).kind, 'itens');
  assert.strictEqual(classifyDlc({ name: 'Game Artbook' }).kind, 'itens');
  assert.strictEqual(classifyDlc({ name: 'Game - Cosmetic Skin Pack', short: 'Unlock new skins and outfits', priceCents: 199 }).kind, 'itens');
  assert.strictEqual(classifyDlc({ name: "Moxxi's Heist of the Handsome Jackpot", short: 'A new story campaign with new missions and a new area to explore.', priceCents: 1499 }).kind, 'jogavel');
  assert.strictEqual(classifyDlc({ name: 'Mystery DLC' }).kind, 'incerto');
});

test('grupos do site de conquistas viram origens', () => {
  const { originsFromGroups } = require('../src/origin-web');
  const ach = ['A one', 'B two', 'C three', 'D four'].map((n, i) => ({ apiName: 'x' + i, nameEn: n }));
  const data = { groups: [{ title: '', names: ['A one', 'B two', 'C three'] }, { title: 'The Game - Big Expansion Achievements', names: ['D four'] }] };
  const o = originsFromGroups(data, ach, 'The Game', ['Big Expansion']);
  assert.deepStrictEqual(o, { x0: 'base', x1: 'base', x2: 'base', x3: 'Big Expansion' });
  assert.strictEqual(originsFromGroups({ groups: [{ title: '', names: ['A one'] }] }, ach, 'The Game', []), null);
  const { groupLabel, matchStoreLabel } = require('../src/origin');
  assert.strictEqual(groupLabel("Borderlands 3: Moxxi's Heist Achievements", 'Borderlands 3'), "Moxxi's Heist");
  assert.strictEqual(groupLabel('The Witcher 3: Wild Hunt - Hearts of Stone Achievements', 'The Witcher 3: Wild Hunt — Remastered'), 'Hearts of Stone');
  assert.strictEqual(matchStoreLabel('Hearts of Stone', ['Witcher Hearts of Stone']), 'Witcher Hearts of Stone');
});

test('DLC com Steam Achievements é jogável e passes não viram origem', () => {
  const { classifyDlc, isPassName } = require('../src/origin');
  assert.strictEqual(classifyDlc({ name: 'Game Pack', hasAchievements: true }).kind, 'jogavel');
  assert.ok(isPassName('Season Pass 2') && isPassName('Season Pass') && !isPassName("Moxxi's Heist"));
});

test('trilha sonora nunca é DLC com conquistas e não "rouba" o nome da DLC', () => {
  const { classifyDlc, matchStoreLabel } = require('../src/origin');
  assert.strictEqual(classifyDlc({ name: 'Blood and Wine Soundtrack', hasAchievements: true }).kind, 'itens');
  assert.strictEqual(matchStoreLabel('Blood and Wine', ['Blood and Wine Soundtrack', 'Blood and Wine']), 'Blood and Wine');
  assert.strictEqual(matchStoreLabel('Blood and Wine', ['Blood and Wine Soundtrack']), 'Blood and Wine');
});

test('votação: várias fontes decidem a origem', () => {
  const { voteOrigins } = require('../src/origin');
  const labels = ['Blood and Wine', 'Hearts of Stone'];
  const mk = (extra) => ({ apiName: 'A', nameEn: 'Some', descEn: 'Do a thing', snippets: [], ...extra });
  let v = voteOrigins([mk({ web: 'Blood and Wine', snippets: [{ source: 'IGN Wiki', section: 'Hearts of Stone Trophies' }] })], { labels, name: 'The Witcher 3' }).A;
  assert.strictEqual(v.origin, 'Blood and Wine'); // Exophase (4) vence um guia (2)
  assert.ok(v.conflict);
  v = voteOrigins([mk({ snippets: [{ source: 'IGN Wiki', section: 'Hearts of Stone DLC' }, { source: 'PowerPyx', title: 'Hearts of Stone Trophy Guide' }] })], { labels, name: 'The Witcher 3' }).A;
  assert.strictEqual(v.origin, 'Hearts of Stone'); // dois guias concordam
  v = voteOrigins([mk({ snippets: [{ source: 'PowerPyx', section: 'Base game' }] })], { labels, name: 'X' }).A;
  assert.strictEqual(v.origin, 'base');
  assert.strictEqual(voteOrigins([mk({})], { labels, name: 'X' }).A, undefined); // sem pistas: sem voto
});
