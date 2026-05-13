// physics.js — гравитация, импульс, границы.
// dt — относительное время кадра (1 ≈ 16.67ms). Это позволяет независимость от FPS.
import { CONFIG } from './config.js';

export const Physics = {
  applyTick(player, dt) {
    player.vy += CONFIG.gravity * dt;
    if (player.vy > CONFIG.maxFallSpeed) player.vy = CONFIG.maxFallSpeed;
    player.y += player.vy * dt;
    // плавный поворот ракеты в зависимости от vy
    const targetRot = Math.max(-0.5, Math.min(1.2, player.vy * CONFIG.rotationFactor));
    player.rotation += (targetRot - player.rotation) * 0.18 * dt;
  },

  jump(player) {
    player.vy = CONFIG.jumpForce;
  },

  // true, если ракета вылетела за верх или низ канваса
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
