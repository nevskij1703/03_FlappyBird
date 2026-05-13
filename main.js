// main.js — точка входа
// Запускает игру после загрузки DOM.
import { Game } from './game.js';

function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) {
    console.error('Canvas #game не найден');
    return;
  }
  const game = new Game(canvas);
  game.start();
  // Экспортируем для отладки
  window.__game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
