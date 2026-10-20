'use strict';

// Aplica o tema salvo ANTES da primeira pintura, para a tela não "piscar" na cor padrão.
// (O tema oficial fica em config.json; aqui só lemos uma cópia guardada pelo app.js.)
(function () {
  try {
    var theme = localStorage.getItem('bc-theme');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  } catch (_) {
    /* sem armazenamento: segue com o tema padrão */
  }
})();
