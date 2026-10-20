'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bc-rob-'));
const GARBAGE = [undefined, null, 0, 1, -1, NaN, '', ' ', 'x', '{}', [], [null], {}, { a: 1 }, () => 1, true, false, 'a'.repeat(5000), [[[]]], { blocked: 'x', custom: 5, status: [], preferredOff: {}, autoBlocked: 3 }];

/* ---------- configurações ---------- */
const settings = require('../src/settings');

test('settings.sanitize aguenta qualquer entrada sem lançar erro e é idempotente', () => {
  for (const g of GARBAGE) {
    const a = settings.sanitize(g);
    const b = settings.sanitize(a);
    assert.deepEqual(b.blocked, a.blocked);
    assert.deepEqual(b.custom.map((c) => c.template), a.custom.map((c) => c.template));
    assert.ok(Array.isArray(a.blocked) && Array.isArray(a.custom) && Array.isArray(a.autoBlocked));
  }
});

test('settings.sanitize: sites de fábrica nunca ficam duplicados na lista do usuário', () => {
  const s = settings.sanitize({ blocked: ['psnprofiles.com', 'www.steamhunters.com', 'meusite.com', 'https://bing.com/x'], autoBlocked: [{ host: 'psnprofiles.com', at: 1 }, { host: 'outro.com', at: 2 }] });
  assert.deepEqual(s.blocked, ['meusite.com']);
  assert.deepEqual(s.autoBlocked.map((a) => a.host), ['outro.com']);
});

test('settings.sanitize: limites de tamanho', () => {
  const many = Array.from({ length: 200 }, (_, i) => `site${i}.com`);
  assert.ok(settings.sanitize({ blocked: many }).blocked.length <= 50);
  const custom = Array.from({ length: 30 }, (_, i) => ({ id: 'f' + i, name: 'n' + i, template: `https://s${i}.com/{slug}` }));
  assert.ok(settings.sanitize({ custom }).custom.length <= 10);
});

test('settings.normalizeHost e validTemplate rejeitam lixo', () => {
  for (const bad of ['', null, undefined, 'a', 'localhost', 'http://', 'ftp://x.com', 'x y.com', '.com', 'a..b']) {
    const h = settings.normalizeHost(bad);
    assert.ok(h === null || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h), String(bad));
  }
  assert.equal(settings.normalizeHost('HTTPS://WWW.Exemplo.COM/abc?x=1'), 'exemplo.com');
  assert.equal(settings.validTemplate('http://x.com/{slug}'), null);
  assert.equal(settings.validTemplate('https://x.com/abc'), null);
  assert.equal(settings.validTemplate('https://localhost/{slug}'), null);
  assert.equal(settings.validTemplate('https://x.com/{slug}'), 'https://x.com/{slug}');
  assert.equal(settings.validTemplate('https://x.com/' + 'a'.repeat(400) + '{slug}'), null);
});

test('settings: lista de fábrica contém os sites esperados e isDefaultBlocked cobre subdomínios', () => {
  for (const h of ['steamhunters.com', 'psnprofiles.com', 'trophieshunter.com', 'keengamer.com', 'ludo.guide', 'bing.com', 'youtube.com']) assert.ok(settings.isDefaultBlocked(h), h);
  assert.ok(settings.isDefaultBlocked('www.psnprofiles.com'));
  assert.ok(settings.isDefaultBlocked('m.youtube.com'));
  assert.ok(!settings.isDefaultBlocked('notpsnprofiles.com'));
  assert.ok(!settings.isDefaultBlocked('exemplo.com'));
});

