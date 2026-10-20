'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCache } = require('../src/cache');
const { summarize, keysFor, parseKey } = require('../src/cache-summary');

test('parseKey reconhece tipos e jogos', () => {
  assert.deepStrictEqual(parseKey('steam/schema/2050650-pt'), { kind: 'steam/schema', appid: 2050650 });
  assert.deepStrictEqual(parseKey('guias3/77'), { kind: 'guias3', appid: 77 });
  assert.strictEqual(parseKey('traducao/abc').appid, null);
});

test('lista, resume por jogo e apaga sem tocar nos outros', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-'));
  const c = createCache(dir);
  c.set('nomes/10', 'Jogo Dez'); c.set('guias3/10', { x: 1 }); c.set('guias3/20', { x: 2 }); c.set('traducao/aa', ['oi']);
  const s = summarize(c.list());
  assert.strictEqual(s.games.length, 2);
  assert.strictEqual(s.games.find((g) => g.appid === 10).name, 'Jogo Dez');
  assert.strictEqual(s.shared.traducao.count, 1);
  for (const k of keysFor(c.list(), { type: 'game', appid: 10 })) c.remove(k);
  assert.deepStrictEqual(summarize(c.list()).games.map((g) => g.appid), [20]);
  for (const k of keysFor(c.list(), { type: 'translations' })) c.remove(k);
  assert.strictEqual(summarize(c.list()).shared.traducao.count, 0);
});
