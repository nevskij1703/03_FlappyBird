// physics.js — zero-G движение.
// Каждый тап переключает направление вертикального движения (Voyager-style).
// Гравитации нет: после "пшика" зонд летит с постоянной скоростью до следующего тапа.
import { CONFIG } from './config.js';

export const Physics = {
  applyTick(player, dt) {
    // Никакой гравитации — просто интегрируем позицию.
    player.y += player.vy * dt;
  },

  // Переключает направление движения. Первый тап = вверх.
  toggleDirection(player) {
    if (player.thrustDir === 0) {
      player.thrustDir = -1; // первый импульс — вверх
    } else {
      player.thrustDir = -player.thrustDir;
    }
    player.vy = CONFIG.thrustSpeed * player.thrustDir;
  },

  // true, если зонд вылетел за верх или низ канваса
  isOutOfBounds(player, h) {
    return player.y < -10 || player.y > h - 10;
  },

  // Возвращает прямоугольник хитбокса для коллизий.
  hitbox(player) {
    const w = CONFIG.player.width * CONFIG.player.hitboxScale;
    const h = CONFIG.player.height * CONFIG.player.hitboxScale;
    return {
      x: player.x - w / 2,
      y: player.y - h / 2,
      w,
      h,
    };
  },
};
