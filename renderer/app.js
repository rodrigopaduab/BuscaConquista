'use strict';

/* BuscaConquista — interface. Todo texto vindo da Steam entra via textContent (nunca innerHTML). */

const PROFILE_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings';
const API_KEY_URL = 'https://steamcommunity.com/dev/apikey';
const RARE_PERCENT = 10;

const state = {
  config: null,
  game: null, // dados do jogo aberto
  meta: null, // horas jogadas / último acesso (quando vêm da biblioteca)
  filter: 'missing', // 'missing' | 'all' | 'ending' | 'difficulty' | 'missable' | 'bugged'
  time: null, // tempo para zerar { auto }
  openRows: new Set(), // conquistas expandidas (sobrevivem a atualizações da lista)
  settingsTab: 'cfg-aparencia',
  settings: { powerpyx: true, web: true, translate: true, custom: [], blocked: [], status: {} },
  pick: {}, // fonte escolhida por conquista
  origKeys: new Set(), // fontes que o usuário quer ver no original
  guides: null, // 'loading' | { sources } | { error }
  token: 0, // evita que uma resposta antiga sobrescreva a tela
};

const CATEGORY_LABELS = { ending: 'Final', difficulty: 'Dificuldade', missable: 'Perdível', bugged: 'Bugada' };
const CATEGORY_PLURAL = { ending: 'Finais', difficulty: 'Dificuldade', missable: 'Perdíveis', bugged: 'Bugadas' };
const CATEGORY_IDS = Object.keys(CATEGORY_LABELS);
/** Etiquetas da conquista (pode ter mais de uma): a sua escolha vale sozinha; senão, a pontuação de Steam + guias. */
const catsOf = (a) => (a.override === 'none' ? [] : CATEGORY_IDS.includes(a.override) ? [a.override] : (a.guide && a.guide.categories) ? a.guide.categories : a.auto ? [a.auto] : []);
const categoryOf = (a) => catsOf(a)[0] || null;

let syncSegRef = () => {};
const $app = document.getElementById('app');

/* ---------- utilidades ---------- */

// O DOM escreve a palavra "null" na tela quando recebe null/false em append/replaceChildren: aqui isso é ignorado em todo o programa.
for (const fn of ['append', 'prepend', 'replaceChildren']) {
  const orig = Element.prototype[fn];
  Element.prototype[fn] = function (...nodes) { return orig.apply(this, nodes.flat(Infinity).filter((n) => n != null && n !== false && n !== true)); };
}

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const pctFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct = (n) => pctFmt.format(n) + '%';
const fmtDate = (sec) => new Date(sec * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const fmtDay = (sec) => new Date(sec * 1000).toLocaleDateString('pt-BR');
const fmtHours = (min) => (min >= 60 ? Math.round(min / 60).toLocaleString('pt-BR') + ' h' : min + ' min');

function openExternal(url) {
  radioDuck(url);
  window.api.openExternal(url);
}

function extLink(text, url) {
  return h('a', { href: url, onclick: (e) => { e.preventDefault(); openExternal(url); } }, text);
}

// Imagem padrão (escudo) quando nenhum ícone da Steam carrega — evita o quadradinho de imagem quebrada.
const PLACEHOLDER_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='#26313e'/>" +
      "<path d='M32 12 48 20v14c0 10-7 17-16 20-9-3-16-10-16-20V20z' fill='none' stroke='#6b7683' stroke-width='3'/></svg>"
  );

// Imagens da Steam: o endereço antigo (steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/...) não tem
// os ícones enviados mais recentemente (dá 404, ex.: DLCs novas). Hoje a Steam serve os mesmos arquivos em
// <servidor>.steamstatic.com/community_assets/images/apps/<appid>/<arquivo>. Tentamos o novo primeiro e o antigo por último.
const STEAM_SHARED_HOSTS = ['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'shared.cloudflare.steamstatic.com'];
const OLD_APP_IMAGE_PATH = /^\/steamcommunity\/public\/images\/apps\//;

/** Endereços possíveis para uma mesma imagem: os novos primeiro, o original por último. */
function imageCandidates(url) {
  if (!url) return [];
  let u;
  try { u = new URL(url); } catch (_) { return [url]; }
  if (!OLD_APP_IMAGE_PATH.test(u.pathname)) return [url];
  const rest = u.pathname.replace(OLD_APP_IMAGE_PATH, '');
  return [...STEAM_SHARED_HOSTS.map((host) => `https://${host}/community_assets/images/apps/${rest}`), url];
}

/**
 * Ícone da conquista com plano B: a Steam às vezes não tem a versão cinza (ou o link falha).
 * Ordem: versão certa para o estado (em todas as hospedagens) -> a outra versão (escurecida se for a colorida de uma não conquistada) -> escudo padrão.
 */
function achievementIcon(a, diagBox) {
  const color = !a.achieved && !!state.settings.colorIcons; // opção: ícone colorido também nas não alcançadas
  const wanted = (a.achieved || color) ? [a.icon, a.iconGray] : [a.iconGray, a.icon];
  const sources = [...new Set(wanted.filter(Boolean).flatMap((u) => imageCandidates(u).map((c) => ({ url: c, base: u }))).map((x) => JSON.stringify(x)))].map((x) => JSON.parse(x));
  const img = h('img', { class: 'ach-icon', alt: '', loading: 'lazy' });
  let index = 0;
  async function giveUp() {
    img.removeEventListener('error', next);
    // Último recurso: o programa baixa a imagem por conta própria (fora das regras da página).
    let diag = '';
    try {
      const res = await window.api.fetchImage(sources.map((x) => x.url));
      if (res && res.ok) {
        const first = sources.find((x) => x.url === res.url);
        img.classList.toggle('dim', Boolean(first && !a.achieved && !color && first.base === a.icon && first.base !== a.iconGray));
        img.src = res.dataUrl;
        return;
      }
      diag = (res && res.tried ? res.tried : []).join('\n');
    } catch (err) {
      diag = String(err && err.message);
    }
    img.classList.remove('dim');
    img.src = PLACEHOLDER_ICON;
    img.title = 'Ícone indisponível';
    if (diagBox) {
      diagBox.hidden = false;
      diagBox.textContent = 'Ícone não carregou. Endereços tentados:\n' + sources.map((x) => x.url).join('\n') + (diag ? '\nRespostas:\n' + diag : '');
    }
  }
  function next() {
    if (index >= sources.length) return giveUp();
    const { url, base } = sources[index++];
    img.classList.toggle('dim', !a.achieved && !color && base === a.icon && base !== a.iconGray);
    img.src = url;
  }
  img.addEventListener('error', next);
  next();
  return img;
}

// A política de segurança (CSP) bloqueia style="..." no HTML; pelo CSSOM é permitido.
function progressFill(pct) {
  const span = document.createElement('span');
  span.style.width = pct + '%';
  return span;
}

function globeIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  for (const [tag, attrs] of [
    ['circle', { cx: 12, cy: 12, r: 9 }],
    ['path', { d: 'M3 12h18' }],
    ['path', { d: 'M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18' }],
  ]) {
    const node = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    svg.append(node);
  }
  return svg;
}

/* ---------- login / configuração ---------- */

function renderSetup({ editing = false, message = null, errorCode = null } = {}) {
  const cfg = state.config || {};
  const profile = h('input', { type: 'text', id: 'profile', value: cfg.profileInput || '', placeholder: 'https://steamcommunity.com/id/seu-nome  ou  7656119…', autocomplete: 'off', spellcheck: 'false' });
  const key = h('input', {
    type: 'password', id: 'apikey', autocomplete: 'off', spellcheck: 'false',
    placeholder: editing && cfg.configured ? 'Já salva — deixe em branco para manter' : 'Cole aqui a sua chave',
  });
  const errorBox = h('div', { class: 'error', role: 'alert', hidden: !message });
  const submit = h('button', { class: 'btn', type: 'submit' }, editing ? 'Salvar' : 'Entrar');

  function showError(msg, code) {
    errorBox.hidden = !msg;
    errorBox.replaceChildren(msg || '');
    if (code === 'PRIVATE_PROFILE') {
      errorBox.append(' ', extLink('Abrir as configurações de privacidade da Steam', PROFILE_PRIVACY_URL), '.');
    }
  }
  if (message) showError(message, errorCode);

  const form = h('form', {
    class: 'setup-card' + (editing ? '' : ' setup-big'),
    onsubmit: async (e) => {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Verificando…';
      showError('');
      const res = await window.api.saveConfig({ profile: profile.value, apiKey: key.value });
      submit.disabled = false;
      submit.textContent = editing ? 'Salvar' : 'Entrar';
      if (!res.ok) return showError(res.error.message, res.error.code);
      state.config = res.data;
      state.game = null;
      boot();
    },
  },
    editing
      ? [h('h2', {}, 'Conta Steam'), h('p', { class: 'section-lead' }, 'Troque o perfil ou a chave da API quando precisar.')]
      : [
          h('h1', { class: 'brand' }, h('img', { class: 'brand-logo', src: 'logo.svg', alt: '' }), h('span', { class: 'brand-text' }, h('span', { class: 'brand-name' }, 'Busca', h('small', {}, 'Conquista')), cfg.version ? h('span', { class: 'ver', text: 'versão ' + cfg.version }) : null)),
          h('p', { class: 'lead' }, 'Veja as conquistas que faltam nos seus jogos da Steam e como conseguir cada uma.'),
        ],
    h('div', { class: 'notice' },
      'Para funcionar, o seu perfil e os detalhes dos seus jogos precisam estar com a visibilidade ',
      extLink('Público', PROFILE_PRIVACY_URL),
      ' na Steam.'),
    errorBox,
    h('div', { class: 'field' },
      h('label', { for: 'profile' }, 'Seu perfil Steam'),
      profile,
      h('div', { class: 'profile-help' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => openExternal('https://steamcommunity.com/my/profile') }, '↗ Abrir meu perfil na Steam'),
        h('span', { class: 'hint' }, 'Abre o seu perfil no navegador (se você estiver logado na Steam). Copie o endereço da barra e cole aqui. Também vale o apelido ou o SteamID de 17 dígitos.'))),
    h('div', { class: 'field' },
      h('label', { for: 'apikey' }, 'Chave da Steam Web API'),
      key,
      h('div', { class: 'profile-help' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => openExternal(API_KEY_URL) }, '↗ Obter minha chave (gratuita)'),
        h('span', { class: 'hint' }, 'Abre a página da Steam para gerar a chave: entre na sua conta, aceite os termos e, no campo de domínio, escreva "localhost". Copie a chave e cole aqui. Ela fica guardada de forma criptografada neste computador.'))),
    h('div', { class: 'row' }, submit));

  if (editing) {
    $app.replaceChildren(settingsPage(form));
  } else {
    $app.replaceChildren(h('div', { class: 'setup' }, form));
    profile.focus();
  }
}


/* ---------- fontes de guias (Configurações) ---------- */

/** Tamanho da letra e densidade da lista (classes no <body>; o CSS faz o resto). */
function applyAppearance() {
  const st = state.settings || {};
  document.body.dataset.font = st.fontScale || 'normal';
  document.body.dataset.density = st.density || 'normal';
  // zoom de verdade do Electron (a janela refaz o layout, sem barra de rolagem lateral)
  if (window.api.setZoom) window.api.setZoom({ pequena: 0.9, normal: 1, grande: 1.12, enorme: 1.25 }[st.fontScale] || 1);
}

/** Muda uma configuração em rascunho: aparece na hora, mas só é gravada em "Salvar alterações". */
async function saveSettings(patch, rerender = true) {
  const next = { ...state.settings, ...patch };
  const res = await window.api.sanitizeSettings(next);
  if (res.ok) { state.settings = res.data; state.dirty = true; applyAppearance(); }
  if (rerender) renderSetup({ editing: true }); else refreshSaveBar();
  return res;
}
/** Atualiza só a barra "Salvar alterações" (quando a página não é redesenhada). */
function refreshSaveBar() {
  const cur = document.querySelector('.save-bar');
  if (cur) cur.replaceWith(saveBar());
}
async function commitTheme() {
  if (!state.themeDraft) return;
  const r = await window.api.setTheme(state.themeDraft);
  if (r.ok) state.config = r.data;
  state.themeDraft = null;
}
function revertTheme() {
  if (state.themeDraft) showTheme((state.config && state.config.theme) || 'padrao');
  state.themeDraft = null;
}
async function commitSettings() {
  await commitTheme();
  const res = await window.api.saveSettings(state.settings);
  if (res.ok) { state.settings = res.data; state.dirty = false; state.savedMsg = true; applyAppearance(); }
  renderSetup({ editing: true });
  setTimeout(() => { state.savedMsg = false; const m = document.getElementById('cfgSavedMsg'); if (m) m.textContent = ''; }, 2500);
}
async function discardSettings() {
  revertTheme();
  const st = await window.api.getSettings();
  if (st.ok) state.settings = st.data;
  state.dirty = false;
  applyAppearance();
  renderSetup({ editing: true });
}
/** Caixa de diálogo no visual do programa (no lugar da janela cinza do sistema). Devolve o `value` do botão escolhido; Esc ou clique fora = 'cancel'. */
function askDialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const close = (value) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); if (prev && prev.focus) prev.focus(); resolve(value); };
    const btns = buttons.map((b) => h('button', { class: 'btn' + (b.kind === 'primary' ? '' : ' ghost') + (b.kind === 'danger' ? ' danger' : ''), type: 'button', 'data-value': b.value, onclick: () => close(b.value) }, b.label));
    const box = h('div', { class: 'modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'modalTitle', 'aria-describedby': 'modalMsg' },
      h('h2', { id: 'modalTitle', class: 'modal-title', text: title }),
      h('p', { id: 'modalMsg', class: 'modal-msg', text: message }),
      h('div', { class: 'modal-actions' }, ...btns));
    const overlay = h('div', { class: 'modal-overlay', onmousedown: (e) => { if (e.target === overlay) close('cancel'); } }, box);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close('cancel'); }
      else if (e.key === 'Tab') { // o foco fica dentro da caixa
        const f = [...box.querySelectorAll('button')]; const i = f.indexOf(document.activeElement);
        e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    const first = box.querySelector('.btn:not(.ghost)') || btns[0];
    first.focus();
  });
}

async function resetSettings() {
  const ans = await askDialog({ title: 'Restaurar o padrão?', message: 'Todas as configurações voltam ao padrão. Suas anotações, correções e a conta Steam não são apagadas.', buttons: [{ label: 'Cancelar', value: 'cancel' }, { label: 'Restaurar padrão', value: 'ok', kind: 'primary' }] });
  if (ans !== 'ok') return;
  state.themeDraft = null;
  const tr = await window.api.setTheme('padrao');
  if (tr.ok) { state.config = tr.data; showTheme('padrao'); }
  const res = await window.api.resetSettings();
  if (res.ok) { state.settings = res.data; state.dirty = false; state.savedMsg = true; applyAppearance(); }
  renderSetup({ editing: true });
}
function saveBar() {
  return h('div', { class: 'save-bar' + (state.dirty ? ' dirty' : ''), role: 'region', 'aria-label': 'Salvar configurações' },
    h('span', { class: 'save-msg', id: 'cfgSavedMsg', 'aria-live': 'polite', text: state.dirty ? 'Há alterações ainda não salvas.' : (state.savedMsg ? 'Configurações salvas.' : '') }),
    h('button', { class: 'btn ghost', type: 'button', onclick: resetSettings }, 'Restaurar padrão'),
    h('button', { class: 'btn ghost', type: 'button', disabled: !state.dirty, onclick: discardSettings }, 'Descartar'),
    h('button', { class: 'btn', type: 'button', disabled: !state.dirty, onclick: commitSettings }, 'Salvar alterações'));
}

function statusText(st) {
  if (!st || !st.at) return 'ainda não usada';
  const when = new Date(st.at).toLocaleDateString('pt-BR');
  return st.found > 0 ? `funcionou em ${when} (${st.found} ${st.found === 1 ? 'achado' : 'achados'})` : `não achou nada em ${when}`;
}

function switchRow(label, hint, checked, onChange, extra) {
  return h('div', { class: 'src-row' },
    h('label', { class: 'src-main' },
      h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }),
      h('span', {}, h('strong', { text: label }), hint ? h('span', { class: 'muted', text: ' — ' + hint }) : null)),
    extra || null);
}

/** Linha com lista de opções que grava uma configuração na hora. */
function selectRow(key, label, hint, options, after) {
  const cur = state.settings[key];
  const sel = h('select', { class: 'cfg-select', 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: String(v), text: t, selected: String(cur) === String(v) })));
  sel.addEventListener('change', async () => {
    const v = typeof options[0][0] === 'number' ? Number(sel.value) : sel.value;
    await saveSettings({ [key]: v }, false);
    if (after) after(v);
  });
  return h('div', { class: 'src-row' }, h('label', { class: 'src-main' }, h('span', {}, h('strong', { text: label }), hint ? h('span', { class: 'muted', text: ' — ' + hint }) : null)), sel);
}

