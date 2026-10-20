'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_THEME, isTheme } = require('./themes');

/**
 * Guarda o perfil e a chave da Steam em config.json.
 * A chave é criptografada com o safeStorage do Electron (no Windows usa a conta do usuário).
 * Se a criptografia não estiver disponível, a chave fica apenas codificada (não é segurança real)
 * e isso é marcado em `enc: "plain"`.
 */
function createConfigStore({ dir, safeStorage }) {
  const file = path.join(dir, 'config.json');

  function read() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    } catch (_) {
      return {};
    }
  }

  function write(data) {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2)); // grava num arquivo ao lado e troca: queda de energia não corrompe o perfil
    fs.renameSync(tmp, file);
  }

  function encrypt(text) {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return { enc: 'safe', v: safeStorage.encryptString(text).toString('base64') };
    }
    return { enc: 'plain', v: Buffer.from(text, 'utf8').toString('base64') };
  }

  function decrypt(obj) {
    if (!obj || !obj.v) return '';
    const buf = Buffer.from(obj.v, 'base64');
    if (obj.enc === 'safe') {
      if (!safeStorage) return '';
      try {
        return safeStorage.decryptString(buf);
      } catch (_) {
        return '';
      }
    }
    return buf.toString('utf8');
  }

  return {
    file,

    /** Dados que a interface pode ver (nunca a chave). */
    getPublic() {
      const c = read();
      return {
        configured: Boolean(c.steamId && c.apiKey),
        steamId: c.steamId || '',
        profileInput: c.profileInput || '',
        personaName: c.personaName || '',
        avatar: c.avatar || '',
        theme: isTheme(c.theme) ? c.theme : DEFAULT_THEME,
      };
    },

    /** Guarda o tema de cores (não mexe no perfil nem na chave). */
    setTheme(theme) {
      if (!isTheme(theme)) throw new Error('Tema inválido');
      write({ ...read(), theme });
    },

    getApiKey() {
      return decrypt(read().apiKey);
    },

    getSteamId() {
      return read().steamId || '';
    },

    save({ steamId, profileInput, personaName, avatar, apiKey }) {
      const current = read();
      write({
        ...current,
        steamId,
        profileInput,
        personaName,
        avatar,
        apiKey: apiKey ? encrypt(apiKey) : current.apiKey,
      });
    },

    clear() {
      fs.rmSync(file, { force: true });
    },
  };
}

module.exports = { createConfigStore };
