'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { THEMES, DEFAULT_THEME, isTheme } = require('../src/themes');
const { createConfigStore } = require('../src/config');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'buscaconquista-ui-'));

function themeVars(id) {
  const selector = id === DEFAULT_THEME ? ':root,\n:root[data-theme="padrao"]' : `:root[data-theme="${id}"]`;
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `bloco de cores do tema "${id}" não encontrado em styles.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return [...body.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]).sort();
}

test('os 6 temas da Steam existem, com os mesmos nomes', () => {
  assert.deepEqual(THEMES, ['padrao', 'verao', 'meia-noite', 'aco', 'cosmico', 'escuro']);
  for (const name of ['Tema Padrão', 'Verão', 'Meia-Noite', 'Aço', 'Cósmico', 'Modo Escuro']) {
    assert.ok(appJs.includes(`name: '${name}'`), `falta o nome "${name}" na tela de configurações`);
  }
});

test('cada tema define todas as variáveis de cor e tem sua amostra', () => {
  const expected = themeVars(DEFAULT_THEME);
  assert.ok(expected.length >= 20);
  for (const id of THEMES) {
    assert.deepEqual(themeVars(id), expected, `o tema "${id}" não define as mesmas cores que o padrão`);
    assert.ok(css.includes(`.swatch[data-t="${id}"]`), `falta a amostra redonda do tema "${id}"`);
    assert.ok(appJs.includes(`id: '${id}'`), `o tema "${id}" não aparece em app.js`);
  }
});

test('config guarda o tema sem mexer na conta e ignora temas inválidos', () => {
  const store = createConfigStore({ dir: tmp(), safeStorage: null });
  assert.equal(store.getPublic().theme, DEFAULT_THEME);
  store.setTheme('cosmico');
  assert.equal(store.getPublic().theme, 'cosmico');
  store.save({ steamId: '76561198000000001', profileInput: 'rodrigo', personaName: 'R', avatar: '', apiKey: 'K' });
  assert.equal(store.getPublic().theme, 'cosmico', 'salvar a conta não zera o tema');
  assert.throws(() => store.setTheme('rosa-choque'));
  assert.equal(isTheme('rosa-choque'), false);
  assert.equal(store.getPublic().theme, 'cosmico');
});

test('ícone do programa: PNG 512x512 e ICO com vários tamanhos (incluindo 256)', () => {
  const png = fs.readFileSync(path.join(root, 'assets', 'icon.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);

  const ico = fs.readFileSync(path.join(root, 'assets', 'icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0); // reservado
  assert.equal(ico.readUInt16LE(2), 1); // tipo: ícone
  const count = ico.readUInt16LE(4);
  assert.ok(count >= 6, 'poucos tamanhos no .ico');
  const widths = [];
  for (let i = 0; i < count; i++) widths.push(ico[6 + i * 16] || 256); // 0 significa 256
  assert.ok(widths.includes(16) && widths.includes(32) && widths.includes(256));
});

test('a foto/nome do perfil abrem o perfil na Steam e o ícone tem plano B', () => {
  assert.ok(appJs.includes('https://steamcommunity.com/profiles/${cfg.steamId}'));
  assert.ok(appJs.includes('function achievementIcon'));
  assert.ok(appJs.includes('PLACEHOLDER_ICON'));
});

test('logo ao lado do nome, busca centralizada e ícones com hospedagens de reserva', () => {
  assert.ok(fs.existsSync(path.join(root, 'renderer', 'logo.svg')));
  assert.ok(appJs.includes("src: 'logo.svg'"));
  assert.ok(fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8').includes("img-src 'self'"));
  assert.ok(css.includes('grid-template-columns: 1fr minmax(280px, 560px) 1fr'));
  for (const host of ['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'shared.cloudflare.steamstatic.com']) {
    assert.ok(appJs.includes(host), host);
  }
});

test('imageCandidates troca o caminho antigo pelo novo da Steam (community_assets)', () => {
  const m = appJs.match(/const OLD_APP_IMAGE_PATH[\s\S]*?\n}\n/);
  const STEAM = appJs.match(/const STEAM_SHARED_HOSTS = .*\n/)[0];
  const fn = new Function(STEAM + m[0] + '; return imageCandidates;')();
  const old = 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/2054970/e3c64285aeb6bf2249a92516ebe628bf285a0bb9.jpg';
  const out = fn(old);
  assert.equal(out[0], 'https://shared.fastly.steamstatic.com/community_assets/images/apps/2054970/e3c64285aeb6bf2249a92516ebe628bf285a0bb9.jpg');
  assert.equal(out.at(-1), old);
  assert.deepEqual(fn('data:image/svg+xml;utf8,x'), ['data:image/svg+xml;utf8,x']);
  assert.deepEqual(fn(''), []);
});

test('app.js tem uma única imagem/ícone (sem funções duplicadas)', () => {
  assert.equal((appJs.match(/function imageCandidates/g) || []).length, 1);
  assert.equal((appJs.match(/function achievementIcon/g) || []).length, 1);
  assert.ok(!appJs.includes('STEAM_IMAGE_HOSTS'));
});