const PREFERRED_SITES = [
  { host: 'ign.com', label: 'IGN Wiki', hint: 'wikis com lista de conquistas e como conseguir' },
  { host: 'gamefaqs.gamespot.com', label: 'GameFAQs', hint: 'guias escritos por jogadores, bem detalhados' },
  { host: 'fextralife.com', label: 'Fextralife Wiki', hint: 'wikis de RPGs, costumam incluir as DLCs' },
  { host: 'game8.co', label: 'Game8', hint: 'lista curta com link para guias específicos' },
  { host: 'gamepressure.com', label: 'Gamepressure', hint: 'guia de troféus completo, com passo a passo' },
  { host: 'strategywiki.org', label: 'StrategyWiki', hint: 'wiki aberta, com tabela de conquistas e descrições' },
  { host: 'progameguides.com', label: 'Pro Game Guides', hint: 'listas de conquistas com dicas diretas' },
  { host: 'gamerant.com', label: 'Game Rant', hint: 'guias de conquistas para jogos recentes' },
  { host: 'fandom.com', label: 'Fandom Wiki', hint: 'wikis de comunidade, muitas com página de conquistas' },
];
const MAP_SITES = [
  { id: 'mapgenie', label: 'MapGenie', hint: 'mapas interativos com marcadores de itens, chefes e colecionáveis' },
  { id: 'ign-maps', label: 'IGN Maps', hint: 'mapas interativos da IGN' },
  { id: 'fextralife-map', label: 'Fextralife Mapa', hint: 'mapa interativo da wiki do jogo (RPGs principalmente)' },
  { id: 'gamepressure-map', label: 'Gamepressure Mapas', hint: 'mapas interativos por região' },
];

const BLOCKED_GROUPS = [
  { why: 'Pedem verificação anti-robô (Cloudflare). O programa não tenta burlar essa verificação, então essas páginas nunca abrem.',
    hosts: ['trueachievements.com', 'truesteamachievements.com', 'gamerguides.com', 'xboxachievements.com', 'playstationtrophies.org', 'steamhunters.com', 'psnprofiles.com', 'trophieshunter.com', 'keengamer.com', 'ludo.guide'] },
  { why: 'Não são guias: buscadores, vídeos e redes sociais.', hosts: ['bing.com', 'google.com', 'youtube.com', 'reddit.com', 'facebook.com', 'x.com', 'instagram.com', 'wikipedia.org'] },
  { why: 'Steam: os guias da comunidade pedem confirmação de idade em vários jogos, e as outras páginas não trazem guia.', hosts: ['steamcommunity.com', 'steampowered.com'] },
];

/** Caixa de aviso que fica logo abaixo do botão que a usa. */
function flashBox() {
  const el = h('div', { class: 'hint flash', role: 'status', hidden: true });
  const flash = (text, bad = false) => { el.hidden = !text; el.textContent = text; el.classList.toggle('bad', bad); };
  return { el, flash };
}

const cfgCard = (id, title, lead, ...kids) => h('section', { class: 'setup-card cfg-section', id }, h('h2', {}, title), lead ? h('p', { class: 'section-lead' }, lead) : null, ...kids);

/** Nomes das fontes na ordem que o usuário escolheu (as que ele nunca moveu ficam no fim, na ordem de sempre). */
function allSourceNames() {
  const base = ['PowerPyx', ...PREFERRED_SITES.map((p) => p.label), ...state.settings.custom.map((c) => c.name)];
  const saved = (state.settings.sourceOrder || []).filter((n) => base.includes(n));
  return [...saved, ...base.filter((n) => !saved.includes(n))];
}

function sourceOrderList() {
  const names = allSourceNames();
  const box = h('ol', { class: 'order-list' });
  const save = (list) => saveSettings({ sourceOrder: list }, false).then(() => draw());
  let dragFrom = null;
  function draw() {
    const cur = allSourceNames();
    box.replaceChildren(...cur.map((n, i) => {
      const li = h('li', { class: 'order-item', draggable: 'true', 'data-i': String(i) },
        h('span', { class: 'order-grip', 'aria-hidden': 'true', text: '⋮⋮' }),
        h('span', { class: 'order-num', text: String(i + 1) }),
        h('span', { class: 'order-name', text: n }),
        h('button', { class: 'tr-btn', type: 'button', disabled: i === 0, 'aria-label': `Subir ${n}`, onclick: () => { const l = [...cur]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } }, '↑'),
        h('button', { class: 'tr-btn', type: 'button', disabled: i === cur.length - 1, 'aria-label': `Descer ${n}`, onclick: () => { const l = [...cur]; [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); } }, '↓'));
      li.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
      li.addEventListener('dragleave', () => li.classList.remove('over'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragFrom == null || dragFrom === i) return;
        const l = [...cur]; const [moved] = l.splice(dragFrom, 1); l.splice(i, 0, moved); dragFrom = null; save(l);
      });
      return li;
    }));
  }
  draw();
  void names;
  return box;
}

function ignoreWordsEditor() {
  const input = h('input', { type: 'text', maxlength: 30, placeholder: 'ex.: Anniversary, Reforged', autocomplete: 'off', 'aria-label': 'Palavra a ignorar' });
  const chips = h('div', { class: 'chip-row' });
  const words = () => state.settings.ignoreWords || [];
  const save = (list) => saveSettings({ ignoreWords: list }, false).then(draw);
  function draw() {
    chips.replaceChildren(...words().map((w) => h('span', { class: 'chip-x' }, w, h('button', { type: 'button', 'aria-label': `Remover ${w}`, onclick: () => save(words().filter((x) => x !== w)) }, '×'))));
  }
  const add = () => { const v = input.value.trim(); if (v.length >= 2 && !words().includes(v)) save([...words(), v]); input.value = ''; };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  draw();
  return h('div', {}, h('div', { class: 'src-add' }, input, h('button', { class: 'btn', type: 'button', onclick: add }, 'Adicionar')), chips);
}

function sourcesCard() {
  const cfg = state.settings;
  const { el: msg, flash } = flashBox();
  const name = h('input', { type: 'text', placeholder: 'Nome do guia (ex.: Meu site de guias)', maxlength: 40, autocomplete: 'off', 'aria-label': 'Nome do guia' });
  const tpl = h('input', { type: 'text', placeholder: 'https://site.com/guias/{slug}/', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Endereço do guia' });

  const customRows = cfg.custom.map((c) => h('div', { class: 'src-custom' },
    switchRow(c.name, c.template, c.enabled, (on) => saveSettings({ custom: cfg.custom.map((x) => (x.id === c.id ? { ...x, enabled: on } : x)) }),
      h('button', { class: 'tr-btn', type: 'button', onclick: () => saveSettings({ custom: cfg.custom.filter((x) => x.id !== c.id) }) }, 'Excluir')),
    h('div', { class: 'muted src-status', text: statusText(cfg.status[c.id]) })));

  const worked = Object.entries(cfg.status).filter(([k, v]) => k !== 'powerpyx' && !cfg.custom.some((c) => c.id === k) && !PREFERRED_SITES.some((p) => k.endsWith(p.host)) && v.found > 0)
    .sort((a, b) => b[1].at - a[1].at).slice(0, 12);
  const prefStatus = (host) => { const k = Object.keys(cfg.status).find((x) => x === host || x.endsWith('.' + host)); return k ? statusText(cfg.status[k]) : 'ainda não usado'; };

  return cfgCard('cfg-fontes', 'Guias principais', 'Os guias que o programa consulta primeiro, todos juntos. As explicações aparecem lado a lado em cada conquista, e você troca entre elas pelos botões de fonte.',
    h('div', { class: 'src-list' },
      switchRow('PowerPyx', 'tabela de troféus com imagens e vídeos', cfg.powerpyx, (on) => saveSettings({ powerpyx: on }), h('div', { class: 'muted src-status', text: statusText(cfg.status.powerpyx) })),
      ...PREFERRED_SITES.map((p) => switchRow(p.label, p.hint, !cfg.preferredOff.includes(p.host),
        (on) => saveSettings({ preferredOff: on ? cfg.preferredOff.filter((x) => x !== p.host) : [...cfg.preferredOff, p.host] }),
        h('div', { class: 'muted src-status', text: prefStatus(p.host) }))),
      ...customRows),
    h('h3', {}, 'Adicionar um guia'),
    h('ol', { class: 'howto' },
      h('li', {}, 'Abra, no navegador, a página do guia de um jogo qualquer (por exemplo, a de "Jogo Exemplo").'),
      h('li', {}, 'Copie o endereço dela. Suponha que seja ', h('code', { text: 'https://site.com/guias/jogo-exemplo/' }), '.'),
      h('li', {}, 'Troque a parte do nome do jogo por ', h('code', { text: '{slug}' }), ': ', h('code', { text: 'https://site.com/guias/{slug}/' }), '.'),
      h('li', {}, 'Cole abaixo. Para cada jogo que você abrir, o programa troca ', h('code', { text: '{slug}' }), ' pelo nome dele escrito em formato de endereço (Dragon\'s Dogma 2 vira ', h('code', { text: 'dragons-dogma-2' }), ') e abre a página.')),
    h('div', { class: 'src-add' }, name, tpl,
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!tpl.value.trim()) return flash('Cole o endereço do guia, com {slug} no lugar do nome do jogo.', true);
        const before = state.settings.custom.length;
        const res = await saveSettings({ custom: [...cfg.custom, { name: name.value, template: tpl.value, enabled: true }] }, false);
        if (!res.ok || state.settings.custom.length === before) return flash('Endereço inválido: precisa começar com https:// e conter {slug}.', true);
        renderSetup({ editing: true });
      } }, 'Adicionar')),
    msg,
    h('p', { class: 'hint' }, 'Também existem ', h('code', { text: '{nome}' }), ' (nome com espaços) e ', h('code', { text: '{id}' }), ' (número do jogo na Steam). A página precisa mostrar o nome de cada conquista, em inglês, seguido da explicação. Se o site pedir verificação anti-robô, ele vai sozinho para Sites bloqueados e você é avisado.'),
    h('h3', {}, 'Busca em outros sites'),
    switchRow('Procurar também por conta própria', 'depois dos guias acima, o programa busca outras páginas na internet para comparar', cfg.web, (on) => saveSettings({ web: on })),
    h('h3', {}, 'Idioma dos guias'),
    selectRow('guideLang', 'Idioma preferido', 'o botão de cada guia continua trocando entre português e original', [['pt', 'Português (traduzido)'], ['en', 'Inglês (original)'], ['both', 'Os dois, um embaixo do outro']], () => { if (state.game) renderList(); }),
    h('h3', {}, 'Ordem de prioridade das fontes'),
    h('p', { class: 'hint', text: 'Arraste (ou use as setas) para decidir qual guia aparece primeiro em cada conquista.' }),
    sourceOrderList(),
    h('h3', {}, 'Palavras a ignorar nos nomes dos jogos'),
    h('p', { class: 'hint', text: 'Além de Remastered, Remake, Ultimate Edition, Deluxe, Complete etc., que já são ignoradas em todas as buscas. Escreva uma palavra e clique em Adicionar.' }),
    ignoreWordsEditor(),
    h('h3', {}, 'Separação jogo base / DLC'),
    switchRow('Usar o Exophase para separar as conquistas por DLC', 'é a fonte mais forte; além dela, cada guia encontrado também "vota" (pela seção ou título onde a conquista aparece)', cfg.dlcExophase, (on) => saveSettings({ dlcExophase: on })),
    worked.length ? [h('h3', {}, 'Sites que já funcionaram (também votam na separação)'), h('ul', { class: 'worked' }, worked.map(([k, v]) => h('li', {}, h('strong', { text: k }), h('span', { class: 'muted', text: ' — ' + statusText(v) }))))] : null);
}

function mapsCard() {
  const cfg = state.settings;
  const { el: msg, flash } = flashBox();
  const name = h('input', { type: 'text', placeholder: 'Nome do site de mapas (ex.: Meu site de mapas)', maxlength: 40, autocomplete: 'off', 'aria-label': 'Nome do site de mapas' });
  const tpl = h('input', { type: 'text', placeholder: 'https://site-de-mapas.com/{slug}/', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Endereço do mapa' });
  const rows = cfg.mapsCustom.map((c) => switchRow(c.name, c.template, c.enabled, (on) => saveSettings({ mapsCustom: cfg.mapsCustom.map((x) => (x.id === c.id ? { ...x, enabled: on } : x)) }),
    h('button', { class: 'tr-btn', type: 'button', onclick: () => saveSettings({ mapsCustom: cfg.mapsCustom.filter((x) => x.id !== c.id) }) }, 'Excluir')));
  return cfgCard('cfg-mapas', 'Mapas principais', 'Sites de mapas interativos. Quando o jogo tem mapa em algum deles, aparece um botão no cabeçalho do jogo (um botão por site).',
    h('div', { class: 'src-list' },
      ...MAP_SITES.map((m) => switchRow(m.label, m.hint, !cfg.mapsOff.includes(m.id), (on) => saveSettings({ mapsOff: on ? cfg.mapsOff.filter((x) => x !== m.id) : [...cfg.mapsOff, m.id] }))),
      ...rows),
    h('h3', {}, 'Adicionar um site de mapas'),
    h('ol', { class: 'howto' },
      h('li', {}, 'Abra, no navegador, a página do mapa de um jogo qualquer (por exemplo, a de "Jogo Exemplo").'),
      h('li', {}, 'Copie o endereço. Suponha que seja ', h('code', { text: 'https://site-de-mapas.com/jogo-exemplo/' }), '.'),
      h('li', {}, 'Troque a parte do nome do jogo por ', h('code', { text: '{slug}' }), ': ', h('code', { text: 'https://site-de-mapas.com/{slug}/' }), '.'),
      h('li', {}, 'Cole abaixo. Para cada jogo, o programa troca ', h('code', { text: '{slug}' }), ' pelo nome em formato de endereço (Dragon\'s Dogma 2 vira ', h('code', { text: 'dragons-dogma-2' }), ') e só mostra o botão se a página existir.')),
    h('div', { class: 'src-add' }, name, tpl,
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (!tpl.value.trim()) return flash('Cole o endereço do mapa, com {slug} no lugar do nome do jogo.', true);
        const before = state.settings.mapsCustom.length;
        const res = await saveSettings({ mapsCustom: [...cfg.mapsCustom, { name: name.value, template: tpl.value, enabled: true }] }, false);
        if (!res.ok || state.settings.mapsCustom.length === before) return flash('Endereço inválido: precisa começar com https:// e conter {slug}.', true);
        renderSetup({ editing: true });
      } }, 'Adicionar')),
    msg,
    h('p', { class: 'hint' }, 'Também existem ', h('code', { text: '{nome}' }), ' (nome com espaços), ', h('code', { text: '{junto}' }), ' (nome sem hífens, como em eldenring) e ', h('code', { text: '{id}' }), ' (número do jogo na Steam). O resultado é guardado por 30 dias (a aba Cache permite apagar).'));
}

function blockedCard() {
  const cfg = state.settings;
  const { el: msg, flash } = flashBox();
  const blk = h('input', { type: 'text', placeholder: 'site.com', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Site para bloquear' });
  const auto = new Map((cfg.autoBlocked || []).map((x) => [x.host, x]));
  const chips = cfg.blocked.map((b) => h('span', { class: 'chip-x', title: auto.has(b) ? 'Bloqueado automaticamente: o site pediu verificação anti-robô' : '' }, b, auto.has(b) ? h('em', { class: 'muted', text: ' (automático)' }) : null, h('button', { type: 'button', 'aria-label': 'Remover ' + b, onclick: () => saveSettings({ blocked: cfg.blocked.filter((x) => x !== b) }) }, '×')));
  return cfgCard('cfg-bloqueados', 'Sites bloqueados', 'Sites que o programa nunca abre nas buscas. Os de fábrica não funcionam como fonte; você pode bloquear outros.',
    ...BLOCKED_GROUPS.map((g) => h('div', { class: 'blocked-group' }, h('p', { class: 'hint', text: g.why }), h('p', { class: 'hosts', text: g.hosts.join(', ') }))),
    h('p', { class: 'hint' }, 'Se um desses sites abre normalmente no seu navegador e você quiser tentar mesmo assim, adicione-o em "Fontes de guias" como fonte própria. Mas, quando o site pede verificação anti-robô, o programa não consegue ler a página.'),
    (cfg.autoBlocked || []).length ? h('div', { class: 'notice warn' }, h('strong', { text: 'Bloqueados automaticamente: ' }), 'estes sites pediram verificação anti-robô quando o programa tentou abri-los (' + cfg.autoBlocked.map((x) => x.host + (x.at ? ', ' + new Date(x.at).toLocaleDateString('pt-BR') : '')).join('; ') + '). Foram colocados na lista sozinhos para não perder tempo de novo. Se o site mudar e você quiser tentar outra vez, remova-o abaixo.') : null,
    h('h3', {}, 'Sua lista de bloqueados'),
    h('div', { class: 'chips-x' }, chips.length ? chips : h('span', { class: 'muted', text: 'Nenhum site na sua lista.' })),
    h('div', { class: 'src-add' }, blk, h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
      const before = state.settings.blocked.length;
      await saveSettings({ blocked: [...cfg.blocked, blk.value] }, false);
      if (state.settings.blocked.length === before) return flash('Escreva só o endereço do site, por exemplo: site.com', true);
      renderSetup({ editing: true });
    } }, 'Bloquear')),
    msg);
}

