'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { originsFromText, usable, searchOrigins } = require('../src/origin-search');
const { voteOrigins } = require('../src/origin');

const ach = [
  { apiName: 'A1', nameEn: 'Hello Pawn' }, { apiName: 'A2', nameEn: 'Slayer of Wyrms' }, { apiName: 'A3', nameEn: 'Bitterblack Delver' },
  { apiName: 'A4', nameEn: 'Dark Arisen Champion' }, { apiName: 'A5', nameEn: 'Lord of the Isle' },
];
const text = ['Dragon\'s Dogma achievements', 'Base Game Achievements', 'Hello Pawn - Summon a pawn', 'Slayer of Wyrms - Kill a dragon', 'Dark Arisen Expansion', 'Bitterblack Delver - Enter the Isle', 'Dark Arisen Champion', 'Lord of the Isle - Finish the quest'].join('\n');

test('originsFromText: cada conquista fica na seção em que aparece', () => {
  const r = originsFromText(text, ach, ['Dark Arisen Expansion']);
  assert.deepStrictEqual(r.origins, { A1: 'base', A2: 'base', A3: 'Dark Arisen Expansion', A4: 'Dark Arisen Expansion', A5: 'Dark Arisen Expansion' });
  assert.ok(usable(r, ach));
  assert.ok(!usable(originsFromText('Hello Pawn\nSlayer of Wyrms\nBitterblack Delver', ach, ['Dark Arisen Expansion']), ach)); // sem seções: não vale
});

test('searchOrigins: sites que concordam viram votos e a votação decide', async () => {
  const pages = { 'https://a.example/x': text, 'https://b.example/y': text.replace('Dark Arisen Expansion', 'Dark Arisen Expansion DLC'), 'https://c.example/z': 'nada aqui' };
  const res = await searchOrigins({
    name: "Dragon's Dogma", achievements: ach, labels: ['Dark Arisen Expansion', 'Season Pass'],
    getPage: async (u) => ({ ok: true, text: pages[u] }), searchLinks: async () => Object.keys(pages),
  });
  assert.strictEqual(res.votes.A3.length, 2);
  const v = voteOrigins(ach.map((a) => ({ apiName: a.apiName, nameEn: a.nameEn, webVotes: res.votes[a.apiName] || [], snippets: [] })), { labels: ['Dark Arisen Expansion'], name: "Dragon's Dogma" });
  assert.strictEqual(v.A3.origin, 'Dark Arisen Expansion');
  assert.strictEqual(v.A1.origin, 'base');
});

test('searchOrigins: só vai às listas da PlayStation se a pesquisa geral não achou nada', async () => {
  const sep = text;
  const calls = [];
  const mk = (generalPage) => ({
    name: "Dragon's Dogma", achievements: ach, labels: ['Dark Arisen Expansion'],
    getPage: async (u) => { calls.push(u); return { ok: true, text: u.includes('psnprofiles') ? sep : generalPage }; },
    searchLinks: async (q) => (/psnprofiles|playstationtrophies|truetrophies/.test(q) ? ['https://psnprofiles.com/trophies/1-dd'] : ['https://blog.example/guide']),
  });
  let r = await searchOrigins(mk('sem seções'));
  assert.ok(calls.some((u) => u.includes('psnprofiles')), 'sem resultado geral: usa a PlayStation');
  assert.strictEqual(r.votes.A3[0].w, 3);
  calls.length = 0;
  r = await searchOrigins(mk(sep));
  assert.ok(!calls.some((u) => u.includes('psnprofiles')), 'achou na pesquisa geral: não vai à PlayStation');
  assert.strictEqual(r.votes.A3[0].w, 2);
});

test('searchOrigins: ignora links do próprio buscador', async () => {
  const opened = [];
  await searchOrigins({
    name: 'X', achievements: ach, labels: ['Dark Arisen Expansion'], psn: false,
    getPage: async (u) => { opened.push(u); return { ok: true, text: 'nada' }; },
    searchLinks: async () => ['https://www.bing.com/images/search?q=x', 'https://blog.example/a'],
  });
  assert.deepStrictEqual(opened, ['https://blog.example/a']);
});
