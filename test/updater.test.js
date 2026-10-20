'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const u = require('../src/updater');
const boot = require('../boot');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bc-t-'));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function fakeGithub({ tag = 'v0.8.1', prerelease = true, body = Buffer.from('conteudo-asar'), electron = 44, badSha = false } = {}) {
  const manifest = { version: tag.replace(/^v/, ''), sha256: badSha ? 'f'.repeat(64) : sha(body), electron, notes: 'nota' };
  const rel = [{ tag_name: tag, draft: false, prerelease, assets: [
    { name: 'app.asar', browser_download_url: 'https://x.test/app.asar', size: body.length },
    { name: 'update.json', browser_download_url: 'https://x.test/update.json' }] }];
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/releases')) return { ok: true, status: 200, json: async () => rel };
    if (url.endsWith('update.json')) return { ok: true, status: 200, json: async () => manifest };
    if (url.endsWith('app.asar')) return { ok: true, status: 200, arrayBuffer: async () => body };
    return { ok: false, status: 404 };
  };
  return { fetchFn, calls };
}
const mk = (dir, g, extra = {}) => u.createUpdater({ repo: 'a/b', currentVersion: '0.8.0', electronMajor: 44, dir, fetchFn: g.fetchFn, ...extra });

test('versões: comparação e validação', () => {
  assert.equal(u.compareVersions('0.8.10', '0.8.9'), 1);
  assert.equal(u.compareVersions('v1.0.0', '0.9.9'), 1);
  assert.equal(u.compareVersions('0.8.0', '0.8.0'), 0);
  assert.equal(u.parseVersion('abc'), null);
  assert.equal(u.repoConfigured('SEU-USUARIO/BuscaConquista'), false);
  assert.equal(u.repoConfigured('rodrigo/BuscaConquista'), true);
});

test('baixa, confere o sha256 e deixa a atualização pronta', async () => {
  const dir = tmp();
  const up = mk(dir, fakeGithub());
  const st = await up.check({ channel: 'beta' });
  assert.equal(st.status, 'ready');
  assert.equal(st.version, '0.8.1');
  const cur = u.readCurrent(dir);
  assert.equal(cur.file, 'app-0.8.1.asar');
  assert.ok(fs.existsSync(path.join(dir, cur.file)));
});

test('canal estável ignora pré-lançamento; nada novo = em dia', async () => {
  const st = await mk(tmp(), fakeGithub()).check({ channel: 'stable' });
  assert.equal(st.status, 'uptodate');
  const st2 = await mk(tmp(), fakeGithub({ tag: 'v0.7.9' })).check({ channel: 'beta' });
  assert.equal(st2.status, 'uptodate');
});

test('arquivo corrompido (sha diferente) é recusado e nada é gravado', async () => {
  const dir = tmp();
  const st = await mk(dir, fakeGithub({ badSha: true })).check({ channel: 'beta' });
  assert.equal(st.status, 'error');
  assert.equal(u.readCurrent(dir), null);
});

test('Electron diferente pede instalação completa', async () => {
  const st = await mk(tmp(), fakeGithub({ electron: 45 })).check({ channel: 'beta' });
  assert.equal(st.status, 'needs-full');
});

test('repositório não configurado não faz requisição', async () => {
  const g = fakeGithub();
  const st = await u.createUpdater({ repo: 'SEU-USUARIO/x', currentVersion: '0.8.0', electronMajor: 44, dir: tmp(), fetchFn: g.fetchFn }).check({});
  assert.equal(st.status, 'unconfigured');
  assert.equal(g.calls.length, 0);
});

test('falha de rede vira erro, sem travar', async () => {
  const up = u.createUpdater({ repo: 'a/b', currentVersion: '0.8.0', electronMajor: 44, dir: tmp(), fetchFn: async () => { throw new Error('offline'); } });
  assert.equal((await up.check({})).status, 'error');
  assert.equal((await up.check({})).status, 'error'); // pode tentar de novo
});

test('boot.choose: usa a atualização mais nova, ignora a velha, a ruim e a de outro Electron', async () => {
  const dir = tmp();
  assert.equal(boot.choose({ dir, bundledVersion: '0.8.0', electronMajor: 44 }), null);
  await mk(dir, fakeGithub()).check({ channel: 'beta' });
  assert.ok(boot.choose({ dir, bundledVersion: '0.8.0', electronMajor: 44 }));
  assert.equal(boot.choose({ dir, bundledVersion: '0.8.1', electronMajor: 44 }), null); // instalada já é igual
  assert.equal(boot.choose({ dir, bundledVersion: '0.8.0', electronMajor: 45 }), null);
  const meta = u.readCurrent(dir);
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ ...meta, pending: true, tries: boot.MAX_TRIES }));
  assert.equal(boot.choose({ dir, bundledVersion: '0.8.0', electronMajor: 44 }), null); // travou ao abrir: volta à instalada
  assert.equal(u.readCurrent(dir).bad, true);
  fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify({ ...meta, file: '../x.asar' }));
  assert.equal(boot.choose({ dir, bundledVersion: '0.8.0', electronMajor: 44 }), null); // caminho suspeito
});

test('configurações: canal e atualização automática', () => {
  const s = require('../src/settings');
  assert.equal(s.sanitize({}).autoUpdate, true);
  assert.equal(s.sanitize({ autoUpdate: false }).autoUpdate, false);
  assert.equal(s.sanitize({ updateChannel: 'x' }).updateChannel, 'beta');
  assert.equal(s.sanitize({ updateChannel: 'stable' }).updateChannel, 'stable');
});
