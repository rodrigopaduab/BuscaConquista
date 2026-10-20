'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseProfileInput, mergeAchievements, summarize, pickLastPlayed, normalizeText, createSteamClient, SteamError,
} = require('../src/steam');
const { createCache } = require('../src/cache');
const { createConfigStore } = require('../src/config');
const { createMockFetch, DD2, PUBLIC_ID, PRIVATE_ID } = require('../dev/mock-steam');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'buscaconquista-'));
const client = (opts = {}) => createSteamClient({ fetch: createMockFetch(), getApiKey: () => 'TESTKEY', ...opts });

test('parseProfileInput entende link, SteamID e apelido', () => {
  assert.deepEqual(parseProfileInput('https://steamcommunity.com/profiles/76561198000000001/'), { type: 'id', steamId: '76561198000000001' });
  assert.deepEqual(parseProfileInput('steamcommunity.com/id/meu-nome/'), { type: 'vanity', vanity: 'meu-nome' });
  assert.deepEqual(parseProfileInput('76561198000000001'), { type: 'id', steamId: '76561198000000001' });
  assert.deepEqual(parseProfileInput('  rodrigo '), { type: 'vanity', vanity: 'rodrigo' });
  assert.equal(parseProfileInput(''), null);
  assert.equal(parseProfileInput('isso não é um perfil!'), null);
});

test('normalizeText ignora acentos e maiúsculas', () => {
  assert.equal(normalizeText('Dragão'), 'dragao');
});

test('mergeAchievements junta PT/EN, % e progresso e ordena como a Steam', () => {
  const list = mergeAchievements({
    pt: [{ name: 'A', displayName: 'Paz', description: 'desc pt', icon: 'i', icongray: 'g' }, { name: 'B', displayName: 'Raro' }],
    en: [{ name: 'A', displayName: 'Peace', description: 'desc en' }, { name: 'B', displayName: 'Rare' }, { name: 'C', displayName: 'Sem pct' }],
    percentages: [{ name: 'A', percent: '12.6' }, { name: 'B', percent: 4.6 }],
    player: [{ apiname: 'A', achieved: 1, unlocktime: 100 }],
  });
  assert.deepEqual(list.map((a) => a.apiName), ['A', 'B', 'C']);
  assert.equal(list[0].namePt, 'Paz');
  assert.equal(list[0].nameEn, 'Peace');
  assert.equal(list[0].percent, 12.6);
  assert.equal(list[0].achieved, true);
  assert.equal(list[1].achieved, false);
  assert.equal(list[2].percent, null); // sem % vai para o fim
  assert.equal(list[2].namePt, 'Sem pct'); // sem tradução PT usa o inglês
});

test('summarize conta faltantes e raras (< 10%)', () => {
  const s = summarize([
    { achieved: true, percent: 50 },
    { achieved: false, percent: 9.9 },
    { achieved: false, percent: 10.0 },
    { achieved: false, percent: null },
  ]);
  assert.deepEqual(s, { total: 4, achieved: 1, remaining: 3, remainingRare: 1 });
});

test('pickLastPlayed usa a data da última sessão e, sem ela, o mais jogado', () => {
  assert.equal(pickLastPlayed([{ appid: 1, lastPlayed: 10 }, { appid: 2, lastPlayed: 99 }]).appid, 2);
  assert.equal(pickLastPlayed([{ appid: 1, lastPlayed: 0, playtimeMinutes: 5 }, { appid: 2, lastPlayed: 0, playtimeMinutes: 50 }]).appid, 2);
  assert.equal(pickLastPlayed([{ appid: 1, lastPlayed: 0, playtimeMinutes: 0 }]), null);
});