function dataCard() {
  const { el: msg, flash } = flashBox();
  const dirInfo = h('p', { class: 'hint', text: 'Pasta dos dados: carregando…' });
  const trashBox = h('div', {});
  window.api.dataInfo().then((r) => { if (r.ok) dirInfo.textContent = 'Pasta dos dados: ' + r.data.dir + (r.data.isDefault ? ' (padrão)' : ' (escolhida por você)'); });

  async function drawTrash() {
    const r = await window.api.listTrash();
    if (!r.ok) { trashBox.replaceChildren(h('p', { class: 'hint', text: 'Não foi possível ler a lixeira.' })); return; }
    if (!r.data.length) { trashBox.replaceChildren(h('p', { class: 'hint', text: 'A lixeira está vazia. Anotações apagadas ficam aqui por 30 dias.' })); return; }
    trashBox.replaceChildren(
      h('ul', { class: 'trash-list' }, ...r.data.map((t) => h('li', {},
        h('div', {}, h('strong', { text: t.game }), h('span', { class: 'muted', text: ` · apagada em ${fmtWhen(t.at)} · conquista ${t.apiName}` })),
        h('div', { class: 'trash-text', text: t.text.length > 220 ? t.text.slice(0, 220) + '…' : t.text }),
        h('button', { class: 'tr-btn', type: 'button', onclick: async () => {
          const res = await window.api.restoreTrash({ appid: t.appid, apiName: t.apiName });
          flash(res.ok ? 'Anotação restaurada.' : (res.error && res.error.message) || 'Não foi possível restaurar.', !res.ok);
          if (res.ok && state.game && state.game.appid === t.appid) { const ach = state.game.achievements.find((x) => x.apiName === t.apiName); if (ach && !ach.note) ach.note = t.text; }
          drawTrash();
        } }, 'Restaurar')))),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await window.api.emptyTrash(); flash('Lixeira esvaziada.'); drawTrash(); } }, 'Esvaziar a lixeira'));
  }
  drawTrash();

  return cfgCard('cfg-dados', 'Dados e idioma', 'Tudo o que é seu: anotações, correções e escolhas de DLC. Esses dados não são apagados quando você limpa o cache.',
    h('h3', {}, 'Backup'),
    h('div', { class: 'src-add cache-actions' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        const r = await window.api.exportData();
        if (!r.ok) return flash((r.error && r.error.message) || 'Não foi possível exportar.', true);
        if (!r.data.canceled) flash(`Dados exportados (${r.data.count} itens) em ${r.data.path}`);
      } }, 'Exportar meus dados'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const r = await window.api.importData();
        if (!r.ok) return flash((r.error && r.error.message) || 'Não foi possível importar.', true);
        if (r.data.canceled) return;
        state.settings = r.data.settings || state.settings;
        flash(`Importado: ${r.data.merged} itens juntados aos seus dados. Abra o jogo de novo para ver as anotações.`);
        drawTrash();
      } }, 'Importar dados…')),
    h('p', { class: 'hint', text: 'A importação soma ao que você já tem (em caso de conflito, vale o arquivo importado). Serve de backup e para levar tudo para outro computador.' }),
    h('h3', {}, 'Onde ficam os dados'),
    dirInfo,
    h('div', { class: 'src-add cache-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const r = await window.api.chooseDataDir();
        if (!r.ok) return flash((r.error && r.error.message) || 'Não foi possível mudar a pasta.', true);
        if (r.data.canceled) return;
        flash(`Dados copiados para ${r.data.dir}. Reiniciando…`);
        setTimeout(() => window.api.relaunch(), 900);
      } }, 'Escolher outra pasta…'),
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => { await window.api.resetDataDir(); flash('Voltando para a pasta padrão. Reiniciando…'); setTimeout(() => window.api.relaunch(), 900); } }, 'Voltar para a pasta padrão')),
    h('p', { class: 'hint', text: 'Ao escolher uma pasta (por exemplo, dentro do OneDrive), seus dados são copiados para lá e o programa reinicia. O cache não é copiado: ele se refaz sozinho.' }),
    h('h3', {}, 'Lixeira de anotações'),
    trashBox,
    msg,
    h('p', { class: 'hint', text: 'Para ver ou apagar o que o programa guardou (guias, traduções, tempos), use a aba Cache. O idioma dos guias fica em Guias principais.' }));
}

function radioCard() {
  return cfgCard('cfg-radio', 'Rádio', 'A rádio GameFM (gamefm.com.br) toca música de jogos 24 horas, direto da barra de cima.',
    selectRow('radioMode', 'Ao abrir o programa', null, [['never', 'Nunca tocar sozinha'], ['auto', 'Tocar sozinha'], ['remember', 'Voltar a tocar se estava tocando']]),
    switchRow('Esconder o player da rádio', 'some da barra de cima (a mudança aparece ao voltar para o jogo)', !!state.settings.radioHidden, (on) => saveSettings({ radioHidden: on }, false)),
    switchRow('Pausar ao minimizar o programa', 'e voltar a tocar quando você reabrir', !!state.settings.radioPauseMinimized, (on) => saveSettings({ radioPauseMinimized: on }, false)),
    switchRow('Baixar o volume ao abrir um vídeo', 'quando você abre um vídeo do YouTube pelo programa, a rádio fica baixinha até você voltar', !!state.settings.radioDuck, (on) => saveSettings({ radioDuck: on }, false)),
    h('p', { class: 'hint', text: 'O volume e o botão ▶/⏸ ficam no player da barra de cima.' }));
}

function toolsCard() {
  const { el: msg, flash } = flashBox();
  const out = h('div', { class: 'conn-list' });
  const run = h('button', { class: 'btn', type: 'button' }, 'Testar conexões');
  run.onclick = async () => {
    run.disabled = true; run.textContent = 'Testando…';
    out.replaceChildren(h('p', { class: 'hint', text: 'Consultando os sites (até 10 segundos cada)…' }));
    const r = await window.api.testConnections();
    run.disabled = false; run.textContent = 'Testar conexões';
    if (!r.ok) return out.replaceChildren(h('p', { class: 'hint bad', text: 'O teste não pôde ser feito.' }));
    out.replaceChildren(h('ul', { class: 'conn' }, ...r.data.map((c) => h('li', { class: c.ok ? 'ok' : 'fail' },
      h('span', { class: 'conn-dot', text: c.ok ? '●' : '✕' }),
      h('strong', { text: c.name }),
      h('span', { class: 'muted', text: c.ok ? ` · ${c.ms} ms` : ` · ${c.status ? 'erro ' + c.status : 'sem resposta'}${c.note ? ' (' + c.note + ')' : ''}` })))));
  };
  return cfgCard('cfg-ferramentas', 'Ferramentas', 'Para descobrir por que algo não funciona e para me mandar o que aconteceu.',
    h('h3', {}, 'Conexões'),
    h('p', { class: 'hint', text: 'Confere se Steam, HowLongToBeat, PowerPyx, Exophase, Bing, o tradutor e a rádio estão respondendo.' }),
    run, out,
    h('h3', {}, 'Diagnóstico'),
    switchRow('Modo diagnóstico', 'também grava o registro em um arquivo (diagnostico.log) na pasta dos dados', !!state.settings.diagMode, (on) => saveSettings({ diagMode: on }, false)),
    h('div', { class: 'src-add cache-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => {
        const r = await window.api.saveDiagReport();
        if (!r.ok) return flash((r.error && r.error.message) || 'Não foi possível salvar.', true);
        if (!r.data.canceled) flash(`Relatório salvo (${r.data.lines} linhas) em ${r.data.path}. Pode me enviar esse arquivo.`);
      } }, 'Salvar relatório de diagnóstico')),
    h('p', { class: 'hint', text: 'O relatório traz versão, sistema, suas configurações (sem a chave nem o perfil da Steam) e o que o programa fez nas últimas buscas: páginas abertas e se deram certo.' }),
    msg);
}

const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const fmtWhen = (ms) => new Date(ms).toLocaleDateString('pt-BR');

/** Aba Cache: lista o que está salvo por jogo e deixa apagar (tudo, por tipo ou por jogo). */
function cacheCard() {
  const { el: msg, flash } = flashBox();
  const body = h('div', {}, h('p', { class: 'hint', text: 'Carregando…' }));
  const del = async (scope, text) => {
    const res = await window.api.deleteCache(scope);
    flash(res.ok ? `${text} (${res.data.removed} ${res.data.removed === 1 ? 'item' : 'itens'}).` : 'Não foi possível apagar agora.', !res.ok);
    draw();
  };
  const btn = (label, scope, text, cls = 'btn ghost') => h('button', { class: cls, type: 'button', onclick: () => del(scope, text) }, label);
  async function draw() {
    const res = await window.api.listCache();
    if (!res.ok) { body.replaceChildren(h('p', { class: 'hint', text: 'Não foi possível ler o cache.' })); return; }
    const c = res.data;
    const sh = c.shared;
    body.replaceChildren(
      h('p', { class: 'hint', text: c.files ? `${c.games.length} ${c.games.length === 1 ? 'jogo' : 'jogos'} no cache · ${c.files} arquivos · ${fmtBytes(c.bytes)}` : 'O cache está vazio.' }),
      h('div', { class: 'src-add cache-actions' },
        btn('Apagar guias e traduções', { type: 'guides' }, 'Guias, traduções, tempos e nomes apagados'),
        btn('Apagar só traduções', { type: 'translations' }, 'Traduções apagadas'),
        btn('Apagar tudo', { type: 'all' }, 'Cache apagado', 'btn ghost danger')),
      sh.traducao.count ? h('p', { class: 'hint', text: `Traduções salvas: ${sh.traducao.count} textos (${fmtBytes(sh.traducao.bytes)}).` }) : null,
      sh.library.count ? h('p', { class: 'hint', text: `Sua lista de jogos da Steam está salva (${fmtBytes(sh.library.bytes)}, ${fmtWhen(sh.library.savedAt)}).` }) : null,
      ...c.games.map((g) => h('div', { class: 'cache-game' },
        h('div', { class: 'cache-head' },
          h('b', { text: g.name }), h('span', { class: 'muted', text: ` · ${fmtBytes(g.bytes)} · ${fmtWhen(g.lastAt)}` }), g.notes ? h('span', { class: 'sp-site note-tag', title: 'Este jogo tem anotações suas, então o cache dele dura o dobro do tempo', text: `📝 ${g.notes} ${g.notes === 1 ? 'anotação' : 'anotações'} · cache 2×` }) : null,
          h('button', { class: 'btn ghost', type: 'button', onclick: () => del({ type: 'game', appid: g.appid }, `Cache de ${g.name} apagado`) }, 'Apagar')),
        h('div', { class: 'cache-items' }, g.items.map((i) => h('span', { class: 'sp-site', title: `salvo em ${fmtWhen(i.savedAt)}`, text: i.label }))))),
      h('p', { class: 'hint', text: 'Suas correções feitas com o lápis (✎) e as configurações nunca são apagadas aqui.' }));
  }
  draw();
  const rules = h('div', {},
    selectRow('cacheDays', 'Duração do cache', 'depois disso o programa busca de novo', [[7, '7 dias'], [30, '30 dias (padrão)'], [90, '90 dias']]),
    selectRow('cacheMaxMb', 'Limite de espaço', 'ao passar, apaga primeiro os jogos usados há mais tempo (menos os com anotações)', [[0, 'Sem limite'], [100, '100 MB'], [250, '250 MB'], [500, '500 MB'], [1000, '1 GB']]),
    switchRow('Apagar o cache ao fechar o programa', 'alternativa mais leve ao "Não salvar cache": usa durante a sessão e limpa na saída', !!state.settings.clearOnExit, (on) => saveSettings({ clearOnExit: on }, false)),
    h('h3', { class: 'cfg-sub', text: 'Sempre buscar de novo (nunca usar o cache)' }),
    ...[['percent', '% global de jogadores'], ['library', 'Biblioteca e horas jogadas'], ['hltb', 'Tempo para zerar (HowLongToBeat)'], ['guides', 'Guias'], ['maps', 'Mapas'], ['dlc', 'Jogo base / DLCs']].map(([k, label]) => switchRow(label, null, (state.settings.alwaysFresh || []).includes(k), (on) => {
      const cur = state.settings.alwaysFresh || [];
      saveSettings({ alwaysFresh: on ? [...new Set([...cur, k])] : cur.filter((x) => x !== k) }, false);
    })));
  const noCache = switchRow('Não salvar cache', 'com isso marcado, nada novo é guardado (tudo é buscado de novo a cada vez). O que já está salvo continua sendo usado até você apagar. Suas anotações e correções não são afetadas.', !!state.settings.noCache, (on) => saveSettings({ noCache: on }));
  return cfgCard('cfg-cache', 'Cache', 'Jogos e guias que o programa já guardou no computador para abrir mais rápido.', h('div', {}, noCache, rules, body), msg);
}

/** Aba Atualizações: procura, baixa e aplica novas versões do código do programa (Releases do GitHub). */
const UPD_TEXT = {
  unconfigured: 'Atualização automática indisponível nesta versão.', idle: 'Ainda não procurou nesta sessão.', checking: '⏳ Procurando atualizações…', uptodate: '✔ Nenhuma atualização encontrada: você já está na versão mais recente.',
  downloading: '⬇ Atualização encontrada! Baixando…', ready: 'Atualização pronta! Reinicie o programa para usar.', error: 'Não foi possível verificar agora.',
  'needs-full': 'Há uma versão nova que precisa de uma instalação completa (peça o novo instalador a quem te passou o programa).',
};
function updateBanner(up) {
  let el = document.getElementById('updBanner');
  if (!up || up.status !== 'ready') { if (el) el.remove(); return; }
  if (el) return;
  el = h('div', { id: 'updBanner', class: 'upd-banner', role: 'status' },
    h('span', { text: `Atualização ${up.version} pronta.` }),
    h('button', { class: 'btn', type: 'button', onclick: () => window.api.applyUpdate() }, 'Reiniciar agora'),
    h('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Fechar aviso', onclick: () => el.remove() }, '×'));
  document.body.append(el);
}
function updatesCard() {
  const body = h('div', {});
  const draw = () => {
    const up = state.update || { status: 'idle', current: state.config.version };
    body.replaceChildren(
      h('p', { class: 'hint', text: `Versão em uso: ${up.current || state.config.version || '?'}` }),
      h('p', { class: (up.status === 'error' ? 'hint err' : 'hint') + (up.status === 'checking' || up.status === 'downloading' ? ' upd-busy' : ''), text: (UPD_TEXT[up.status] || '') + (up.version && up.status !== 'uptodate' ? ` (${up.version})` : '') + (up.status === 'error' && up.error ? ' ' + up.error : '') }),
      up.notes && ['ready', 'downloading', 'needs-full'].includes(up.status) ? h('pre', { class: 'upd-notes', text: up.notes }) : null,
      h('div', { class: 'src-add' },
        up.status === 'ready' ? h('button', { class: 'btn', type: 'button', onclick: () => window.api.applyUpdate() }, 'Reiniciar e atualizar') : null,
        h('button', { class: 'btn ghost', type: 'button', disabled: !up.enabled || up.status === 'checking' || up.status === 'downloading', onclick: async () => {
          state.update = { ...up, status: 'checking', error: '' }; draw(); // feedback na hora
          const [r] = await Promise.all([window.api.checkUpdate(), new Promise((ok) => setTimeout(ok, 700))]); // tempo mínimo para dar para ler
          state.update = r.ok ? r.data : { ...up, status: 'error', error: r.error || '' };
          updateBanner(state.update); draw();
        } }, up.status === 'checking' ? 'Procurando…' : 'Procurar atualizações agora'),
        up.checkedAt && up.status !== 'checking' ? h('span', { class: 'muted', text: 'Última verificação: ' + new Date(up.checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }) : null),
      up.enabled === false ? h('p', { class: 'hint', text: 'A busca só funciona no programa instalado (.exe), não ao rodar pelo código-fonte.' }) : null);
  };
  draw();
  state.updateRedraw = draw;
  window.api.getUpdate().then((r) => { if (r.ok) { state.update = r.data; draw(); } });
  return cfgCard('cfg-atualizacoes', 'Atualizações', 'O programa procura sozinho versões novas e baixa só o que mudou.', body,
    switchRow('Procurar atualizações automaticamente', 'ao abrir o programa e a cada 6 horas', state.settings.autoUpdate !== false, (on) => saveSettings({ autoUpdate: on }, false)),
    selectRow('updateChannel', 'Tipo de versão', 'beta recebe também as versões em teste (pré-lançamento)', [['beta', 'Beta (testes) — padrão'], ['stable', 'Só versões estáveis']]));
}

/** Aba Novidades: o que mudou na versão atual (aberta) e o histórico das anteriores. */
function changelogCard() {
  const body = h('div', {});
  const bold = (t) => String(t).split('**').map((x, i) => (i % 2 ? h('strong', { text: x }) : x));
  const list = (items) => h('ul', { class: 'changelog' }, ...items.map((it) => h('li', {}, ...bold(it))));
  const fill = (data) => {
    if (!data || !data.length) { body.replaceChildren(h('p', { class: 'hint', text: 'Sem histórico disponível.' })); return; }
    const cur = state.config.version;
    const now = data.find((e) => e.version === cur) || data[0];
    const older = data.filter((e) => e !== now);
    body.replaceChildren(
      h('h3', {}, `Novo na versão ${now.version}`), list(now.items),
      older.length ? h('h3', {}, 'Versões anteriores') : null,
      ...older.map((e) => h('details', { class: 'changelog-old' }, h('summary', { text: 'Versão ' + e.version }), list(e.items))));
  };
  if (state.changelogData) fill(state.changelogData); // já carregado: a aba abre pronta, sem "pulo" de altura
  else {
    body.append(h('p', { class: 'hint', text: 'Carregando…' }));
    window.api.getChangelog().then((res) => { state.changelogData = res.ok ? res.data : []; fill(state.changelogData); });
  }
  return cfgCard('cfg-novidades', 'Novidades', 'Tudo o que mudou na versão que você está usando.', body);
}

const SETTINGS_TOC = [
  ['cfg-aparencia', 'Aparência e uso'], ['cfg-radio', 'Rádio'], ['cfg-fontes', 'Guias principais'], ['cfg-mapas', 'Mapas principais'], ['cfg-bloqueados', 'Sites bloqueados'], ['cfg-dados', 'Dados e idioma'], ['cfg-cache', 'Cache'], ['cfg-ferramentas', 'Ferramentas'], ['cfg-atualizacoes', 'Atualizações'], ['cfg-novidades', 'Novidades'], ['cfg-conta', 'Conta Steam'],
];

/** Página de Configurações: sumário à esquerda; só a seção escolhida aparece à direita. */
function settingsPage(accountForm) {
  const theme = themeCard();
  theme.id = 'cfg-aparencia'; theme.classList.add('cfg-section');
  accountForm.classList.add('cfg-section');
  const sections = { 'cfg-aparencia': theme, 'cfg-radio': radioCard(), 'cfg-fontes': sourcesCard(), 'cfg-mapas': mapsCard(), 'cfg-bloqueados': blockedCard(), 'cfg-dados': dataCard(), ...(state.settingsTab === 'cfg-cache' ? { 'cfg-cache': cacheCard() } : {}), 'cfg-ferramentas': toolsCard(), ...(state.settingsTab === 'cfg-atualizacoes' ? { 'cfg-atualizacoes': updatesCard() } : {}), ...(state.settingsTab === 'cfg-novidades' ? { 'cfg-novidades': changelogCard() } : {}), 'cfg-conta': h('div', { id: 'cfg-conta' }, accountForm, cfgCard('cfg-busca', 'Busca de jogos', null, switchRow('Esconder demos e ferramentas na busca', 'não mostra demos, playtests, servidores dedicados, SDKs e trilhas sonoras nas sugestões', !!state.settings.hideDemos, (on) => saveSettings({ hideDemos: on }, false)))) };
  if (!sections[state.settingsTab]) state.settingsTab = 'cfg-aparencia';
  const toc = h('nav', { class: 'settings-toc', 'aria-label': 'Seções das configurações' },
    h('div', { class: 'toc-title', text: 'Configurações' }),
    ...SETTINGS_TOC.map(([id, label]) => h('button', {
      type: 'button', class: 'toc-link' + (id === state.settingsTab ? ' active' : ''), 'aria-current': id === state.settingsTab ? 'page' : 'false',
      onclick: () => { state.settingsTab = id; renderSetup({ editing: true }); window.scrollTo(0, 0); },
    }, label)),
    h('div', { class: 'muted ver-note', text: 'versão ' + (state.config.version || '?') }),
    h('button', { class: 'btn ghost toc-back', type: 'button', onclick: backFromSettings }, state.game ? '← Voltar ao jogo' : '← Voltar'));
  return h('div', { class: 'settings-layout' }, toc, h('div', { class: 'settings-main' }, sections[state.settingsTab], saveBar()));
}

/* ---------- temas de cores ---------- */

// Mesmos nomes da Steam. As cores de cada tema ficam em styles.css (data-theme="id").
const THEMES = [
  { id: 'padrao', name: 'Tema Padrão' },
  { id: 'verao', name: 'Verão' },
  { id: 'meia-noite', name: 'Meia-Noite' },
  { id: 'aco', name: 'Aço' },
  { id: 'cosmico', name: 'Cósmico' },
  { id: 'escuro', name: 'Modo Escuro' },
];

/** Aplica o tema na tela e guarda uma cópia local para a próxima abertura não piscar. */
function showTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  try {
    localStorage.setItem('bc-theme', id);
  } catch (_) {
    /* sem armazenamento: o tema oficial continua salvo em config.json */
  }
}

