'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { textKind, normalizeParts, slugify, classifyText, findSnippets, findGuidePage, buildGuides, combineClassification, SOURCES } = require('../src/guides');
const { PAGE, getPage } = require('../dev/mock-pages');

const ach = (apiName, nameEn, extra = {}) => ({ apiName, nameEn, namePt: '', descEn: '', descPt: '', ...extra });

test('slugify faz o endereço do guia', () => {
  assert.equal(slugify("Dragon's Dogma 2"), 'dragons-dogma-2');
  assert.equal(slugify('SILENT HILL 2'), 'silent-hill-2');
  assert.equal(slugify('Wolfenstein II: The New Colossus'), 'wolfenstein-ii-the-new-colossus');
});

test('palavras-chave nos trechos dos guias', () => {
  assert.deepEqual(classifyText('This trophy is highly missable.'), ['missable']);
  assert.deepEqual(classifyText('The trophy may be glitched and not unlocking.'), ['bugged']);
  assert.ok(classifyText('Choose the second ending to get it.').includes('ending'));
  assert.ok(classifyText('Finish the game on Hard difficulty.').includes('difficulty'));
  assert.deepEqual(classifyText('Go to the village and talk to the man.'), []);
});

test('trechos: acha a linha da conquista e ignora nomes curtos demais', () => {
  const found = findSnippets(PAGE, ach('ACH_PEACE', 'Peace'));
  assert.ok(found.length >= 1);
  assert.ok(found[0].startsWith('Peace –'));
  assert.deepEqual(findSnippets(PAGE, ach('X', 'Ab')), []);
  assert.deepEqual(findSnippets(PAGE, ach('X', 'Inexistente total')), []);
  const heading = findSnippets(PAGE, ach('ACH_END', '[teste] True Ending'));
  assert.ok(heading[0].includes('Reach the true ending'), 'título curto junta com a linha seguinte');
});

const viaSearch404 = { done: false };
test('findGuidePage: tenta o endereço padrão e depois a busca do site', async () => {
  const src = SOURCES[0];
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('?s=')) return { ok: true, title: 'busca', text: 'x', links: [{ href: 'https://www.powerpyx.com/outro-jogo-trophy-guide-roadmap/', text: '' }, { href: 'https://www.powerpyx.com/dragons-dogma-2-trophy-guide-roadmap/', text: '' }] };
    if (url === 'https://www.powerpyx.com/dragons-dogma-2-trophy-guide-roadmap/') return { ok: true, title: 'Guide', text: PAGE, links: [] };
    return { ok: false, title: '404', text: '', links: [] };
  };
  const page = await findGuidePage(src, { name: "Dragon's Dogma 2" }, fake);
  assert.equal(page.url, 'https://www.powerpyx.com/dragons-dogma-2-trophy-guide-roadmap/');
  assert.equal(calls.length, 1, 'achou direto, sem precisar buscar');


  const viaSearch = await findGuidePage(src, { name: "Dragon's Dogma 2" }, async (url) => {
    if (url.includes('?s=')) return fake(url);
    if (url === 'https://www.powerpyx.com/dragons-dogma-2-trophy-guide-roadmap/' && !viaSearch404.done) { viaSearch404.done = true; return { ok: false, title: '404', text: '', links: [] }; }
    return fake(url);
  });
  assert.equal(viaSearch.url, 'https://www.powerpyx.com/dragons-dogma-2-trophy-guide-roadmap/');

  const noPage = await findGuidePage(src, { name: 'Jogo Inexistente' }, async () => ({ ok: false, title: '404', text: '', links: [] }));
  assert.equal(noPage, null);
});

