'use strict';

/** Páginas de mentira para testar os guias sem internet (só roda com BUSCACONQUISTA_MOCK=1). */
const PAGE = [
  "Dragon's Dogma 2 Trophy Guide & Roadmap",
  'Home » Trophy Guides » Dragon’s Dogma 2 Trophy Guide & Roadmap',
  'Estimated trophy difficulty: 5/10',
  'Approximate amount of time to platinum: 70-100 Hours',
  'Number of missable trophies: Technically all of them, so keep a backup save.',
  'Minimum Playthroughs: 1 if you clean up everything before the point of no return.',
  'Introduction',
  'Welcome to the guide! The best approach is to focus on the story until the point of no return and then clean up all trophies from there on.',
  'Step 1: Play until Main Quest 14 and clean up everything you can before the point of no return.',
  'Peace – Become Sovran of Vernworth. This trophy is missable if you reload the wrong save, so keep a backup save.',
  '[teste] True Ending',
  'Reach the true ending by choosing the second option. This ending is a one-time choice per save.',
  '[teste] Nightmare – Finish the game on Hard difficulty. Only mode that counts is Hard mode; no difficulty can be changed later.',
  'Gigantus, I Hardly Knew Ye – Defeat the gigantus with the Unmaking Arrow. The trophy may be glitched and not unlocking for some players.',
  'Master of the Maisters – Collect every Maister’s teaching.',
  ...Array.from({ length: 80 }, (_, i) => `Filler line number ${i} about the world, with enough words to make this page look like a long guide for the parser.`),
].join('\n');

const T = (v) => ({ t: 'text', v });
const ENTRIES = [
  { name: 'Peace', desc: 'Became Sovran of Vernworth.', parts: [
    { t: 'video', url: 'https://www.youtube.com/watch?v=MOouWLRefq4' },
    T('This is for one of the game endings. Missable if you reload the wrong save.'),
    T('Step 1: In Main Quest 16 attack the big dragon at the very end of the game. [R2] to climb.'),
    T('Tip: Keep a backup save before the final quest.'),
    { t: 'img', url: 'https://www.powerpyx.com/wp-content/uploads/dragons-dogma-2-peace-1.jpg' },
    T('Note: Passing the border any other way will not count.'),
    { t: 'img', url: 'https://www.powerpyx.com/wp-content/uploads/dragons-dogma-2-peace-2.jpg' },
    ...Array.from({ length: 12 }, (_, i) => T(`Step ${i + 2}: filler explanation with enough words to make the guide long enough to need scrolling inside the box.`)),
  ] },
  { name: '[teste] True Ending', desc: 'Reached the true ending.', parts: [T('Warning: this is a one-time choice per save. Choose the second option.')] },
  { name: '[teste] Nightmare', desc: 'Complete the game on Hard mode.', parts: [] }, // só a explicação curta
  { name: 'Gigantus, I Hardly Knew Ye', desc: 'Defeated the gigantus rapidly.', parts: [T('Use the Unmaking Arrow as an Archer. This trophy is glitched and not unlocking for some players.')] },
  { name: 'Master of the Maisters', desc: 'Acquired every maister’s teaching.', parts: [T('Refer to [SILVER] Peace.')] },
];

const DLC_NAMES = { 'Peace': 'Become Sovran by completing the final quest with the Sovran seated; keep a backup save.', '[teste] Nightmare': 'Hard mode is unlocked after beating the game once; start a new save on Hard and finish the story.', '[teste] Barbecue Master': 'Grill one of each meat type at a campfire at night, then again in the day. See the list of meat locations.',
  '[teste] Forgotten Lands of the North': 'Defeat the hidden boss of the Dark Arisen area with three pawns. Bring plenty of healing items.' };

function getPage(url, opts = {}) {
  if (/powerpyx\.com\/.*trophy-guide/i.test(url)) return { ok: true, title: 'Trophy Guide', text: PAGE, links: [], extra: { entries: ENTRIES }, date: 'March 27, 2024', dateKind: 'published' };
  if (/bing\.com\/search/i.test(url)) {
    const real = 'https://mock-guides.example/dd2-dark-arisen-achievements/';
    const enc = 'a1' + Buffer.from(real).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { ok: true, title: 'busca', text: 'resultados', links: [{ href: 'https://www.bing.com/ck/a?!&&p=x&u=' + enc, text: 'DD2 Dark Arisen achievements' }, { href: 'https://www.reddit.com/r/x', text: 'reddit' }] };
  }
  if (/cf-mock\.example/.test(url)) return { ok: false, antiBot: true, reason: 'o site pede verificação anti-robô' };
  if (/mock-guides\.example/.test(url)) {
    const results = {};
    for (const n of opts.names || []) if (DLC_NAMES[n]) results[n] = { title: n, parts: [{ t: 'text', v: DLC_NAMES[n] }, { t: 'img', url: 'https://mock-guides.example/a.jpg' }] };
    return { ok: true, title: 'Dark Arisen achievements', text: 'x', links: [], extra: { results }, date: '2026-10-10', dateKind: 'updated' };
  }
  return { ok: false, title: '404', text: '', links: [] };
}

module.exports = { getPage, PAGE, ENTRIES, DLC_NAMES };