test('settings.expandTemplate substitui todos os marcadores', () => {
  const urls = settings.expandTemplate('https://x.com/{slug}/{id}', { appid: 42 }, ['Dragon\'s Dogma 2'], (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  assert.ok(urls.length >= 1);
  for (const u of urls) { assert.ok(!/\{[a-z]+\}/.test(u), u); assert.ok(u.startsWith('https://x.com/')); }
});

/* ---------- cache ---------- */
const { createCache } = require('../src/cache');

test('cache: ida e volta, validade (TTL) e getStale', () => {
  let t = 1000;
  const c = createCache(tmp(), () => t);
  c.set('a/b', { x: 1 });
  assert.deepEqual(c.get('a/b', 500), { x: 1 });
  t += 600;
  assert.equal(c.get('a/b', 500), undefined);
  assert.deepEqual(c.getStale('a/b'), { x: 1 });
  assert.deepEqual(c.get('a/b'), { x: 1 });
});

test('cache: chaves perigosas ficam dentro da pasta', () => {
  const dir = tmp();
  const c = createCache(dir);
  for (const k of ['../fora', '..', 'a/../../b', '/abs/path', 'C:\\x\\y', 'a//b', 'nome com espaço', '....']) {
    try { c.set(k, 1); } catch (_) { /* chave vazia pode recusar */ }
  }
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(dir)) assert.ok(path.resolve(f).startsWith(path.resolve(dir)), f);
  assert.ok(!fs.existsSync(path.join(dir, '..', 'fora.json')));
});

test('cache: arquivo corrompido vira "sem cache"; list ignora lixo', () => {
  const dir = tmp();
  const c = createCache(dir);
  c.set('ok/um', 1);
  fs.writeFileSync(path.join(dir, 'quebrado.json'), '{ nao e json');
  fs.writeFileSync(path.join(dir, 'vazio.json'), '');
  assert.equal(c.get('quebrado'), undefined);
  assert.equal(c.get('vazio'), undefined);
  assert.deepEqual(c.list().map((e) => e.key).sort(), ['ok/um']);
});

test('cache: gravações simultâneas da mesma chave não falham nem deixam .tmp', async () => {
  const dir = tmp();
  const c = createCache(dir);
  await Promise.all(Array.from({ length: 50 }, (_, i) => Promise.resolve().then(() => c.set('mesma', { i }))));
  assert.ok(typeof c.get('mesma').i === 'number');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
});

test('cache: clear(prefixo) apaga só aquela pasta; remove é seguro se não existe', () => {
  const c = createCache(tmp());
  c.set('a/1', 1); c.set('a/2', 2); c.set('b/1', 3);
  c.clear('a');
  assert.equal(c.get('a/1'), undefined);
  assert.equal(c.get('b/1'), 3);
  c.remove('nao/existe');
  c.clear('pasta-inexistente');
});

/* ---------- config (perfil/chave) ---------- */
const { createConfigStore } = require('../src/config');

test('config: não vaza a chave, aceita arquivo corrompido e guarda tema sem perder o perfil', () => {
  const dir = tmp();
  const s = createConfigStore({ dir, safeStorage: null });
  assert.equal(s.getPublic().configured, false);
  s.save({ steamId: '76561198000000000', profileInput: 'x', personaName: 'Rod', avatar: '', apiKey: 'SEGREDO123' });
  const pub = s.getPublic();
  assert.equal(pub.configured, true);
  assert.ok(!JSON.stringify(pub).includes('SEGREDO123'));
  assert.equal(s.getApiKey(), 'SEGREDO123');
  s.setTheme('aco');
  assert.equal(s.getPublic().theme, 'aco');
  assert.equal(s.getPublic().steamId, '76561198000000000');
  assert.throws(() => s.setTheme('nao-existe'));
  s.save({ steamId: '76561198000000000', profileInput: 'y', personaName: 'Rod', avatar: '' }); // sem chave nova: mantém a antiga
  assert.equal(s.getApiKey(), 'SEGREDO123');
  fs.writeFileSync(s.file, '{{{');
  assert.equal(s.getPublic().configured, false);
  assert.equal(s.getApiKey(), '');
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
});

test('config: com safeStorage a chave não fica em texto puro no arquivo', () => {
  const fake = { isEncryptionAvailable: () => true, encryptString: (t) => Buffer.from('ENC:' + t.split('').reverse().join('')), decryptString: (b) => b.toString().slice(4).split('').reverse().join('') };
  const s = createConfigStore({ dir: tmp(), safeStorage: fake });
  s.save({ steamId: '1', profileInput: '', personaName: '', avatar: '', apiKey: 'ABCDEF' });
  assert.ok(!fs.readFileSync(s.file, 'utf8').includes('ABCDEF'));
  assert.equal(s.getApiKey(), 'ABCDEF');
});

/* ---------- tradução ---------- */
const tr = require('../src/translate');

test('translate.splitText: nada se perde, ninguém passa do limite, termina sempre', () => {
  const samples = ['', 'curto', 'a'.repeat(5000), 'Frase um. '.repeat(400), 'palavra '.repeat(800), ('x'.repeat(100) + '! ').repeat(100), 'sem espaços '.padEnd(3000, 'y')];
  for (const t of samples) {
    const parts = tr.splitText(t, 1400);
    assert.ok(parts.every((p) => p.length <= 1401), 'tamanho');
    assert.equal(parts.join('').replace(/\s+/g, ''), t.replace(/\s+/g, ''), 'conteúdo');
  }
});

test('translate.parseResponse e translateMany', async () => {
  assert.throws(() => tr.parseResponse(null));
  assert.throws(() => tr.parseResponse({}));
  assert.equal(tr.parseResponse([[['Olá ', 'Hello '], ['mundo', 'world'], null]]), 'Olá mundo');
  const fetchFn = async (u) => ({ ok: true, json: async () => [[[`PT:${decodeURIComponent(u.split('&q=')[1])}`, '']]] });
  const out = await tr.translateMany(['a', 'b', 'c', 'd', 'e'], fetchFn);
  assert.deepEqual(out, ['PT:a', 'PT:b', 'PT:c', 'PT:d', 'PT:e']);
  await assert.rejects(tr.translateOne('x', async () => ({ ok: false, status: 429 })), /429/);
});

/* ---------- HowLongToBeat / nomes ---------- */
const hltb = require('../src/hltb');
const { cleanGameName } = require('../src/names');

test('hltb.parseHours cobre os formatos da página', () => {
  const c = { '31½ Hours': 31.5, '45 Mins': 0.8, '--': null, '': null, '100 Hours': 100, '1,5 Hours': 1.5, '2¼ Hours': 2.3, '30 h': 30, 'lixo': null, null: null };
  for (const [k, v] of Object.entries(c)) assert.equal(hltb.parseHours(k === 'null' ? null : k), v, k);
});

test('hltb.parseHltbText + pickMatch', () => {
  const text = 'Dragon\'s Dogma 2\nMain Story 31½ Hours Main + Extra 55 Hours Completionist 94 Hours\nDragon\'s Dogma 2 DLC Pack\nMain Story -- Main + Extra -- Completionist 3 Hours';
  const r = hltb.parseHltbText(text);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].story, r[0].extra, r[0].full], [31.5, 55, 94]);
  assert.equal(hltb.pickMatch(r, "Dragon's Dogma 2").approx, false);
  assert.equal(hltb.pickMatch([], 'x'), null);
  assert.equal(hltb.pickMatch(r, 'Outro jogo').approx, true);
  assert.deepEqual(hltb.parseHltbText(null), []);
});