/** O tema aparece na hora, mas só é gravado em "Salvar alterações" (como o resto das configurações). */
function chooseTheme(id) {
  showTheme(id);
  state.themeDraft = id === ((state.config && state.config.theme) || 'padrao') ? null : id;
  if (state.themeDraft) state.dirty = true;
  refreshSaveBar();
}

function themeCard() {
  const current = state.themeDraft || (state.config && state.config.theme) || 'padrao';
  const group = h('div', { class: 'themes', role: 'radiogroup', 'aria-label': 'Tema de cores' },
    THEMES.map((t) =>
      h('label', { class: 'theme-opt' },
        h('input', { type: 'radio', name: 'theme', value: t.id, checked: t.id === current, onchange: () => chooseTheme(t.id) }),
        h('span', { class: 'swatch', 'data-t': t.id }),
        h('span', { class: 'theme-name', text: t.name }))));
  const pick = (key, label, hint, options) => {
    const sel = h('select', { class: 'cfg-select', 'aria-label': label }, ...options.map(([v, t]) => h('option', { value: v, text: t, selected: (state.settings[key] || options[0][0]) === v })));
    sel.addEventListener('change', () => saveSettings({ [key]: sel.value }, false));
    return h('div', { class: 'src-row' }, h('label', { class: 'src-main' }, h('span', {}, h('strong', { text: label }), hint ? h('span', { class: 'muted', text: ' — ' + hint }) : null)), sel);
  };
  const flip = (key, label, hint) => switchRow(label, hint, key === 'groupDlc' ? state.settings.groupDlc !== false : !!state.settings[key], (on) => saveSettings({ [key]: on }, false));
  return h('section', { class: 'setup-card' },
    h('h2', {}, 'Aparência e uso'),
    h('p', { class: 'section-lead' }, 'Escolha as cores e o jeito de usar o programa. A mudança aparece na hora; clique em Salvar alterações para guardá-la.'),
    group,
    h('h3', { class: 'cfg-sub', text: 'Tamanho e densidade' }),
    pick('fontScale', 'Tamanho da letra', 'aumenta ou diminui o programa todo', [['pequena', 'Pequena'], ['normal', 'Normal'], ['grande', 'Grande'], ['enorme', 'Muito grande']]),
    pick('density', 'Densidade da lista', 'espaço entre as conquistas', [['compacta', 'Compacta'], ['normal', 'Normal'], ['confortavel', 'Confortável']]),
    flip('colorIcons', 'Ícones coloridos nas conquistas não alcançadas', 'em vez do cinza'),
    h('h3', { class: 'cfg-sub', text: 'Ao abrir' }),
    pick('startView', 'Ao iniciar o programa', null, [['last', 'Abrir o último jogo'], ['search', 'Mostrar a tela de busca']]),
    pick('defaultFilter', 'Ao abrir um jogo, mostrar', null, [['missing', 'Só as não alcançadas'], ['all', 'Todas as conquistas']]),
    flip('progressCollapsed', 'Barra de pesquisa começa recolhida', 'o que o programa está fazendo fica numa linha só; dá para abrir quando quiser'),
    flip('summaryOpen', 'Resumo do guia de conquistas já aberto', 'o painel entre o cabeçalho e a lista'),
    flip('groupDlc', 'Separar a lista em caixas (jogo base e DLCs)', 'desmarcado, a lista fica corrida e o filtro "Origem" continua disponível'));
}

/* ---------- estrutura principal + busca ---------- */

function renderShell() {
  const input = h('input', { type: 'search', id: 'q', placeholder: 'Buscar um jogo pelo nome…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Buscar jogo' });
  const suggest = h('div', { class: 'suggest', hidden: true, role: 'listbox' });
  let timer = null;
  let searchToken = 0;

  function closeSuggest() {
    suggest.hidden = true;
    suggest.replaceChildren();
  }

  function pick(game, owned) {
    closeSuggest();
    input.value = '';
    openGame(game.appid, owned ? { playtimeMinutes: game.playtimeMinutes, lastPlayed: game.lastPlayed } : null, game.name);
  }

  function renderSuggest(data) {
    suggest.replaceChildren();
    if (!data.library.length && !data.store.length) {
      suggest.append(h('div', { class: 'empty' }, 'Nenhum jogo encontrado.'));
    }
    const group = (title, games, owned) => {
      if (!games.length) return;
      suggest.append(h('h4', {}, title));
      for (const g of games) {
        suggest.append(h('button', { type: 'button', role: 'option', onclick: () => pick(g, owned) },
          h('span', { text: g.name }),
          owned && g.playtimeMinutes ? h('span', { class: 'meta', text: fmtHours(g.playtimeMinutes) }) : null));
      }
    };
    group('Na sua biblioteca', data.library, true);
    group('Loja Steam', data.store, false);
    suggest.hidden = false;
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const value = input.value.trim();
    if (value.length < 2) return closeSuggest();
    timer = setTimeout(async () => {
      const mine = ++searchToken;
      const res = await window.api.searchGames(value);
      if (mine !== searchToken) return;
      if (!res.ok) {
        suggest.replaceChildren(h('div', { class: 'empty', text: res.error.message }));
        suggest.hidden = false;
        return;
      }
      renderSuggest(res.data);
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    const items = [...suggest.querySelectorAll('button')];
    const current = items.findIndex((b) => b.classList.contains('active'));
    if (e.key === 'Escape') return closeSuggest();
    if (!items.length || suggest.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? Math.min(current + 1, items.length - 1) : Math.max(current - 1, 0);
      items.forEach((b, i) => b.classList.toggle('active', i === next));
      items[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (items[current] || items[0]).click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!suggest.contains(e.target) && e.target !== input) closeSuggest();
  });

  const cfg = state.config;
  $app.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'top-left' },
        h('h1', { class: 'brand' }, h('img', { class: 'brand-logo', src: 'logo.svg', alt: '' }), h('span', { class: 'brand-text' }, h('span', { class: 'brand-name' }, 'Busca', h('small', {}, 'Conquista')), state.config.version ? h('span', { class: 'ver', text: 'versão ' + state.config.version }) : null)),
        h('button', { class: 'btn ghost', type: 'button', onclick: loadLast }, 'Último jogo')),
      h('div', { class: 'search' }, input, suggest),
      h('div', { class: 'who' },
        radioWidget(),
        // Foto e nome levam ao seu perfil na Steam (abre no navegador padrão)
        h('button', {
          class: 'who-link', type: 'button', title: 'Abrir meu perfil na Steam',
          onclick: () => openExternal(`https://steamcommunity.com/profiles/${cfg.steamId}`),
        },
          cfg.avatar ? h('img', { src: cfg.avatar, alt: '' }) : null,
          h('span', { text: cfg.personaName || 'Conta Steam' })),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => renderSetup({ editing: true }), 'aria-label': 'Configurações' }, 'Configurações'))),
    h('main', { id: 'content' }));
}

/* ---------- rádio GameFM (stream 24 h: gamefm.com.br) ---------- */

const RADIO_URL = 'https://azura12.instainternet.com/listen/gamefm/radio.mp3';
const radio = { audio: null, playing: false, text: 'GameFM · rádio 24 h', timer: null, vol: 0.5, subs: new Set() };
try { const v = parseFloat(localStorage.getItem('radioVol')); if (v >= 0 && v <= 1) radio.vol = v; } catch (_) { /* sem armazenamento */ }
const radioEmit = () => radio.subs.forEach((fn) => fn());

async function radioPoll() {
  const res = await window.api.radioNow();
  if (res.ok && res.data.title) radio.text = `${res.data.artist ? res.data.artist + ' – ' : ''}${res.data.title}`;
  radioEmit();
}
function radioStop(text, keepMemory = false) {
  if (!keepMemory) { try { localStorage.setItem('radioWas', '0'); } catch (_) { /* ok */ } }
  if (radio.audio) { radio.audio.pause(); radio.audio.removeAttribute('src'); radio.audio.load(); }
  radio.playing = false;
  clearInterval(radio.timer); radio.timer = null;
  if (text) radio.text = text;
  radioEmit();
}
function radioToggle() {
  if (radio.playing) return radioStop('GameFM · rádio 24 h');
  if (!radio.audio) {
    radio.audio = new Audio();
    radio.audio.preload = 'none';
    radio.audio.addEventListener('error', () => { if (radio.playing) radioStop('Sem sinal. Clique para tentar de novo'); });
  }
  radio.audio.src = RADIO_URL;
  radio.audio.volume = radio.vol;
  radio.playing = true;
  radio.text = 'Conectando…';
  radioEmit();
  radio.audio.play().then(() => { radioPoll(); radio.timer = setInterval(radioPoll, 20000); try { localStorage.setItem('radioWas', '1'); } catch (_) { /* ok */ } }).catch(() => radioStop('Sem sinal. Clique para tentar de novo'));
}
/** Mini player da barra de cima (o áudio fica fora da tela, então continua tocando ao trocar de jogo ou abrir Configurações). */
/** Comportamentos da rádio (Configurações > Rádio): tocar ao abrir, lembrar, pausar ao minimizar e baixar o volume ao abrir vídeos. */
function radioOnBoot() {
  const mode = state.settings.radioMode;
  let was = false;
  try { was = localStorage.getItem('radioWas') === '1'; } catch (_) { /* ok */ }
  if (!state.settings.radioHidden && !radio.playing && (mode === 'auto' || (mode === 'remember' && was))) radioToggle();
}
document.addEventListener('visibilitychange', () => {
  if (!state.settings || !state.settings.radioPauseMinimized) return;
  if (document.hidden && radio.playing) { radio.autoPaused = true; radioStop(null, true); }
  else if (!document.hidden && radio.autoPaused) { radio.autoPaused = false; radioToggle(); }
});
/** Abriu um vídeo no navegador: baixa a rádio até você voltar para o programa. */
function radioDuck(url) {
  if (!state.settings || !state.settings.radioDuck || !radio.audio || !radio.playing || !/(youtube\.com|youtu\.be)/i.test(String(url))) return;
  radio.audio.volume = Math.max(0, radio.vol * 0.2);
  const restore = () => { if (radio.audio && radio.playing) radio.audio.volume = radio.vol; };
  window.addEventListener('blur', () => window.addEventListener('focus', restore, { once: true }), { once: true });
  setTimeout(restore, 15 * 60 * 1000);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function radioIcon(kind) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  // o triângulo é deslocado um pouco para a direita para parecer centralizado no círculo
  path.setAttribute('d', kind === 'pause' ? 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z' : 'M8.5 5.2v13.6L19 12z');
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/** Mini player da barra de cima (o áudio fica fora da tela, então continua tocando ao trocar de jogo ou abrir Configurações). */
function radioWidget() {
  if (state.settings && state.settings.radioHidden) { const none = h('div', { class: 'radio-none', hidden: true }); return none; }
  const btn = h('button', { class: 'radio-btn', type: 'button', onclick: radioToggle });
  const inner = h('span', { class: 'radio-text-inner' });
  const label = h('span', { class: 'radio-text' }, inner);
  const vol = h('input', { class: 'radio-vol', type: 'range', min: 0, max: 100, value: Math.round(radio.vol * 100), 'aria-label': 'Volume da rádio' });
  vol.addEventListener('input', () => {
    radio.vol = vol.value / 100;
    if (radio.audio) radio.audio.volume = radio.vol;
    try { localStorage.setItem('radioVol', String(radio.vol)); } catch (_) { /* ok */ }
  });
  const link = h('button', { class: 'radio-link', type: 'button', title: 'Abrir o site da GameFM', onclick: () => openExternal('https://gamefm.com.br/') }, '📻');
  const box = h('div', { class: 'radio' }, link, btn, h('div', { class: 'radio-info' }, h('span', { class: 'radio-name', text: 'GameFM · ao vivo' }), label), vol);
  let shown = null;
  const sync = () => {
    if (!box.isConnected && box.dataset.shown) { radio.subs.delete(sync); return; }
    box.dataset.shown = '1';
    const icon = radio.playing ? 'pause' : 'play';
    if (shown !== icon) { btn.replaceChildren(radioIcon(icon)); shown = icon; }
    btn.title = radio.playing ? 'Pausar a rádio' : 'Tocar a rádio GameFM';
    btn.setAttribute('aria-label', btn.title);
    inner.textContent = radio.text;
    label.title = radio.text;
    box.classList.toggle('on', radio.playing);
    fitRadioText(label, inner);
  };
  radio.subs.add(sync);
  window.addEventListener('resize', () => fitRadioText(label, inner));
  sync();
  return box;
}

/** Nome da música comprido demais para o espaço: rola devagar para dar para ler tudo (sem inline style, só CSSOM). */
function fitRadioText(label, inner) {
  requestAnimationFrame(() => {
    const extra = inner.scrollWidth - label.clientWidth;
    inner.classList.toggle('scroll', extra > 4);
    if (extra > 4) {
      inner.style.setProperty('--shift', `-${extra + 8}px`);
      inner.style.setProperty('--dur', `${Math.max(6, Math.round((extra + 8) / 18))}s`);
    }
  });
}

const $content = () => document.getElementById('content');

function showLoading(text) {
  $content().replaceChildren(h('div', { class: 'state', role: 'status' }, h('div', { class: 'spinner' }), text));
}

function showError(error) {
  const box = h('div', { class: 'state', role: 'alert' }, h('h2', {}, 'Ops'), h('div', { text: error.message }));
  if (error.code === 'PRIVATE_PROFILE') {
    box.append(h('p', {}, extLink('Abrir as configurações de privacidade da Steam', PROFILE_PRIVACY_URL)));
  }
  if (error.code === 'INVALID_KEY' || error.code === 'MISSING_KEY') {
    box.append(h('p', {}, h('button', { class: 'btn', type: 'button', onclick: () => renderSetup({ editing: true }) }, 'Abrir configurações')));
  }
  $content().replaceChildren(box);
}

/* ---------- carregar jogo ---------- */

async function loadLast() {
  const mine = ++state.token;
  showLoading('Procurando o último jogo que você jogou…');
  const res = await window.api.lastGame();
  if (mine !== state.token) return;
  if (!res.ok) return showError(res.error);
  const { game } = res.data;
  if (!game) {
    return $content().replaceChildren(h('div', { class: 'state' }, h('h2', {}, 'Nenhum jogo jogado encontrado'), 'Use a busca acima para escolher um jogo.'));
  }
  openGame(game.appid, { playtimeMinutes: game.playtimeMinutes, lastPlayed: game.lastPlayed, isLast: true }, game.name);
}

async function openGame(appid, meta, name) {
  const mine = ++state.token;
  try { window.api.cancelGuides(); } catch (_) { /* sem cancelar */ } // a busca do jogo anterior para: não disputa a internet com a nova
  showLoading(`Carregando conquistas${name ? ' de ' + name : ''}…`);
  const res = await window.api.loadGame(appid);
  if (mine !== state.token) return;
  if (!res.ok) return showError(res.error);
  state.game = res.data;
  state.meta = meta;
  state.filter = state.settings.defaultFilter === 'all' ? 'all' : 'missing'; // padrão: só o que ainda falta
  state.scope = state.filter;
  state.time = null;
  state.openRows = new Set(); state.pick = {}; state.origKeys = new Set(); state.fallback = null; state.antiBot = []; state.progress = null; state.dlcSites = []; state.progressCollapsed = !!state.settings.progressCollapsed; state.summaries = []; state.summaryOpen = !!state.settings.summaryOpen; state.summaryPick = 0;
  state.guides = 'loading';
  realDlcMemo = null; state.dlc = { labels: [], origins: {} }; state.originFilter = 'all'; state.organize = false; state.sel = new Set(); state.lastSel = null;
  initSteps();
  renderGame();
  renderProgress();
  loadMapButton(mine);
  // ordem: 1) conquistas (já na tela)  2) tempo  3) caixas jogo base/DLC  4) guias e etiquetas
  (async () => {
    await loadTime(appid, state.game.name, mine);
    if (mine !== state.token) return;
    await loadDlcs(mine);
    if (mine !== state.token) return;
    await loadGuides(mine);
  })();
}

/* ---------- tela do jogo ---------- */

/** Um único botão de mapa: com 1 opção abre direto; com várias, abre uma janelinha com o nome de cada uma. */
const mapButtons = (list) => {
  if (!list || !list.length) return [];
  if (list.length === 1) return [h('button', { class: 'head-link map-btn', type: 'button', onclick: () => openExternal(list[0].url) }, '🗺 Mapa interativo')];
  const menu = h('div', { class: 'map-menu', role: 'menu', hidden: true },
    ...list.map((m) => h('button', { class: 'map-menu-item', type: 'button', role: 'menuitem', onclick: () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); openExternal(m.url); } }, m.name)));
  const close = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  const toggle = h('button', { class: 'head-link', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) {
      const off = (ev) => { if (!wrap.contains(ev.target) || ev.type === 'keydown') { close(); document.removeEventListener('click', off); document.removeEventListener('keydown', esc); } };
      const esc = (ev) => { if (ev.key === 'Escape') { close(); document.removeEventListener('click', off); document.removeEventListener('keydown', esc); } };
      setTimeout(() => { document.addEventListener('click', off); document.addEventListener('keydown', esc); }, 0);
    }
  } }, `🗺 Mapas interativos (${list.length}) ▾`);
  const wrap = h('div', { class: 'map-btn map-wrap' }, toggle, menu);
  return [wrap];
};

