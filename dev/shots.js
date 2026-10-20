'use strict';

/** Só para desenvolvimento: confere comportamentos na janela de verdade e tira capturas de tela. */
const fs = require('fs');
const path = require('path');

const THEME_IDS = ['padrao', 'verao', 'meia-noite', 'aco', 'cosmico', 'escuro'];

async function run(win, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (cond, label) => {
    for (let i = 0; i < 100; i++) {
      if (await js(`Boolean(${cond})`)) return;
      await wait(100);
    }
    throw new Error('Tempo esgotado esperando: ' + label + ' :: ' + (await js('document.body.innerText.slice(0,300)')));
  };
  const shot = async (name) => {
    await wait(250);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), image.toPNG());
  };
  const report = (label, value) => console.log(`[check] ${label}: ${JSON.stringify(value)}`);
  const clickByText = (selector, text) =>
    js(`[...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.textContent.includes(${JSON.stringify(text)})).click()`);

  try {
    await until("document.querySelectorAll('.ach').length > 0", 'lista de conquistas');
    // o roteiro mexe em configurações sem salvar: caixas de confirmação são resolvidas sozinhas (descartar), salvo nos testes dela
    await js("new MutationObserver(() => { const b = document.querySelector('.modal [data-value=discard]'); if (b && !window.__keepModal) b.click(); }).observe(document.body, { childList: true })");
    if (process.env.BUSCACONQUISTA_MOCK_DELAY) {
      await until("!document.getElementById('searchProgress').hidden && document.querySelector('.sp-step.active')", 'barra de pesquisa');
      report('barra de pesquisa (guias principais)', await js("document.getElementById('searchProgress').innerText.replace(/\\n+/g, ' | ')"));
      await shot('progresso-1');
      await until("/Guias/.test(document.querySelector('.sp-step.active')?.textContent || '')", 'fase seguinte');
      report('barra de pesquisa (fase seguinte)', await js("document.getElementById('searchProgress').innerText.replace(/\\n+/g, ' | ')"));
      await shot('progresso-2');
      await js("state.progressCollapsed = true; renderProgress(); state.summaryOpen = false; renderSummary(); document.getElementById('searchProgress').scrollIntoView({ block: 'center' })");
      report('alturas recolhidas', await js("[document.getElementById('searchProgress'), document.querySelector('#platSummary .plat-toggle')].map((e) => e && Math.round(e.getBoundingClientRect().height))"));
      await shot('recolhidas');
      await js("state.progressCollapsed = false; renderProgress()");
    }

    // 1) Ícones: nenhum "quebrado"; o plano B funciona (cinza falha -> colorida escurecida; tudo falha -> escudo)
    const icons = await js(`(async () => {
      const out = { broken: [], dim: [], placeholder: [] };
      for (const img of document.querySelectorAll('.ach-icon')) {
        img.scrollIntoView();
        const id = img.closest('.ach').dataset.api;
        for (let i = 0; i < 40; i++) {
          if (img.complete && img.naturalWidth > 0 && !img.src.includes('invalid.example')) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (!(img.complete && img.naturalWidth > 0)) out.broken.push(id);
        if (img.classList.contains('dim')) out.dim.push(id);
        if (img.src.startsWith('data:image/svg+xml') && img.src.includes('%236b7683') && id === 'ACH_BBQ') out.placeholder.push(id);
      }
      window.scrollTo(0, 0);
      return out;
    })()`);
    report('icones', icons);
    await shot('1-ultimo-jogo');

    // 1a) E3: guias da internet (páginas de mentira), trechos e classificação pelo guia
    await until("document.getElementById('guideStatus').innerText.includes('Guias consultados')", 'guias carregados');
    report('guias', await js("document.getElementById('guideStatus').innerText"));
    report('peace pelo guia', await js("document.querySelector('.ach[data-api=ACH_PEACE] .cat-badge').textContent"));
    await until("!document.getElementById('guideStatus').innerText.includes('buscando outras fontes')", 'outras fontes');
    await js("document.querySelector('.ach[data-api=ACH_HARD] .ach-row').click()");
    report('outra fonte (bbq)', await js("document.querySelector('.ach[data-api=ACH_HARD] .guide-box').innerText.slice(0, 300)"));
    report('botoes de fonte (bbq)', await js("[...document.querySelectorAll('.ach[data-api=ACH_HARD] .src-btn')].map((b) => b.textContent)"));
    report('botoes de fonte (peace)', await js("(() => { document.querySelector('.ach[data-api=ACH_PEACE] .ach-row').click(); return [...document.querySelectorAll('.ach[data-api=ACH_PEACE] .src-btn')].map((b) => b.textContent); })()"));
    await until("document.querySelector('.ach[data-api=ACH_PEACE] .snippet p') && document.querySelector('.ach[data-api=ACH_PEACE] .snippet').innerText.includes('[PT]')", 'traducao do peace');
    report('traduzido (peace)', await js("document.querySelector('.ach[data-api=ACH_PEACE] .snippet').innerText.slice(0, 140)"));
    await js("[...document.querySelectorAll('.ach[data-api=ACH_PEACE] .tr-btn')].find((b) => b.textContent.includes('original')).click()");
    report('trecho peace', await js("document.querySelector('.ach[data-api=ACH_PEACE] .snippet').innerText.slice(0, 400)"));
    report('midias', await js("[...document.querySelectorAll('.ach[data-api=ACH_PEACE] .media-link')].map((b) => b.textContent)"));
    report('destaques de dica', await js("[...document.querySelectorAll('.ach[data-api=ACH_PEACE] .guide-tip')].map((d) => d.dataset.kind + ': ' + d.textContent.slice(0, 50))"));
    report('caixa rolavel', await js("(() => { const b = document.querySelector('.ach[data-api=ACH_PEACE] .guide-scroll'); return { rola: b.scrollHeight > b.clientHeight, max: getComputedStyle(b).maxHeight }; })()"));
    await shot('e3-1-guia');
    report('resumo recolhido', await js("(() => { const b = document.getElementById('platSummary'); return { hidden: b.hidden, texto: b.innerText, corpo: !!b.querySelector('.plat-body') }; })()"));
    await js("document.querySelector('.plat-toggle').click()");
    await wait(900);
    report('resumo aberto', await js("document.getElementById('platSummary').innerText"));
    await shot('e8-resumo');
    await until("document.querySelector('.origin-head')", 'origem');
    report('origem', await js("(() => ({ cabecalhos: [...document.querySelectorAll('.origin-head')].map((x) => x.innerText), barra: document.getElementById('originBar').innerText, tags: document.querySelectorAll('.origin-tag').length }))()"));
    await js("document.getElementById('platSummary').hidden = true; document.getElementById('originBar').scrollIntoView()");
    await shot('e7b-origem');
    await js("document.querySelector('.org-toggle').click()");
    await js("(() => { const b = document.querySelectorAll('.sel-input'); b[0].click(); b[1].click(); })()");
    report('organizar', await js("(() => ({ barra: !!document.querySelector('.org-bar'), caixas: document.querySelectorAll('.sel-input').length, marcadas: document.querySelector('.org-row .muted').innerText, caixasOrigem: document.querySelectorAll('.origin-box').length }))()"));
    await shot('e7c-organizar');
    await js("(() => { const sel = document.querySelector('.org-dest'); sel.value = '__new'; sel.dispatchEvent(new Event('change')); document.querySelector('.org-name').value = 'DLC Teste'; })()");
    await js("[...document.querySelectorAll('.org-row button')].find((b) => b.innerText === 'Mover marcadas').click()");
    await new Promise((r) => setTimeout(r, 600));
    report('apos mover', await js("[...document.querySelectorAll('.origin-head')].map((x) => x.innerText)"));
    await js("document.querySelector('.org-toggle').click()");
    await js("radio.playing = true; radio.text = 'SuperSweep – Harem Mantis (Original Soundtrack Extended Mix feat. Someone Long)'; radioEmit(); window.scrollTo(0, 0)");
    await new Promise((r) => setTimeout(r, 400));
    await shot('e7d-radio');
    report('lista', await js("(() => ({ sel: document.querySelectorAll('.sel-input').length, caixas: document.querySelectorAll('.origin-box').length, borda: getComputedStyle(document.querySelector('.origin-box')).borderLeftWidth, grouped: document.getElementById('achList').className }))()"));
    await js("document.getElementById('originBar').scrollIntoView()");
    await shot('e7e-lista');
    await js("radio.playing = false; radio.text = 'GameFM · rádio 24 h'; radioEmit()");
    await js("saveSettings({ fontScale: 'grande', density: 'compacta', colorIcons: true }, false).then(() => renderList())");
    await new Promise((r) => setTimeout(r, 500));
    report('aparencia', await js("({ fonte: document.body.dataset.font, dens: document.body.dataset.density, linhas: document.querySelectorAll('.ach').length })"));
    await js("document.getElementById('originBar').scrollIntoView()");
    await shot('e7f-compacta');
    await js("saveSettings({ fontScale: 'normal', density: 'normal', colorIcons: false }, false).then(() => renderList())");
    report('radio', await js("(() => { const r = document.querySelector('.radio'); return { existe: !!r, botao: r && r.querySelector('.radio-btn').innerText, texto: r && r.querySelector('.radio-text').innerText }; })()"));
    report('botao de mapas', await js("(() => { const w = document.querySelector('.map-wrap'); return { botoes: document.querySelectorAll('.head-links > *').length, texto: w && w.querySelector('.head-link').innerText, menuFechado: w && w.querySelector('.map-menu').hidden }; })()"));
    await js("document.querySelector('.map-wrap .head-link').click()");
    await wait(200);
    report('menu de mapas', await js("[...document.querySelectorAll('.map-menu-item')].map((b) => b.innerText)"));
    report('faixas de categoria (cores por conquista)', await js("[...document.querySelectorAll('.ach')].map((li) => [li.querySelectorAll('.cat-badge').length, li.querySelectorAll('.cat-stripe i').length]).filter(([b, s]) => b !== s).length"));
    await js("document.querySelector('#seg button[data-filter=all]').click()"); await wait(200);
    report('filtros em Todas contam conquistadas', await js("(() => ({ todas: state.game.achievements.filter((a) => catsOf(a).includes('missable')).length, botao: document.querySelector('#catFilters button[data-filter=missable] .count').innerText, escopo: state.scope }))()"));
    await js("document.querySelector('#seg button[data-filter=missing]').click()"); await wait(200);
    report('filtros em Não alcançadas', await js("document.querySelector('#catFilters button[data-filter=missable] .count').innerText"));
    await js("state.progressCollapsed = true; renderProgress(); window.scrollTo(0, 0)"); await wait(150);
    report('barra recolhida (pronta)', await js("(() => { const m = document.querySelector('.sp-mini'); return { texto: m.innerText, cortado: m.scrollWidth > m.clientWidth }; })()"));
    await shot('recolhida-pronta');
    await js("state.progressCollapsed = false; renderProgress()");
    await js("window.scrollTo(0, 0)"); await wait(150);
    report('menu de mapas por cima', await js("(() => { const items = [...document.querySelectorAll('.map-menu-item')]; return items.map((b) => { const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && e.closest('.map-menu')); }); })()"));
    await shot('e11-menu-mapas');
    await js("document.body.click()");
    await wait(200);
    report('menu fecha ao clicar fora', await js("document.querySelector('.map-menu').hidden"));
    await js("document.querySelector('.plat-toggle').click()");
    await js("document.querySelector('.ach[data-api=ACH_END] .ach-row').click()");
    report('diverge final', await js("document.querySelector('.ach[data-api=ACH_END] .diverge') && document.querySelector('.ach[data-api=ACH_END] .diverge').innerText"));
    await shot('e3-2-diverge');
    await js("document.querySelectorAll('.ach-row').forEach((r) => r.getAttribute('aria-expanded') === 'true' && r.click())");
    // 1b) E2: tempo, destaques, filtros por categoria e lápis
    await until("document.querySelector('#timeBox .time-item')", 'tempo para zerar');
    report('tempo', await js("document.getElementById('timeBox').innerText"));
    report('sem destaques redundantes', await js("!document.getElementById('chips')"));
    report('filtros', await js("[...document.querySelectorAll('#catFilters button')].map((b) => b.textContent)"));
    await shot('e2-1-cabecalho');
    await js("document.querySelector('#catFilters button[data-filter=ending]').click()");
    report('so finais', await js("[...document.querySelectorAll('.ach')].map((l) => l.dataset.api)"));
    await shot('e2-2-filtro-finais');
    await js("document.querySelector('#catFilters button[data-filter=difficulty]').click()");
    report('so dificuldade', await js("[...document.querySelectorAll('.ach')].map((l) => l.dataset.api)"));
    await js("document.querySelector('#seg button[data-filter=missing]').click()");
    // lápis: marca "Paz" como bugada, confere o filtro e se continua depois de recarregar
    await js("document.querySelector('.ach[data-api=ACH_PEACE] .pencil').click()");
    await until("document.querySelector('.cat-menu')", 'menu do lápis');
    await shot('e2-3-lapis');
    await js("document.querySelector('.cat-menu button[data-cat=bugged]').click()");
    await wait(300);
    report('paz editada', await js("document.querySelector('.ach[data-api=ACH_PEACE] .cat-badge').textContent"));
    await js("document.querySelector('#catFilters button[data-filter=bugged]').click()");
    report('so bugadas', await js("[...document.querySelectorAll('.ach')].map((l) => l.dataset.api)"));
    await shot('e2-4-bugadas');
    await js("document.querySelector('#seg button[data-filter=missing]').click()");
    await js("document.querySelector('.ach[data-api=ACH_PEACE] .pencil').click()");
    await js("document.querySelector('.cat-menu .restore').click()");
    await wait(300);
    report('paz restaurada (sem editado)', await js("!document.querySelector('.ach[data-api=ACH_PEACE] .cat-badge').textContent.includes('editado')"));
    // 2) Foto/nome do perfil abrem o perfil na Steam
    await js("document.querySelector('.who-link').click()");
    await wait(300);

    // 3) Configurações: aparência + conta, trocando os 6 temas
    await clickByText('.topbar .btn', 'Configurações');
    await until("document.querySelector('.themes')", 'tela de configurações');
    for (const id of THEME_IDS) {
      await js(`document.querySelector('input[name=theme][value="${id}"]').click()`);
      await until(`document.documentElement.getAttribute('data-theme') === '${id}'`, 'tema ' + id);
      await shot('tema-config-' + id);
    }
    report('tema escolhido (ultimo)', await js("document.documentElement.getAttribute('data-theme')"));
    report('espelho no localStorage', await js("localStorage.getItem('bc-theme')"));

    await js('state.dirty = false'); // o teste mexe em configurações sem salvar
    // 4) Tela do jogo em cada tema
    for (const id of THEME_IDS) {
      await clickByText('.settings-layout .toc-back', 'Voltar');
      await until("document.querySelectorAll('.ach').length > 0", 'jogo após voltar');
      await js(`document.documentElement.setAttribute('data-theme', '${id}')`);
      await js("document.querySelectorAll('.ach-row')[1].click()");
      await shot('tema-jogo-' + id);
      await clickByText('.topbar .btn', 'Configurações');
      await clickByText('.toc-link', 'Aparência');
      await until("document.querySelector('.themes')", 'configurações de novo');
    }
    // deixa o tema "Cósmico" salvo de verdade e confere depois de recarregar a janela
    await js("document.querySelector('input[name=theme][value=cosmico]').click()");
    await until("document.documentElement.getAttribute('data-theme') === 'cosmico'", 'tema cosmico');
    await wait(300);
    win.webContents.reload();
    await wait(600);
    await until("document.querySelectorAll('.ach').length > 0", 'lista após recarregar');
    report('tema depois de recarregar', await js("document.documentElement.getAttribute('data-theme')"));
    await shot('apos-recarregar-cosmico');

    // E6: Configurações das fontes (uma seção por vez, escolhida no sumário)
    await clickByText('.topbar .btn', 'Configurações');
    await clickByText('.toc-link', 'Aparência');
    await until("document.querySelector('.toc-link')", 'configurações');
    report('seções visíveis (aparência)', await js("[...document.querySelectorAll('.cfg-section h2')].map((e) => e.innerText)"));
    await clickByText('.toc-link', 'Guias principais');
    await until("document.querySelector('.src-add')", 'guias principais');
    report('seções visíveis (guias)', await js("[...document.querySelectorAll('.cfg-section h2')].map((e) => e.innerText)"));
    await js("(() => { const i = document.querySelectorAll('.src-add input'); i[0].value = 'Meu site'; i[1].value = 'https://meu.site/{slug}/'; })()");
    await clickByText('button', 'Adicionar');
    await until("document.querySelector('.src-custom')", 'fonte personalizada adicionada');
    await js("(() => { const i = document.querySelectorAll('.src-add input'); i[0].value = 'Site com robô'; i[1].value = 'https://cf-mock.example/{slug}/'; })()");
    await clickByText('button', 'Adicionar');
    await until("document.querySelectorAll('.src-custom').length === 2", 'segunda fonte');
    report('fontes personalizadas', await js("[...document.querySelectorAll('.src-custom .src-main')].map((e) => e.innerText)"));
    await js("document.querySelectorAll('.src-row input[type=checkbox]')[0].click()");
    await wait(400);
    report('powerpyx desligado', await js("document.querySelectorAll('.src-row input[type=checkbox]')[0].checked === false"));
    await js("document.querySelectorAll('.src-row input[type=checkbox]')[0].click()");
    await wait(400);
    await shot('e6-guias-principais');
    await clickByText('.toc-link', 'Sites bloqueados');
    await until("document.querySelector('.chips-x')", 'bloqueados');
    await js("document.querySelector('.src-add input').value = 'https://www.Ruim.com/x'");
    await clickByText('button', 'Bloquear');
    await until("document.querySelector('.chip-x')", 'site bloqueado');
    report('bloqueados', await js("[...document.querySelectorAll('.chip-x')].map((e) => e.innerText)"));
    await shot('e6-bloqueados');
    // aba Mapas principais
    await clickByText('.toc-link', 'Mapas principais');
    await until("document.querySelector('#cfg-mapas .src-row, #cfg-mapas .switch-row, #cfg-mapas input')", 'mapas');
    report('mapas', await js("document.querySelector('#cfg-mapas').innerText.slice(0, 200)"));
    await shot('e10-mapas');
    // abas novas: Rádio, Guias (ordem), Dados, Ferramentas
    await clickByText('.toc-link', 'Rádio');
    await until("document.querySelector('#cfg-radio')", 'radio');
    report('cfg radio', await js("document.querySelector('#cfg-radio').innerText.slice(0, 200)"));
    await shot('e12-cfg-radio');
    report('sumário (esquerda, topo)', await js("(() => { const r = document.querySelector('.settings-toc').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), document.documentElement.scrollHeight > innerHeight]; })()"));
    await clickByText('.toc-link', 'Guias principais');
    await until("document.querySelector('.order-list')", 'ordem');
    report('cfg ordem', await js("({ itens: [...document.querySelectorAll('.order-name')].map((e) => e.innerText), ignorar: !!document.querySelector('[aria-label=\"Palavra a ignorar\"]') })"));
    await js("document.querySelectorAll('.order-item')[2].querySelector('button').click()");
    await new Promise((r) => setTimeout(r, 500));
    report('ordem apos subir', await js("[...document.querySelectorAll('.order-name')].slice(0, 4).map((e) => e.innerText)"));
    await shot('e13-cfg-guias');
    report('sumário rolando (topo antes/depois)', await js("(async () => { const t = () => Math.round(document.querySelector('.settings-toc').getBoundingClientRect().top); const a = t(); window.scrollTo(0, 400); await new Promise((r) => setTimeout(r, 200)); const b = t(); const y = window.scrollY; window.scrollTo(0, 0); return [a, b, y]; })()"));
    report('sumário (esquerda, topo)', await js("(() => { const r = document.querySelector('.settings-toc').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), document.documentElement.scrollHeight > innerHeight]; })()"));
    await clickByText('.toc-link', 'Dados e idioma');
    await until("document.querySelector('#cfg-dados .trash-list, #cfg-dados .hint')", 'dados');
    report('cfg dados', await js("document.querySelector('#cfg-dados').innerText.slice(0, 260)"));
    await shot('e14-cfg-dados');
    await clickByText('.toc-link', 'Cache');
    await until("document.querySelector('#cfg-cache .cache-actions')", 'cache');
    report('cache sem "null"', await js("!/\\bnull\\b/.test(document.querySelector('#cfg-cache').innerText)"));
    await clickByText('.toc-link', 'Novidades');
    await until("document.querySelector('#cfg-novidades h3')", 'novidades');
    report('novidades', await js("document.querySelector('#cfg-novidades h3').innerText"));
    report('sumário (esquerda, topo)', await js("(() => { const r = document.querySelector('.settings-toc').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), document.documentElement.scrollHeight > innerHeight]; })()"));
    report('barra salvar (limpa)', await js("(() => { const b = document.querySelector('.save-bar'); return { existe: !!b, salvarDesabilitado: b && [...b.querySelectorAll('button')].find((x) => /Salvar/.test(x.innerText)).disabled }; })()"));
    await js("saveSettings({ hideDemos: true })");
    await new Promise((r) => setTimeout(r, 500));
    report('barra salvar (suja)', await js("(() => { const b = document.querySelector('.save-bar'); return { suja: b.classList.contains('dirty'), msg: b.innerText.slice(0, 60), salvarDesabilitado: [...b.querySelectorAll('button')].find((x) => /Salvar/.test(x.innerText)).disabled }; })()"));
    await shot('e14b-barra-salvar');
    await js("commitSettings()");
    await new Promise((r) => setTimeout(r, 600));
    report('depois de salvar', await js("(async () => ({ dirty: state.dirty, gravado: (await window.api.getSettings()).data.hideDemos, msg: document.querySelector('.save-bar').innerText.slice(0, 40) }))()"));
    await js("chooseTheme('aco')"); await new Promise((r) => setTimeout(r, 300));
    report('tema muda a barra', await js("(async () => ({ dirty: state.dirty, salvarDesabilitado: [...document.querySelectorAll('.save-bar button')].find((x) => /Salvar/.test(x.innerText)).disabled, gravadoAinda: state.config.theme }))()"));
    await js("discardSettings()"); await new Promise((r) => setTimeout(r, 400));
    report('descartar volta o tema', await js("({ tema: document.documentElement.getAttribute('data-theme'), dirty: state.dirty })"));
    await js("saveSettings({ fontScale: 'grande' }, false)"); await new Promise((r) => setTimeout(r, 400));
    report('sem redesenhar a barra acende', await js("[...document.querySelectorAll('.save-bar button')].find((x) => /Salvar/.test(x.innerText)).disabled"));
    await js("discardSettings()"); await new Promise((r) => setTimeout(r, 400));
    await js("setTimeout(() => resetSettings(), 0); 1");
    await until("document.querySelector('.modal')", 'caixa de confirmação');
    await shot('e14c-caixa-restaurar');
    await js("document.querySelector('.modal [data-value=ok]').click()");
    await new Promise((r) => setTimeout(r, 600));
    report('depois de restaurar', await js("(async () => ({ hideDemos: (await window.api.getSettings()).data.hideDemos, dirty: state.dirty }))()"));
    await js("saveSettings({ custom: [{ id: 'cf', name: 'Site com robô', template: 'https://cf-mock.example/{slug}/', enabled: true }] }, false).then(() => commitSettings())"); // o restaurar apagou as fontes: refaz a do teste anti-robô
    await new Promise((r) => setTimeout(r, 700));
    await js("saveSettings({ hideDemos: true })");
    await new Promise((r) => setTimeout(r, 400));
    await js("window.__keepModal = true; setTimeout(() => backFromSettings(), 0); 1");
    await until("document.querySelector('.modal')", 'caixa de alterações não salvas');
    await shot('e14d-caixa-sair');
    report('caixa de sair', await js("({ titulo: document.querySelector('.modal-title').innerText, botoes: [...document.querySelectorAll('.modal .btn')].map((b) => b.innerText), foco: document.activeElement.innerText })"));
    await js("document.querySelector('.modal [data-value=discard]').click(); window.__keepModal = false");
    await new Promise((r) => setTimeout(r, 600));
    report('depois de descartar', await js("(async () => ({ dirty: state.dirty, gravado: (await window.api.getSettings()).data.hideDemos, caixa: !!document.querySelector('.modal') }))()"));
    await clickByText('.topbar .btn', 'Configurações');
    await clickByText('.toc-link', 'Aparência');
    await clickByText('.toc-link', 'Ferramentas');
    await until("document.querySelector('#cfg-ferramentas')", 'ferramentas');
    report('cfg ferramentas', await js("document.querySelector('#cfg-ferramentas').innerText.slice(0, 200)"));
    // aba Novidades
    await clickByText('.toc-link', 'Novidades');
    await until("document.querySelector('.changelog')", 'novidades');
    report('novidades', await js("document.querySelector('#cfg-novidades').innerText.slice(0, 160)"));
    await shot('e9-novidades');
    // aba Cache
    await clickByText('.toc-link', 'Cache');
    await until("document.querySelector('.cache-game')", 'cache listado');
    report('cache jogos', await js("[...document.querySelectorAll('.cache-head b')].map((e) => e.innerText)"));
    await shot('e7-cache');
    await clickByText('.cache-head button', 'Apagar');
    await wait(600);
    report('cache apos apagar 1', await js("document.querySelectorAll('.cache-game').length"));
    // anti-robô: limpa o cache, reabre o jogo e confere o bloqueio automático + aviso
    await clickByText('button', 'Apagar tudo');
    await wait(500);
    await clickByText('.settings-layout .toc-back', 'Voltar');
    await clickByText('.top-left .btn', 'Último jogo');
    await until("document.querySelectorAll('.ach').length > 0", 'jogo recarregado');
    await until("document.querySelector('#guideStatus .notice.warn')", 'aviso anti-robô');
    report('aviso anti-robô', await js("document.querySelector('#guideStatus .notice.warn').innerText.slice(0, 200)"));
    await shot('e6-aviso-antirobo');
    await clickByText('.topbar .btn', 'Configurações');
    await clickByText('.toc-link', 'Sites bloqueados');
    await until("document.querySelector('.chip-x')", 'bloqueados 2');
    report('bloqueados depois', await js("[...document.querySelectorAll('.chip-x')].map((e) => e.innerText.replace(/\\s+/g, ' '))"));
    report('fonte desligada', await js("(() => { document.querySelectorAll('.toc-link')[1].click(); return null; })()"));
    await wait(400);
    report('custom depois', await js("[...document.querySelectorAll('.src-custom input[type=checkbox]')].map((e) => e.checked)"));
    // Voltar das Configurações devolve o jogo pesquisado (não o último jogo)
    await clickByText('.settings-layout .toc-back', 'Voltar');
    await until("document.querySelector('.search input')", 'barra de busca');
    await js("(() => { const i = document.querySelector('.search input'); i.value = 'SILENT'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
    await until("[...document.querySelectorAll('.suggest button, [role=option]')].some((b) => b.textContent.includes('SILENT'))", 'sugestão do jogo');
    await js("[...document.querySelectorAll('[role=option]')].find((b) => b.textContent.includes('SILENT')).click()");
    await until("document.querySelector('.game-head h1') && document.querySelector('.game-head h1').textContent.includes('SILENT')", 'jogo pesquisado aberto');
    await clickByText('.topbar .btn', 'Configurações');
    await clickByText('.settings-layout .toc-back', 'Voltar');
    await until("document.querySelector('.game-head h1')", 'voltou ao jogo');
    report('voltou para o jogo pesquisado', await js("document.querySelector('.game-head h1').textContent"));
    await shot('layout-c');
  } catch (err) {
    console.error('Falha nas capturas:', err.message);
    try { await shot('erro'); } catch (_) { /* ignora */ }
    process.exitCode = 1;
  }
}

module.exports = { run };