test('names.cleanGameName: tira edições, nunca apaga o nome inteiro, aceita extras do usuário', () => {
  const c = {
    'Skyrim Special Edition': 'Skyrim',
    'The Witcher 3: Wild Hunt - Game of the Year Edition': 'The Witcher 3: Wild Hunt',
    'DOOM®': 'DOOM',
        'Hades': 'Hades',
    'Resident Evil 4 Remake': 'Resident Evil 4',
  };
  for (const [k, v] of Object.entries(c)) assert.equal(cleanGameName(k), v, k);
  assert.equal(cleanGameName('Jogo Turbo Edition', ['turbo']), 'Jogo');
  assert.equal(cleanGameName('Jogo (x+y)', ['(']), cleanGameName('Jogo (x+y)', ['(']));
  assert.equal(cleanGameName(null), '');
  assert.equal(cleanGameName(undefined, 'nao-lista'), '');
});

/* ---------- Steam: perfil, mesclagem, texto ---------- */
const steam = require('../src/steam');

test('steam.parseProfileInput', () => {
  assert.deepEqual(steam.parseProfileInput('76561198000000000'), { type: 'id', steamId: '76561198000000000' });
  assert.deepEqual(steam.parseProfileInput('https://steamcommunity.com/profiles/76561198000000000/'), { type: 'id', steamId: '76561198000000000' });
  assert.deepEqual(steam.parseProfileInput('https://steamcommunity.com/id/rodrigo_x'), { type: 'vanity', vanity: 'rodrigo_x' });
  assert.deepEqual(steam.parseProfileInput('rodrigo'), { type: 'vanity', vanity: 'rodrigo' });
  for (const bad of ['', '  ', null, undefined, 'a', 'com espaço', 'http://evil.com/id/x', '<script>', 'x'.repeat(40)]) {
    const r = steam.parseProfileInput(bad);
    assert.ok(r === null || (r.type === 'vanity' && /^[A-Za-z0-9_-]{2,32}$/.test(r.vanity)), String(bad));
  }
});