test('resolveSteamId por apelido, e erros de perfil inexistente e chave inválida', async () => {
  const c = client();
  assert.equal(await c.resolveSteamId('rodrigo'), PUBLIC_ID);
  await assert.rejects(() => c.resolveSteamId('naoexiste'), { code: 'PROFILE_NOT_FOUND' });
  await assert.rejects(() => c.resolveSteamId('!!!'), { code: 'BAD_INPUT' });
  const bad = client({ getApiKey: () => 'CHAVE-ERRADA' });
  await assert.rejects(() => bad.resolveSteamId('rodrigo'), { code: 'INVALID_KEY' });
  const none = client({ getApiKey: () => '' });
  await assert.rejects(() => none.resolveSteamId('rodrigo'), { code: 'MISSING_KEY' });
});

test('perfil com jogos privados avisa PRIVATE_PROFILE', async () => {
  const c = client();
  await assert.rejects(() => c.getOwnedGames(PRIVATE_ID), (e) => e instanceof SteamError && e.code === 'PRIVATE_PROFILE');
});

test('último jogo e busca por nome (biblioteca primeiro, depois loja)', async () => {
  const c = client();
  assert.equal((await c.getLastPlayed(PUBLIC_ID)).appid, DD2);
  const r = await c.searchGames(PUBLIC_ID, 'dragon');
  assert.deepEqual(r.library.map((g) => g.appid), [DD2]);
  assert.ok(r.store.some((g) => g.name === "Dragon's Dogma: Dark Arisen"));
  assert.ok(!r.store.some((g) => g.appid === DD2), 'não repete jogos que já estão na biblioteca');
  assert.deepEqual(await c.searchGames(PUBLIC_ID, 'd'), { library: [], store: [] });
  const accent = await c.searchGames(PUBLIC_ID, 'WOLFENSTEIN');
  assert.equal(accent.library.length, 1);
});

test('loadGame traz nomes PT/EN, % e progresso; ordem e contagem batem com o print', async () => {
  const c = client();
  const g = await c.loadGame(PUBLIC_ID, DD2);
  const missing = g.achievements.filter((a) => !a.achieved);
  assert.equal(g.summary.total, 15);
  assert.equal(g.summary.achieved, 3);
  assert.equal(missing[0].namePt, 'Você não Morre tão Cedo');
  assert.equal(missing[0].percent, 16.4);
  // 9,96% aparece como "10,0%" e já conta como rara (dourada), igual ao print da Steam
  assert.deepEqual(missing.slice(0, 8).map((a) => a.percent), [16.4, 12.6, 10.1, 9.96, 7.8, 6.3, 5.7, 4.6]);
  const peace = g.achievements.find((a) => a.apiName === 'ACH_PEACE');
  assert.equal(peace.nameEn, 'Peace');
  assert.equal(peace.namePt, 'Paz');
  assert.equal(g.achievements.find((a) => a.apiName === 'ACH_SECRET').hidden, true);
  assert.equal(g.progressAvailable, true);
});

test('jogo sem conquistas, e jogo que o usuário não tem', async () => {
  const c = client();
  await assert.rejects(() => c.loadGame(PUBLIC_ID, 1145360), { code: 'NO_ACHIEVEMENTS' });
  const notOwned = await c.loadGame(PUBLIC_ID, 1245620).catch((e) => e);
  assert.equal(notOwned.code, 'NO_ACHIEVEMENTS'); // jogo fora da mock = sem esquema
});

test('perfil privado ao ler conquistas avisa PRIVATE_PROFILE', async () => {
  await assert.rejects(() => client().loadGame(PRIVATE_ID, DD2), { code: 'PRIVATE_PROFILE' });
});

test('cache evita pedir de novo à Steam (esquema e %)', async () => {
  const fetchMock = createMockFetch();
  const cache = createCache(tmp());
  const c = createSteamClient({ fetch: fetchMock, getApiKey: () => 'TESTKEY', cache });
  await c.loadGame(PUBLIC_ID, DD2);
  const firstCalls = fetchMock.calls.length;
  await c.loadGame(PUBLIC_ID, DD2);
  const secondCalls = fetchMock.calls.length - firstCalls;
  assert.equal(secondCalls, 1, 'só o progresso do jogador é buscado de novo');
});

