'use strict';

/**
 * Steam "de mentira" para testes e capturas de tela (só roda com BUSCACONQUISTA_MOCK=1 ou nos testes).
 * Os nomes/descrições PT vêm do print do usuário; nomes em inglês marcados com [teste] são inventados
 * só para exercitar a interface — no uso real tudo vem da Steam.
 */

const DD2 = 2054970;
const SILENT_HILL_2 = 2124490;
const WOLFENSTEIN_2 = 612880;
const GOOD_KEY = new Set(['MOCKKEY', 'TESTKEY']);
const PRIVATE_ID = '76561198000000002';
const PUBLIC_ID = '76561198000000001';

function icon(color) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='${color}'/><path d='M32 12 48 20v14c0 10-7 17-16 20-9-3-16-10-16-20V20z' fill='none' stroke='#6b7683' stroke-width='3'/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
const BAD_ICON = 'https://invalid.example/icone-que-nao-existe.jpg';
const ICON = icon('#2b3a49');
const ICON_GRAY = icon('#1b242e');

// [apiName, nomePT, descPT, nomeEN, descEN, hidden, achieved, percent]
const DD2_ROWS = [
  ['ACH_REVIVE', 'Você não Morre tão Cedo', 'Ressuscitou mortos em um necrotério ou cemitério.', '[teste] You Do Not Die So Soon', 'Resurrected the dead in a morgue or graveyard.', 0, 0, 16.4],
  ['ACH_PEACE', 'Paz', 'Tornou-se Sobran de Vernworth.', 'Peace', 'Became Sovran of Vernworth.', 0, 0, '12.6'],
  ['ACH_DOGMA', 'Dogma do Dragão', 'Obteve o Dogma do Dragão.', "Dragon's Dogma", "Obtained Dragon's Dogma.", 0, 0, 10.1],
  ['ACH_GIGANTUS', 'Gigantus, nem sei quem é', 'Derrotou o gigantus rapidamente.', 'Gigantus, I Hardly Knew Ye', 'Defeated the gigantus in a short span of time.', 0, 0, 9.96],
  ['ACH_MEDUSA', 'Cabeça no lugar', 'Adquiriu a cabeça de uma medusa preservada.', '[teste] Head in Place', 'Acquired a preserved medusa head.', 0, 0, 7.8],
  ['ACH_MAISTER', 'Mestre dos Mestres', 'Adquiriu todos os ensinamentos de maestria.', 'Master of the Maisters', "Acquired every maister's teaching.", 0, 0, 6.3],
  ['ACH_NORGAN', 'Terras Esquecidas do Norte', 'Você chegou em Norgan.', '[teste] Forgotten Lands of the North', 'You arrived in Norgan.', 0, 0, 5.7],
  ['ACH_BBQ', 'Mestre do churrasco', 'Assou todos os tipos de carne à noite e de dia.', '[teste] Barbecue Master', 'Grilled every type of meat during the night and day.', 0, 0, 4.6],
  ['ACH_SECRET', '[teste] Segredo', '', '[teste] Secret', '', 1, 0, 3.2],
  ['ACH_END', '[teste] Final verdadeiro', 'Viu o final verdadeiro do jogo.', '[teste] True Ending', 'Reached the true ending.', 0, 0, 2.4],
  ['ACH_HARD', '[teste] Pesadelo', 'Conclua o jogo no modo difícil.', '[teste] Nightmare', 'Complete the game on Hard mode.', 0, 0, 1.9],
  ['ACH_MISS', '[teste] Chance única', 'Faça isto apenas uma vez durante a campanha.', '[teste] One Chance', 'Do this only once during the campaign.', 0, 0, 3.9],
  ['ACH_ARRIVE', '[teste] Chegou a Vernworth', 'Chegou em Vernworth.', '[teste] Arrived', 'Arrived in Vernworth.', 0, 1, 83.0],
  ['ACH_CAMP', '[teste] Acampamento', 'Acampou pela primeira vez.', '[teste] Camping', 'Went camping.', 0, 1, 81.2],
  ['ACH_VOCATION', '[teste] Mudou de vocação', 'Mudou de vocação.', '[teste] Vocation', 'Changed your vocation.', 0, 1, 67.9],
];

function ddSchema(lang) {
  const pt = lang === 'brazilian';
  return {
    game: {
      gameName: "Dragon's Dogma 2 (dados de teste)",
      availableGameStats: {
        achievements: DD2_ROWS.map(([name, np, dp, ne, de, hidden]) => ({
          name,
          defaultvalue: 0,
          displayName: pt ? np : ne,
          hidden,
          description: pt ? dp : de,
          // Falhas de propósito para testar o plano B dos ícones:
          //  ACH_NORGAN: só a versão cinza falha; ACH_BBQ: as duas falham.
          icon: name === 'ACH_BBQ' ? BAD_ICON : ICON,
          icongray: name === 'ACH_NORGAN' || name === 'ACH_BBQ' ? BAD_ICON : ICON_GRAY,
        })),
      },
    },
  };
}

function genericSchema(name) {
  return {
    game: {
      gameName: name,
      availableGameStats: {
        achievements: [1, 2, 3].map((n) => ({
          name: `ACH_${n}`, defaultvalue: 0, displayName: `[teste] Conquista ${n}`, hidden: 0,
          description: `Descrição de teste ${n}.`, icon: ICON, icongray: ICON_GRAY,
        })),
      },
    },
  };
}

