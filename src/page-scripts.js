'use strict';

/**
 * Funções que rodam DENTRO das páginas de guias (via executeJavaScript). Por isso elas não podem usar nada de fora:
 * cada uma é convertida em texto com .toString() e executada na página.
 *  - powerpyx: lê a tabela do guia do PowerPyx (explicação curta + detalhes, imagens, vídeos).
 *  - extractMany: em qualquer site, acha a seção de cada conquista pelo título (h1-h6) ou linha de tabela.
 *  - pageDate: descobre a data de publicação/atualização da página.
 */

function helpers() {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (_) { return null; } };
  const smiley = (src) => { const m = /smilies\/([\w-]+)\./.exec(src || ''); return m ? m[1].toUpperCase() : null; };
  const youtube = (s) => { const m = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/.exec(String(s || '')); return m ? 'https://www.youtube.com/watch?v=' + m[1] : null; };
  const isAd = (el) => /(^|[-_ ])ad([-_ ]|s?$)|advert|mv-ad|sponsor|cookie|newsletter|related/i.test(el.className && el.className.toString ? el.className.toString() : '');

  function collectImage(img, images, href) {
    if (img.getAttribute('data-lazy-type') === 'iframe') {
      const v = youtube(img.getAttribute('data-lazy-src'));
      if (v) images.push({ t: 'video', url: v });
      return;
    }
    const raw = img.getAttribute('data-lazy-src') || img.getAttribute('data-src') || img.getAttribute('src') || '';
    if (!raw || raw.startsWith('data:')) return;
    if (/\/trophy\.png$|trophy-guide-(bronze|silver|gold|platinum)|smilies\//i.test(raw)) return;
    const w = parseInt(img.getAttribute('width') || '0', 10);
    if (w && w < 80) return;
    const direct = href && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(href) ? href : null;
    const url = abs(direct || raw.replace(/-\d+x\d+(\.\w+)$/, '$1'));
    if (url && !images.some((i) => i.url === url)) images.push({ t: 'img', url });
  }

  // Link para um mapa ("[Map Link]", "Interactive Map", MapGenie...): vira botão clicável junto do texto.
  function mapLink(a) {
    const href = a.href || '';
    if (!/^https?:/i.test(href)) return null;
    const text = clean(a.textContent).replace(/^[\[(]+|[\])]+$/g, '').trim();
    if (!text || text.length > 40) return null;
    const byText = /^(map( link)?|mapa|interactive map|view (on )?(the )?map|map location|location( map)?|ver no mapa)$/i.test(text);
    const byHost = /(^|\.)(mapgenie\.io|gamemaps\.com|ign\.com\/maps)|[?&/]map(s)?[/?=&-]|interactive[-_ ]?map/i.test(href) && /map|location|mapa/i.test(text);
    return byText || byHost ? { t: 'link', v: text, url: href, map: true } : null;
  }

  function textOf(node, images, links) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += n.textContent;
      else if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'BR') out += ' ';
        else if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
        else if (tag === 'IMG') {
          const sm = smiley(n.getAttribute('src'));
          if (sm) out += ' [' + sm + '] ';
          else collectImage(n, images);
        } else if (tag === 'PICTURE') { const im = n.querySelector('img'); if (im) collectImage(im, images); }
        else if (tag === 'A' && n.querySelector('img') && !clean(n.textContent)) { collectImage(n.querySelector('img'), images, n.href); }
        else if (tag === 'LI') out += ' • ' + textOf(n, images, links);
        else {
          if (tag === 'A' && links) { const ml = mapLink(n); if (ml) links.push(ml); }
          out += textOf(n, images, links);
        }
      }
    }
    return out;
  }

  // Bloco que é só um link ("» Todos os locais..."): vira um link clicável, não texto solto.
  function soleLink(run) {
    const els = run.filter((n) => !(n.nodeType === 3 && !clean(n.textContent)));
    if (els.length !== 1 || els[0].nodeType !== 1) return null;
    let el = els[0];
    if (el.tagName !== 'A') {
      const kids = [...el.childNodes].filter((n) => !(n.nodeType === 3 && !clean(n.textContent)));
      if (kids.length !== 1 || kids[0].nodeType !== 1 || kids[0].tagName !== 'A') return null;
      el = kids[0];
    }
    const text = clean(el.textContent).replace(/^[»›>\s]+/, '');
    if (!text || !/^https?:/i.test(el.href) || el.querySelector('img')) return null;
    return { t: 'link', v: text, url: el.href };
  }

  const BLOCK = /^(P|DIV|UL|OL|H[1-6]|TABLE|BLOCKQUOTE|FIGURE|PRE|HR|SECTION|ARTICLE)$/;
  function parseDetail(td) {
    const parts = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const link = soleLink(run);
      if (link) { parts.push(link); run = []; return; }
      const imgs = [];
      const links = [];
      const text = clean(textOf({ childNodes: run }, imgs, links));
      if (text) parts.push({ t: 'text', v: text });
      for (const l of links) if (!parts.some((p) => p.t === 'link' && p.url === l.url)) parts.push(l);
      parts.push(...imgs);
      run = [];
    };
    for (const n of td.childNodes) {
      if (n.nodeType === 8) continue;
      if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'NOSCRIPT' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NAV' || tag === 'FORM' || tag === 'ASIDE') continue;
        if (isAd(n)) { flush(); continue; }
        if (tag === 'IFRAME') { flush(); const v = youtube(n.src); if (v) parts.push({ t: 'video', url: v }); continue; }
        if (BLOCK.test(tag)) { flush(); run.push(n); flush(); continue; }
      }
      run.push(n);
    }
    flush();
    return parts;
  }

  return { clean, parseDetail };
}

