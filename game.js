// game.js — главный класс игры. Координирует все модули, держит game loop и стейт-машину.
import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Audio } from './audio.js';
import { Physics } from './physics.js';
import { ObstacleField } from './obstacles.js';
import { drawRocket } from './skins.js';
import { Ads } from './ads.js';
import { UI } from './ui.js';
import { EndlessMode } from './modes.js';

const STATE = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  DEAD: 'DEAD',
  AD: 'AD',
});

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
      vy: 0,
      rotation: 0,
    };

    this.obstacles = new ObstacleField(this.w, this.h);
    this.ui = new UI();
    this.mode = new EndlessMode();
    this.score = 0;
    this.best = Storage.get('bestScore') || 0;
    this.state = STATE.MENU;

    this.currentParams = this.mode.paramsForScore(0);
    this.lastTs = 0;
    this.flameFlicker = 0;

    // Revive — лимита нет, ведётся только неуязвимость после возрождения
    this.invulnerableUntil = 0;

    // Parallax stars: 3 слоя
    this.stars = this._makeStars();

    // Death freeze (короткая пауза для feedback)
    this.deathFreezeUntil = 0;
    this.pendingGameOver = null;

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
    this.player.y = this.h / 2;
    this.player.vy = 0;
    this.player.rotation = 0;
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
    Physics.jump(this.player);
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
      // Возвращаем ракету в центр по высоте, чтобы revive был "безопасным рестартом"
      this.player.y = this.h / 2;
      this.player.vy = CONFIG.jumpForce * 0.6;
      this.invulnerableUntil = performance.now() + CONFIG.reviveInvulnerabilitySeconds * 1000;
      this.state = STATE.PLAYING;
      this.ui.showHud();
      this.lastTs = performance.now();
    });
  }

  die() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.DEAD;
    Audio.playCrash();
    Audio.vibrate(60);
    Storage.increment('deathsSinceAd');

    const isNewRecord = this.score > this.best;
    if (isNewRecord) {
      this.best = this.score;
      Storage.set('bestScore', this.best);
      // Небольшое торжество при новом рекорде
      Audio.playWin();
    }
    // Сохраняем для отложенного показа после фриза. Реклама теперь не здесь, а перед след. попыткой.
    this.pendingGameOver = { score: this.score, best: this.best, isNewRecord };
    this.deathFreezeUntil = performance.now() + 350;
  }

  _afterDeathFreeze() {
    const { score, best, isNewRecord } = this.pendingGameOver;
    this.pendingGameOver = null;
    this.ui.showGameOver(score, best, isNewRecord);
    this.state = STATE.DEAD;
  }

  // === Tick ===
  _tick(ts) {
    const rawDt = Math.min(40, ts - this.lastTs);
    const dt = rawDt / 16.67;
    this.lastTs = ts;
    this.flameFlicker += rawDt / 60;

    if (this.state === STATE.PLAYING) {
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

    // Отложенный gameover screen после death freeze
    if (this.state === STATE.DEAD && this.pendingGameOver && performance.now() >= this.deathFreezeUntil) {
      this._afterDeathFreeze();
    }

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

    // Игрок (с мерцанием при неуязвимости)
    const invulnerable = performance.now() < this.invulnerableUntil;
    if (invulnerable) {
      const f = Math.sin(performance.now() / 70);
      ctx.globalAlpha = f > 0 ? 0.5 : 0.95;
    }
    drawRocket(ctx, this.player.x, this.player.y, this.player.rotation, Storage.get('skin') || 'default', this.flameFlicker);
    ctx.globalAlpha = 1;
  }
}
