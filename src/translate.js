'use strict';

/**
 * Tradução EN -> PT-BR pelo endpoint público do Google Tradutor (sem chave).
 * É um serviço não oficial: pode mudar ou limitar o uso. Por isso a interface sempre tem o texto original
 * e o botão "Copiar pedido" como plano B.
 */
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

/** Quebra um texto longo em pedaços de até `max` letras, cortando em fim de frase. */
function splitText(text, max = 1400) {
  const out = [];
  let rest = String(text);
  while (rest.length > max) {
    let cut = Math.max(rest.lastIndexOf('. ', max), rest.lastIndexOf('! ', max), rest.lastIndexOf('? ', max));
    if (cut < max * 0.4) cut = rest.lastIndexOf(' ', max);
    if (cut < 1) cut = max;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** A resposta é [[[traduzido, original, ...], ...], ...]; junta os pedaços traduzidos. */
function parseResponse(json) {
  if (!Array.isArray(json) || !Array.isArray(json[0])) throw new Error('resposta inesperada do tradutor');
  return json[0].map((seg) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('').trim();
}

async function translateOne(text, fetchFn, { target = 'pt', source = 'en' } = {}) {
  const pieces = splitText(text);
  const out = [];
  for (const piece of pieces) {
    const url = `${ENDPOINT}?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(piece)}`;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`o tradutor respondeu ${res.status}`);
    out.push(parseResponse(await res.json()));
  }
  return out.join(' ');
}

/** Traduz vários textos (poucos de cada vez, para não ser bloqueado). */
async function translateMany(texts, fetchFn, opts = {}) {
  const out = new Array(texts.length);
  let next = 0;
  const worker = async () => {
    while (next < texts.length) {
      const i = next++;
      out[i] = await translateOne(texts[i], fetchFn, opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, texts.length) }, worker));
  return out;
}

module.exports = { splitText, parseResponse, translateOne, translateMany };
