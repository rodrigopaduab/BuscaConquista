'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitize, normalizeHost, validTemplate, expandTemplate, DEFAULTS } = require('../src/settings');
const guides = require('../src/guides');

test('sanitize: padrão tudo ligado, nada personalizado', () => {
  const s = sanitize(undefined);
  assert.equal(s.powerpyx, true); assert.equal(s.web, true); assert.equal(s.translate, true);
  assert.deepEqual(s.custom, []); assert.deepEqual(s.blocked, []);
  assert.deepEqual(sanitize(DEFAULTS).custom, []);
});

test('validTemplate: só https e com {slug}, {nome} ou {id}', () => {
  assert.ok(validTemplate('https://site.com/guia/{slug}/'));
  assert.equal(validTemplate('http://site.com/{slug}'), null);
  assert.equal(validTemplate('https://site.com/guia'), null);
  assert.equal(validTemplate('javascript:alert({slug})'), null);
  assert.equal(validTemplate('https://localhost/{slug}'), null);
});

test('normalizeHost aceita endereço ou domínio e tira o www', () => {
  assert.equal(normalizeHost('https://www.Site.com/abc'), 'site.com');
  assert.equal(normalizeHost('site.com'), 'site.com');
  assert.equal(normalizeHost('lixo'), null);
});

test('sanitize: limita fontes, remove inválidas, deduplica bloqueados', () => {
  const s = sanitize({
    custom: [{ name: 'Meu site', template: 'https://a.com/{slug}', enabled: false }, { name: 'ruim', template: 'ftp://x/{slug}' }],
    blocked: ['https://www.Ruim.com/x', 'ruim.com', 'xx'],
    translate: false,
  });
  assert.equal(s.custom.length, 1);
  assert.equal(s.custom[0].enabled, false);
  assert.deepEqual(s.blocked, ['ruim.com']);
  assert.equal(s.translate, false);
});

test('expandTemplate usa as variações do nome', () => {
  const urls = expandTemplate('https://a.com/{slug}-guide/', { appid: 1 }, ['Grand Theft Auto IV', 'GTA 4'], guides.slugify);
  assert.deepEqual(urls, ['https://a.com/grand-theft-auto-iv-guide/', 'https://a.com/gta-4-guide/']);
});

test('webFallback: fonte personalizada é aberta primeiro e site bloqueado pelo usuário é ignorado', async () => {
  const opened = [];
  const getPage = async (url, opts) => {
    opened.push(url);
    if (/bing\.com/.test(url)) return { ok: true, text: 'x', links: [{ href: 'https://blocked.example/a', text: 'a' }] };
    if (/meu\.site/.test(url)) return { ok: true, text: 'x', links: [], extra: { results: { 'Test Achievement': { parts: [{ t: 'text', v: 'Do the thing in the place for ten minutes straight.' }] } } }, date: '2025-01-02' };
    return { ok: false };
  };
  const r = await guides.webFallback({
    game: { name: 'Jogo' }, targets: [{ apiName: 'A', nameEn: 'Test Achievement' }], getPage,
    seeds: [{ url: 'https://meu.site/jogo/', label: 'Meu site' }], blocked: ['blocked.example'], onResult: () => {},
  });
  assert.equal(r.found, 1);
  assert.equal(opened.filter((u) => /blocked\.example/.test(u)).length, 0);
  assert.ok(opened.some((u) => u === 'https://meu.site/jogo/'));
  const before = opened.filter((u) => /bing\.com/.test(u)).length;
  const none = await guides.webFallback({ game: { name: 'Jogo' }, targets: [{ apiName: 'A', nameEn: 'Test Achievement' }], getPage, useSearch: false, seeds: [] });
  assert.equal(none.found, 0);
  assert.equal(opened.filter((u) => /bing\.com/.test(u)).length, before);
});

test('webFallback: páginas dos sites preferidos são abertas antes das outras; texto igual ao da Steam é descartado', async () => {
  const opened = [];
  const getPage = async (url) => {
    opened.push(url);
    if (/bing\.com/.test(url)) return { ok: true, text: 'x', links: [{ href: 'https://outro.example/a', text: 'a' }, { href: 'https://www.ign.com/wikis/jogo/Achievements', text: 'ign' }] };
    const ach = { 'Test Achievement': { parts: [{ t: 'text', v: 'Same description as steam.' }] } };
    return { ok: true, text: 'x', links: [], extra: { results: ach } };
  };
  const r = await guides.webFallback({
    game: { name: 'Jogo' }, targets: [{ apiName: 'A', nameEn: 'Test Achievement', descEn: 'Same description as Steam.' }], getPage,
    preferred: [{ host: 'ign.com', label: 'IGN Wiki' }], onResult: () => {},
  });
  const pages = opened.filter((u) => !/bing\.com/.test(u));
  assert.ok(/ign\.com/.test(pages[0]));
  assert.equal(r.found, 0); // repetia a descrição da Steam
});

