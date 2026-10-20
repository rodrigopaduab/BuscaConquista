'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Cache simples em arquivos JSON, dentro da pasta BuscaConquistaCache (em Documentos).
 * Cada entrada guarda o momento em que foi salva, para respeitar o prazo (TTL).
 */
function createCache(dir, now = Date.now) {
  function fileFor(key) {
    const safe = String(key)
      .split('/')
      .map((part) => part.replace(/[^\w.-]/g, '_').replace(/^\.+/, '_'))
      .filter(Boolean);
    if (!safe.length) throw new Error('Chave de cache inválida');
    return path.join(dir, ...safe) + '.json';
  }

  function readEntry(key) {
    try {
      const entry = JSON.parse(fs.readFileSync(fileFor(key), 'utf8'));
      if (entry && typeof entry.savedAt === 'number') return entry;
    } catch (_) {
      /* sem cache ou arquivo corrompido: tratamos como ausente */
    }
    return undefined;
  }

  return {
    dir,

    /** Valor salvo, se ainda estiver dentro do prazo (ttlMs). */
    get(key, ttlMs) {
      const entry = readEntry(key);
      if (!entry) return undefined;
      if (ttlMs != null && now() - entry.savedAt > ttlMs) return undefined;
      return entry.value;
    },

    /** Valor salvo mesmo vencido (útil quando a Steam está fora do ar). */
    getStale(key) {
      const entry = readEntry(key);
      return entry ? entry.value : undefined;
    },

    set(key, value) {
      const file = fileFor(key);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`; // único: gravações simultâneas da mesma chave não se atropelam
      try {
        fs.writeFileSync(tmp, JSON.stringify({ savedAt: now(), value }));
        fs.renameSync(tmp, file);
      } catch (err) { try { fs.rmSync(tmp, { force: true }); } catch (_) { /* ignora */ } throw err; }
    },

    /** Lista tudo que está salvo: [{ key, bytes, savedAt }]. */
    list() {
      const out = [];
      const walk = (folder, prefix) => {
        let names = [];
        try { names = fs.readdirSync(folder, { withFileTypes: true }); } catch (_) { return; }
        for (const d of names) {
          const full = path.join(folder, d.name);
          if (d.isDirectory()) walk(full, prefix + d.name + '/');
          else if (d.name.endsWith('.json')) {
            try {
              const st = fs.statSync(full);
              const entry = JSON.parse(fs.readFileSync(full, 'utf8'));
              out.push({ key: prefix + d.name.slice(0, -5), bytes: st.size, savedAt: entry && entry.savedAt || st.mtimeMs, value: entry && entry.value });
            } catch (_) { /* arquivo ilegível: ignora */ }
          }
        }
      };
      walk(dir, '');
      return out;
    },

    /** Apaga uma entrada. */
    remove(key) {
      try { fs.rmSync(fileFor(key), { force: true }); } catch (_) { /* já não existe */ }
    },

    /** Apaga uma pasta inteira do cache (ex.: "steam/schema"). */
    clear(prefix = '') {
      const target = prefix ? path.dirname(fileFor(prefix + '/x')) : dir;
      fs.rmSync(target, { recursive: true, force: true });
    },
  };
}

/** Cache que não guarda nada (usado para validar a chave antes de salvar). */
const nullCache = {
  get: () => undefined,
  getStale: () => undefined,
  set: () => {},
  clear: () => {},
  list: () => [],
  remove: () => {},
};

module.exports = { createCache, nullCache };