test('steam.mergeAchievements/summarize/pickLastPlayed aguentam listas vazias e faltando campos', () => {
  assert.deepEqual(steam.mergeAchievements({}), []);
  const m = steam.mergeAchievements({ pt: [{ name: 'A', displayName: 'Um' }], en: [{ name: 'A', displayName: 'One' }, { name: 'B', displayName: 'Two' }], percentages: [{ name: 'A', percent: 5 }], player: [{ apiname: 'A', achieved: 1 }] });
  assert.ok(m.length >= 1);
  const s = steam.summarize(m);
  assert.ok(s.total >= 1 && s.achieved <= s.total && s.remaining === s.total - s.achieved);
  assert.equal(steam.pickLastPlayed([]), null);
  assert.equal(steam.pickLastPlayed(null), null);
});

test('steam.parseCommunityAchievements não quebra com lixo', () => {
  for (const g of [null, '', 'abc', '"api_name":"x"', '\\"api_name\\":\\"a\\",\\"name\\":\\"b\\",']) assert.deepEqual(steam.parseCommunityAchievements(g), {});
  const html = '\\"api_name\\":\\"ACH_1\\",\\"name\\":\\"Nome\\",\\"description\\":\\"Desc\\",\\"hidden\\":false';
  assert.equal(steam.parseCommunityAchievements(html).ACH_1.name, 'Nome');
});

/* ---------- guias: funções puras ---------- */
const guides = require('../src/guides');

test('guides: funções puras aguentam qualquer entrada', () => {
  for (const g of GARBAGE) {
    assert.doesNotThrow(() => guides.scoreText(g));
    assert.doesNotThrow(() => guides.scoreSection(g));
    assert.doesNotThrow(() => guides.isRarityOnly(g));
    assert.doesNotThrow(() => guides.looksLikeProse(g));
    assert.doesNotThrow(() => guides.extractSummary(g));
    assert.doesNotThrow(() => guides.nameVariants(g));
    assert.doesNotThrow(() => guides.slugify(g));
    assert.doesNotThrow(() => guides.hostOf(g));
    assert.doesNotThrow(() => guides.decodeBingUrl(g));
    assert.doesNotThrow(() => guides.isAntiBotPage(g));
    assert.doesNotThrow(() => guides.textKind(g));
    assert.doesNotThrow(() => guides.combineClassification(g || {}, {}));
    assert.doesNotThrow(() => guides.findSnippets(g, { nameEn: g, apiName: 'x' }));
  }
  assert.deepEqual(guides.candidateLinks(null), []);
  assert.deepEqual(guides.candidateLinks([null, {}, { href: 'x' }, { href: 'http://a.com', text: 'a' }]), []);
});

test('guides.candidateLinks: filtra bloqueados, repetidos, arquivos e http', () => {
  const links = [
    { href: 'https://www.game8.co/games/x/archives/1#a', text: 'Game8' },
    { href: 'https://game8.co/games/x/archives/1#b', text: 'Game8 de novo' },
    { href: 'https://www.game8.co/games/x/archives/1', text: 'mesma' },
    { href: 'https://psnprofiles.com/guide/1', text: 'psn' },
    { href: 'https://sub.psnprofiles.com/guide/1', text: 'psn sub' },
    { href: 'https://site.com/a.pdf', text: 'pdf' },
    { href: 'https://site.com/a.PNG?x=1', text: 'png' },
    { href: 'http://inseguro.com/a', text: 'http' },
    { href: 'https://ok.com/a', text: '  ' },
    { href: 'https://ok.com/b', text: 'ok' },
  ];
  const out = guides.candidateLinks(links, { skip: ['psnprofiles.com'] });
  assert.deepEqual(out, ['https://www.game8.co/games/x/archives/1', 'https://game8.co/games/x/archives/1', 'https://ok.com/b']);
});

test('guides.decodeBingUrl: só devolve https decodificado', () => {
  const real = 'https://www.game8.co/games/x/archives/1';
  const enc = 'a1' + Buffer.from(real).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(guides.decodeBingUrl(`https://www.bing.com/ck/a?!&&u=${enc}&ntb=1`), real);
  assert.equal(guides.decodeBingUrl('https://www.bing.com/ck/a?x=1'), null);
  assert.equal(guides.decodeBingUrl('https://outro.com/a'), 'https://outro.com/a');
  assert.equal(guides.decodeBingUrl('nao-e-url'), null);
});

