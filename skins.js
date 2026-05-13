// skins.js — палитры ракеты + функция отрисовки.
// Чтобы добавить скин, расширь объект SKINS и установи storage.set('skin', 'id').
import { CONFIG } from './config.js';

export const SKINS = {
  default: {
    id: 'default',
    name: 'Стандарт',
    body: '#e8f4ff',
    bodyDark: '#9bb5cc',
    nose: '#ff4dd2',
    fin: '#00d4ff',
    window: '#0098cc',
    windowGlow: 'rgba(120, 230, 255, 0.9)',
    flameInner: '#fff5b0',
    flameOuter: '#ff8a3d',
  },
  magenta: {
    id: 'magenta',
    name: 'Розовая молния',
    body: '#ffe0f4',
    bodyDark: '#cc7eb0',
    nose: '#ffd86b',
    fin: '#ff4dd2',
    window: '#9020a0',
    windowGlow: 'rgba(255, 180, 240, 0.9)',
    flameInner: '#fff',
    flameOuter: '#ff4dd2',
  },
  gold: {
    id: 'gold',
    name: 'Золотая комета',
    body: '#fff2c0',
    bodyDark: '#c89540',
    nose: '#ff8a3d',
    fin: '#ffd86b',
    window: '#8a5a10',
    windowGlow: 'rgba(255, 230, 130, 0.9)',
    flameInner: '#fff',
    flameOuter: '#ffaa20',
  },
};

export function getSkin(id) {
  return SKINS[id] || SKINS.default;
}

// Рисует ракету в (x, y) с поворотом rotation (рад).
// flameFlicker — фаза для анимации пламени (0..1, обычно perf.now()/100).
export function drawRocket(ctx, x, y, rotation, skinId, flameFlicker) {
  const skin = getSkin(skinId);
  const w = CONFIG.player.width;
  const h = CONFIG.player.height;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // === Пламя ===
  const fl = 0.7 + 0.3 * Math.sin(flameFlicker * 0.6);
  // Внешнее пламя
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, h * 0.42);
  ctx.quadraticCurveTo(0, h * 0.42 + 26 * fl, w * 0.18, h * 0.42);
  ctx.closePath();
  ctx.fillStyle = skin.flameOuter;
  ctx.fill();
  // Внутреннее пламя
  ctx.beginPath();
  ctx.moveTo(-w * 0.11, h * 0.42);
  ctx.quadraticCurveTo(0, h * 0.42 + 16 * fl, w * 0.11, h * 0.42);
  ctx.closePath();
  ctx.fillStyle = skin.flameInner;
  ctx.fill();

  // === Крылья (плавники) ===
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, h * 0.34);
  ctx.lineTo(-w * 0.5, h * 0.18);
  ctx.lineTo(-w * 0.22, h * 0.32);
  ctx.closePath();
  ctx.fillStyle = skin.fin;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.34);
  ctx.lineTo(w * 0.5, h * 0.18);
  ctx.lineTo(w * 0.22, h * 0.32);
  ctx.closePath();
  ctx.fill();

  // === Корпус — скруглённая капсула ===
  const bodyTop = -h * 0.5;
  const bodyBot = h * 0.34;
  const bodyW = w * 0.46;
  // Градиент по горизонтали — иллюзия объёма
  const grad = ctx.createLinearGradient(-bodyW, 0, bodyW, 0);
  grad.addColorStop(0, skin.bodyDark);
  grad.addColorStop(0.45, skin.body);
  grad.addColorStop(1, skin.bodyDark);
  ctx.fillStyle = grad;
  ctx.beginPath();
  // нос — треугольник сверху
  ctx.moveTo(0, bodyTop - h * 0.04);
  ctx.lineTo(bodyW, h * 0.0);
  ctx.lineTo(bodyW, bodyBot);
  ctx.lineTo(-bodyW, bodyBot);
  ctx.lineTo(-bodyW, h * 0.0);
  ctx.closePath();
  ctx.fill();

  // === Нос-конус сверху (другой цвет) ===
  ctx.beginPath();
  ctx.moveTo(0, bodyTop - h * 0.04);
  ctx.lineTo(bodyW, h * 0.0);
  ctx.lineTo(-bodyW, h * 0.0);
  ctx.closePath();
  ctx.fillStyle = skin.nose;
  ctx.fill();

  // === Иллюминатор ===
  ctx.beginPath();
  ctx.arc(0, h * 0.08, w * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = skin.window;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, h * 0.08, w * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = skin.windowGlow;
  ctx.fill();
  // Блик
  ctx.beginPath();
  ctx.arc(-w * 0.05, h * 0.05, w * 0.05, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();

  // Тёмная полоса внизу корпуса
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(-bodyW, h * 0.26, bodyW * 2, 4);

  ctx.restore();
}
