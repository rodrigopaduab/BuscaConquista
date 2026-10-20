'use strict';

/**
 * Porta de entrada do programa (NÃO MEXA neste arquivo: ele fica "congelado" na versão instalada).
 * Se existir uma atualização baixada (userData/atualizacoes/current.json) mais nova que a versão instalada e
 * feita para este Electron, carrega o código dela; senão, o código que veio na instalação.
 * Se a atualização falhar ao abrir 3 vezes seguidas, ela é marcada como ruim e a versão instalada volta a valer.
 */
const fs = require('fs');
const path = require('path');

const MAX_TRIES = 3;

const parts = (v) => { const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim()); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };
const newer = (a, b) => { const x = parts(a); const y = parts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

function readMeta(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, 'current.json'), 'utf8')); } catch (_) { return null; } }
function writeMeta(dir, meta) {
  try { fs.writeFileSync(path.join(dir, 'current.json.tmp'), JSON.stringify(meta)); fs.renameSync(path.join(dir, 'current.json.tmp'), path.join(dir, 'current.json')); } catch (_) { /* sem disco: segue */ }
}

/** Decide qual código abrir. Devolve { file, meta } da atualização, ou null para usar o instalado. */
function choose({ dir, bundledVersion, electronMajor }) {
  const meta = readMeta(dir);
  if (!meta || meta.bad || typeof meta.file !== 'string' || /[\\/]/.test(meta.file)) return null;
  const file = path.join(dir, meta.file);
  if (!fs.existsSync(file)) return null;
  if (!newer(meta.version, bundledVersion)) return null; // a instalada já é igual ou mais nova
  if (meta.electron != null && Number(meta.electron) !== Number(electronMajor)) return null;
  if (meta.pending && (meta.tries || 0) >= MAX_TRIES) { writeMeta(dir, { ...meta, bad: true }); return null; }
  return { file, meta };
}

function start() {
  const { app } = require('electron');
  const bundledVersion = require('./package.json').version;
  let picked = null;
  const dir = path.join(app.getPath('userData'), 'atualizacoes');
  // em desenvolvimento (npm start) vale sempre o código da pasta
  if (app.isPackaged) picked = choose({ dir, bundledVersion, electronMajor: Number(String(process.versions.electron).split('.')[0]) });
  if (picked) {
    writeMeta(dir, { ...picked.meta, pending: true, tries: (picked.meta.tries || 0) + 1 });
    // o programa chama isto quando a janela abre direito: a atualização está boa
    global.__buscaBootOk = () => { const m = readMeta(dir); if (m && m.pending) writeMeta(dir, { ...m, pending: false, tries: 0 }); };
    global.__buscaRunning = path.basename(picked.file);
    try {
      require(path.join(picked.file, 'main.js'));
      return;
    } catch (err) {
      console.error('Atualização falhou ao abrir; usando a versão instalada.', err);
      writeMeta(dir, { ...picked.meta, bad: true });
      global.__buscaRunning = null;
    }
  }
  require('./main.js');
}

if (process.versions.electron && require.main === module) start();

module.exports = { choose, newer, MAX_TRIES };