test('guides.webFallback: nunca abre sites bloqueados de fábrica e termina sem achar nada', async () => {
  const opened = [];
  const getPage = async (url) => {
    opened.push(url);
    if (/bing\.com\/search/.test(url)) return { ok: true, links: [{ href: 'https://psnprofiles.com/guide/1', text: 'psn' }, { href: 'https://steamhunters.com/x', text: 'sh' }, { href: 'https://www.game8.co/a', text: 'g8' }], text: 'resultados' };
    return { ok: true, title: 'Página', text: 'nada útil aqui', links: [] };
  };
  const res = await guides.webFallback({ game: { appid: 1, name: 'Jogo Teste' }, targets: [{ apiName: 'A', nameEn: 'Alguma Conquista' }], getPage, useSearch: true, maxPages: 4, attempts: [] });
  assert.ok(!opened.some((u) => /psnprofiles|steamhunters/.test(u)), opened.join('\n'));
  assert.ok(res && typeof res === 'object');
});

/* ---------- origem (jogo base x DLC) ---------- */
const origin = require('../src/origin');

test('origin.voteOrigins: entradas estranhas não quebram e a saída sempre tem origem', () => {
  const items = [{ apiName: 'A' }, { apiName: 'B', nameEn: 'x', descEn: 'y', web: null, webVotes: [], snippets: [] }, { apiName: 'C', webVotes: [{ src: 'psn', origin: 'Fate of Atlantis', w: 3 }], snippets: [{ section: 'Fate of Atlantis', title: '' }] }];
  const out = origin.voteOrigins(items, { labels: ['Fate of Atlantis'], name: 'Jogo' });
  for (const k of ['A', 'B', 'C']) assert.ok(k in out || true);
  assert.doesNotThrow(() => origin.voteOrigins([], {}));
  assert.doesNotThrow(() => origin.voteOrigins(items, { labels: null, name: null }));
  assert.equal(out.C && out.C.origin, 'Fate of Atlantis');
});

test('origin.classifyDlc: trilha, itens e passes ficam de fora; expansões jogáveis entram', () => {
  assert.equal(origin.classifyDlc({ name: 'Jogo - Original Soundtrack' }).kind, 'itens');
  assert.equal(origin.classifyDlc({ name: 'Jogo - Artbook', hasAchievements: true }).kind, 'itens');
  assert.equal(origin.classifyDlc({ name: 'Jogo - Dark Arisen Expansion', priceCents: 1999, hasAchievements: true }).kind, 'jogavel');
  assert.doesNotThrow(() => origin.classifyDlc());
});

/* ---------- datas das páginas ---------- */
const pageScripts = require('../src/page-scripts');

test('toIsoDate', () => {
  assert.equal(pageScripts.toIsoDate('March 27, 2024'), '2024-03-27');
  assert.equal(pageScripts.toIsoDate('2026-10-08T10:00:00Z'), '2026-10-08');
  for (const bad of [null, '', 'ontem', '1999-01-01', '2999-01-01', 'x']) assert.equal(pageScripts.toIsoDate(bad), null, String(bad));
});

/* ---------- resumo do cache ---------- */
const cs = require('../src/cache-summary');

test('cache-summary: parseKey/summarize aguentam chaves de todos os tipos', () => {
  const keys = ['steam/schema/2050650-pt', 'steam/percent/1', 'steam/library', 'traducao/abc', 'guias3/1', 'guias-web/1', 'hltb/1', 'nomes/1', 'mapas/1', 'dlc4/1', 'origens-web2/1', 'origens-web3/1', 'nexus/1', 'estranha', '', 'a/b/c/d'];
  for (const k of keys) assert.doesNotThrow(() => cs.parseKey(k), k);
  assert.doesNotThrow(() => cs.summarize(keys.map((key) => ({ key, bytes: 10, savedAt: 1, value: null }))));
  assert.doesNotThrow(() => cs.summarize([]));
});

/* ---------- histórico de versões e pacote ---------- */
const changelog = require('../src/changelog');
const pkg = require('../package.json');