test('buildGuides + combineClassification: Steam primeiro, guia depois, e avisa divergência', async () => {
  const achievements = [
    ach('ACH_PEACE', 'Peace', { descEn: 'Became Sovran of Vernworth.' }),
    ach('ACH_END', '[teste] True Ending', { descEn: 'Reached the true ending.' }),
    ach('ACH_HARD', '[teste] Nightmare', { descEn: 'Complete the game on Hard mode.' }),
    ach('ACH_GIG', 'Gigantus, I Hardly Knew Ye', { descEn: 'Defeated the gigantus rapidly.' }),
    ach('ACH_MAISTER', 'Master of the Maisters'),
    ach('ACH_NONE', 'Nada sobre isto no guia'),
  ];
  const built = await buildGuides({ game: { name: "Dragon's Dogma 2" }, achievements, getPage: async (u) => getPage(u) });
  assert.equal(built.sources[0].name, 'PowerPyx');
  assert.equal(built.byAchievement.ACH_NONE, undefined);
  // lista que não tem detalhes e sem tabela (fonte sem estrutura) ainda funciona pelo texto da página
  const plain = await buildGuides({ game: { name: "Dragon's Dogma 2" }, achievements: [achievements[0]], getPage: async (u) => ({ ...getPage(u), extra: null }) });
  assert.ok(plain.byAchievement.ACH_PEACE.snippets[0].parts[0].v.startsWith('Peace –'));

  const peaceSn = built.byAchievement.ACH_PEACE.snippets[0];
  assert.equal(peaceSn.short, false);
  assert.equal(peaceSn.parts[0].t, 'video');
  assert.ok(!peaceSn.parts.some((p) => p.t === 'text' && p.v === 'Became Sovran of Vernworth.'), 'ignora a explicação curta quando há detalhes');
  assert.deepEqual(peaceSn.parts.filter((p) => p.t === 'text').map((p) => p.kind).slice(0, 4), ['text', 'text', 'tip', 'note']);
  assert.equal(peaceSn.parts.filter((p) => p.t === 'img').length, 2);
  assert.ok(peaceSn.parts.find((p) => p.t === 'text' && p.v.includes('[R2]')), 'botões do controle viram [R2]');
  assert.ok(peaceSn.parts.filter((p) => p.t === 'text').every((p) => p.v.length > 0));
  assert.ok(!JSON.stringify(peaceSn).includes('…'), 'nada de texto cortado');

  const hardSn = built.byAchievement.ACH_HARD.snippets[0];
  assert.equal(hardSn.short, true, 'sem detalhes: usa a explicação curta');
  assert.equal(hardSn.parts[0].v, 'Complete the game on Hard mode.');

  const master = built.byAchievement.ACH_MAISTER.snippets[0];
  assert.ok(master.parts.some((p) => p.t === 'img'), '"Refer to Peace" traz o passo a passo de Peace');
  assert.ok(master.parts.some((p) => p.kind === 'note' && p.v.includes('Peace')));

  const peace = combineClassification(achievements[0], built.byAchievement.ACH_PEACE);
  assert.equal(peace.category, 'missable');
  assert.equal(peace.origin, 'guia');

  const hard = combineClassification(achievements[2], built.byAchievement.ACH_HARD);
  assert.equal(hard.category, 'difficulty');
  assert.equal(hard.origin, 'steam');

  const gig = combineClassification(achievements[3], built.byAchievement.ACH_GIG);
  assert.equal(gig.category, 'bugged');

  const end = combineClassification(achievements[1], built.byAchievement.ACH_END);
  assert.equal(end.category, 'ending');
  assert.equal(end.origin, 'steam');
  // Steam diz "final"; o trecho só sugere "perdível" de leve
  assert.ok(end.categories.includes('ending'));
  assert.deepEqual(end.categories, ['ending']); // a dica fraca de "perdível" (só um guia) não vira etiqueta sozinha
});

test('tipos de texto: dica, nota e aviso só quando o guia marca assim', () => {
  assert.equal(textKind('Tip: use fire.'), 'tip');
  assert.equal(textKind('Pro Tip! use fire.'), 'tip');
  assert.equal(textKind('Note: border crossing'), 'note');
  assert.equal(textKind('Warning: missable'), 'warning');
  assert.equal(textKind('Note that not all NPCs accept gifts.'), 'text');
  assert.equal(textKind('Step 1: do this'), 'text');
  const parts = normalizeParts([{ t: 'text', v: 'Refer to [SILVER]   An Eye.' }, { t: 'img', url: 'http://inseguro/x.png' }, { t: 'video', url: 'https://youtu.be/x' }, null]);
  assert.deepEqual(parts, [{ t: 'text', kind: 'text', v: 'Refer to An Eye.' }, { t: 'video', url: 'https://youtu.be/x' }]);
});