/** Abre a página de mods do jogo no Nexus Mods (o endereço é descoberto na primeira vez e guardado). */
async function openMods() {
  const g = state.game;
  if (!state.mods || state.mods.appid !== g.appid) {
    const btn = document.querySelector('.mods-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🧩 Procurando…'; }
    const res = await window.api.findMods({ appid: g.appid, name: g.name });
    if (btn) { btn.disabled = false; btn.textContent = '🧩 Mods (Nexus)'; }
    if (!res.ok) return;
    state.mods = { appid: g.appid, ...res.data };
  }
  openExternal(state.mods.url);
}

/** Procura mapas interativos do jogo (MapGenie e as fontes de mapa configuradas); cada um encontrado vira um botão no cabeçalho. */
const mapsDetail = (n) => (n ? `${n} ${n === 1 ? 'mapa' : 'mapas'}` : 'nenhum mapa encontrado');
async function loadMapButton(token) {
  const g = state.game;
  if (state.map && state.map.appid === g.appid) { setStep('mapas', 'done', mapsDetail(state.map.list.length)); return; }
  setStep('mapas', 'active', 'procurando mapas interativos…');
  const res = await window.api.findMap({ appid: g.appid, name: g.name });
  if (token !== state.token) return;
  if (!res.ok) { setStep('mapas', 'warn', 'não foi possível procurar mapas'); return; }
  state.map = { appid: g.appid, list: res.data.list || [] };
  setStep('mapas', 'done', mapsDetail(state.map.list.length));
  document.querySelectorAll('.map-btn').forEach((b) => b.remove());
  const links = document.querySelector('.head-links');
  if (links && state.map.list.length) {
    const last = links.lastElementChild;
    for (const b of mapButtons(state.map.list)) links.insertBefore(b, last);
  }
}

/** Exporta as conquistas que faltam (com origem, categoria e minhas anotações) em texto ou PDF. */
function exportButton() {
  const msg = h('span', { class: 'muted export-msg', role: 'status' });
  const go = async (format) => {
    const g = state.game;
    const order = originList();
    const items = g.achievements.filter((a) => !a.achieved)
      .sort((a, b) => order.indexOf(originOf(a)) - order.indexOf(originOf(b)))
      .map((a) => ({ name: a.namePt || a.nameEn, en: a.nameEn, desc: a.descPt || a.descEn, pct: a.percent == null ? null : fmtPct(a.percent).replace('%', ''), origin: originName(originOf(a)), cat: catsOf(a).map((c) => CATEGORY_LABELS[c]).join(' / '), note: a.note || '' }));
    if (!items.length) { msg.textContent = 'Não falta nenhuma conquista.'; return; }
    msg.textContent = 'Gerando…';
    const res = await window.api.exportMissing({ game: g.name, items, format });
    msg.textContent = res.ok ? (res.data.canceled ? '' : 'Salvo em ' + res.data.path) : ((res.error && res.error.message) || 'Não foi possível exportar.');
  };
  const wrap = h('div', { class: 'export-wrap' },
    h('button', { class: 'btn ghost', type: 'button', title: 'Salva a lista do que falta, com suas anotações' }, '📄 Exportar ▾'),
    h('div', { class: 'export-menu', hidden: true },
      h('button', { type: 'button', onclick: () => go('pdf') }, 'PDF (para imprimir)'),
      h('button', { type: 'button', onclick: () => go('txt') }, 'Texto (.txt)')),
    msg);
  const btn = wrap.querySelector('button');
  const menu = wrap.querySelector('.export-menu');
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) setTimeout(() => document.addEventListener('click', () => { menu.hidden = true; }, { once: true }), 0); });
  return wrap;
}

