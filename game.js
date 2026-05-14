// game.js — главный класс игры. Координирует все модули, держит game loop и стейт-машину.
import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';
import { Physics } from './physics.js';
import { ObstacleField } from './obstacles.js';
import { drawProbe } from './skins.js';
import { Ads } from './ads.js';
import { UI } from './ui.js';
import { EndlessMode } from './modes.js';

const STATE = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  CRASHING: 'CRASHING', // отскок + взрыв (~1.5с) перед DEAD
  DEAD: 'DEAD',
  AD: 'AD',
});

// Длительности фаз крушения, мс.
const CRASH_BOUNCE_MS = 280;   // зонд тумблит и отскакивает
const CRASH_TOTAL_MS = 1500;   // когда показываем экран gameover

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = CONFIG.canvasLogicalWidth;
    this.h = CONFIG.canvasLogicalHeight;
    canvas.width = this.w;
    canvas.height = this.h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._fitCanvas();

    this.player = {
      x: CONFIG.player.x,
      y: this.h / 2,
      vx: 0,              // используется только в фазе CRASHING
      vy: 0,
      thrustDir: 0,       // 0=покой, -1=вверх, +1=вниз
      lastThrustAt: -1e9, // время последнего "пшика" для визуального эффекта
    };

    // Анимация крушения
    this.crashAt = 0;
    this.crashRot = 0;
    this.crashExploded = false;
    this.crashParticles = [];

    this.obstacles = new ObstacleField(this.w, this.h);
    this.ui = new UI();
    this.mode = new EndlessMode();
    this.score = 0;
    this.best = Storage.get('bestScore') || 0;
    this.state = STATE.MENU;

    this.currentParams = this.mode.paramsForScore(0);
    this.lastTs = 0;

    // Revive — лимита нет, ведётся только неуязвимость после возрождения
    this.invulnerableUntil = 0;
    this.pendingGameOver = null;

    // Parallax stars: 3 слоя
    this.stars = this._makeStars();

    this._bindInputs();
    this._bindUI();
    this.ui.showStart();
    this.ui.updateBest(this.best);
  }

  start() {
    this.lastTs = performance.now();
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  // === Канвас на весь stage с сохранением aspect ===
  _fitCanvas() {
    const resize = () => {
      const stage = document.getElementById('stage');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const targetAspect = this.w / this.h;
      let cssW, cssH;
      if (vw / vh > targetAspect) {
        cssH = vh;
        cssW = vh * targetAspect;
      } else {
        cssW = vw;
        cssH = vw / targetAspect;
      }
      stage.style.width = cssW + 'px';
      stage.style.height = cssH + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 100));
  }

  // === Input ===
  _bindInputs() {
    const onTap = (e) => {
      // Игнорируем нажатия по кнопкам — overlays перехватят сами
      if (e.target && e.target.closest('button')) return;
      this.handleTap();
      e.preventDefault();
    };
    document.addEventListener('pointerdown', onTap, { passive: false });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        this.handleTap();
        e.preventDefault();
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === STATE.PLAYING) this.pause();
        else if (this.state === STATE.PAUSED) this.resume();
      }
    });
  }

  _bindUI() {
    this.ui.bind({
      startEndless: () => this.startGame(),
      revive: () => this.tryRevive(),
      restart: () => this.startGame(),
      pause: () => this.pause(),
      resume: () => this.resume(),
      toggleSound: () => {
        const on = Storage.toggle('soundOn');
        if (on) Audio.playTap();
      },
      toggleVibration: () => {
        const on = Storage.toggle('vibrationOn');
        if (on) Audio.vibrate(30);
      },
    });
  }

  // === Стейт-переходы ===

  // Точка входа в попытку. Сначала проверяет рекламу, потом запускает раунд.
  async startGame() {
    // Если уже показывается реклама — не запускаем повторно
    if (this.state === STATE.AD) return;
    Storage.increment('attempts');

    if (Ads.shouldShowInterstitialBeforeAttempt()) {
      this.state = STATE.AD;
      // Скрываем все экраны, чтобы под рекламой не было game over screen
      this.ui.hideAll();
      await Ads.showInterstitialAd();
      Ads.markInterstitialShown();
    }
    this._beginRound();
  }

  _beginRound() {
    this.player.x = CONFIG.player.x;
    this.player.y = this.h / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.thrustDir = 0;
    this.player.lastThrustAt = -1e9;
    this.crashRot = 0;
    this.crashExploded = false;
    this.crashParticles = [];
    this.obstacles.reset();
    this.score = 0;
    this.invulnerableUntil = 0;
    this.currentParams = this.mode.paramsForScore(0);
    this.state = STATE.PLAYING;
    this.ui.showHud();
    this.ui.updateScore(0);
    this.ui.updateBest(this.best);
    this.lastTs = performance.now();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.ui.showPause();
  }

  // Возвращение в игру с отсчётом 3-2-1, чтобы игрок успел подготовиться.
  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.ui.hidePause();
    // Состояние остаётся PAUSED во время отсчёта — физика не идёт, тап игнорируется.
    this.ui.showCountdown(3, () => {
      if (this.state !== STATE.PAUSED) return; // если за это время сменили состояние — не запускаем
      this.state = STATE.PLAYING;
      this.lastTs = performance.now();
    });
  }

  handleTap() {
    Audio.ensure();
    if (this.state !== STATE.PLAYING) return;
    // Один тап — переключение направления (zero-G "пшик").
    Physics.toggleDirection(this.player);
    this.player.lastThrustAt = performance.now();
    Audio.playTap();
  }

  tryRevive() {
    if (this.state !== STATE.DEAD) return;
    if (!CONFIG.ads.rewardedReviveEnabled) return;
    // Rewarded реклама показывается ТОЛЬКО по тапу игрока (правило).
    // Лимита на количество revive нет — пока готов смотреть рекламу, можно возрождаться.
    this.state = STATE.AD;
    Ads.showRewardedAd().then((ok) => {
      if (!ok) {
        this.state = STATE.DEAD;
        return;
      }
      // Чистим ближайшие препятствия для безопасного рестарта
      this.obstacles.clearNear(this.player.x, 220);
      // Возвращаем зонд в центр и в покой — игрок сам решит, куда лететь после revive
      this.player.y = this.h / 2;
      this.player.vy = 0;
      this.player.thrustDir = 0;
      this.player.lastThrustAt = -1e9;
      this.invulnerableUntil = performance.now() + CONFIG.reviveInvulnerabilitySeconds * 1000;
      this.state = STATE.PLAYING;
      this.ui.showHud();
      this.lastTs = performance.now();
    });
  }

  die() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.CRASHING;
    Audio.playCrash();
    Audio.vibrate(60);
    Storage.increment('deathsSinceAd');

    const isNewRecord = this.score > this.best;
    if (isNewRecord) {
      this.best = this.score;
      Storage.set('bestScore', this.best);
      Audio.playWin();
    }
    // Сохраняем для показа после анимации крушения.
    this.pendingGameOver = { score: this.score, best: this.best, isNewRecord };

    // Запускаем анимацию крушения: отскок + взрыв.
    this.crashAt = performance.now();
    this.crashRot = 0;
    this.crashExploded = false;
    this.crashParticles = [];
    // Отскок: разворачиваем vy с потерей энергии + лёгкий случайный момент.
    const yMomentum = this.player.vy || (Math.random() < 0.5 ? -3 : 3);
    this.player.vy = -Math.sign(yMomentum) * (3.5 + Math.random() * 1.5);
    this.player.vx = -2.4 - Math.random() * 1.6; // толчок назад от препятствия
  }

  // Спавнит осколки + горящие частицы при взрыве.
  _spawnCrashParticles() {
    const cx = this.player.x;
    const cy = this.player.y;
    const list = [];
    const palette = ['#ffd86b', '#ff8a3d', '#fff5b0', '#ff4dd2', '#80e8ff', '#ffffff'];
    // Яркие быстрые искры
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 2.2 + Math.random() * 4.5;
      list.push({
        x: cx, y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 55 + Math.random() * 30,  // в кадрах (1 кадр = ~1 dt)
        size: 2 + Math.random() * 3,
        color: palette[Math.floor(Math.random() * palette.length)],
        glow: Math.random() < 0.45,
      });
    }
    // Куски-обломки Вояджера — более тусклые
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.6;
      list.push({
        x: cx + (Math.random() - 0.5) * 14,
        y: cy + (Math.random() - 0.5) * 14,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 70 + Math.random() * 40,
        size: 3 + Math.random() * 3,
        color: ['#c9d0d8', '#727680', '#e8c248'][Math.floor(Math.random() * 3)],
        debris: true,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.4,
      });
    }
    return list;
  }

  _updateCrash(dt) {
    const now = performance.now();
    const t = now - this.crashAt;

    // Фаза 1: отскок и кувырок — зонд ещё виден.
    if (t < CRASH_BOUNCE_MS) {
      this.player.x += this.player.vx * dt;
      this.player.y += this.player.vy * dt;
      this.player.vx *= 0.93;
      this.player.vy *= 0.93;
      this.crashRot += 0.22 * dt;
    } else if (!this.crashExploded) {
      // Фаза 2: взрыв — спавним частицы, зонд больше не рисуется.
      this.crashExploded = true;
      this.crashParticles = this._spawnCrashParticles();
      Audio.playCrash(); // повтор для драматизма
      Audio.vibrate([20, 30, 60]);
    }

    // Обновляем все частицы (если уже есть).
    for (const p of this.crashParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // лёгкое замедление; почти нет гравитации (zero-G), но искры остывают
      p.vx *= 0.985;
      p.vy *= 0.985;
      if (p.debris) p.rot += p.spin * dt;
      p.life -= dt;
    }
    if (this.crashParticles.length) {
      this.crashParticles = this.crashParticles.filter((p) => p.life > 0);
    }

    // По таймеру — показываем gameover.
    if (t >= CRASH_TOTAL_MS) {
      const { score, best, isNewRecord } = this.pendingGameOver;
      this.pendingGameOver = null;
      this.state = STATE.DEAD;
      this.ui.showGameOver(score, best, isNewRecord);
    }
  }

  // === Tick ===
  _tick(ts) {
    const rawDt = Math.min(40, ts - this.lastTs);
    const dt = rawDt / 16.67;
    this.lastTs = ts;

    if (this.state === STATE.CRASHING) {
      this._updateCrash(dt);
    } else if (this.state === STATE.PLAYING) {
      // Физика
      Physics.applyTick(this.player, dt);
      // Сложность
      this.currentParams = this.mode.paramsForScore(this.score);
      // Обновляем препятствия
      this.obstacles.update(dt, this.currentParams.speed, this.currentParams.gap, this.currentParams.spacing);
      // Очки
      const scored = this.obstacles.processPassed(this.player.x);
      if (scored > 0) {
        this.score += scored;
        this.ui.updateScore(this.score);
        Audio.playScore();
        Audio.vibrate(10);
      }
      // Коллизии
      const invulnerable = performance.now() < this.invulnerableUntil;
      if (!invulnerable) {
        const hb = Physics.hitbox(this.player);
        if (this.obstacles.checkCollision(hb)) {
          this.die();
        } else if (Physics.isOutOfBounds(this.player, this.h)) {
          this.die();
        }
      } else {
        // При неуязвимости клампим игрока в границы (защита от вылета)
        if (this.player.y < 20) { this.player.y = 20; this.player.vy = 0; }
        if (this.player.y > this.h - 20) { this.player.y = this.h - 20; this.player.vy = 0; }
      }
    }

    // Параллакс крутится всегда, в т.ч. в MENU/DEAD — живой фон
    this._updateStars(dt);

    this._render();

    requestAnimationFrame(this._tick);
  }

  // === Stars parallax ===
  _makeStars() {
    const layers = [];
    const counts = [80, 50, 30];
    const speeds = [0.18, 0.42, 0.85];
    const sizes = [1, 2, 3];
    for (let l = 0; l < 3; l++) {
      const arr = [];
      for (let i = 0; i < counts[l]; i++) {
        arr.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          size: sizes[l],
          speed: speeds[l],
          twinkle: Math.random(),
        });
      }
      layers.push(arr);
    }
    return layers;
  }

  _updateStars(dt) {
    // Едут быстрее если идёт игра, иначе медленный эмбиент
    const baseSpeed = this.state === STATE.PLAYING ? this.currentParams.speed * 0.5 : 0.4;
    for (const layer of this.stars) {
      for (const s of layer) {
        s.x -= s.speed * baseSpeed * dt;
        s.twinkle += dt * 0.04;
        if (s.x < -2) { s.x = this.w + 2; s.y = Math.random() * this.h; }
      }
    }
  }

  // === Render ===
  _render() {
    const ctx = this.ctx;
    // Фон-градиент
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    const colors = CONFIG.bg.gradient;
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.55, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);

    // Дальняя туманность (тонкая)
    ctx.save();
    ctx.globalAlpha = 0.18;
    const neb = ctx.createRadialGradient(this.w * 0.7, this.h * 0.3, 10, this.w * 0.7, this.h * 0.3, 240);
    neb.addColorStop(0, '#ff4dd2');
    neb.addColorStop(1, 'rgba(255,77,210,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    // Звёзды
    for (const layer of this.stars) {
      for (const s of layer) {
        const tw = 0.55 + 0.45 * Math.sin(s.twinkle * 6.28);
        ctx.globalAlpha = tw;
        ctx.fillStyle = s.size >= 3 ? '#fff8b0' : (s.size === 2 ? '#cfeaff' : '#9fc4ff');
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;

    // Препятствия
    this.obstacles.render(ctx);

    // Зонд — не рисуем после взрыва
    const isCrashing = this.state === STATE.CRASHING;
    const showProbe = !isCrashing || !this.crashExploded;
    if (showProbe) {
      const invulnerable = performance.now() < this.invulnerableUntil;
      if (invulnerable) {
        const f = Math.sin(performance.now() / 70);
        ctx.globalAlpha = f > 0 ? 0.5 : 0.95;
      }
      drawProbe(
        ctx,
        this.player.x,
        this.player.y,
        Storage.get('skin') || 'default',
        this.player.lastThrustAt,
        this.player.thrustDir,
        isCrashing ? this.crashRot : 0
      );
      ctx.globalAlpha = 1;
    }

    // Вспышка взрыва (короткая, 220мс с момента взрыва)
    if (isCrashing && this.crashExploded) {
      const flashT = performance.now() - this.crashAt - CRASH_BOUNCE_MS;
      if (flashT < 220) {
        const a = 1 - flashT / 220;
        const r = 30 + flashT * 0.6;
        const grad = ctx.createRadialGradient(this.player.x, this.player.y, 0, this.player.x, this.player.y, r);
        grad.addColorStop(0, `rgba(255, 240, 200, ${a})`);
        grad.addColorStop(0.35, `rgba(255, 150, 60, ${a * 0.65})`);
        grad.addColorStop(1, `rgba(255, 80, 30, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    // Частицы взрыва
    if (this.crashParticles && this.crashParticles.length) {
      for (const p of this.crashParticles) {
        const a = Math.max(0, Math.min(1, p.life / 50));
        ctx.globalAlpha = a;
        if (p.debris) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        } else {
          if (p.glow) {
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
          }
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
          if (p.glow) ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}