test('webFallback: busca no Bing, decodifica o link e extrai várias conquistas de uma página', async () => {
  const mock = require('../dev/mock-pages');
  const { webFallback } = require('../src/guides');
  const got = {};
  const attempts = [];
  const r = await webFallback({
    game: { name: "Dragon's Dogma 2" },
    targets: [{ apiName: 'A', nameEn: '[teste] Barbecue Master' }, { apiName: 'B', nameEn: '[teste] Forgotten Lands of the North' }],
    getPage: async (url, opts) => mock.getPage(url, opts), attempts,
    onResult: (api, sn) => { got[api] = sn; },
  });
  assert.equal(r.found, 2);
  assert.equal(got.A.source, 'mock-guides.example');
  assert.equal(got.A.date, '2026-10-10');
  assert.ok(got.A.parts.some((p) => p.t === 'img'));
});

test('candidateLinks ignora Reddit, YouTube e sites com verificação anti-robô', () => {
  const { candidateLinks } = require('../src/guides');
  const out = candidateLinks([
    { href: 'https://www.reddit.com/r/x', text: 'a' }, { href: 'https://www.trueachievements.com/x', text: 'b' },
    { href: 'https://game8.co/games/y#top', text: 'c' }, { href: 'https://game8.co/games/y', text: 'dup' },
  ]);
  assert.deepEqual(out, ['https://game8.co/games/y']);
});

test('toIsoDate converte datas de páginas reais (meta ISO e texto) e rejeita datas absurdas', () => {
  const { toIsoDate } = require('../src/page-scripts');
  assert.equal(toIsoDate('2024-04-07T15:47:43+00:00'), '2024-04-07');
  assert.equal(toIsoDate('March 27, 2024'), '2024-03-27');
  assert.equal(toIsoDate('1970-01-01'), null);
  assert.equal(toIsoDate(null), null);
});

test('translate: divide textos longos e junta a resposta do tradutor', async () => {
  const { splitText, parseResponse, translateOne } = require('../src/translate');
  const long = Array.from({ length: 80 }, (_, i) => `Frase número ${i} do guia.`).join(' ');
  const parts = splitText(long, 300);
  assert.ok(parts.length > 3 && parts.every((p) => p.length <= 300));
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), long);
  assert.equal(parseResponse([[['Olá ', 'Hello '], ['mundo', 'world']], null, 'en']), 'Olá mundo');
  assert.throws(() => parseResponse({}), /inesperada/);
  const calls = [];
  const out = await translateOne('Hello world', async (u) => { calls.push(u); return { ok: true, json: async () => [[['Olá mundo', 'Hello world']]] }; });
  assert.equal(out, 'Olá mundo');
  assert.ok(calls[0].includes('sl=en&tl=pt'));
  await assert.rejects(translateOne('x', async () => ({ ok: false, status: 429 })), /429/);
});

test('nameVariants: tira "Special Edition", "The" e usa o que vem depois de ":"', () => {
  const { nameVariants } = require('../src/guides');
  const v = nameVariants('The Elder Scrolls V: Skyrim Special Edition');
  assert.ok(v.includes('The Elder Scrolls V: Skyrim') && v.includes('Skyrim'));
  assert.deepEqual(nameVariants("Dragon's Dogma 2"), ["Dragon's Dogma 2"]);
  assert.ok(nameVariants('The Witcher 3: Wild Hunt').includes('The Witcher 3'));
  // palavra inteira: o guia de "Monster Hunter Wilds" não serve para "Wild Hunt"
  const { SOURCES } = require('../src/guides');
  const px = SOURCES.find((x) => x.id === 'powerpyx');
  assert.equal(px.isGuideLink('https://www.powerpyx.com/monster-hunter-wilds-trophy-guide-roadmap/', { name: 'Wild Hunt' }), false);
  assert.equal(px.isGuideLink('https://www.powerpyx.com/skyrim-trophy-guide-roadmap/', { name: 'Skyrim' }), true);
});

