// obstacles.js — астероидные пояса с одним широким коридором.
// Каждый "пояс" — вертикальная колонна круглых астероидов разного размера,
// в которой есть один заметно широкий просвет (коридор для зонда). Между
// мелкими астероидами могут оставаться зазоры, но они уже размера зонда —
// игрок должен пролетать через ШИРОКИЙ просвет, а не лавировать.
//
// Инвариант "честной" генерации: разница gapY между двумя соседними поясами
// ограничена CONFIG.difficultyGrowth.maxGapDelta — иначе после быстрой
// смены направления зонд просто не успеет.
import { CONFIG } from './config.js';

export class ObstacleField {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.list = [];
    this.lastGapY = height / 2;
  }

  reset() {
    this.list.length = 0;
    this.lastGapY = this.h / 2;
  }

  // Спавнит новый пояс справа за экраном.
  spawn(currentGap) {
    const margin = CONFIG.obstacleMinMargin + currentGap / 2;
    const minY = margin;
    const maxY = this.h - margin;
    const maxDelta = CONFIG.difficultyGrowth.maxGapDelta;

    let gapY = minY + Math.random() * (maxY - minY);
    if (gapY < this.lastGapY - maxDelta) gapY = this.lastGapY - maxDelta;
    if (gapY > this.lastGapY + maxDelta) gapY = this.lastGapY + maxDelta;
    gapY = Math.max(minY, Math.min(maxY, gapY));
    this.lastGapY = gapY;

    const beltX = this.w + 30;
    const beltWidth = CONFIG.obstacleWidth; // визуальная ширина пояса по горизонтали
    const corridorHalf = currentGap / 2;
    const topEnd = gapY - corridorHalf;
    const botStart = gapY + corridorHalf;

    const asteroids = [];
    // Верхняя секция: от потолка до края коридора
    this._fillSection(asteroids, beltX, beltWidth, 18, topEnd);
    // Нижняя секция: от края коридора до пола
    this._fillSection(asteroids, beltX, beltWidth, botStart, this.h - 18);

    this.list.push({
      x: beltX,
      gapY,
      gapHeight: currentGap,
      width: beltWidth,
      asteroids,
      passed: false,
    });
  }

  // Заполняет вертикальную секцию столбиком астероидов разного размера.
  // Между соседними астероидами оставляем небольшие промежутки 8-16px —
  // вроде "вот тут можно проскочить", но реально игрок туда не пройдёт.
  _fillSection(asteroids, beltX, beltWidth, fromY, toY) {
    if (toY - fromY < 22) return;
    let cy = fromY + 10 + Math.random() * 6;
    while (cy < toY - 10) {
      // Радиус 9..22 — мелкие астероиды
      const r = 9 + Math.random() * 13;
      // Если астероид не помещается до конца секции — выходим
      if (cy + r > toY) break;
      // Лёгкое горизонтальное смещение в пределах пояса
      const jitterMax = Math.max(0, (beltWidth / 2) - r - 2);
      const cx = beltX + (Math.random() - 0.5) * 2 * jitterMax;
      asteroids.push({
        cx,
        cy,
        r,
        rotation: Math.random() * Math.PI * 2,
        seed: Math.floor(Math.random() * 1e6),
      });
      // Зазор между астероидами — "ложный" проход
      const gapBetween = 8 + Math.random() * 9;
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
    // Удаляем ушедшие за экран
    while (
      this.list.length &&
      this.list[0].x + this.list[0].width / 2 + 30 < 0
    ) {
      this.list.shift();
    }
    // Спавним при необходимости
    const last = this.list[this.list.length - 1];
    if (!last || last.x < this.w - currentSpacing) {
      this.spawn(currentGap);
    }
  }

  // Проверка AABB (хитбокс игрока) с каждым астероидом (окружность).
  checkCollision(hb) {
    const hbCx = hb.x + hb.w / 2;
    for (const belt of this.list) {
      // Грубый отсев — если пояс далеко от игрока, пропускаем
      if (Math.abs(belt.x - hbCx) > belt.width / 2 + 80) continue;
      for (const a of belt.asteroids) {
        // Ближайшая точка прямоугольника к центру окружности
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
      this._renderBelt(ctx, belt);
    }
  }

  _renderBelt(ctx, belt) {
    const top = belt.gapY - belt.gapHeight / 2;
    const bot = belt.gapY + belt.gapHeight / 2;
    const markerX = belt.x - belt.width / 2 - 4;
    const markerW = belt.width + 8;

    // Подсветка коридора — неоновые cyan-полосы сверху и снизу прохода
    const g1 = ctx.createLinearGradient(0, top - 8, 0, top + 1);
    g1.addColorStop(0, 'rgba(0,220,255,0)');
    g1.addColorStop(1, 'rgba(0,220,255,0.9)');
    ctx.fillStyle = g1;
    ctx.fillRect(markerX, top - 8, markerW, 8);

    const g2 = ctx.createLinearGradient(0, bot, 0, bot + 8);
    g2.addColorStop(0, 'rgba(0,220,255,0.9)');
    g2.addColorStop(1, 'rgba(0,220,255,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(markerX, bot, markerW, 8);

    // Сами астероиды
    for (const a of belt.asteroids) {
      this._drawAsteroid(ctx, a);
    }
  }

  _drawAsteroid(ctx, a) {
    const { cx, cy, r, seed } = a;
    // Основное тело — мягкий радиальный градиент, чтобы выглядел объёмным
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
    // Лёгкий блик с теневой стороны (солнечная сторона)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.45, cy - r * 0.45, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}