test('cache respeita o prazo (TTL)', () => {
  let t = 1000;
  const cache = createCache(tmp(), () => t);
  cache.set('a/b', { x: 1 });
  assert.deepEqual(cache.get('a/b', 500), { x: 1 });
  t += 600;
  assert.equal(cache.get('a/b', 500), undefined);
  assert.deepEqual(cache.getStale('a/b'), { x: 1 });
});

test('cache não deixa a chave escapar da pasta', () => {
  const dir = tmp();
  const cache = createCache(dir);
  cache.set('../../fora', 1);
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : files.push(path.join(d, f.name)); })(dir);
  assert.ok(files.length === 1 && files[0].startsWith(dir));
});

test('config guarda a chave criptografada e nunca a expõe à interface', () => {
  const fake = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from('ENC:' + s.split('').reverse().join('')),
    decryptString: (b) => b.toString().slice(4).split('').reverse().join(''),
  };
  const dir = tmp();
  const store = createConfigStore({ dir, safeStorage: fake });
  store.save({ steamId: PUBLIC_ID, profileInput: 'rodrigo', personaName: 'R', avatar: '', apiKey: 'SEGREDO123' });
  const raw = fs.readFileSync(path.join(dir, 'config.json'), 'utf8');
  assert.ok(!raw.includes('SEGREDO123'));
  assert.equal(store.getApiKey(), 'SEGREDO123');
  assert.equal('apiKey' in store.getPublic(), false);
  assert.equal(store.getPublic().configured, true);
  // salvar de novo sem digitar a chave mantém a anterior
  store.save({ steamId: PUBLIC_ID, profileInput: 'novo', personaName: 'R', avatar: '' });
  assert.equal(store.getApiKey(), 'SEGREDO123');
});

test('parseCommunityAchievements lê descrições de conquistas ocultas da página da comunidade', () => {
  const { parseCommunityAchievements, mergeAchievements } = require('../src/steam');
  const html = 'x {\\"api_name\\":\\"5\\",\\"name\\":\\"Oculta\\",\\"description\\":\\"Viu o mundo \\\\\\"solto\\\\\\".\\",\\"hidden\\":true,\\"archived\\":false} y';
  const c = parseCommunityAchievements(html);
  assert.deepStrictEqual(c['5'], { name: 'Oculta', description: 'Viu o mundo "solto".', hidden: true });
  const list = mergeAchievements({ pt: [{ name: '5', displayName: 'Oculta', description: '', hidden: 1 }], en: [{ name: '5', displayName: 'Hid', description: '', hidden: 1 }], community: { pt: c, en: {} } });
  assert.strictEqual(list[0].descPt, 'Viu o mundo "solto".');
});

test('jogo que não é seu: perfil público + "perfil não público" da Steam mostra a lista sem progresso', async () => {
  const base = createMockFetch();
  const fetchMock = async (url, opts) => {
    if (String(url).includes('GetPlayerAchievements')) {
      return { ok: false, status: 403, headers: { get: () => 'application/json' }, json: async () => ({ playerstats: { error: 'Profile is not public', success: false } }), text: async () => '{"playerstats":{"error":"Profile is not public","success":false}}' };
    }
    return base(url, opts);
  };
  const game = await createSteamClient({ fetch: fetchMock, getApiKey: () => 'TESTKEY' }).loadGame(PUBLIC_ID, DD2);
  assert.strictEqual(game.progressAvailable, false);
  assert.ok(game.achievements.length > 0 && game.achievements.every((a) => !a.achieved));
  // perfil realmente privado continua avisando
  await assert.rejects(() => client().loadGame(PRIVATE_ID, DD2), { code: 'PRIVATE_PROFILE' });
});
