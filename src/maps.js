'use strict';

/** Confere se um endereço (ou título) de mapa é mesmo do jogo procurado, para nunca mostrar o mapa de outro jogo. */
const alnum = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** variants: nomes do jogo ("The Binding of Isaac: Rebirth", "Rebirth", "The Binding of Isaac"). Variantes de uma palavra só ("Rebirth") são ignoradas quando há nomes maiores. */
function makeRelates(variants) {
  const list = (Array.isArray(variants) ? variants : []).map((v) => String(v || '').trim()).filter(Boolean);
  const strong = list.filter((v) => /\s/.test(v));
  const keys = (strong.length ? strong : list).map((v) => alnum(v).replace(/^the/, '')).filter((k) => k.length >= 4);
  const hasKey = (hay) => keys.some((k) => hay.includes(k));
  return {
    url: (u) => { try { const x = new URL(u); return hasKey(alnum(x.hostname + x.pathname)); } catch (_) { return false; } },
    title: (t) => hasKey(alnum(t)),
  };
}

module.exports = { makeRelates, alnum };