test('extractSummary tira o quadro de resumo e a introdução de um guia de platina', () => {
  const { extractSummary } = require('../src/guides');
  const text = [
    'Trophy Guides » Jogo X Trophy Guide & Roadmap', 'Jogo X Trophy Guide & Roadmap', 'March 27, 2024 by PowerPyx 54 Comments',
    'Jogo X Trophy Roadmap', 'Estimated trophy difficulty: 5/10', 'Approximate amount of time to platinum: 70-100 Hours',
    'Offline Trophies: 55 (1, 2, 6, 46)', 'Online Trophies: 0', 'Number of missable trophies: Technically all of them.',
    'Glitched trophies: 0, nothing glitched', 'Minimum Playthroughs: 1 if you clean up everything, plus some cleanup in NG+.',
    'PS4/PS5 Crossbuy, Autopop & Save Transfer: No', 'Release Date: March 22, 2024', 'Introduction',
    'Welcome to the Trophy Guide! The best approach is to focus on story until the point of no return, then clean up everything from there on.',
    'Step 1: Play until quest 14', 'Qualquer coisa depois.',
  ].join('\n');
  const sm = extractSummary(text);
  assert.deepStrictEqual(sm.facts.map((f) => f.label), ['Dificuldade', 'Tempo estimado', 'Conquistas online', 'Perdíveis', 'Bugadas', 'Jogadas mínimas']);
  assert.match(sm.facts[0].value, /^5\/10/);
  assert.match(sm.intro, /^Welcome/);
  assert.equal(extractSummary('Só um texto qualquer sem nada de resumo.'), null);
});

test('extractSummary não confunde rodapé/menu de site com resumo', () => {
  const { extractSummary, looksLikeProse } = require('../src/guides');
  const nav = 'Notícias•Críticas•Guias de jogos•Guias de livros•Guias de streaming•Guias LEGO•Cobertura NYCC•Planet Pokémon•Loja IGN•Datas de lançamento de jogos•MapGenie•Melhores ofertas hoje•Eurogamer•IGN YouTube•Política de Privacidade•Termos de uso';
  assert.equal(looksLikeProse(nav), false);
  assert.equal(extractSummary(['Achievements', 'Introduction', nav, 'Your privacy is important to us'].join('\n')), null);
  const prose = 'This guide explains how to unlock every achievement in the game. Most of them come naturally while you play the story, but a few need extra care and a second run.';
  assert.equal(looksLikeProse(prose), true);
});

test('classificação por pontos: uma pista fraca sozinha não basta, duas fontes sim', () => {
  const a = ach('X', 'Tutorial', { descEn: 'Finish the tutorial.' });
  const weak = (src) => ({ source: src, votes: ['difficulty'], scores: { difficulty: 1 } });
  assert.equal(combineClassification(a, { snippets: [weak('A')] }).category, null);
  assert.equal(combineClassification(a, { snippets: [weak('A'), weak('B')] }).category, 'difficulty');
  const m = combineClassification(a, { snippets: [{ source: 'A', votes: [], scores: {}, section: 'Missable Trophies' }] });
  assert.deepEqual(m.categories, ['missable']);
});

test('trechos que são só raridade do troféu (Prata, Gold, Ultra Rare) são descartados', () => {
  const { isRarityOnly, usefulSnippet } = require('../src/guides');
  for (const t of ['Silver', 'Prata', 'Gold 12.5%', 'Bronze trophy', 'Ultra Rare', 'Platinum', 'Rarity: Rare (2.1%)']) assert.equal(isRarityOnly(t), true, t);
  for (const t of ['Kill the dragon in Chapter 3.', 'Gold coins are in the chest', 'Silver key opens the door']) assert.equal(isRarityOnly(t), false, t);
  assert.equal(usefulSnippet({ parts: [{ t: 'text', v: 'Silver' }] }), false);
  assert.equal(usefulSnippet({ parts: [{ t: 'text', v: 'Silver' }, { t: 'video', url: 'https://youtu.be/x' }] }), true);
});
