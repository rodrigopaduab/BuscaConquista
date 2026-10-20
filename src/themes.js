'use strict';

// Temas de cores disponíveis (os mesmos nomes da Steam). Os valores de cada cor ficam em renderer/styles.css.
const THEMES = ['padrao', 'verao', 'meia-noite', 'aco', 'cosmico', 'escuro'];
const DEFAULT_THEME = 'padrao';

const isTheme = (value) => THEMES.includes(value);

module.exports = { THEMES, DEFAULT_THEME, isTheme };