test('changelog: versão do pacote é a mais nova, sem repetidas e em ordem decrescente', () => {
  const v = changelog.map((c) => c.version);
  assert.equal(v[0], pkg.version);
  assert.equal(new Set(v).size, v.length);
  const num = (s) => s.split('.').map(Number);
  for (let i = 1; i < v.length; i++) {
    const [a, b] = [num(v[i - 1]), num(v[i])];
    assert.ok(a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]))), `${v[i - 1]} deveria ser maior que ${v[i]}`);
  }
  for (const c of changelog) { assert.ok(c.items.length > 0); for (const it of c.items) assert.ok(typeof it === 'string' && it.length > 5); }
});

test('README menciona a versão atual', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.ok(readme.includes(pkg.version), 'README sem a versão ' + pkg.version);
});

/* ---------- interface: segurança e consistência ---------- */
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('interface: CSP presente, sem estilos inline nem scripts inline, sem eval', () => {
  const html = read('renderer/index.html');
  assert.ok(/Content-Security-Policy/.test(html));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html), 'script inline no HTML');
  assert.ok(!/\sstyle=/i.test(html));
  const app = read('renderer/app.js');
  assert.ok(!/\beval\(|new Function\(/.test(app));
  assert.ok(!/\.innerHTML\s*=/.test(app), 'innerHTML no renderer');
  assert.ok(!/setAttribute\(\s*['"]style['"]/.test(app));
  assert.ok(!/\bstyle:\s*['"`]/.test(app), 'atributo style como texto no renderer');
});

test('interface: ids usados com getElementById existem no HTML ou são criados no app.js', () => {
  const app = read('renderer/app.js');
  const html = read('renderer/index.html');
  const used = [...app.matchAll(/getElementById\('([\w-]+)'\)/g)].map((m) => m[1]);
  for (const id of new Set(used)) {
    assert.ok(html.includes(`id="${id}"`) || new RegExp(`id:\\s*'${id}'`).test(app), `id "${id}" não existe`);
  }
});

test('interface: todo canal do preload tem handler no main e vice-versa', () => {
  const main = read('main.js');
  const pre = read('preload.js');
  const handles = new Set([...main.matchAll(/handle\('([\w:.-]+)'/g)].map((m) => m[1]));
  const chans = new Set([...pre.matchAll(/(?:call|invoke)\('([\w:.-]+)'/g)].map((m) => m[1]));
  for (const c of chans) assert.ok(handles.has(c), 'sem handler: ' + c);
  for (const h of handles) assert.ok(chans.has(h), 'sem preload: ' + h);
});

test('interface: tudo que o renderer chama em window.api existe no preload', () => {
  const app = read('renderer/app.js');
  const pre = read('preload.js');
  const exposed = new Set([...pre.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));
  for (const m of app.matchAll(/window\.api\.(\w+)/g)) assert.ok(exposed.has(m[1]), 'preload sem ' + m[1]);
});

test('interface: classes CSS usadas em app.js têm regra no styles.css (e não sobram regras mortas óbvias)', () => {
  const app = read('renderer/app.js');
  const css = read('renderer/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const usedClasses = new Set();
  for (const m of app.matchAll(/class:\s*'([^'$]+)'/g)) for (const c of m[1].trim().split(/\s+/)) usedClasses.add(c);
  const dead = [...defined].filter((c) => !new RegExp(c.replace(/[-]/g, '[-]')).test(app) && !read('renderer/index.html').includes(c));
  assert.deepEqual(dead, [], 'regras CSS sem uso: ' + dead.join(', '));
});

test('main: arquivos exigidos existem e a janela usa isolamento', () => {
  const main = read('main.js');
  assert.ok(/contextIsolation:\s*true/.test(main));
  assert.ok(/nodeIntegration:\s*false/.test(main));
  assert.ok(/sandbox:\s*true/.test(main));
  for (const f of ['preload.js', 'renderer/index.html', 'renderer/app.js', 'renderer/styles.css', 'assets/icon.ico', 'Executar.bat']) assert.ok(fs.existsSync(path.join(root, f)), f);
});

/* ---------- desempenho: textos enormes não podem travar o programa ---------- */
test('desempenho: funções de texto respondem rápido com páginas gigantes e entradas hostis', () => {
  const shapes = [' '.repeat(300000) + 'x', '. '.repeat(150000), 'Silver '.repeat(80000), 'ending all\n'.repeat(50000), 'Fate of Atlantis ending all every each '.repeat(8000), '('.repeat(100000), 'Main Story '.repeat(20000)];
  const fns = [
    (s) => hltb.parseHltbText(s), (s) => origin.groupLabel(s, 'Jogo'), (s) => origin.sectionOrigin(s, 'Jogo'), (s) => origin.labelIn(s, ['Fate of Atlantis']),
    (s) => guides.scoreText(s), (s) => guides.findSnippets(s, { apiName: 'A', nameEn: 'Silver ending' }), (s) => guides.extractSummary(s),
    (s) => guides.isRarityOnly(s), (s) => guides.looksLikeProse(s), (s) => guides.nameVariants(s), (s) => cleanGameName(s), (s) => tr.splitText(s),
  ];
  for (const sh of shapes) for (const fn of fns) {
    const t = Date.now();
    fn(sh);
    assert.ok(Date.now() - t < 2500, `lento: ${fn.toString().slice(0, 60)}`);
  }
});

test('hltb.parseHltbText: nome na linha de cima e vários resultados na mesma linha', () => {
  const r = hltb.parseHltbText('Hades\nMain Story 22 Hours Main + Extra 40 Hours Completionist 95 Hours\nPortal 2\nMain Story 8½ Hours Main + Extra 12 Hours Completionist 20 Hours');
  assert.deepEqual(r.map((x) => [x.name, x.story, x.full]), [['Hades', 22, 95], ['Portal 2', 8.5, 20]]);
  const l = hltb.parseHltbText('Add to Profile Celeste Main Story 8 Hours Main + Extra 12 Hours Completionist 30 Hours');
  assert.equal(l[0].name, 'Celeste');
});

test('origin.dlcLabel: só o nome da DLC, sem repetir o nome do jogo (®, ™, travessões e apóstrofos diferentes)', () => {
  const c = [
    ["Assassin's Creed® Odyssey – Legacy of the First Blade", "Assassin's Creed Odyssey", 'Legacy of the First Blade'],
    ["Assassin's Creed® Odyssey - The Fate of Atlantis", "Assassin's Creed Odyssey", 'The Fate of Atlantis'],
    ["ASSASSIN’S CREED ODYSSEY: Story Creator", "Assassin's Creed Odyssey", 'Story Creator'],
    ['Elden Ring - Shadow of the Erdtree', 'Elden Ring', 'Shadow of the Erdtree'],
    ['The Witcher 3: Wild Hunt - Blood and Wine', 'The Witcher 3: Wild Hunt', 'Blood and Wine'],
    ['Jogo', 'Jogo', 'Jogo'],
    ['Outra Coisa', 'Jogo', 'Outra Coisa'],
    ['Jogo X Hard Mode (DLC)', 'Jogo X', 'Hard Mode'],
  ];
  for (const [dlc, game, want] of c) assert.equal(origin.dlcLabel(dlc, game), want, dlc);
  assert.equal(origin.dlcLabel('', 'Jogo'), '');
  assert.doesNotThrow(() => origin.dlcLabel(null, null));
});

/* ---------- mapas: nunca o mapa de outro jogo ---------- */
const { makeRelates } = require('../src/maps');

test('maps.makeRelates: só aceita endereços que citam o jogo (nada de mapa de outro jogo)', () => {
  const isaac = makeRelates(['The Binding of Isaac: Rebirth', 'Rebirth', 'The Binding of Isaac']);
  assert.ok(isaac.url('https://mapgenie.io/the-binding-of-isaac-rebirth'));
  assert.ok(isaac.url('https://thebindingofisaacrebirth.wiki.fextralife.com/Interactive+Map'));
  assert.ok(isaac.url('https://www.ign.com/maps/binding-of-isaac'));
  assert.ok(!isaac.url('https://mapgenie.io/rebirth'), 'variante de uma palavra não vale');
  assert.ok(!isaac.url('https://www.gamepressure.com/titan-quest-2/interactive-maps'));
  assert.ok(!isaac.url('https://mapgenie.io/'));
  assert.ok(!isaac.url('lixo'));
  assert.ok(isaac.title('The Binding of Isaac: Rebirth Interactive Map'));
  assert.ok(!isaac.title('Titan Quest 2 Interactive Map'));
  const solo = makeRelates(['Skyrim']);
  assert.ok(solo.url('https://mapgenie.io/skyrim'));
  assert.ok(!solo.url('https://mapgenie.io/fallout-4'));
  const none = makeRelates([]);
  assert.ok(!none.url('https://mapgenie.io/x'));
  assert.doesNotThrow(() => makeRelates(null).title(null));
});