function powerpyx(H) {
  const { clean, parseDetail } = H;
  const entries = [];
  let cur = null;
  let section = '';
  for (const tr of document.querySelectorAll('h1,h2,h3,h4,h5,h6,table tr')) {
    if (/^H[1-6]$/.test(tr.tagName)) { section = clean(tr.textContent).slice(0, 120); continue; }
    const cells = tr.cells;
    if (cells.length >= 2 && cells[1] && clean(cells[1].innerText)) {
      const lines = cells[1].innerText.split('\n').map(clean).filter(Boolean);
      cur = { name: lines[0], desc: lines.slice(1).join(' '), section, parts: [] };
      entries.push(cur);
    } else if (cells.length === 1 && cur) {
      cur.parts.push(...parseDetail(cells[0]));
    }
  }
  return { entries };
}

function extractMany(H, NAMES) {
  const { clean, parseDetail } = H;
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`´']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const level = (h) => Number(h.tagName[1]);
  const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  const textLen = (parts) => parts.filter((p) => p.t === 'text').reduce((n, p) => n + p.v.length, 0);
  const results = {};

  function fromHeading(name) {
    const want = norm(name);
    const rank = (t) => (t === want ? 0 : t.startsWith(want + ' ') ? 1 : 2);
    const ranked = heads
      .map((h) => ({ h, t: norm(h.textContent) }))
      .filter((x) => x.t === want || x.t.startsWith(want + ' ') || (' ' + x.t + ' ').includes(' ' + want + ' '))
      .sort((a, b) => rank(a.t) - rank(b.t));
    for (const { h } of ranked) {
      const nodes = [];
      let n = h.nextSibling;
      let holder = h;
      while (nodes.length < 60) {
        if (!n) {
          holder = holder.parentElement;
          if (!holder || holder === document.body) break;
          n = holder.nextSibling;
          if (!n) continue;
        }
        if (n.nodeType === 1) {
          const hh = /^H[1-6]$/.test(n.tagName) ? n : (n.querySelector ? n.querySelector('h1,h2,h3,h4,h5,h6') : null);
          if (hh && level(hh) <= level(h)) break;
        }
        nodes.push(n);
        n = n.nextSibling;
      }
      const parts = parseDetail({ childNodes: nodes });
      if (textLen(parts) >= 60) return { title: h.textContent.trim().slice(0, 120), parts: parts.slice(0, 80) };
    }
    return null;
  }

  function fromRow(name) {
    const want = norm(name);
    for (const tr of document.querySelectorAll('tr')) {
      const cells = [...tr.cells];
      const hit = cells.find((c) => norm(c.innerText.split('\n')[0]) === want);
      if (!hit) continue;
      const parts = [{ t: 'text', v: clean(cells.filter((c) => c !== hit).map((c) => c.innerText).join(' - ')) || clean(hit.innerText) }];
      const next = tr.nextElementSibling;
      if (next && next.cells && next.cells.length === 1) parts.push(...parseDetail(next.cells[0]));
      return { title: name, parts };
    }
    return null;
  }

  // Listas e parágrafos no formato "Nome – como conseguir" (ou "Nome: ...").
  function fromItem(name) {
    const want = norm(name);
    const sep = /^\s*[-–—:|]\s*/;
    for (const el of document.querySelectorAll('li, p')) {
      const raw = clean(el.innerText || '');
      if (raw.length < want.length + 25 || raw.length > 1500) continue;
      const strong = el.querySelector('strong, b');
      const lead = strong && norm(strong.textContent) === want ? clean(strong.textContent) : null;
      let rest = null;
      if (lead && raw.toLowerCase().startsWith(lead.toLowerCase())) rest = raw.slice(lead.length);
      else {
        const head = raw.slice(0, name.length);
        if (norm(head) === want && sep.test(raw.slice(name.length))) rest = raw.slice(name.length);
      }
      if (rest == null) continue;
      rest = rest.replace(sep, '').trim();
      if (rest.length >= 25) return { title: name, parts: [{ t: 'text', v: rest }] };
    }
    return null;
  }

  for (const name of NAMES) {
    if (norm(name).length < 4) continue;
    try { const r = fromHeading(name) || fromRow(name) || fromItem(name); if (r) results[name] = r; } catch (_) { /* ignora */ }
  }
  return { results };
}

/** Data da página: meta, JSON-LD, "Updated: ..." ou <time>. Devolve { date, kind } ou null. */
function pageDate() {
  const pick = (v) => (v && String(v).trim()) || null;
  const metas = [['article:modified_time', 'modified'], ['og:updated_time', 'modified'], ['dateModified', 'modified'], ['article:published_time', 'published'], ['datePublished', 'published'], ['og:article:published_time', 'published'], ['date', 'published'], ['DC.date', 'published'], ['DC.date.issued', 'published'], ['sailthru.date', 'published']];
  for (const [key, kind] of metas) {
    const m = document.querySelector('meta[property="' + key + '"], meta[name="' + key + '"], meta[itemprop="' + key + '"]');
    if (m && pick(m.content)) return { date: pick(m.content), kind };
  }
  const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join('\n');
  const mod = /"dateModified"\s*:\s*"([^"]+)"/.exec(ld);
  if (mod) return { date: mod[1], kind: 'modified' };
  const text = document.body ? document.body.innerText.slice(0, 8000) : '';
  const upd = /(?:last updated|updated|atualizado)(?: on)?\s*[:\-]?\s*([A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2} [A-Za-z]{3,9}\.? \d{4}|\d{4}-\d{2}-\d{2})/i.exec(text);
  if (upd) return { date: upd[1], kind: 'modified' };
  const pubLd = /"datePublished"\s*:\s*"([^"]+)"/.exec(ld);
  if (pubLd) return { date: pubLd[1], kind: 'published' };
  const t = document.querySelector('time[datetime]');
  if (t) return { date: t.getAttribute('datetime'), kind: 'published' };
  const t2 = document.querySelector('time, .entry-date, .post-date, .published, .date, [class*="post-meta"] [class*="date"]');
  if (t2 && /\d{4}/.test(t2.textContent || '')) return { date: t2.textContent.trim(), kind: 'published' };
  const pub = /([A-Z][a-z]{2,8} \d{1,2}, \d{4}) by /.exec(text) || /(?:published|posted)(?: on)?\s*[:\-]?\s*([A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{4}-\d{2}-\d{2})/i.exec(text);
  if (pub) return { date: pub[1], kind: 'published' };
  // Último recurso: a primeira data escrita por extenso no começo da página.
  const any = /\b([A-Z][a-z]{2,8}\.? \d{1,2}(?:st|nd|rd|th)?,? \d{4}|\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]{2,8}\.? \d{4}|\d{4}-\d{2}-\d{2})\b/.exec(text.slice(0, 2500));
  if (any) return { date: any[1].replace(/(\d)(?:st|nd|rd|th)/, '$1'), kind: 'published' };
  return null;
}

const HELPERS_SRC = `(${helpers.toString()})()`;
const POWERPYX_EXTRACT = `(${powerpyx.toString()})(${HELPERS_SRC})`;
const buildExtractMany = (names) => `(${extractMany.toString()})(${HELPERS_SRC}, ${JSON.stringify(names)})`;
const DATE_SCRIPT = `(${pageDate.toString()})()`;

/** "March 27, 2024" / "2026-10-08T..." / "10 April 2024" -> "2024-03-27" (ou null). */
function toIsoDate(raw) {
  if (!raw) return null;
  const t = Date.parse(String(raw).trim().replace(/([A-Za-z])\./g, '$1'));
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  if (d.getUTCFullYear() < 2000 || t > Date.now() + 86400000) return null;
  return d.toISOString().slice(0, 10);
}

module.exports = { POWERPYX_EXTRACT, buildExtractMany, DATE_SCRIPT, toIsoDate, _fns: { helpers, powerpyx, extractMany, pageDate } };