function renderGame() {
  const g = state.game;
  const s = g.summary;
  const pct = s.total ? Math.round((s.achieved / s.total) * 100) : 0;
  const meta = state.meta;

  const subParts = [];
  if (meta && meta.isLast) subParts.push('Último jogo que você jogou');
  if (meta && meta.playtimeMinutes) subParts.push(fmtHours(meta.playtimeMinutes) + ' jogadas');
  if (meta && meta.lastPlayed) subParts.push('último acesso em ' + fmtDay(meta.lastPlayed));

  const cover = h('img', { class: 'cover', alt: '' });
  const bg = h('div', { class: 'gh-bg', 'aria-hidden': 'true' });
  const head = h('section', { class: 'game-head layout-c' },
    bg,
    h('div', { class: 'gh-in' },
    cover,
    h('div', { class: 'info' },
      h('h1', { text: g.name }),
      h('div', { class: 'sub', text: subParts.join(' · ') || 'Jogo da Steam' }),
      g.progressAvailable
        ? h('div', {},
            h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, progressFill(pct)),
            h('div', { class: 'progress-label' }, h('strong', { text: `${s.achieved} de ${s.total}` }), ` conquistas (${pct}%) · faltam ${s.remaining}`))
        : h('div', { class: 'progress-label', text: `${s.total} conquistas · não foi possível ver o seu progresso neste jogo (você pode não possuí-lo).` }),
      h('div', { class: 'time-box', id: 'timeBox' }),
      h('div', { class: 'guide-status', id: 'guideStatus' })),
    h('div', { class: 'head-links' },
      h('button', { class: 'head-link', type: 'button', onclick: () => openExternal(`https://store.steampowered.com/app/${g.appid}`) }, '🛒 Página na loja'),
      state.config && state.config.steamId
        ? h('button', { class: 'head-link', type: 'button', onclick: () => openExternal(`https://steamcommunity.com/profiles/${state.config.steamId}/stats/${g.appid}/achievements`) }, '🏆 Conquistas na Steam')
        : null,
      h('button', { class: 'head-link', type: 'button', onclick: () => openExternal(`https://steamcommunity.com/app/${g.appid}`) }, '👥 Central da comunidade'),
      ...(state.map && state.map.appid === g.appid ? mapButtons(state.map.list) : []),
      h('button', { class: 'head-link mods-btn', type: 'button', title: 'Abre a página de mods do jogo no Nexus Mods', onclick: openMods }, '🧩 Mods (Nexus)'),
      h('button', { class: 'head-link', type: 'button', title: 'Cancela a busca atual (se houver) e pesquisa de novo', onclick: restartSearch }, '↻ Reiniciar busca'))),
    h('div', { class: 'search-progress strip', id: 'searchProgress', hidden: true, 'aria-live': 'polite' }),
    h('section', { class: 'plat', id: 'platSummary', hidden: true })); // o resumo do guia faz parte do cabeçalho, logo abaixo da barra de pesquisa

  // Se a capa não carregar (jogo sem imagem ou sem internet), some sem deixar um bloco preto.
  const coverUrls = [
    `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
  ];
  let coverTry = 0;
  async function coverFallback() {
    // Último recurso: o programa pergunta à loja da Steam o endereço certo e baixa a imagem por conta própria.
    try {
      const res = await window.api.gameCover(g.appid);
      if (res && res.ok) { cover.removeEventListener('error', coverError); cover.src = res.dataUrl; return; }
    } catch (_) { /* cai no bloco sem capa */ }
    cover.remove();
    bg.remove();
    head.classList.add('no-cover');
  }
  function coverError() {
    coverTry += 1;
    if (coverTry < coverUrls.length) cover.src = coverUrls[coverTry];
    else coverFallback();
  }
  cover.addEventListener('error', coverError);
  cover.addEventListener('load', () => { bg.style.backgroundImage = `url("${cover.src}")`; });
  cover.src = coverUrls[0];

  const list = h('ul', { class: 'ach-list', id: 'achList' });
  const title = h('div', { class: 'list-title', id: 'listTitle' });

  const segBtn = (value, label) =>
    h('button', {
      type: 'button',
      'aria-pressed': String(state.filter === value),
      onclick: () => { state.filter = value; if (value === 'all' || value === 'missing') state.scope = value; renderList(); syncSeg(); },
      'data-filter': value,
      'data-cat': CATEGORY_IDS.includes(value) ? value : null,
    }, label);
  const seg = h('div', { class: 'seg', id: 'seg', role: 'group', 'aria-label': 'Filtro de conquistas' },
    segBtn('missing', 'Não alcançadas'), segBtn('all', 'Todas'));
  const catSeg = h('div', { class: 'cat-filters', id: 'catFilters', role: 'group', 'aria-label': 'Filtros por categoria' });
  const catCount = (c) => g.achievements.filter((a) => inCatScope(a) && catsOf(a).includes(c)).length;
  for (const c of CATEGORY_IDS) {
    catSeg.append(segBtn(c, ''));
  }
  function syncSeg() {
    document.querySelectorAll('#seg button, #catFilters button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter)));
    for (const b of catSeg.querySelectorAll('button')) {
      const c = b.dataset.filter;
      b.replaceChildren(CATEGORY_PLURAL[c] + ' ', h('span', { class: 'count', text: String(catCount(c)) }));
    }
  }
  syncSegRef = syncSeg;

  $content().replaceChildren(head, h('div', { class: 'toolbar' }, title, h('div', { class: 'toolbar-right' }, exportButton(), seg)), catSeg, h('div', { class: 'origin-bar', id: 'originBar', hidden: true }), list);
  renderList();
  syncSeg();
  renderSummary();
}

/* ---------- jogo base x DLCs ---------- */

const BASE = 'base';
/** Origem final: escolha do usuário > seção do guia > nome da DLC na loja/texto > jogo base. */
const MIN_DLC_ACH = 3; // DLC "de verdade" = expansão com conteúdo próprio; 1-2 conquistas soltas são updates/episódios e ficam no jogo base
let realDlcMemo = null;
function realDlcs() {
  if (realDlcMemo) return realDlcMemo;
  const n = new Map(); const forced = new Set();
  for (const a of (state.game && state.game.achievements) || []) {
    const o = rawOriginOf(a);
    if (o === BASE) continue;
    n.set(o, (n.get(o) || 0) + 1);
    if (a.originOverride) forced.add(o); // o usuário escolheu esta DLC: ela existe
  }
  realDlcMemo = new Set([...n].filter(([o, c]) => c >= MIN_DLC_ACH || forced.has(o)).map(([o]) => o));
  return realDlcMemo;
}
function originOf(a) {
  const o = rawOriginOf(a);
  return o === BASE || realDlcs().has(o) ? o : BASE;
}
function rawOriginOf(a) {
  return a.originOverride || a.voted || (state.dlc && state.dlc.webOrigins && state.dlc.webOrigins[a.apiName]) || a.guideOrigin || (state.dlc && state.dlc.origins[a.apiName]) || titleOrigin(a) || BASE;
}
const normT = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/** Guia de DLC (título da página traz o nome da DLC da loja Steam) que explica esta conquista. */
function titleOrigin(a) {
  const labels = (state.dlc && state.dlc.labels) || [];
  if (!labels.length || !a.guide || !a.guide.snippets) return null;
  for (const sn of a.guide.snippets) {
    const t = ' ' + normT(sn.title) + ' ';
    if (t.trim().length < 3) continue;
    const hit = labels.find((l) => normT(l).length >= 5 && t.includes(' ' + normT(l) + ' '));
    if (hit) return hit;
  }
  return null;
}
function catTip(a, c) {
  if (a.override) return 'Etiqueta escolhida por você';
  const d = a.guide && a.guide.details && a.guide.details.find((x) => x.category === c);
  return d ? 'Indicada por: ' + d.sources.join(', ') : 'Palpite pelo nome e descrição da Steam';
}
function voteTip(a) {
  const v = a.voteInfo;
  if (!v || !v.votes.length || a.originOverride) return a.originOverride ? 'Origem escolhida por você' : 'Esta conquista é de uma DLC';
  return 'Votos: ' + v.votes.map((e) => `${e.src} → ${e.origin === 'base' ? 'jogo base' : e.origin}`).join('; ') + (v.conflict ? ' (as fontes divergem)' : '');
}
const isPass = (o) => /\b(season|expansion|battle) pass\b|^pass\b|\bbundle\b/i.test(String(o || ''));
const originName = (o) => (o === BASE ? 'Jogo base' : o);
/** Origens existentes neste jogo, jogo base primeiro. */
function originList() {
  const seen = new Set([BASE]);
  for (const a of state.game.achievements) seen.add(originOf(a));
  for (const l of (state.dlc && state.dlc.labels) || []) if (realDlcs().has(l)) seen.add(l);
  // passes ("Season Pass") reúnem várias DLCs: não são uma origem, a não ser que o usuário tenha movido conquistas para lá
  const used = new Set(state.game.achievements.map((a) => originOf(a)));
  return [...seen].filter((o) => !isPass(o) || used.has(o));
}

async function loadDlcs(token) {
  const g = state.game;
  state.dlcSites = [];
  setStep('dlc', 'active', 'consultando a loja Steam…');
  const res = await window.api.listDlcs({ appid: g.appid, name: g.name, achievements: g.achievements.map((a) => ({ apiName: a.apiName, nameEn: a.nameEn, descEn: a.descEn })) });
  if (token !== state.token) return;
  if (!res.ok) { setStep('dlc', 'warn', 'não foi possível separar (' + res.error.message + ')'); return; }
  state.dlc = { labels: (res.data.dlcs || []).map((d) => d.label), ignored: res.data.ignored || [], web: res.data.web || null, why: res.data.why || [], withAch: res.data.withAch || [], webOrigins: res.data.webOrigins || {}, webVotes: res.data.webVotes || {}, origins: res.data.origins || {} };
  renderList();
  scheduleVotes();
  const nSites = new Set([...(res.data.web ? ['Exophase'] : []), ...Object.values(res.data.webVotes || {}).flat().map((v) => v.src)]).size;
  const nDlc = (res.data.dlcs || []).length;
  setStep('dlc', 'done', `${nDlc ? `${nDlc} ${nDlc === 1 ? 'DLC' : 'DLCs'} com conteúdo` : 'nenhuma DLC jogável'} · ${nSites} ${nSites === 1 ? 'site separou' : 'sites separaram'} as conquistas`);
}

/** Reúne as pistas (Exophase + seções dos guias + texto) e deixa o programa votar a origem de cada conquista. */
let voteTimer = null;
function scheduleVotes() {
  clearTimeout(voteTimer);
  voteTimer = setTimeout(async () => {
    const g = state.game; const token = state.token;
    if (!g || !state.dlc) return;
    const items = g.achievements.map((a) => ({
      apiName: a.apiName, nameEn: a.nameEn, descEn: a.descEn,
      web: (state.dlc.webOrigins && state.dlc.webOrigins[a.apiName]) || null,
      webVotes: (state.dlc.webVotes && state.dlc.webVotes[a.apiName]) || [],
      snippets: ((a.guide && a.guide.snippets) || []).map((s) => ({ source: s.source, section: s.section, title: s.title })),
    }));
    const res = await window.api.voteOrigins({ name: g.name, labels: state.dlc.labels || [], items });
    if (token !== state.token || !res.ok) return;
    for (const a of g.achievements) {
      const v = res.data.votes[a.apiName];
      a.voted = v ? v.origin : null;
      a.voteInfo = v || null;
    }
    renderList();
  }, 150);
}

async function setOrigin(a, value) {
  const res = await window.api.setOrigin({ appid: state.game.appid, apiName: a.apiName, value });
  closeMenus();
  if (!res.ok) return;
  a.originOverride = value;
  renderList();
}

function renderOriginBar(items) {
  const bar = document.getElementById('originBar');
  if (!bar) return;
  const origins = originList();
  const hasDlc = origins.length > 1 || state.organize;
  if (!hasDlc) { bar.hidden = true; bar.replaceChildren(); state.originFilter = 'all'; return; }
  if (state.originFilter !== 'all' && !origins.includes(state.originFilter)) state.originFilter = 'all';
  const count = (o) => items.filter((a) => originOf(a) === o).length;
  const btn = (value, label, n) => h('button', {
    type: 'button', 'aria-pressed': String(state.originFilter === value),
    onclick: () => { state.originFilter = value; renderList(); },
  }, label + ' ', h('span', { class: 'count', text: String(n) }));
  bar.hidden = false;
  const top = h('div', { class: 'origin-row' }, h('span', { class: 'origin-label', text: 'Origem:' }),
    h('div', { class: 'seg' }, btn('all', 'Tudo', items.length), ...origins.map((o) => btn(o, originName(o), count(o)))),
    h('button', { type: 'button', class: 'btn ghost org-toggle', 'aria-pressed': String(!!state.organize), onclick: () => { state.organize = !state.organize; state.sel = new Set(); renderList(); } },
      state.organize ? '✔ Concluir organização' : '🗂 Organizar DLCs'));
  const kids = [top];
  const d = state.dlc || {};
  const notes = [];
  if (d.web) notes.push(`Divisão feita a partir do ${d.web.host}.`);
  else notes.push(`Divisão por palpites (${(d.why && d.why.length ? d.why.join('; ') : 'sem site de apoio')}). Ajuste em "Organizar DLCs".`);
  if (d.withAch && d.withAch.length) notes.push(`A Steam indica conquistas nestas DLCs: ${d.withAch.join(', ')}.`);
  if (d.ignored && d.ignored.length) notes.push(`DLCs só de itens/trilha (ignoradas): ${d.ignored.join(', ')}.`);
  const tip = notes.join(' ');
  const tg = top.querySelector && top.querySelector('.org-toggle');
  if (tg) tg.title = tip; // detalhes só ao passar o mouse: tela limpa
  if (state.organize) kids.push(organizeToolbar(items));
  bar.replaceChildren(...kids);
}

/** Barra do modo "Organizar": marque conquistas (Shift marca um intervalo) e mova todas de uma vez para o jogo base ou uma DLC. */
function organizeToolbar(items) {
  const sel = state.sel || (state.sel = new Set());
  const known = [...new Set([BASE, ...originList(), ...((state.dlc && state.dlc.labels) || [])])];
  const dest = h('select', { class: 'org-dest', 'aria-label': 'Mover para' },
    ...known.map((o) => h('option', { value: o, text: originName(o) })),
    h('option', { value: '__new', text: 'Outra DLC (digitar nome)…' }),
    h('option', { value: '__auto', text: 'Voltar ao automático' }));
  const nameBox = h('input', { class: 'org-name', type: 'text', maxlength: 60, placeholder: 'Nome da DLC', hidden: true });
  dest.addEventListener('change', () => { nameBox.hidden = dest.value !== '__new'; });
  const info = h('span', { class: 'muted', text: `${sel.size} marcada${sel.size === 1 ? '' : 's'}` });
  const apply = h('button', { type: 'button', class: 'btn', disabled: sel.size === 0, onclick: async () => {
    let value = dest.value;
    if (value === '__auto') value = null;
    else if (value === '__new') { value = nameBox.value.trim(); if (!value) { nameBox.focus(); return; } }
    const names = [...sel];
    const res = await window.api.setOrigins({ appid: state.game.appid, apiNames: names, value });
    if (!res.ok) return;
    for (const a of state.game.achievements) if (sel.has(a.apiName)) a.originOverride = value;
    state.sel = new Set();
    renderList();
  } }, 'Mover marcadas');
  const all = h('button', { type: 'button', class: 'btn ghost', onclick: () => { for (const a of visibleItems()) sel.add(a.apiName); renderList(); } }, 'Marcar todas as visíveis');
  const none = h('button', { type: 'button', class: 'btn ghost', onclick: () => { state.sel = new Set(); renderList(); } }, 'Limpar');
  return h('div', { class: 'org-bar' },
    h('div', { class: 'org-help muted', text: 'Dica: as conquistas de DLC costumam ficar juntas. Use Shift para marcar do primeiro ao último de um intervalo e mova todas para a DLC certa. A escolha fica salva.' }),
    h('div', { class: 'org-row' }, info, all, none, h('span', { class: 'org-to', text: 'Mover para:' }), dest, nameBox, apply));
}

/** Conquistas que aparecem na lista agora (filtros de status, categoria e origem). */
function visibleItems() {
  const f = state.filter;
  const all = state.game.achievements.filter((a) => (f === 'all' ? true : a.achieved ? false : f === 'missing' ? true : catsOf(a).includes(f)));
  const of = state.originFilter || 'all';
  return of === 'all' ? all : all.filter((a) => originOf(a) === of);
}

/** Caixa de marcar da linha (modo Organizar); Shift marca o intervalo desde a última marcada. */
function selectBox(a, order) {
  const sel = state.sel || (state.sel = new Set());
  const box = h('input', { type: 'checkbox', class: 'sel-input', 'aria-label': `Marcar ${a.namePt || a.nameEn}` });
  box.checked = sel.has(a.apiName);
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = order.indexOf(a.apiName);
    if (e.shiftKey && state.lastSel != null && order[state.lastSel] !== undefined) {
      const [x, y] = [Math.min(state.lastSel, idx), Math.max(state.lastSel, idx)];
      for (let i = x; i <= y; i++) (box.checked ? sel.add(order[i]) : sel.delete(order[i]));
    } else if (box.checked) sel.add(a.apiName); else sel.delete(a.apiName);
    state.lastSel = idx;
    renderList();
  });
  return h('label', { class: 'sel-box', title: 'Marcar para mover (Shift marca um intervalo)', onclick: (e) => e.stopPropagation() }, box);
}

/** Os filtros de categoria valem para o que está na tela: só as que faltam (padrão) ou todas, se a lista estava em "Todas". */
const inCatScope = (a) => state.scope === 'all' || !a.achieved;

function renderList() {
  realDlcMemo = null;
  queueMicrotask(() => syncSegRef()); // os números dos filtros e os destaques seguem sempre a lista (etiquetas chegam aos poucos)
  const g = state.game;
  const f = state.filter;
  const all = g.achievements.filter((a) => {
    if (f === 'all') return true;
    if (f === 'missing') return !a.achieved;
    return inCatScope(a) && catsOf(a).includes(f);
  });
  renderOriginBar(all);
  const of = state.originFilter || 'all';
  const items = of === 'all' ? all : all.filter((a) => originOf(a) === of);
  document.getElementById('listTitle').textContent =
    f === 'all' ? `Todas as conquistas (${items.length})`
      : f === 'missing' ? `Conquistas não alcançadas (${items.length})`
        : `${CATEGORY_PLURAL[f]}${state.scope === 'all' ? '' : ' não alcançadas'} (${items.length})`;
  const list = document.getElementById('achList');
  const grouped = of === 'all' && originList().length > 1 && state.settings.groupDlc !== false;
  list.classList.toggle('grouped', grouped && items.length > 0);
  // ordem de exibição (para o Shift-clique do modo Organizar)
  const order = grouped ? originList().flatMap((o) => items.filter((a) => originOf(a) === o).map((x) => x.apiName)) : items.map((x) => x.apiName);
  const build = (a) => {
    const li = renderAchievement(a);
    if (state.organize) { li.classList.add('selecting'); li.append(selectBox(a, order)); }
    return li;
  };
  if (!items.length) {
    list.replaceChildren(h('li', { class: 'state' },
      of !== 'all' ? `Nenhuma conquista nesta lista pertence a "${originName(of)}" ainda.${state.organize ? '' : ' Use "Organizar DLCs" para mover conquistas para cá.'}`
        : f === 'missing' ? [h('h2', {}, 'Tudo conquistado!'), 'Não falta nenhuma conquista neste jogo.']
          : f === 'all' ? 'Este jogo não tem conquistas.'
            : `Nenhuma conquista${state.scope === 'all' ? '' : ' não alcançada'} na categoria "${CATEGORY_PLURAL[f]}". Use o lápis ✎ para classificar manualmente.`));
    return;
  }
  if (!grouped) { list.replaceChildren(...items.map(build)); return; }
  const rows = [];
  for (const o of originList()) {
    const mine = items.filter((a) => originOf(a) === o);
    const total = g.achievements.filter((a) => originOf(a) === o);
    if (!mine.length && !(state.organize && total.length === 0)) continue;
    const done = total.filter((a) => a.achieved).length;
    // cada origem é uma caixa própria (cabeçalho + conquistas)
    const box = h('li', { class: 'origin-box', 'data-origin': o === BASE ? 'base' : 'dlc' },
      h('div', { class: 'origin-head' },
        h('strong', { text: originName(o) }),
        h('span', { class: 'muted', text: ` · ${mine.length} ${mine.length === 1 ? 'conquista' : 'conquistas'} nesta lista · ${done}/${total.length} conquistadas` }),
        state.organize && mine.length ? h('button', { type: 'button', class: 'link-btn org-block', onclick: () => { for (const a of mine) state.sel.add(a.apiName); renderList(); } }, 'marcar esta caixa') : null),
      mine.length ? h('ul', { class: 'origin-list' }, ...mine.map(build)) : h('div', { class: 'origin-empty muted', text: 'Nenhuma conquista aqui ainda. Use "Organizar DLCs" para mover conquistas para esta caixa.' }));
    rows.push(box);
  }
  list.replaceChildren(...rows);
}

/* ---------- barra de pesquisa dos guias (mostra os sites consultados) ---------- */

const phaseGroup = (p) => (p === 'busca' || p === 'paginas' ? 'internet' : p);

/** Etapas da busca, na ordem em que acontecem. */
const STEPS = [
  ['conq', 'Conquistas'],
  ['tempo', 'Tempo de jogo'],
  ['mapas', 'Mapas'],
  ['dlc', 'DLCs'],
  ['guias', 'Guias'],
  ['etiq', 'Etiquetas'],
];
function initSteps() {
  state.steps = {}; state.searchStart = Date.now(); state.searchMs = null;
  for (const [id] of STEPS) state.steps[id] = { status: 'pending', detail: '' };
  state.steps.conq = { status: 'done', detail: `${state.game.achievements.length} conquistas` };
  state.steps.tempo = { status: 'active', detail: 'procurando…' };
}
/** status: pending | active | done | warn */
function setStep(id, status, detail) {
  if (!state.steps) return;
  state.steps[id] = { status, detail: detail == null ? (state.steps[id] || {}).detail || '' : detail };
  renderProgress();
}

function onGuideProgress(evt) {
  if (!state.game || evt.appid !== state.game.appid) return;
  if (evt.phase === 'dlc') {
    const sites = (state.dlcSites = state.dlcSites || []);
    if (evt.site && !sites.includes(evt.site)) sites.push(evt.site);
    setStep('dlc', 'active', evt.label + (evt.site ? ` — ${evt.site}` : '') + '…');
    return;
  }
  const pr = state.progress && !state.progress.finished ? state.progress : (state.progress = { visited: [], finished: false, phase: 'principal' });
  if (evt.site && !pr.visited.some((v) => v.site === evt.site)) pr.visited.push({ site: evt.site, group: phaseGroup(evt.phase) });
  Object.assign(pr, { phase: evt.phase, label: evt.label, site: evt.site, detail: evt.detail, done: evt.done, total: evt.total });
  if (state.steps) state.steps.guias = { status: 'active', detail: `${evt.label || 'procurando guias'}${evt.site ? ' — ' + evt.site : ''}…` };
  renderProgress();
}

/** Termina a busca; a barra continua na tela (com o botão de reiniciar) para poder pesquisar de novo. */
function endProgress() {
  if (!state.progress) state.progress = { visited: [], finished: true, phase: 'internet' };
  state.progress.finished = true;
  if (state.steps && state.game) {
    const pr = state.progress;
    const missing = state.game.achievements.filter((a) => !a.achieved);
    const tagged = missing.filter((a) => catsOf(a).length).length;
    if (state.steps.guias.status !== 'warn') setStep('guias', 'done', pr.visited.length ? `${pr.visited.length} ${pr.visited.length === 1 ? 'site consultado' : 'sites consultados'}` : 'carregados do cache');
    setStep('etiq', 'done', missing.length ? `${tagged} de ${missing.length} conquistas que faltam com etiqueta` : 'nenhuma conquista faltando');
  }
  renderProgress();
}

function renderProgress() {
  const box = document.getElementById('searchProgress');
  if (!box) return;
  const st = state.steps;
  if (!st) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false;
  const pr = state.progress;
  const ok = (x) => x.status === 'done' || x.status === 'warn';
  const allDone = STEPS.every(([id]) => ok(st[id]));
  const active = STEPS.find(([id]) => st[id].status === 'active');
  // linha de status: o que está acontecendo agora; pronto = resumo de tudo
  let line;
  // pronto: só o que foi achado (DLCs, guias, etiquetas); conquistas e horas já aparecem no cabeçalho
  if (allDone && state.searchMs == null) state.searchMs = Date.now() - (state.searchStart || Date.now()); // o tempo para de contar quando tudo termina
  if (!allDone) state.searchMs = null;
  const took = (ms) => { const t = Math.max(1, Math.round(ms / 1000)); return t >= 60 ? `${Math.floor(t / 60)} min ${String(t % 60).padStart(2, '0')} s` : `${t} s`; };
  if (allDone) line = [...['dlc', 'mapas', 'guias', 'etiq'].map((id) => st[id].detail), `pesquisa levou ${took(state.searchMs)}`].filter(Boolean).join('  ·  ');
  else if (active) {
    const guides = active[0] === 'guias' && pr && !pr.finished;
    const known = guides && pr.total > 0;
    line = `${active[1]}: ` + (guides ? `${pr.label || 'procurando guias'}${pr.site ? ' — ' + pr.site : ''}${known ? `  (${Math.min(pr.done + 1, pr.total)} de ${pr.total})` : ''}…` : st[active[0]].detail || '…');
  } else line = 'Aguardando…';
  const toggle = (open) => h('button', { class: 'sp-toggle', type: 'button', 'aria-expanded': String(open), title: open ? 'Recolher esta barra' : 'Mostrar o que o programa está fazendo', onclick: () => { state.progressCollapsed = !state.progressCollapsed; renderProgress(); } }, open ? '▲ recolher' : '▼ mostrar');
  const title = h('b', { class: 'sp-title', text: allDone ? '✅ Busca concluída' : '🔎 Pesquisando' });
  const icon = (x) => (x.status === 'done' ? '✓' : x.status === 'warn' ? '⚠' : x.status === 'active' ? '●' : '○');
  const pill = ([id, label]) => h('span', { class: 'sp-step ' + st[id].status, title: st[id].detail || label },
    h('span', { class: 'sp-ico', 'aria-hidden': 'true', text: icon(st[id]) }), h('span', { text: label }));
  if (state.progressCollapsed) {
    box.classList.add('collapsed');
    // recolhida: texto mais curto, para caber tudo numa linha só
    const mini = allDone ? line.replace(/ com conteúdo/g, '').replace(/ as conquistas/g, '').replace(/ conquistas que faltam com etiqueta/, ' com etiqueta').replace('pesquisa levou ', 'levou ') : line;
    box.replaceChildren(h('div', { class: 'sp-head' }, title, h('span', { class: 'sp-mini', title: line, text: mini }), toggle(false)));
    return;
  }
  box.classList.remove('collapsed');
  const known = !allDone && active && active[0] === 'guias' && pr && pr.total > 0 && !pr.finished;
  const pct = allDone ? 100 : known ? Math.min(100, Math.round((pr.done / pr.total) * 100)) : 100;
  box.replaceChildren(
    h('div', { class: 'sp-head' }, title, h('div', { class: 'sp-steps' }, ...STEPS.map(pill)), toggle(true)),
    h('div', { class: 'sp-foot2' + (allDone ? ' done' : '') },
      allDone ? null : h('div', { class: 'sp-bar' + (known ? '' : ' indeterminate'), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, progressFill(pct)),
      h('div', { class: 'sp-line', text: line })));
}

/* ---------- resumo para platinar ---------- */

function addSummaries(list) {
  if (!Array.isArray(list)) return;
  for (const sm of list) if (!state.summaries.some((x) => x.url === sm.url)) state.summaries.push(sm);
  renderSummary();
}

const summaryTexts = (sm) => [...sm.facts.map((f) => f.value), ...(sm.intro ? sm.intro.split('\n') : [])];

async function ensureSummaryTranslation(sm) {
  if (!state.settings.translate || sm._pt || sm._ptState === 'loading' || sm._orig) return;
  const texts = summaryTexts(sm);
  if (!texts.length) return;
  sm._ptState = 'loading'; renderSummary();
  const token = state.token;
  const res = await window.api.translateTexts({ texts });
  if (token !== state.token) return;
  if (res.ok) { sm._pt = res.data.texts; sm._ptState = 'ok'; } else { sm._ptState = 'error'; sm._ptError = res.error.message; }
  renderSummary();
}

/** Painel recolhível entre o cabeçalho e a lista: como é platinar o jogo (dificuldade, tempo, jogadas...). */
function renderSummary() {
  const box = document.getElementById('platSummary');
  if (!box) return;
  const list = state.summaries || [];
  if (!list.length) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false;
  const idx = Math.min(state.summaryPick || 0, list.length - 1);
  const sm = list[idx];
  const open = !!state.summaryOpen;
  const head = h('button', { class: 'plat-toggle', type: 'button', 'aria-expanded': String(open), onclick: () => { state.summaryOpen = !state.summaryOpen; renderSummary(); if (state.summaryOpen) ensureSummaryTranslation(list[Math.min(state.summaryPick || 0, list.length - 1)]); } },
    h('b', { class: 'sp-title plat-title', text: '📌 Resumo: Guia de conquistas' }), h('span', { class: 'sp-toggle plat-caret', text: open ? '▲ recolher' : '▼ mostrar' }));
  const kids = [head];
  if (open) {
    const showPt = state.settings.translate && !sm._orig;
    const pt = showPt && sm._pt ? sm._pt : null;
    const nf = sm.facts.length;
    const body = h('div', { class: 'plat-body' });
    if (list.length > 1) {
      body.append(h('div', { class: 'source-switch', role: 'group', 'aria-label': 'Trocar de guia' },
        ...list.map((x, i) => h('button', { class: 'src-btn' + (i === idx ? ' active' : ''), type: 'button', 'aria-pressed': String(i === idx),
          onclick: () => { state.summaryPick = i; renderSummary(); ensureSummaryTranslation(list[i]); } }, x.source + (x.date ? ` (${fmtIsoDate(x.date)})` : '')))));
    }
    if (state.settings.translate) {
      const bar = h('div', { class: 'tr-bar' });
      if (sm._ptState === 'loading' && showPt) bar.append(h('span', { class: 'muted', text: 'Traduzindo para o português…' }));
      bar.append(h('button', { class: 'tr-btn', type: 'button', onclick: () => { sm._orig = !sm._orig; renderSummary(); ensureSummaryTranslation(sm); } }, showPt ? 'Ver original (inglês)' : 'Ver em português'));
      if (sm._ptState === 'error' && showPt) bar.append(h('span', { class: 'muted', text: (sm._ptError || 'Tradução indisponível.') + ' Mostrando o original.' }));
      body.append(bar);
    }
    const shown = sm.facts.map((f, i) => ({ label: f.label, value: pt ? (pt[i] || f.value) : f.value }));
    const short = shown.filter((f) => f.value.length <= 48);
    const long = shown.filter((f) => f.value.length > 48);
    if (short.length) body.append(h('div', { class: 'plat-tiles' }, ...short.map((f) => h('div', { class: 'plat-tile' }, h('span', { class: 'plat-label', text: f.label }), h('strong', { text: f.value })))));
    if (long.length) body.append(h('div', { class: 'plat-blocks' }, ...long.map((f) => h('div', { class: 'plat-block' }, h('h4', { text: f.label }), h('p', { text: f.value })))));
    if (sm.intro) body.append(h('div', { class: 'plat-block plat-introblock' }, h('h4', { text: 'Introdução do guia' }), ...sm.intro.split('\n').map((line, i) => h('p', { text: pt ? (pt[nf + i] || line) : line }))));
    body.append(h('footer', {}, 'Fonte: ', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(sm.url) }, sm.source),
      sm.date ? h('span', { class: 'muted', text: ` · ${(sm.dateKind === 'updated' || sm.dateKind === 'modified') ? 'atualizado' : 'publicado'} em ${fmtIsoDate(sm.date)}` }) : null));
    kids.push(body);
  }
  box.replaceChildren(...kids);
}

/* ---------- guias da internet ---------- */

/** Cancela a busca em andamento (inclusive se travou) e começa de novo no mesmo jogo. */
async function restartSearch() {
  const g = state.game;
  if (!g) return;
  const token = ++state.token; // buscas antigas passam a ser ignoradas
  await window.api.cancelGuides();
  await window.api.deleteCache({ type: 'game-guides', appid: g.appid }); // recomeça do zero, sem usar guias nem divisão de DLC já salvos
  if (token !== state.token) return;
  // barra zerada: conquistas e tempo já estão prontos; o resto refaz na ordem
  state.progress = null; state.dlcSites = []; state.guides = 'loading'; state.fallback = null; state.summaries = []; state.summaryPick = 0;
  realDlcMemo = null; state.dlc = { labels: [], origins: {} }; state.originFilter = 'all';
  for (const a of g.achievements) { a.guide = null; a.guideOrigin = null; a.voted = null; a.voteInfo = null; }
  if (!state.steps) initSteps();
  for (const id of ['dlc', 'guias', 'etiq']) state.steps[id] = { status: 'pending', detail: '' };
  state.searchStart = Date.now(); state.searchMs = null;
  renderProgress(); renderGuideStatus(); renderList();
  await loadDlcs(token);
  if (token !== state.token) return;
  await loadGuides(token);
}

async function loadGuides(token) {
  const g = state.game;
  setStep('guias', 'active', 'procurando guias…');
  const missing = g.achievements; // todas: o guia também ajuda a classificar as já conquistadas
  const res = await window.api.loadGuides({
    appid: g.appid, name: g.name,
    achievements: missing.map((a) => ({ apiName: a.apiName, nameEn: a.nameEn, namePt: a.namePt, descEn: a.descEn, descPt: a.descPt })),
  });
  if (token !== state.token) return;
  if (!res.ok) {
    state.guides = { error: res.error.message, sources: [] };
    setStep('guias', 'warn', 'erro: ' + res.error.message);
  } else {
    state.guides = { sources: res.data.sources, attempts: res.data.attempts || [] };
    addSummaries(res.data.summaries);
    for (const a of g.achievements) { a.guide = res.data.byAchievement[a.apiName] || null; a.guideOrigin = (a.guide && a.guide.guideOrigin) || null; }
  }
  scheduleVotes();
  renderGuideStatus();
  renderList();
  syncSegRef();
  await loadFallback(token);
  if (token === state.token) endProgress();
}

const hasFullGuide = (a) => !!(a.guide && a.guide.snippets && a.guide.snippets.some((s) => !s.short && s.parts.some((p) => p.t === 'text')));

/** Para o que o guia principal não explica, busca em outras fontes (e mostra um aviso enquanto isso). */
async function loadFallback(token) {
  const g = state.game;
  const targets = g.achievements.map((a) => ({ apiName: a.apiName, nameEn: a.nameEn, needsSearch: !a.achieved && !hasFullGuide(a), optional: !!a.achieved, descEn: a.descEn }));
  const needSummary = !state.summaries.length;
  if (!targets.length && !needSummary) return;
  state.fallback = 'loading';
  renderGuideStatus();
  const res = await window.api.loadGuidesFallback({ appid: g.appid, name: g.name, targets, needSummary });
  if (token !== state.token) return;
  state.fallback = res.ok ? { attempts: res.data.attempts || [] } : { error: res.error.message, attempts: [] };
  if (res.ok) addSummaries(res.data.summaries);
  if (res.ok && res.data.blockedNow && res.data.blockedNow.length) {
    state.antiBot = [...(state.antiBot || []), ...res.data.blockedNow];
    const st = await window.api.getSettings();
    if (st.ok) state.settings = st.data;
  }
  if (res.ok) {
    const extraSources = new Map();
    for (const a of g.achievements) {
      const more = res.data.byAchievement[a.apiName];
      if (!more || !more.length) continue;
      a.guide = a.guide || { snippets: [], guideCategory: null, diverge: false, details: [] };
      for (const sn of more) {
        if (!a.guide.snippets.some((x) => x.url === sn.url)) a.guide.snippets.push({ ...sn, votes: sn.votes || [] });
        extraSources.set(sn.url, { name: sn.source, url: sn.url, date: sn.date });
      }
    }
    const withGuide = g.achievements.filter((a) => a.guide && a.guide.snippets && a.guide.snippets.length);
    const cls = await window.api.combineClasses({ items: withGuide.map((a) => ({ apiName: a.apiName, nameEn: a.nameEn, descEn: a.descEn, namePt: a.namePt, descPt: a.descPt, snippets: a.guide.snippets.map((x) => ({ source: x.source, section: x.section, votes: x.votes, scores: x.scores })) })) });
    if (cls.ok && token === state.token) for (const a of withGuide) { const c = cls.data.classes[a.apiName]; if (c) Object.assign(a.guide, { categories: c.categories, category: c.category, guideCategory: c.guideCategory, details: c.details }); }
    state.guides = { ...(state.guides || { sources: [] }), sources: [...(state.guides.sources || []), ...[...extraSources.values()].filter((x) => !(state.guides.sources || []).some((y) => y.url === x.url))] };
  }
  renderGuideStatus();
  renderList();
  scheduleVotes();
  for (const a of g.achievements) if (state.openRows.has(a.apiName)) ensureTranslation(a);
}

function antiBotBanner() {
  const hosts = state.antiBot || [];
  if (!hosts.length) return null;
  return h('div', { class: 'notice warn', role: 'alert' },
    h('strong', { text: '⚠️ Verificação anti-robô: ' }),
    `${hosts.join(', ')} ${hosts.length === 1 ? 'pede' : 'pedem'} que o visitante prove que não é um robô, e o programa não consegue (nem tenta) passar por isso. `,
    hosts.length === 1 ? 'O site foi' : 'Os sites foram', ' colocado',
    hosts.length === 1 ? '' : 's', ' automaticamente em Sites bloqueados e não será usado de novo. ',
    h('button', { class: 'link-btn', type: 'button', onclick: () => { state.settingsTab = 'cfg-bloqueados'; renderSetup({ editing: true }); } }, 'Ver em Configurações'));
}

function renderGuideStatus() {
  drawGuideStatus();
  const box = document.getElementById('guideStatus');
  const banner = antiBotBanner();
  if (box && banner) box.append(banner);
}

function drawGuideStatus() {
  const box = document.getElementById('guideStatus');
  if (!box) return;
  const st = state.guides;
  if (st === 'loading') return box.replaceChildren(h('span', { class: 'muted', text: 'Buscando guias na internet…' }));
  const allAttempts = [...((st && st.attempts) || []), ...((state.fallback && state.fallback.attempts) || [])];
  const fb = state.fallback === 'loading' ? h('span', { class: 'muted', text: ' · buscando outras fontes para comparar…' }) : null;
  if (st && !st.error && !st.sources.length && state.fallback === 'loading') return box.replaceChildren(h('span', { class: 'muted', text: 'O guia principal não tem este jogo; buscando outras fontes na web…' }));
  if (!st || st.error || !st.sources.length) {
    const attempts = allAttempts;
    return box.replaceChildren(...[
      h('span', { class: 'muted', text: 'Guias: nenhuma fonte encontrou este jogo (a classificação usa só a Steam). ' }),
      attempts.length ? h('details', { class: 'diag-details' }, h('summary', { text: 'ver diagnóstico' }), h('pre', { class: 'diag', text: attempts.join('\n') })) : null].filter(Boolean));
  }
  box.replaceChildren(h('span', { class: 'muted' }, 'Guias consultados: ',
    ...st.sources.flatMap((x, i) => [i ? ', ' : '', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(x.url) }, x.name)]), fb,
    allAttempts.length ? h('details', { class: 'diag-details' }, h('summary', { text: 'ver diagnóstico' }), h('pre', { class: 'diag', text: allAttempts.join('\n') })) : null));
}

const fmtIsoDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

/** Posição da fonte na ordem de prioridade escolhida (menor = aparece antes). */
function sourceRank(sn) {
  const order = allSourceNames();
  let host = '';
  try { host = new URL(sn.url).hostname.replace(/^www\./, '').toLowerCase(); } catch (_) { /* sem endereço */ }
  let label = null;
  if (/(^|\.)powerpyx\.com$/.test(host)) label = 'PowerPyx';
  else { const p = PREFERRED_SITES.find((x) => host === x.host || host.endsWith('.' + x.host)); if (p) label = p.label; }
  if (!label) label = (state.settings.custom.find((c) => c.name === sn.source) || {}).name || sn.source;
  const i = order.indexOf(label);
  return i < 0 ? 999 : i;
}
/** Reordena (no lugar, de forma estável) os trechos da conquista pela prioridade das fontes. */
function orderSnippets(list) {
  if (!state.settings.sourceOrder || !state.settings.sourceOrder.length || !list || list.length < 2) return list;
  const ranked = list.map((sn, i) => ({ sn, i, r: sourceRank(sn) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.sn);
  list.splice(0, list.length, ...ranked);
  return list;
}

/** Fonte aberta por padrão: a primeira (guia principal) se tiver explicação completa; senão a mais recente das completas. */
function bestSnippetIndex(snippets) {
  const full = (sn) => !sn.short && sn.parts.some((p) => p.t === 'text');
  if (snippets[0] && full(snippets[0])) return 0;
  let best = -1;
  snippets.forEach((sn, i) => { if (full(sn) && (best < 0 || (sn.date || '') > (snippets[best].date || ''))) best = i; });
  return best < 0 ? 0 : best;
}

/* ---------- tradução dos guias (inglês -> português) ---------- */

const snipKey = (a, sn) => a.apiName + '|' + sn.url;

function selectedSnippet(a) {
  const sns = a.guide && a.guide.snippets;
  if (!sns || !sns.length) return null;
  orderSnippets(sns);
  let idx = state.pick[a.apiName];
  if (idx == null || idx >= sns.length) idx = bestSnippetIndex(sns);
  return sns[idx];
}

/** Traduz a fonte aberta da conquista (uma vez; o resultado fica guardado no computador). */
async function ensureTranslation(a) {
  const sn = selectedSnippet(a);
  if (!state.settings.translate || !sn || sn._pt || sn._ptState === 'loading' || state.origKeys.has(snipKey(a, sn))) return;
  const texts = sn.parts.filter((p) => p.t === 'text').map((p) => p.v);
  if (!texts.length) return;
  sn._ptState = 'loading';
  renderList();
  const token = state.token;
  const res = await window.api.translateTexts({ texts });
  if (token !== state.token) return;
  if (res.ok) { sn._pt = res.data.texts; sn._ptState = 'ok'; sn._ptError = null; }
  else { sn._ptState = 'error'; sn._ptError = res.error.message; }
  renderList();
}

function copyRequest(sn) {
  const text = sn.parts.filter((p) => p.t === 'text').map((p) => p.v).join('\n\n');
  const prompt = 'Traduza para português do Brasil o texto de guia de conquistas abaixo. Mantenha nomes de itens, locais e botões (como [R2]) e deixe a tradução clara e direta:\n\n' + text;
  return navigator.clipboard.writeText(prompt);
}

function renderTranslateBar(a, sn, showPt) {
  if (!state.settings.translate) return null;
  const bar = h('div', { class: 'tr-bar' });
  if (sn._ptState === 'loading' && showPt) bar.append(h('span', { class: 'muted', text: 'Traduzindo para o português…' }));
  const toggle = h('button', { class: 'tr-btn', type: 'button', onclick: () => {
    const k = snipKey(a, sn);
    if (state.origKeys.has(k)) { state.origKeys.delete(k); renderList(); ensureTranslation(a); }
    else { state.origKeys.add(k); renderList(); }
  } }, showPt ? 'Ver original (inglês)' : 'Ver em português');
  bar.append(toggle);
  if (sn._ptState === 'error' && showPt) {
    const copy = h('button', { class: 'tr-btn', type: 'button' }, 'Copiar pedido');
    copy.onclick = async () => { try { await copyRequest(sn); copy.textContent = 'Copiado! Cole no Claude'; } catch (_) { copy.textContent = 'Não consegui copiar'; } };
    bar.append(
      h('span', { class: 'muted', text: (sn._ptError || 'Tradução indisponível.') + ' Mostrando o original.' }),
      h('button', { class: 'tr-btn', type: 'button', onclick: () => { sn._ptState = null; renderList(); ensureTranslation(a); } }, 'Tentar de novo'),
      copy);
  }
  return bar;
}

const KIND_LABEL = { tip: '💡 Dica', note: 'ℹ️ Nota', warning: '⚠️ Aviso' };

/** Uma explicação de guia: texto, dicas destacadas e imagens/vídeos como links numerados. */
/** Tira o "- 50 - Ouro" (pontos e tipo de troféu), que não ajuda a conseguir a conquista. */
function stripTier(text) {
  return String(text).replace(/\s*[-–—]\s*\d+\s*[-–—]\s*(bronze|prata|ouro|platina|silver|gold|platinum)\b\.?/gi, '').replace(/\s*\(\s*(bronze|prata|ouro|platina|silver|gold|platinum)\s*\)/gi, '').replace(/^\s*[-–—•]\s+/, '').trim();
}

function renderSnippet(sn, a) {
  let img = 0; let vid = 0; let ti = 0;
  const showPt = state.settings.translate && !state.origKeys.has(snipKey(a, sn));
  const pt = showPt && sn._pt ? sn._pt : null;
  const buildBody = (usePt) => {
  img = 0; vid = 0; ti = 0;
  const body = h('div', { class: 'guide-scroll', tabindex: '0', 'aria-label': 'Texto do guia (role para ler tudo)' });
  for (const p of sn.parts) {
    if (p.t === 'text') {
      const shown = stripTier(usePt ? (usePt[ti] || p.v) : p.v);
      ti += 1;
      if (p.kind === 'text') {
        body.append(h('p', { text: shown }));
      } else {
        const text = shown.replace(/^[^:!–-]{2,12}[:!–-]\s*/, ''); // tira o "Tip:" do começo; o rótulo vai no destaque
        body.append(h('div', { class: 'guide-tip', 'data-kind': p.kind }, h('strong', { text: KIND_LABEL[p.kind] + ': ' }), text));
      }
    } else if (p.t === 'link') {
      body.append(h('p', {}, h('button', { class: 'media-link', type: 'button', onclick: () => openExternal(p.url) }, `${p.map ? '🗺' : '🔗'} ${p.v || 'Link do guia'}`)));
    } else if (p.t === 'img') {
      img += 1;
      body.append(h('p', {}, h('button', { class: 'media-link', type: 'button', onclick: () => openExternal(p.url) }, `🖼 IMAGEM ${img}`)));
    } else if (p.t === 'video') {
      vid += 1;
      body.append(h('p', {}, h('button', { class: 'media-link', type: 'button', onclick: () => openExternal(p.url) }, `▶ VÍDEO ${vid}`)));
    }
  }
  return body;
  };
  const body = buildBody(pt);
  // idioma "os dois": o texto em português e, logo abaixo, o original
  const both = state.settings.guideLang === 'both' && pt;
  return h('div', { class: 'snippet' },
    renderTranslateBar(a, sn, showPt),
    sn.short ? h('div', { class: 'muted short-note', text: 'O guia só traz a explicação curta para esta conquista:' }) : null,
    body,
    both ? h('div', { class: 'muted both-label', text: 'Original (inglês)' }) : null,
    both ? buildBody(null) : null,
    h('footer', {}, 'Fonte: ', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(sn.url) }, sn.source),
      sn.date ? h('span', { class: 'muted', text: ` · ${(sn.dateKind === 'updated' || sn.dateKind === 'modified') ? 'atualizado' : 'publicado'} em ${fmtIsoDate(sn.date)}` }) : null,
      sn.votes.length ? h('span', { class: 'muted', text: ' · indica: ' + sn.votes.map((v) => CATEGORY_LABELS[v]).join(', ') }) : null));
}

/** Parte do guia dentro da conquista expandida. */
function renderGuideBox(a) {
  const box = h('div', { class: 'guide-box' });
  const st = state.guides;
  if (st === 'loading') {
    box.append(h('div', { class: 'muted', text: 'Buscando guias…' }));
    return box;
  }
  const gd = a.guide;
  if (!gd || !gd.snippets || !gd.snippets.length) {
    box.append(h('div', { class: 'muted', text: st && st.sources && st.sources.length ? 'Nenhum trecho sobre esta conquista nos guias consultados.' : 'Nenhum guia encontrado para este jogo.' }));
    return box;
  }
  box.append(h('h4', { text: 'O que dizem os guias' }));
  const sns = orderSnippets(gd.snippets);
  let idx = state.pick[a.apiName];
  if (idx == null || idx >= sns.length) idx = bestSnippetIndex(sns);
  if (sns.length > 1) {
    box.append(h('div', { class: 'source-switch', role: 'group', 'aria-label': 'Trocar de fonte' },
      ...sns.map((sn, i) => h('button', {
        class: 'src-btn' + (i === idx ? ' active' : ''), type: 'button', 'aria-pressed': String(i === idx),
        onclick: () => { state.pick[a.apiName] = i; renderList(); ensureTranslation(a); },
      }, sn.source + (sn.date ? ` (${fmtIsoDate(sn.date)})` : '') + (sn.short ? ' · só resumo' : '')))));
  }
  box.append(renderSnippet(sns[idx], a));
  if (!a.override && gd.details && gd.details.length) {
    box.append(h('div', { class: 'muted', text: 'Etiquetas: ' + gd.details.map((d) => `${CATEGORY_LABELS[d.category]} (${d.sources.join(', ')})`).join('; ') + '. Use o lápis ✎ para corrigir.' }));
  }
  return box;
}

/* ---------- tempo para zerar ---------- */

const fmtH = (n) => (n == null ? '—' : `${String(Math.round(n * 10) / 10).replace('.', ',')} h`);

async function loadTime(appid, name, token) {
  const res = await window.api.getTime({ appid, name });
  if (token !== state.token) return;
  state.time = res.ok ? res.data : { auto: { error: res.error.message } };
  renderTime();
  const au = state.time.auto;
  if (au && !au.error && ((au.story ?? au.extra) != null || au.full != null)) setStep('tempo', 'done', `História ≈ ${fmtH(au.story ?? au.extra)} · 100% ≈ ${fmtH(au.full)}`);
  else setStep('tempo', 'warn', 'não encontrado no HowLongToBeat');
}

function renderTime() {
  const box = document.getElementById('timeBox');
  if (!box || !state.game) return;
  const g = state.game;
  const t = state.time;
  if (!t) return box.replaceChildren(h('span', { class: 'muted', text: 'Procurando o tempo para zerar…' }));
  const auto = t.auto && !t.auto.error ? t.auto : null;
  const story = auto && (auto.story ?? auto.extra);
  const full = auto && auto.full;
  const hltbUrl = 'https://howlongtobeat.com/?q=' + encodeURIComponent(g.searchName || g.name);

  const kids = [];
  if (story != null || full != null) {
    kids.push(h('span', { class: 'time-item', title: 'Tempo para terminar a história' }, '⏱ História ', h('strong', { text: '≈ ' + fmtH(story) })));
    kids.push(h('span', { class: 'time-item', title: 'Tempo para conquistar tudo (100%)' }, '🏆 100% ', h('strong', { text: '≈ ' + fmtH(full) })));
    kids.push(h('span', { class: 'muted src' }, 'Fonte: ', h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(hltbUrl) }, 'HowLongToBeat'),
      ''));
  } else {
    kids.push(h('span', { class: 'muted', text: 'Tempo para zerar não encontrado automaticamente.' }));
  }
  if (story == null && full == null) kids.push(h('button', { class: 'link-btn', type: 'button', onclick: () => openExternal(hltbUrl) }, 'procurar no HowLongToBeat'));
  box.replaceChildren(...kids);
}

function closeMenus() { document.querySelectorAll('.cat-menu').forEach((m) => m.remove()); }
document.addEventListener('click', (e) => { if (!e.target.closest('.pencil') && !e.target.closest('.cat-menu')) closeMenus(); });

async function setCategory(a, value) {
  const res = await window.api.setClassification({ appid: state.game.appid, apiName: a.apiName, value });
  closeMenus();
  if (!res.ok) return;
  a.override = value; // null = volta ao automático
  renderList();
  syncSegRef();
}

function pencilButton(a, getLi) {
  return h('button', {
    class: 'pencil', type: 'button', title: 'Reclassificar esta conquista', 'aria-label': 'Reclassificar esta conquista',
    onclick: (e) => {
      e.stopPropagation();
      const had = getLi().querySelector('.cat-menu');
      closeMenus();
      if (had) return;
      const current = categoryOf(a);
      const opt = (value, label, extra) => h('button', {
        type: 'button', role: 'menuitemradio', 'aria-checked': String(value === current && !extra), 'data-cat': CATEGORY_IDS.includes(value) ? value : null,
        onclick: () => setCategory(a, value),
      }, label);
      const menu = h('div', { class: 'cat-menu', role: 'menu' },
        h('div', { class: 'cat-menu-title', text: 'Esta conquista é…' }),
        ...CATEGORY_IDS.map((c) => opt(c, CATEGORY_LABELS[c])),
        opt('none', 'Nenhuma destas'),
        a.override ? h('button', { type: 'button', class: 'restore', onclick: () => setCategory(a, null) }, 'Restaurar automática') : null,
        h('div', { class: 'cat-menu-title', text: 'Origem' }),
        ...[...new Set([BASE, ...originList(), ...((state.dlc && state.dlc.labels) || []), 'DLC'])].map((o) => h('button', {
          type: 'button', role: 'menuitemradio', 'aria-checked': String(originOf(a) === o), onclick: () => setOrigin(a, o),
        }, originName(o))),
        a.originOverride ? h('button', { type: 'button', class: 'restore', onclick: () => setOrigin(a, null) }, 'Restaurar origem automática') : null);
      getLi().append(menu);
    },
  }, '✎');
}

/** Anotações do usuário para a conquista: salvam sozinhas enquanto escreve. */
function noteBox(a) {
  const status = h('span', { class: 'muted note-status', text: a.note ? 'Salvo' : '' });
  const area = h('textarea', { class: 'note-area', rows: 3, maxlength: 8000, placeholder: 'Escreva aqui o que quiser lembrar sobre esta conquista (onde fica, o que falta, dicas…)', 'aria-label': 'Minhas anotações' });
  area.value = a.note || '';
  let timer = null;
  const save = async () => {
    status.textContent = 'Salvando…';
    const res = await window.api.setNote({ appid: state.game.appid, apiName: a.apiName, text: a.note });
    status.textContent = res.ok ? (a.note.trim() ? 'Salvo' : 'Anotação removida') : 'Não foi possível salvar';
    const mark = document.querySelector(`[data-api="${CSS.escape(a.apiName)}"] .note-mark`);
    if (mark) mark.hidden = !a.note.trim();
  };
  area.addEventListener('input', () => { a.note = area.value; status.textContent = 'Escrevendo…'; clearTimeout(timer); timer = setTimeout(save, 700); });
  area.addEventListener('blur', () => { if (timer) { clearTimeout(timer); timer = null; save(); } });
  return h('div', { class: 'ach-note' }, h('h4', { text: '📝 Minhas anotações' }), area, h('div', { class: 'note-foot' }, status));
}

function renderAchievement(a) {
  const g = state.game;
  const sameName = a.namePt.trim().toLowerCase() === a.nameEn.trim().toLowerCase();
  const desc = a.descPt || a.descEn;
  const rare = a.percent != null && a.percent < RARE_PERCENT;

  const diagBox = h('pre', { class: 'diag', hidden: true });
  const detail = h('div', { class: 'ach-detail', hidden: !state.openRows.has(a.apiName) },
    h('dl', {},
      !sameName ? [h('dt', {}, 'Nome em inglês'), h('dd', { text: a.nameEn })] : null,
      a.descEn && a.descEn !== a.descPt ? [h('dt', {}, 'Descrição em inglês'), h('dd', { text: a.descEn })] : null,
      a.hidden ? [h('dt', {}, 'Conquista oculta'), h('dd', {}, desc ? 'A Steam esconde esta conquista até você desbloqueá-la; a descrição acima veio da página pública da comunidade.' : 'A Steam só mostra a descrição completa depois de desbloqueá-la.')] : null,
      a.achieved && a.unlockTime ? [h('dt', {}, 'Desbloqueada em'), h('dd', { text: fmtDate(a.unlockTime) })] : null),
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openExternal('https://www.google.com/search?q=' + encodeURIComponent(`${g.searchName || g.name} "${a.nameEn}" achievement guide`)) }, 'Buscar guia no Google'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openExternal('https://www.youtube.com/results?search_query=' + encodeURIComponent(`${g.searchName || g.name} ${a.nameEn} achievement guide`)) }, 'Buscar vídeos no YouTube')),
    diagBox,
    renderGuideBox(a),
    noteBox(a));

  const row = h('button', {
    class: 'ach-row', type: 'button', 'aria-expanded': String(state.openRows.has(a.apiName)),
    onclick: () => {
      const open = detail.hidden;
      detail.hidden = !open;
      if (open) { state.openRows.add(a.apiName); ensureTranslation(a); } else state.openRows.delete(a.apiName);
      row.setAttribute('aria-expanded', String(open));
    },
  },
    achievementIcon(a, diagBox),
    h('div', { class: 'ach-main' },
      h('div', { class: 'ach-name' },
        a.namePt,
        !sameName ? [' ', h('span', { class: 'en', text: `(${a.nameEn})` })] : null,
        a.achieved ? h('span', { class: 'badge-done' }, 'Conquistada') : null,
        originOf(a) !== BASE ? h('span', { class: 'origin-tag', title: voteTip(a), text: originOf(a) === 'DLC' ? 'DLC' : originOf(a) }) : null,
        h('span', { class: 'note-mark', title: 'Você tem uma anotação aqui', hidden: !(a.note && a.note.trim()), text: '📝' }),
        ...catsOf(a).map((c) => h('span', { class: 'cat-badge', 'data-cat': c, title: catTip(a, c) }, CATEGORY_LABELS[c] + (a.override ? ' · editado por você' : !a.auto && a.guide && a.guide.guideCategory === c && !(a.guide.details.find((d) => d.category === c) || { sources: [] }).sources.includes('Steam') ? ' · pelo guia' : '')))),
      desc
        ? h('div', { class: 'ach-desc', text: desc })
        : h('div', { class: 'ach-desc hidden-ach' }, a.hidden ? 'Conquista oculta' : 'Sem descrição')),
    a.percent != null
      ? h('div', { class: 'ach-pct' + (rare ? ' rare' : ''), title: 'Porcentagem global de jogadores que conquistaram', text: '' }, globeIcon(), fmtPct(a.percent))
      : h('div', { class: 'ach-pct' }));

  const cat = categoryOf(a);
  const cats = catsOf(a);
  // barra da direita: uma faixa de cor para cada categoria da conquista (ex.: final + perdível + dificuldade = 3 cores)
  const stripe = cats.length ? h('span', { class: 'cat-stripe', 'aria-hidden': 'true' }, ...cats.map((c) => h('i', { 'data-cat': c }))) : null;
  const li = h('li', { class: 'ach' + (a.achieved ? ' done' : '') + (cat ? ' has-cat' : ''), 'data-api': a.apiName, 'data-cat': cat }, row, stripe, pencilButton(a, () => li), detail);
  return li;
}

/* ---------- início ---------- */

/** Sai das Configurações e volta para o jogo que estava na tela (sem recarregar nem trocar pelo último jogo). */
async function backFromSettings() {
  if (state.dirty) {
    const ans = await askDialog({ title: 'Alterações não salvas', message: 'Você mudou algumas configurações e ainda não salvou. O que deseja fazer?', buttons: [{ label: 'Continuar editando', value: 'cancel' }, { label: 'Descartar', value: 'discard', kind: 'danger' }, { label: 'Salvar e sair', value: 'save', kind: 'primary' }] });
    if (ans === 'cancel') return null;
    if (ans === 'save') { await commitTheme(); const r = await window.api.saveSettings(state.settings); if (r.ok) state.settings = r.data; }
    else { revertTheme(); const st = await window.api.getSettings(); if (st.ok) state.settings = st.data; }
    state.dirty = false; applyAppearance();
  }
  if (!state.game || !state.config || !state.config.configured) return boot();
  renderShell();
  renderGame();
  if (state.time) renderTime();
  renderGuideStatus();
  renderProgress();
  return null;
}

let progressListener = null;
async function boot() {
  if (!progressListener && window.api.onGuideProgress) progressListener = window.api.onGuideProgress(onGuideProgress);
  const res = await window.api.getConfig();
  state.config = res.ok ? res.data : { configured: false };
  if (window.api.onUpdateState) window.api.onUpdateState((up) => { state.update = up; updateBanner(up); if (state.updateRedraw && document.querySelector('#cfg-atualizacoes')) state.updateRedraw(); });
  if (window.api.getChangelog) window.api.getChangelog().then((r) => { if (r.ok) state.changelogData = r.data; });
  const st = await window.api.getSettings();
  if (st.ok) state.settings = st.data;
  applyAppearance();
  if (state.config.theme) showTheme(state.config.theme);
  if (!state.config.configured) return renderSetup();
  renderShell();
  radioOnBoot();
  if (state.settings.startView === 'search') {
    $content().replaceChildren(h('div', { class: 'state' }, h('h2', {}, 'Busque um jogo'), 'Digite o nome na barra de cima ou clique em "Último jogo".'));
    const q = document.getElementById('q');
    if (q) q.focus();
    return;
  }
  loadLast();
}

boot();
