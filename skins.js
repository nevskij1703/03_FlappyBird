// skins.js — палитры зонда Вояджер-1 + функция отрисовки.
// Чтобы добавить скин, расширь объект SKINS и установи storage.set('skin', 'id').
import { CONFIG } from './config.js';

export const SKINS = {
  default: {
    id: 'default',
    name: 'Серебро',
    dish: '#f2f5f8',
    dishShadow: '#aab4be',
    dishRim: '#3a4048',
    bus: '#c9d0d8',
    busDark: '#727680',
    busOutline: '#2a2d35',
    foil: '#e8c248',
    foilHi: '#fce070',
    boom: '#8a8f9a',
    rtg: '#3d4048',
    rtgDark: '#1c1e24',
    antenna: '#a0a8b4',
    antennaNode: '#ffd86b',
    puff: ['#ffffff', '#cfe9ff', '#9fc4ff'],
  },
  gold: {
    id: 'gold',
    name: 'Золотая фольга',
    dish: '#fff4c8',
    dishShadow: '#c89f50',
    dishRim: '#403018',
    bus: '#f0d68a',
    busDark: '#8a6620',
    busOutline: '#2a1d08',
    foil: '#ffb850',
    foilHi: '#ffd870',
    boom: '#9a7a3a',
    rtg: '#503820',
    rtgDark: '#241a10',
    antenna: '#b89860',
    antennaNode: '#fff4c8',
    puff: ['#fff4d0', '#ffe0a0', '#d8a050'],
  },
  deepspace: {
    id: 'deepspace',
    name: 'Дальний космос',
    dish: '#d8e8ff',
    dishShadow: '#6090c8',
    dishRim: '#101a2e',
    bus: '#7090b4',
    busDark: '#2a3850',
    busOutline: '#0a1020',
    foil: '#80a0d0',
    foilHi: '#a0c4ff',
    boom: '#4060a0',
    rtg: '#1a2438',
    rtgDark: '#080c14',
    antenna: '#5a78a0',
    antennaNode: '#00d4ff',
    puff: ['#cfe9ff', '#80b0e0', '#406090'],
  },
};

export function getSkin(id) {
  return SKINS[id] || SKINS.default;
}

// Рисует зонд (Вояджер-1) в (x, y).
// lastThrustAt — момент последнего тапа (ms), для эффекта "пшика".
// thrustDir — текущее направление движения (-1 вверх, +1 вниз, 0 покой).
// rotation — опциональный угол поворота (используется в анимации крушения).
export function drawProbe(ctx, x, y, skinId, lastThrustAt, thrustDir, rotation = 0) {
  const skin = getSkin(skinId);
  const now = performance.now();
  const tEl = now - (lastThrustAt || -1e9);
  const puffActive = tEl < CONFIG.thrustPuffMs && thrustDir !== 0 && !rotation;

  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);

  // === Облачко-"пшик" (рисуем под/над зондом, противоположно движению) ===
  if (puffActive) {
    const a = Math.max(0, 1 - tEl / CONFIG.thrustPuffMs);
    const grow = tEl / CONFIG.thrustPuffMs; // 0..1
    // напротив движения: thrustDir=-1 (летит вверх) → дым ниже (положительный y)
    const puffSign = -thrustDir;
    const puffY = puffSign * 26;
    // 3 кружка вразброс
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * 5;
      const dy = puffY + puffSign * (3 + i * 1.5 + grow * 6);
      const r = (8 + grow * 6) - i * 1.4;
      if (r <= 0) continue;
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(tEl * 0.04 + i));
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fillStyle = skin.puff[Math.min(i, skin.puff.length - 1)];
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // === Длинная антенна-магнитометр слева ===
  ctx.strokeStyle = skin.antenna;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-26, 4);
  ctx.lineTo(-6, 4);
  ctx.stroke();
  // узлы вдоль антенны (3 шт)
  for (let i = -24; i <= -10; i += 7) {
    ctx.beginPath();
    ctx.arc(i, 4, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = skin.antennaNode;
    ctx.fill();
  }
  // конец антенны — маленький шарик
  ctx.beginPath();
  ctx.arc(-26, 4, 2, 0, Math.PI * 2);
  ctx.fillStyle = skin.antennaNode;
  ctx.fill();

  // === Боом с RTG справа ===
  ctx.strokeStyle = skin.boom;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(7, -2);
  ctx.lineTo(20, 8);
  ctx.stroke();
  // RTG цилиндр
  ctx.fillStyle = skin.rtg;
  this_roundRect(ctx, 18, 6, 7, 12, 1.5);
  ctx.fill();
  // тень снизу
  ctx.fillStyle = skin.rtgDark;
  ctx.fillRect(18.5, 14, 6, 3);
  // блик на RTG
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(19, 7, 1.5, 9);

  // === Маленький "хвост" приборной палубы вниз ===
  ctx.fillStyle = skin.busDark;
  ctx.fillRect(-4, -4, 8, 8);

  // === Шестигранный корпус (bus) ===
  const cx = 0, cy = -12, rH = 12, rV = 9;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 3;
    const px = cx + rH * Math.cos(ang);
    const py = cy + rV * Math.sin(ang);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const busGrad = ctx.createLinearGradient(-rH, 0, rH, 0);
  busGrad.addColorStop(0, skin.busDark);
  busGrad.addColorStop(0.5, skin.bus);
  busGrad.addColorStop(1, skin.busDark);
  ctx.fillStyle = busGrad;
  ctx.fill();
  ctx.strokeStyle = skin.busOutline;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Золотая фольга — горизонтальная полоса на басе
  ctx.fillStyle = skin.foil;
  ctx.fillRect(-7, -12, 14, 3);
  ctx.fillStyle = skin.foilHi;
  ctx.fillRect(-7, -12, 14, 1);

  // === Параболическая антенна (тарелка) сверху ===
  // Полу-эллипс «чашкой вверх»: open side at top, curve goes down
  // Internally an ellipse painted top half flipped — easier: draw the bowl shape manually.
  const dishCx = 0, dishCy = -26, dishRx = 17, dishRy = 8;
  // Внешний контур чаши
  ctx.beginPath();
  ctx.moveTo(dishCx - dishRx, dishCy);
  ctx.bezierCurveTo(dishCx - dishRx, dishCy + dishRy * 1.4,
                    dishCx + dishRx, dishCy + dishRy * 1.4,
                    dishCx + dishRx, dishCy);
  ctx.closePath();
  ctx.fillStyle = skin.dishShadow;
  ctx.fill();
  // Передняя «открытая» поверхность — лёгкий эллипс
  ctx.beginPath();
  ctx.ellipse(dishCx, dishCy, dishRx, dishRy * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = skin.dish;
  ctx.fill();
  // Обод тарелки
  ctx.strokeStyle = skin.dishRim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(dishCx, dishCy, dishRx, dishRy * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Центральный feed — маленькая мачта от центра вверх
  ctx.fillStyle = skin.busDark;
  ctx.fillRect(dishCx - 0.8, dishCy - 6, 1.6, 6);
  ctx.beginPath();
  ctx.arc(dishCx, dishCy - 7, 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Свободная утилита (без this) — _roundRect был бы методом, делаем функцией.
function this_roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
