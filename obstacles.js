// obstacles.js — генерация астероидных столбов + коллизии.
// Инвариант: |gapY - prevGapY| <= maxGapDelta — гарантия физической проходимости.
import { CONFIG } from './config.js';

export class ObstacleField {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.list = [];
    this.lastGapY = height / 2;
    this.rngSeed = 0;
  }

  reset() {
    this.list.length = 0;
    this.lastGapY = this.h / 2;
  }

  // Спавнит новую пару астероидов справа за пределами экрана.
  spawn(currentGap) {
    const margin = CONFIG.obstacleMinMargin + currentGap / 2;
    const minY = margin;
    const maxY = this.h - margin;
    const maxDelta = CONFIG.difficultyGrowth.maxGapDelta;

    let gapY = minY + Math.random() * (maxY - minY);
    // Ограничиваем разницу с прошлым проходом, чтобы был достижим
    if (gapY < this.lastGapY - maxDelta) gapY = this.lastGapY - maxDelta;
    if (gapY > this.lastGapY + maxDelta) gapY = this.lastGapY + maxDelta;
    gapY = Math.max(minY, Math.min(maxY, gapY));
    this.lastGapY = gapY;

    this.list.push({
      x: this.w + CONFIG.obstacleWidth,
      gapY,
      gapSize: currentGap,
      passed: false,
      // случайные смещения кратеров (рисуются в renderer)
      seed: Math.floor(Math.random() * 10000),
    });
  }

  // Двигает столбы влево, удаляет ушедшие за экран.
  update(dt, speed, currentGap, currentSpacing) {
    for (const o of this.list) {
      o.x -= speed * dt;
    }
    // Удаляем ушедшие
    while (this.list.length && this.list[0].x + CONFIG.obstacleWidth / 2 < -20) {
      this.list.shift();
    }
    // Спавним при необходимости
    const last = this.list[this.list.length - 1];
    if (!last || last.x < this.w - currentSpacing) {
      this.spawn(currentGap);
    }
  }

  // AABB-проверка с верхним и нижним прямоугольниками каждой пары.
  checkCollision(hb) {
    const halfW = CONFIG.obstacleWidth / 2;
    for (const o of this.list) {
      const oLeft = o.x - halfW;
      const oRight = o.x + halfW;
      // По X пересечение?
      if (hb.x + hb.w < oLeft || hb.x > oRight) continue;
      const topRectBottom = o.gapY - o.gapSize / 2;
      const bottomRectTop = o.gapY + o.gapSize / 2;
      // По Y — попадает в верхнюю часть?
      if (hb.y < topRectBottom) return true;
      // Или в нижнюю?
      if (hb.y + hb.h > bottomRectTop) return true;
    }
    return false;
  }

  // Регистрирует пролёт игрока — возвращает кол-во новых очков за этот кадр.
  processPassed(playerX) {
    let scored = 0;
    for (const o of this.list) {
      if (!o.passed && o.x + CONFIG.obstacleWidth / 2 < playerX) {
        o.passed = true;
        scored++;
      }
    }
    return scored;
  }

  // Убирает ближайшее препятствие в радиусе для revive.
  clearNear(playerX, radius = 200) {
    this.list = this.list.filter((o) => {
      const dx = o.x - playerX;
      return Math.abs(dx) > radius || dx < -CONFIG.obstacleWidth;
    });
  }

  // Отрисовка.
  render(ctx) {
    const halfW = CONFIG.obstacleWidth / 2;
    for (const o of this.list) {
      const topH = o.gapY - o.gapSize / 2;
      const botY = o.gapY + o.gapSize / 2;
      const botH = this.h - botY;
      // Верхний столб
      this._drawAsteroidColumn(ctx, o.x - halfW, 0, CONFIG.obstacleWidth, topH, o.seed, false);
      // Нижний столб
      this._drawAsteroidColumn(ctx, o.x - halfW, botY, CONFIG.obstacleWidth, botH, o.seed + 1, true);
      // Подсветка прохода (cyan градиент по верху/низу)
      const glowGrad = ctx.createLinearGradient(0, topH - 6, 0, topH + 1);
      glowGrad.addColorStop(0, 'rgba(0,220,255,0)');
      glowGrad.addColorStop(1, 'rgba(0,220,255,0.85)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(o.x - halfW, topH - 6, CONFIG.obstacleWidth, 7);
      const glowGrad2 = ctx.createLinearGradient(0, botY, 0, botY + 6);
      glowGrad2.addColorStop(0, 'rgba(0,220,255,0.85)');
      glowGrad2.addColorStop(1, 'rgba(0,220,255,0)');
      ctx.fillStyle = glowGrad2;
      ctx.fillRect(o.x - halfW, botY, CONFIG.obstacleWidth, 6);
    }
  }

  _drawAsteroidColumn(ctx, x, y, w, h, seed, top) {
    if (h <= 0) return;
    // Основа: вертикальный градиент серый
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#3a3d52');
    grad.addColorStop(0.5, '#62657c');
    grad.addColorStop(1, '#2a2c40');
    ctx.fillStyle = grad;
    this._roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    // Кратеры (детерминированный псевдо-рандом по seed)
    ctx.fillStyle = 'rgba(20, 20, 35, 0.55)';
    let s = seed;
    const cratersCount = Math.max(2, Math.floor(h / 50));
    for (let i = 0; i < cratersCount; i++) {
      s = (s * 9301 + 49297) % 233280;
      const cx = x + 10 + (s % (w - 20));
      s = (s * 9301 + 49297) % 233280;
      const cy = y + 15 + (s % Math.max(1, h - 30));
      s = (s * 9301 + 49297) % 233280;
      const r = 3 + (s % 5);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Светлая боковая полоса (объём)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(x + 4, y + 4, 3, h - 8);
  }

  _roundRect(ctx, x, y, w, h, r) {
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
}