function buildLibrary() {
  const now = Math.floor(Date.now() / 1000);
  return [
    { appid: DD2, name: "Dragon's Dogma 2", playtime_forever: 3120, rtime_last_played: now - 3 * 3600 },
    { appid: SILENT_HILL_2, name: 'SILENT HILL 2', playtime_forever: 900, rtime_last_played: now - 20 * 86400 },
    { appid: WOLFENSTEIN_2, name: 'Wolfenstein II: The New Colossus', playtime_forever: 600, rtime_last_played: now - 90 * 86400 },
    { appid: 413150, name: 'Stardew Valley', playtime_forever: 2400, rtime_last_played: now - 200 * 86400 },
    { appid: 1145360, name: 'Hades', playtime_forever: 0, rtime_last_played: 0 },
  ];
}

const STORE = [
  { type: 'app', id: 1245620, name: 'ELDEN RING' },
  { type: 'app', id: 367500, name: "Dragon's Dogma: Dark Arisen" },
  { type: 'app', id: DD2, name: "Dragon's Dogma 2" },
  { type: 'app', id: WOLFENSTEIN_2, name: 'Wolfenstein II: The New Colossus' },
];

function createMockFetch({ latencyMs = 0 } = {}) {
  const library = buildLibrary();
  const calls = [];

  function reply(status, body) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { status, ok: status >= 200 && status < 300, text: async () => text };
  }
  const FORBIDDEN = () => reply(403, '<html><body><h1>Forbidden</h1></body></html>');

  async function mockFetch(url) {
    calls.push(url);
    if (latencyMs) await new Promise((r) => setTimeout(r, latencyMs));
    const u = new URL(url);
    const q = u.searchParams;
    const path = u.pathname;

    if (u.hostname === 'store.steampowered.com') {
      const term = (q.get('term') || '').toLowerCase();
      const items = STORE.filter((i) => i.name.toLowerCase().includes(term));
      return reply(200, { total: items.length, items });
    }

    // Endpoint público (sem chave)
    if (path.includes('GetGlobalAchievementPercentagesForApp')) {
      if (Number(q.get('gameid')) !== DD2) return reply(200, { achievementpercentages: { achievements: [] } });
      return reply(200, { achievementpercentages: { achievements: DD2_ROWS.map((r) => ({ name: r[0], percent: r[7] })) } });
    }

    if (!GOOD_KEY.has(q.get('key') || '')) return FORBIDDEN();

    if (path.includes('ResolveVanityURL')) {
      const v = q.get('vanityurl');
      if (v === 'rodrigo') return reply(200, { response: { steamid: PUBLIC_ID, success: 1 } });
      if (v === 'privado') return reply(200, { response: { steamid: PRIVATE_ID, success: 1 } });
      return reply(200, { response: { success: 42, message: 'No match' } });
    }
    if (path.includes('GetPlayerSummaries')) {
      const id = q.get('steamids');
      if (id !== PUBLIC_ID && id !== PRIVATE_ID) return reply(200, { response: { players: [] } });
      return reply(200, { response: { players: [{ steamid: id, personaname: id === PUBLIC_ID ? 'Rodrigo (teste)' : 'Perfil Privado', avatarfull: '' }] } });
    }
    if (path.includes('GetOwnedGames')) {
      if (q.get('steamid') === PRIVATE_ID) return reply(200, { response: {} });
      return reply(200, { response: { game_count: library.length, games: library } });
    }
    if (path.includes('GetSchemaForGame')) {
      const appid = Number(q.get('appid'));
      if (appid === DD2) return reply(200, ddSchema(q.get('l')));
      const known = library.find((g) => g.appid === appid);
      if (known && appid !== 1145360) return reply(200, genericSchema(known.name));
      return reply(200, { game: {} });
    }
    if (path.includes('GetPlayerAchievements')) {
      if (q.get('steamid') === PRIVATE_ID) {
        return reply(403, { playerstats: { error: 'Profile is not public', success: false } });
      }
      const appid = Number(q.get('appid'));
      if (appid === DD2) {
        return reply(200, {
          playerstats: {
            steamID: q.get('steamid'), gameName: 'dd2', success: true,
            achievements: DD2_ROWS.map((r) => ({ apiname: r[0], achieved: r[6], unlocktime: r[6] ? 1_729_000_000 : 0 })),
          },
        });
      }
      if (library.some((g) => g.appid === appid)) {
        return reply(200, { playerstats: { success: true, achievements: [{ apiname: 'ACH_1', achieved: 1, unlocktime: 1_700_000_000 }, { apiname: 'ACH_2', achieved: 0, unlocktime: 0 }, { apiname: 'ACH_3', achieved: 0, unlocktime: 0 }] } });
      }
      return reply(400, { playerstats: { error: 'Requested app has no stats', success: false } });
    }
    return reply(404, 'not found');
  }

  mockFetch.calls = calls;
  return mockFetch;
}

module.exports = { createMockFetch, DD2, SILENT_HILL_2, WOLFENSTEIN_2, PUBLIC_ID, PRIVATE_ID };
