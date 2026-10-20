'use strict';
/**
 * Gera os 2 arquivos de uma atualização: dist-update/app.asar e dist-update/update.json.
 * Esses dois arquivos são anexados a uma Release do GitHub (veja GUIA-ATUALIZACOES.md).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const INCLUDE = ['main.js', 'boot.js', 'preload.js', 'package.json', 'src', 'renderer', 'assets'];

async function main() {
  const asar = require('@electron/asar');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-upd-'));
  for (const f of INCLUDE) fs.cpSync(path.join(root, f), path.join(stage, f), { recursive: true });
  const outDir = path.join(root, 'dist-update');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'app.asar');
  await asar.createPackage(stage, out);
  fs.rmSync(stage, { recursive: true, force: true });
  const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
  let electron = null;
  try { electron = Number(String(require(path.join(root, 'node_modules', 'electron', 'package.json')).version).split('.')[0]); } catch (_) { /* sem electron instalado */ }
  let notes = '';
  try {
    const top = require(path.join(root, 'src', 'changelog.js'))[0];
    if (top && top.version === pkg.version) notes = top.items.map((i) => '• ' + String(i).replace(/\*\*/g, '')).join('\n');
  } catch (_) { /* sem notas */ }
  fs.writeFileSync(path.join(outDir, 'update.json'), JSON.stringify({ version: pkg.version, sha256: sha, electron, notes }, null, 2));
  console.log(`\nAtualização ${pkg.version} pronta em: ${outDir}`);
  console.log(`  app.asar  (${(fs.statSync(out).size / 1024).toFixed(0)} KB)\n  update.json`);
}
main().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
