'use strict';

/**
 * Atualização automática do código do programa (arquivo app.asar) a partir das "Releases" do GitHub.
 * Só troca o código; o Electron (a parte pesada) continua o mesmo. Se uma versão exigir um Electron novo,
 * o programa avisa que é preciso instalar a versão completa.
 *
 * Cada release do GitHub leva 2 arquivos:  app.asar  e  update.json  ({ version, sha256, electron, notes }).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ASSET_ASAR = 'app.asar';
const ASSET_MANIFEST = 'update.json';
const MAX_ASAR_BYTES = 60 * 1024 * 1024;

/** "0.8.10" -> [0, 8, 10]; aceita "v0.8.1". Devolve null se não for uma versão. */
function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 1 se a > b, -1 se a < b, 0 se iguais (versões inválidas contam como 0.0.0). */
function compareVersions(a, b) {
  const x = parseVersion(a) || [0, 0, 0];
  const y = parseVersion(b) || [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}

/** O repositório foi configurado? ("dono/nome") */
const repoConfigured = (repo) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(repo || '')) && !/SEU-USUARIO/i.test(String(repo));

/**
 * Entre as releases do GitHub, escolhe a mais nova que serve: não é rascunho, tem os 2 arquivos,
 * é mais nova que a versão atual e (no canal "estável") não é pré-lançamento.
 */
function pickRelease(releases, { current, channel = 'beta' }) {
  let best = null;
  for (const r of Array.isArray(releases) ? releases : []) {
    if (!r || r.draft) continue;
    if (r.prerelease && channel !== 'beta') continue;
    const version = parseVersion(r.tag_name);
    if (!version) continue;
    const vs = version.join('.');
    if (compareVersions(vs, current) <= 0) continue;
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const asar = assets.find((a) => a && a.name === ASSET_ASAR && /^https:\/\//.test(a.browser_download_url || ''));
    const manifest = assets.find((a) => a && a.name === ASSET_MANIFEST && /^https:\/\//.test(a.browser_download_url || ''));
    if (!asar || !manifest) continue;
    if (!best || compareVersions(vs, best.version) > 0) best = { version: vs, prerelease: !!r.prerelease, asarUrl: asar.browser_download_url, manifestUrl: manifest.browser_download_url, asarSize: Number(asar.size) || 0, body: String(r.body || '') };
  }
  return best;
}

/** Valida o update.json. Lança erro se algo estiver errado. */
function parseManifest(json, expectVersion) {
  if (!json || typeof json !== 'object') throw new Error('update.json inválido');
  const version = parseVersion(json.version);
  if (!version) throw new Error('update.json sem versão');
  if (expectVersion && version.join('.') !== expectVersion) throw new Error(`update.json diz ${json.version}, mas a release é ${expectVersion}`);
  if (!/^[a-f0-9]{64}$/i.test(String(json.sha256 || ''))) throw new Error('update.json sem sha256 válido');
  const electron = json.electron == null ? null : Number(json.electron);
  if (electron != null && !Number.isInteger(electron)) throw new Error('update.json com versão do Electron inválida');
  return { version: version.join('.'), sha256: String(json.sha256).toLowerCase(), electron, notes: String(json.notes || '').slice(0, 4000) };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Lê o current.json (o que o boot.js usa) ou null. */
function readCurrent(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8')); } catch (_) { return null; }
}

/** Apaga arquivos app-*.asar antigos (os que não estão em uso). Os travados ficam para a próxima vez. */
function cleanOld(dir, keepFiles) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return; }
  for (const n of names) {
    if (!/^app-[\d.]+\.asar(\.tmp)?$/.test(n) || keepFiles.includes(n)) continue;
    try { fs.rmSync(path.join(dir, n), { force: true }); } catch (_) { /* em uso: tenta depois */ }
  }
}

/**
 * Atualizador. fetchFn(url, opts) devolve algo como a resposta do fetch (ok, status, json(), arrayBuffer()).
 * running = arquivo (dentro de dir) que o programa está usando agora, se for uma atualização.
 */
function createUpdater({ repo, currentVersion, electronMajor, dir, fetchFn, running = null, apiBase = 'https://api.github.com' }) {
  let state = { status: repoConfigured(repo) ? 'idle' : 'unconfigured', version: null, notes: '', error: '', checkedAt: 0 };
  let busy = false;
  const set = (patch) => { state = { ...state, ...patch }; return state; };

  async function getJson(url) {
    const res = await fetchFn(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'BuscaConquista-updater' } });
    if (!res.ok) throw new Error(`o servidor respondeu ${res.status}`);
    return res.json();
  }

  async function check({ channel = 'beta' } = {}) {
    if (!repoConfigured(repo)) return set({ status: 'unconfigured' });
    if (busy) return state;
    busy = true;
    try {
      set({ status: 'checking', error: '' });
      const releases = await getJson(`${apiBase}/repos/${repo}/releases?per_page=20`);
      // uma versão já baixada (esperando reiniciar) conta como a "atual": só baixa algo ainda mais novo
      const cur = readCurrent(dir);
      const pending = cur && !cur.bad && cur.file && fs.existsSync(path.join(dir, cur.file)) && compareVersions(cur.version, currentVersion) > 0 ? cur : null;
      const baseline = pending ? pending.version : currentVersion;
      const pick = pickRelease(releases, { current: baseline, channel });
      if (!pick) {
        return set(pending ? { status: 'ready', version: pending.version, notes: pending.notes || '', checkedAt: Date.now() } : { status: 'uptodate', version: null, notes: '', checkedAt: Date.now() });
      }
      const manifest = parseManifest(await getJson(pick.manifestUrl), pick.version);
      if (manifest.electron != null && manifest.electron !== electronMajor) {
        return set({ status: 'needs-full', version: manifest.version, notes: manifest.notes, checkedAt: Date.now() });
      }
      set({ status: 'downloading', version: manifest.version, notes: manifest.notes });
      const res = await fetchFn(pick.asarUrl, { headers: { 'User-Agent': 'BuscaConquista-updater' } });
      if (!res.ok) throw new Error(`o download respondeu ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_ASAR_BYTES) throw new Error('arquivo de atualização com tamanho inesperado');
      if (sha256(buf) !== manifest.sha256) throw new Error('o arquivo baixado não confere com o sha256 (download corrompido)');
      fs.mkdirSync(dir, { recursive: true });
      const file = `app-${manifest.version}.asar`;
      const tmp = path.join(dir, file + '.tmp');
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, path.join(dir, file));
      fs.writeFileSync(path.join(dir, 'current.json.tmp'), JSON.stringify({ version: manifest.version, file, sha256: manifest.sha256, electron: manifest.electron, notes: manifest.notes, at: Date.now(), pending: false, tries: 0, bad: false }));
      fs.renameSync(path.join(dir, 'current.json.tmp'), path.join(dir, 'current.json'));
      cleanOld(dir, [file, running].filter(Boolean));
      return set({ status: 'ready', version: manifest.version, notes: manifest.notes, checkedAt: Date.now() });
    } catch (err) {
      return set({ status: 'error', error: String((err && err.message) || err).slice(0, 200), checkedAt: Date.now() });
    } finally {
      busy = false;
    }
  }

  return { check, getState: () => state };
}

module.exports = { parseVersion, compareVersions, repoConfigured, pickRelease, parseManifest, sha256, readCurrent, cleanOld, createUpdater, ASSET_ASAR, ASSET_MANIFEST };