test('isAntiBotPage reconhece a verificação do Cloudflare (inglês e português) e ignora páginas normais', () => {
  assert.ok(guides.isAntiBotPage({ title: 'Just a moment...', text: 'Verifying you are human' }));
  assert.ok(guides.isAntiBotPage({ title: 'Um momento…', text: 'Executando verificação de segurança' }));
  assert.ok(!guides.isAntiBotPage({ title: 'Guia', text: 'a'.repeat(5000) }));
  assert.ok(!guides.isAntiBotPage({ title: 'Um momento na história', text: 'a'.repeat(5000) }));
});

test('webFallback devolve os sites com anti-robô para o programa bloquear', async () => {
  const getPage = async (url) => {
    if (/bing\.com/.test(url)) return { ok: true, text: 'x', links: [{ href: 'https://robo.example/a', text: 'a' }] };
    if (/robo\.example/.test(url)) return { ok: false, antiBot: true, reason: 'o site pede verificação anti-robô' };
    return { ok: false };
  };
  const r = await guides.webFallback({ game: { name: 'Jogo' }, targets: [{ apiName: 'A', nameEn: 'Test Achievement' }], getPage, onResult: () => {} });
  assert.deepEqual(r.antiBotHosts, ['robo.example']);
});

test('sanitize guarda a lista de bloqueados automáticos', () => {
  const s = sanitize({ autoBlocked: [{ host: 'robo.example', at: 5 }, { host: 'x' }] });
  assert.deepEqual(s.autoBlocked, [{ host: 'robo.example', at: 5 }]);
});

test('{junto} e fontes de mapa', () => {
  const S = require('../src/settings');
  assert.ok(S.validTemplate('https://{junto}.wiki.fextralife.com/Interactive+Map'));
  const urls = S.expandTemplate('https://{junto}.wiki.fextralife.com/Interactive+Map', { appid: 1 }, ["Elden Ring"], (n) => n.toLowerCase().replace(/ /g, '-'));
  assert.deepStrictEqual(urls, ['https://eldenring.wiki.fextralife.com/Interactive+Map']);
  assert.ok(S.MAP_SOURCES.length >= 3);
  assert.deepStrictEqual(S.sanitize({ mapgenie: false, mapsOff: ['ign-maps', 'lixo'] }).mapsOff.sort(), ['ign-maps', 'mapgenie']);
  assert.ok(S.PREFERRED.length >= 9);
});

test('preferências de aparência e uso: valores válidos ou padrão', () => {
  const settingsLib = require('../src/settings');
  const d = settingsLib.sanitize({});
  assert.strictEqual(d.fontScale, 'normal');
  assert.strictEqual(d.density, 'normal');
  assert.strictEqual(d.defaultFilter, 'missing');
  assert.strictEqual(d.groupDlc, true);
  assert.strictEqual(d.startView, 'last');
  assert.strictEqual(d.colorIcons, false);
  const c = settingsLib.sanitize({ fontScale: 'enorme', density: 'compacta', defaultFilter: 'all', groupDlc: false, startView: 'search', colorIcons: true, summaryOpen: true });
  assert.deepStrictEqual([c.fontScale, c.density, c.defaultFilter, c.groupDlc, c.startView, c.colorIcons, c.summaryOpen], ['enorme', 'compacta', 'all', false, 'search', true, true]);
  const bad = settingsLib.sanitize({ fontScale: 'x', density: 5, defaultFilter: 'zzz', startView: 1 });
  assert.deepStrictEqual([bad.fontScale, bad.density, bad.defaultFilter, bad.startView], ['normal', 'normal', 'missing', 'last']);
});

test('novas preferências: rádio, cache, idioma e ordem', () => {
  const settingsLib = require('../src/settings');
  const d = settingsLib.sanitize({});
  assert.deepStrictEqual([d.radioMode, d.radioHidden, d.cacheDays, d.cacheMaxMb, d.clearOnExit, d.guideLang, d.hideDemos, d.dlcExophase], ['never', false, 30, 0, false, 'pt', false, true]);
  const c = settingsLib.sanitize({ radioMode: 'auto', cacheDays: 90, cacheMaxMb: 250, guideLang: 'both', sourceOrder: ['IGN Wiki', 'IGN Wiki', 'PowerPyx'], ignoreWords: ['Reforged', 'x', 'Reforged'], alwaysFresh: ['percent', 'zzz', 'percent'] });
  assert.deepStrictEqual([c.radioMode, c.cacheDays, c.cacheMaxMb, c.guideLang, c.translate], ['auto', 90, 250, 'both', true]);
  assert.deepStrictEqual(c.sourceOrder, ['IGN Wiki', 'PowerPyx']);
  assert.deepStrictEqual(c.ignoreWords, ['Reforged']);
  assert.deepStrictEqual(c.alwaysFresh, ['percent']);
  assert.strictEqual(settingsLib.sanitize({ guideLang: 'en' }).translate, false);
  assert.strictEqual(settingsLib.sanitize({ cacheDays: 5, cacheMaxMb: 7 }).cacheDays, 30);
});

test('barra de pesquisa recolhida: padrão desligado', () => {
  const settingsLib = require('../src/settings');
  assert.strictEqual(settingsLib.sanitize({}).progressCollapsed, false);
  assert.strictEqual(settingsLib.sanitize({ progressCollapsed: true }).progressCollapsed, true);
});
