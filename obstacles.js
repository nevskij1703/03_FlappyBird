// obstacles.js — астероидные пояса с одним широким коридором.
// Каждый "пояс" — хаотичная россыпь круглых астероидов разного размера,
// между которыми есть один заметный широкий просвет (коридор). Мелкие зазоры
// между астероидами выглядят почти проходимыми, но всё-таки чуть уже хитбокса
// зонда — лететь надо именно через ШИРОКИЙ просвет.
//
// Инвариант "честной" генерации: разница gapY между двумя соседними поясами
// ограничена CONFIG.difficultyGrowth.maxGapDelta — иначе после быстрой
// смены направления зонд просто не успеет.
import { CONFIG } from './config.js';

// Локальная ширина пояса — чуть шире, чем CONFIG.obstacleWidth, чтобы
// горизонтальный разброс астероидов давал ощущение хаоса, а не нити.
const BELT_WIDTH = 112;

// Первые 3 пояса каждого забега — облегчённый коридор.
// belt 0: ×2.0, belt 1: ×1.5, belt 2+: ×1.0.
function beltStartMul(beltIdx) {
  return Math.max(1, 2 - beltIdx * 0.5);
}

export class ObstacleField {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.list = [];
    this.lastGapY = height / 2;
    this.beltsSpawned = 0;
  }

  reset() {
    this.list.length = 0;
    this.lastGapY = this.h / 2;
    this.beltsSpawned = 0;
  }

  // Спавнит новый пояс справа за экраном.
  spawn(currentGap) {
    // Первые пояса забега — облегчённый коридор для разгона
    const beltIdx = this.beltsSpawned;
    const effectiveGap = currentGap * beltStartMul(beltIdx);
    this.beltsSpawned = beltIdx + 1;

    const margin = CONFIG.obstacleMinMargin + effectiveGap / 2;
    const minY = margin;
    const maxY = this.h - margin;
    const maxDelta = CONFIG.difficultyGrowth.maxGapDelta;

    let gapY = minY + Math.random() * (maxY - minY);
    if (gapY < this.lastGapY - maxDelta) gapY = this.lastGapY - maxDelta;
    if (gapY > this.lastGapY + maxDelta) gapY = this.lastGapY + maxDelta;
    gapY = Math.max(minY, Math.min(maxY, gapY));
    this.lastGapY = gapY;

    const beltX = this.w + 30;
    const corridorHalf = effectiveGap / 2;
    const topEnd = gapY - corridorHalf;
    const botStart = gapY + corridorHalf;

    const asteroids = [];
    this._fillSection(asteroids, beltX, 18, topEnd);
    this._fillSection(asteroids, beltX, botStart, this.h - 18);

    this.list.push({
      x: beltX,
      gapY,
      gapHeight: effectiveGap,
      width: BELT_WIDTH,
      asteroids,
      passed: false,
    });
  }

  // Заполняет вертикальную секцию хаотичной россыпью астероидов.
  // - Горизонтальный разброс — почти на всю ширину пояса.
  // - Радиусы 7..24, заметная разница в размерах.
  // - Иногда астероиды идут тесной группой (cluster), иногда — с большим зазором.
  // - Лёгкая вертикальная случайность в положении, чтобы не выстраивались в нить.
  _fillSection(asteroids, beltX, fromY, toY) {
    if (toY - fromY < 25) return;
    const halfBelt = BELT_WIDTH / 2;
    let cy = fromY + 6 + Math.random() * 14;

    while (cy < toY - 8) {
      const r = 7 + Math.random() * 17; // 7..24
      if (cy + r > toY) break;

      // Горизонтальное смещение — почти весь пояс
      const maxOffset = Math.max(8, halfBelt - r * 0.55);
      const cx = beltX + (Math.random() - 0.5) * 2 * maxOffset;

      // Лёгкая вертикальная случайность с учётом границ секции
      const vJitterMax = Math.min(5, (toY - cy - r) * 0.5, (cy - fromY - r) * 0.5);
      const cyJit = vJitterMax > 0 ? (Math.random() - 0.5) * 2 * vJitterMax : 0;

      asteroids.push({
        cx,
        cy: cy + cyJit,
        r,
        rotation: Math.random() * Math.PI * 2,
        seed: Math.floor(Math.random() * 1e6),
      });

      // Шаг по вертикали — иногда тесный кластер, иногда заметный зазор
      const tightCluster = Math.random() < 0.32;
      const gapBetween = tightCluster
        ? 3 + Math.random() * 5     // 3..8 — тесная группа
        : 12 + Math.random() * 10;  // 12..22 — «ложный» проход
      cy += r + gapBetween;
    }
  }

  // Двигает пояса влево, удаляет ушедшие, спавнит новые.
  update(dt, speed, currentGap, currentSpacing) {
    const dx = speed * dt;
    for (const belt of this.list) {
      belt.x -= dx;
      for (const a of belt.asteroids) a.cx -= dx;
    }
    while (
      this.list.length &&
      this.list[0].x + this.list[0].width / 2 + 30 < 0
    ) {
      this.list.shift();
    }
    const last = this.list[this.list.length - 1];
    if (!last || last.x < this.w - currentSpacing) {
      this.spawn(currentGap);
    }
  }

  // Проверка AABB (хитбокс игрока) с каждым астероидом (окружность).
  checkCollision(hb) {
    const hbCx = hb.x + hb.w / 2;
    for (const belt of this.list) {
      if (Math.abs(belt.x - hbCx) > belt.width / 2 + 80) continue;
      for (const a of belt.asteroids) {
        const closestX = Math.max(hb.x, Math.min(a.cx, hb.x + hb.w));
        const closestY = Math.max(hb.y, Math.min(a.cy, hb.y + hb.h));
        const dx = a.cx - closestX;
        const dy = a.cy - closestY;
        if (dx * dx + dy * dy < a.r * a.r) return true;
      }
    }
    return false;
  }

  // Засчитывает пролёт пояса, возвращает количество новых очков.
  processPassed(playerX) {
    let scored = 0;
    for (const belt of this.list) {
      if (!belt.passed && belt.x + belt.width / 2 < playerX) {
        belt.passed = true;
        scored++;
      }
    }
    return scored;
  }

  // Убирает ближайший пояс при revive.
  clearNear(playerX, radius = 220) {
    this.list = this.list.filter((b) => Math.abs(b.x - playerX) > radius);
  }

  render(ctx) {
    for (const belt of this.list) {
      for (const a of belt.asteroids) {
        this._drawAsteroid(ctx, a);
      }
    }
  }

  _drawAsteroid(ctx, a) {
    const { cx, cy, r, seed } = a;
    // Основное тело — мягкий радиальный градиент
    const grad = ctx.createRadialGradient(
      cx - r * 0.4, cy - r * 0.4, r * 0.15,
      cx, cy, r
    );
    grad.addColorStop(0, '#7e8290');
    grad.addColorStop(0.55, '#494c5c');
    grad.addColorStop(1, '#26283a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Контур
    ctx.strokeStyle = 'rgba(16, 18, 30, 0.75)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Кратеры (детерминированный псевдо-рандом по seed)
    let s = seed;
    const craters = 2 + Math.floor(r / 8);
    for (let i = 0; i < craters; i++) {
      s = (s * 9301 + 49297) % 233280;
      const ang = (s / 233280) * Math.PI * 2;
      s = (s * 9301 + 49297) % 233280;
      const dist = (s / 233280) * r * 0.62;
      s = (s * 9301 + 49297) % 233280;
      const cr = 1.2 + (s / 233280) * (r * 0.2);
      ctx.fillStyle = 'rgba(12, 14, 22, 0.55)';
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, cr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Лёгкий блик с солнечной стороны
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.45, cy - r * 0.45, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}
