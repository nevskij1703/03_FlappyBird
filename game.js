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
import { NARRATIVE_LINES } from './narrative.js';

const STATE = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  CRASHING: 'CRASHING', // отскок + взрыв (~1.5с) перед DEAD
  DEAD: 'DEAD',
  AD: 'AD',
});

// Длительность анимации крушения, мс — пока расходятся дым и обломки.
const CRASH_TOTAL_MS = 1500;
// Длительность вводной анимации (зонд уезжает из центра в левую игровую позицию).
const INTRO_DURATION_MS = 700;
// Масштаб увеличенного зонда на стартовом экране.
const MENU_PROBE_SCALE = 1.7;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = CONFIG.canvasLogicalWidth;
    this.h = CONFIG.canvasLogicalHeight;
    // Поднимаем backing store до physical-DPI, чтобы Canvas не размывался
    // при CSS-растяжении на hi-DPI экранах. Всё игровое API оперирует
    // логическими координатами — ctx.scale(dpr, dpr) делает их совместимыми.
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = this.w * this.dpr;
    canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
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
    this.crashExploded = false;
    this.crashParticles = [];

    // Вводная анимация: 0 — не активна, иначе timestamp начала.
    this.introAt = 0;
    // Фаза "покачивания" зонда на стартовом экране.
    this.menuHoverPhase = 0;

    // Становится true после первой смерти в этой сессии. Используется как
    // ворота для interstitial: при самом первом старте сессии рекламу не
    // показываем — только когда игрок уже хоть раз разбился и хочет заново.
    this.hasPlayedThisSession = false;

    // Счётчик стартов в текущей сессии (сбрасывается при перезагрузке страницы).
    // Используется для показа Rate-us попапа перед 3-й попыткой.
    this.attemptsStartedThisSession = 0;

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

    // Parallax stars: 3 слоя (большинство — статичные точки, лишь часть мерцает)
    this.stars = this._makeStars();
    // Большие фоновые объекты — планеты, туманности
    this.cosmic = this._makeCosmic();
    // Падающие звёзды — редкие визуальные события
    this.shootingStars = [];
    this.nextShootingStarAt = performance.now() + 2500 + Math.random() * 4000;

    // Нарратив (DOM-тикер философских фраз внизу)
    this.narrativeEl = document.getElementById('narrative');
    this.narrativeText = document.getElementById('narrative-text');
    this.narrativeIdx = 0;
    this.narrativeLines = this._shuffleLines(NARRATIVE_LINES.slice());
    this.narrativeTimer = null;

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
      toggleLang: () => {
        const cur = (Storage.get('lang') || 'ru');
        Storage.set('lang', cur === 'ru' ? 'en' : 'ru');
        // Локализация ещё не реализована — переключатель только запоминает выбор.
      },
      openPrivacy: () => {
        // Открываем политику конфиденциальности в системном браузере.
        // В WebView APK у нас перехватывается через intent — открывается
        // в браузере Android; в обычном браузере — новая вкладка.
        try {
          window.open('https://cloud.mail.ru/public/KkNS/kzAGja7yB', '_blank', 'noopener,noreferrer');
        } catch (e) {
          console.warn('[privacy] open failed', e);
        }
      },
    });
  }

  // === Стейт-переходы ===

  // Точка входа в попытку. Сначала проверяет rate-popup и рекламу, потом запускает раунд.
  async startGame() {
    // Если уже показывается реклама — не запускаем повторно
    if (this.state === STATE.AD) return;
    Storage.increment('attempts');

    // Rate-us попап: перед 3-й попыткой сессии, если игрок ещё не оценил.
    // attemptsStartedThisSession == 2 → две попытки уже стартанули, сейчас будет третья.
    // Возвращает true, если игрок согласился оценить (нажал "Оценить"); тогда
    // interstitial в эту попытку пропускаем — игрока уже один раз отвлекли.
    let skipAdBecauseRated = false;
    if (this.attemptsStartedThisSession === 2 && !Storage.get('ratedInStore')) {
      this.ui.hideAll();
      const rated = await this._showRatePopup();
      if (rated) skipAdBecauseRated = true;
    }

    // Interstitial показываем только если:
    //  • в этой сессии игрок уже хотя бы раз разбился (не на самом первом старте);
    //  • игрок только что НЕ нажал "Оценить" в Rate-us попапе;
    //  • остальные правила частоты/кулдауна проходят.
    if (!skipAdBecauseRated
        && this.hasPlayedThisSession
        && Ads.shouldShowInterstitialBeforeAttempt()) {
      this.state = STATE.AD;
      // Скрываем все экраны, чтобы под рекламой не было game over screen
      this.ui.hideAll();
      await Ads.showInterstitialAd();
      // Кулдаун стартует здесь — после возвращения игрока из рекламы.
      Ads.markInterstitialShown();
    }
    this._beginRound();
  }

  // Показывает попап "Спасибо за помощь!" с 5 звёздами.
  // Промис резолвится в `true`, если игрок нажал "Оценить" (и в сторе
  // зафиксируется ratedInStore=true), или в `false` — если "Может позже".
  _showRatePopup() {
    return new Promise((resolve) => {
      const overlay = document.getElementById('rate-overlay');
      const btnRate = document.getElementById('btn-rate');
      const btnLater = document.getElementById('btn-rate-later');
      if (!overlay || !btnRate || !btnLater) { resolve(false); return; }

      overlay.classList.remove('hidden');
      const close = (rated) => {
        overlay.classList.add('hidden');
        btnRate.onclick = null;
        btnLater.onclick = null;
        if (rated) {
          Storage.set('ratedInStore', true);
          // TODO: подставить URL приложения в РуСтор / Google Play и раскомментировать:
          // window.open('https://apps.rustore.ru/app/com.terekh.cosmoflight', '_blank');
          console.log('[rate] opening store (stub)');
        }
        resolve(rated);
      };
      btnRate.onclick = () => close(true);
      btnLater.onclick = () => close(false);
    });
  }

  _beginRound() {
    this.player.x = CONFIG.player.x;
    this.player.y = this.h / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.thrustDir = 0;
    this.player.lastThrustAt = -1e9;
    this.crashExploded = false;
    this.crashParticles = [];
    this.obstacles.reset();
    this._startNarrative();
    this.score = 0;
    this.invulnerableUntil = 0;
    this.currentParams = this.mode.paramsForScore(0);
    this.state = STATE.PLAYING;
    this.ui.showHud();
    this.ui.updateScore(0);
    this.ui.updateBest(this.best);
    // Старт вводной анимации (зонд уменьшается из центра в игровую позицию).
    this.introAt = performance.now();
    this.lastTs = performance.now();
    // Учитываем эту попытку в сессионном счётчике (для rate-popup).
    this.attemptsStartedThisSession++;
  }

  // Идёт ли сейчас вступительная анимация зонда?
  _isIntroPlaying() {
    return this.introAt > 0 && performance.now() - this.introAt < INTRO_DURATION_MS;
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this._stopNarrative();
    this.ui.showPause(this.score, this.best);
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
      this._startNarrative();
    });
  }

  handleTap() {
    Audio.ensure();
    if (this.state !== STATE.PLAYING) return;
    if (this._isIntroPlaying()) return; // вводная анимация — ввод заблокирован
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
    this._stopNarrative();
    Audio.playCrash();
    Audio.vibrate([20, 30, 60]);
    Storage.increment('deathsSinceAd');
    // С этого момента в текущей сессии разрешено показывать interstitial
    // перед следующей попыткой (если пройдут остальные правила частоты/кулдауна).
    this.hasPlayedThisSession = true;

    const isNewRecord = this.score > this.best;
    if (isNewRecord) {
      this.best = this.score;
      Storage.set('bestScore', this.best);
      Audio.playWin();
    }
    this.pendingGameOver = { score: this.score, best: this.best, isNewRecord };

    // Взрыв происходит МГНОВЕННО в точке удара — без фазы отскока.
    this.crashAt = performance.now();
    this.crashExploded = true;
    this.crashParticles = this._spawnCrashParticles();
    // Останавливаем движение зонда (он всё равно больше не рисуется).
    this.player.vx = 0;
    this.player.vy = 0;
  }

  // Спавнит частицы реалистичного взрыва: огонь, клубы дыма, обломки.
  _spawnCrashParticles() {
    const cx = this.player.x;
    const cy = this.player.y;
    const list = [];

    // Огненный шар — быстрые горящие частицы (16 шт), оранжево-жёлтые
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const speed = 1.6 + Math.random() * 2.6;
      list.push({
        type: 'fire',
        x: cx + (Math.random() - 0.5) * 6,
        y: cy + (Math.random() - 0.5) * 6,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 28 + Math.random() * 18,   // короткая жизнь (~0.5с)
        maxLife: 46,
        size: 5 + Math.random() * 5,
      });
    }

    // Клубы дыма — крупные мягкие, медленные (14 шт), растут со временем
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.3;
      list.push({
        type: 'smoke',
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 0.15, // лёгкий снос вверх — клубы поднимаются
        life: 75 + Math.random() * 35,   // долго живут (~1.5с)
        maxLife: 110,
        size: 7 + Math.random() * 6,
        growMax: 18 + Math.random() * 14,
      });
    }

    // Обломки Вояджера — серые с разной скоростью (8 шт), вращаются
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.0;
      list.push({
        type: 'debris',
        x: cx + (Math.random() - 0.5) * 10,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 55 + Math.random() * 35,
        maxLife: 90,
        size: 3 + Math.random() * 2.5,
        color: ['#3a3d52', '#62657c', '#8a8f9a', '#a0a8b4'][Math.floor(Math.random() * 4)],
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.3,
      });
    }
    return list;
  }

  _updateCrash(dt) {
    const now = performance.now();
    const t = now - this.crashAt;

    // Обновляем частицы. У каждого типа своё затухание.
    for (const p of this.crashParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'smoke') {
        // Дым быстро тормозит и клубится — почти на месте
        p.vx *= 0.93;
        p.vy *= 0.93;
      } else if (p.type === 'fire') {
        // Огонь летит и затухает
        p.vx *= 0.97;
        p.vy *= 0.97;
      } else {
        // Обломки летят дальше, крутятся
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.rot += p.spin * dt;
      }
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
    } else if (this.state === STATE.PLAYING && !this._isIntroPlaying()) {
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
    this._updateCosmic(dt);
    this._updateShootingStars(dt);
    // Покачивание зонда в меню
    this.menuHoverPhase += dt * 0.045;

    this._render();

    requestAnimationFrame(this._tick);
  }

  // === Stars parallax ===
  // 3 слоя, всего ~65 звёзд (раньше было 160). Лишь часть мерцает — остальные горят ровно.
  _makeStars() {
    const layers = [];
    const counts = [32, 18, 8];
    const speeds = [0.18, 0.40, 0.78];
    const sizes = [1, 2, 3];
    // Доля мерцающих звёзд в каждом слое (только крупные мерцают чаще)
    const twinkleChance = [0.08, 0.20, 0.50];
    for (let l = 0; l < 3; l++) {
      const arr = [];
      for (let i = 0; i < counts[l]; i++) {
        arr.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          size: sizes[l],
          speed: speeds[l],
          twinkle: Math.random() < twinkleChance[l],
          phase: Math.random() * Math.PI * 2,
        });
      }
      layers.push(arr);
    }
    return layers;
  }

  _updateStars(dt) {
    const baseSpeed = this.state === STATE.PLAYING ? this.currentParams.speed * 0.45 : 0.35;
    for (const layer of this.stars) {
      for (const s of layer) {
        s.x -= s.speed * baseSpeed * dt;
        if (s.twinkle) s.phase += dt * 0.05;
        if (s.x < -2) {
          s.x = this.w + 2;
          s.y = Math.random() * this.h;
        }
      }
    }
  }

  // === Большие фоновые космические объекты (туманности + маленькая планета) ===
  _makeCosmic() {
    // Малоконтрастные фоновые объекты. Двигаются заметно медленнее звёзд.
    return [
      // Маленькая планета-спутник вдалеке
      { x: this.w * 1.4, y: this.h * 0.32, r: 55,
        c1: 'rgba(255, 210, 140, 0.20)', c2: 'rgba(120,  60,  30, 0.10)', c3: 'rgba(40, 20, 10, 0)',
        dx: -0.04 },
      // Туманность мажента по центру
      { x: this.w * 0.5, y: this.h * 0.45, r: 240,
        c1: 'rgba(220, 80, 180, 0.08)', c2: 'rgba(100, 30, 120, 0.04)', c3: 'rgba(20, 10, 40, 0)',
        dx: -0.014 },
      // Бирюзовая туманность далеко
      { x: this.w * 1.2, y: this.h * 0.65, r: 200,
        c1: 'rgba(80, 200, 220, 0.08)', c2: 'rgba(30, 100, 140, 0.04)', c3: 'rgba(10, 40, 60, 0)',
        dx: -0.014 },
    ];
  }

  _updateCosmic(dt) {
    const mult = this.state === STATE.PLAYING ? this.currentParams.speed * 0.4 : 0.4;
    for (const o of this.cosmic) {
      o.x += o.dx * mult * dt;
      if (o.x < -o.r - 50) o.x = this.w + o.r + Math.random() * 100;
    }
  }

  _renderCosmic(ctx) {
    for (const o of this.cosmic) {
      const grad = ctx.createRadialGradient(
        o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.05,
        o.x, o.y, o.r
      );
      grad.addColorStop(0, o.c1);
      grad.addColorStop(0.5, o.c2);
      grad.addColorStop(1, o.c3);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === Падающие звёзды ===
  _spawnShootingStar() {
    // Угол падения: от диагонали вниз-влево, лёгкая случайность
    const angle = Math.PI * 0.18 + (Math.random() - 0.5) * 0.35; // ~32° от вертикали
    const speed = 11 + Math.random() * 5;
    // Стартуем из верхней правой четверти, иногда слегка над экраном
    const startX = this.w * 0.45 + Math.random() * this.w * 0.55;
    const startY = -20 - Math.random() * 60;
    this.shootingStars.push({
      x: startX,
      y: startY,
      // Летят вниз-влево
      vx: -Math.sin(angle) * speed,
      vy: Math.cos(angle) * speed,
      life: 38 + Math.random() * 12,
      maxLife: 50,
      length: 55 + Math.random() * 30,
      width: 1.4 + Math.random() * 0.8,
    });
  }

  _updateShootingStars(dt) {
    const now = performance.now();
    if (now >= this.nextShootingStarAt) {
      this._spawnShootingStar();
      // Иногда пускаем "пару" подряд для эффектного метеорного дождичка
      if (Math.random() < 0.18) {
        setTimeout(() => this._spawnShootingStar(), 150 + Math.random() * 250);
      }
      this.nextShootingStarAt = now + 4000 + Math.random() * 6000;
    }
    for (const s of this.shootingStars) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    if (this.shootingStars.length) {
      this.shootingStars = this.shootingStars.filter(
        (s) => s.life > 0 && s.x > -100 && s.y < this.h + 100
      );
    }
  }

  _renderShootingStars(ctx) {
    if (!this.shootingStars.length) return;
    for (const s of this.shootingStars) {
      const t = Math.max(0, Math.min(1, s.life / s.maxLife));
      // Появляется ярко, угасает в конце
      const alpha = t < 0.85 ? t / 0.85 : 1;
      // Хвост в направлении, противоположном движению
      const speed = Math.hypot(s.vx, s.vy);
      const tx = s.x - (s.vx / speed) * s.length;
      const ty = s.y - (s.vy / speed) * s.length;
      // Линейный градиент: прозрачный хвост → яркая голова
      const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
      grad.addColorStop(0,    'rgba(255, 250, 200, 0)');
      grad.addColorStop(0.55, `rgba(255, 240, 180, ${alpha * 0.45})`);
      grad.addColorStop(1,    `rgba(255, 255, 255, ${alpha})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      // Яркая голова с лёгким glow
      ctx.shadowColor = 'rgba(255, 240, 180, 0.75)';
      ctx.shadowBlur = 8;
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.width * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // === Narrative ticker ===
  _shuffleLines(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _startNarrative() {
    if (!this.narrativeEl) return;
    this.narrativeEl.classList.remove('hidden');
    this._showNarrativeLine(this.narrativeLines[this.narrativeIdx]);
    this._scheduleNextNarrative();
  }

  _scheduleNextNarrative() {
    clearTimeout(this.narrativeTimer);
    this.narrativeTimer = setTimeout(() => {
      // fade out → swap → fade in
      this.narrativeText.classList.remove('visible');
      setTimeout(() => {
        this.narrativeIdx = (this.narrativeIdx + 1) % this.narrativeLines.length;
        this._showNarrativeLine(this.narrativeLines[this.narrativeIdx]);
        this._scheduleNextNarrative();
      }, 700);
    }, 6500);
  }

  _showNarrativeLine(text) {
    if (!this.narrativeText) return;
    this.narrativeText.textContent = text;
    // Принудительный reflow перед добавлением visible, чтобы transition сработал
    void this.narrativeText.offsetWidth;
    this.narrativeText.classList.add('visible');
  }

  _stopNarrative() {
    clearTimeout(this.narrativeTimer);
    this.narrativeTimer = null;
    if (this.narrativeText) this.narrativeText.classList.remove('visible');
    if (this.narrativeEl) this.narrativeEl.classList.add('hidden');
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

    // Большие фоновые объекты (планеты, туманности) — низкоконтрастные
    this._renderCosmic(ctx);

    // Падающие звёзды — рисуются после фоновых космо-объектов, но до обычных звёзд,
    // чтобы их хвост проходил «за» точками-звёздами и читался естественно.
    this._renderShootingStars(ctx);

    // Звёзды: большинство — статичные точки, лишь часть мерцает
    for (const layer of this.stars) {
      for (const s of layer) {
        const baseColor = s.size >= 3 ? '#fff8b0' : (s.size === 2 ? '#cfeaff' : '#9fc4ff');
        if (s.twinkle) {
          const tw = 0.5 + 0.5 * Math.sin(s.phase * 6.28);
          ctx.globalAlpha = tw;
          ctx.fillStyle = baseColor;
          ctx.fillRect(s.x, s.y, s.size, s.size);
          // Лёгкий ореол вокруг мерцающих
          if (s.size >= 2) {
            ctx.globalAlpha = tw * 0.35;
            ctx.fillRect(s.x - 1, s.y - 1, s.size + 2, s.size + 2);
          }
        } else {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = baseColor;
          ctx.fillRect(s.x, s.y, s.size, s.size);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Препятствия
    this.obstacles.render(ctx);

    // Зонд — мгновенно исчезает в момент удара (взрыв происходит на его месте).
    const isCrashing = this.state === STATE.CRASHING;
    if (!isCrashing) {
      // Позиция/масштаб зависят от состояния:
      //   MENU       — увеличенный, по центру, с лёгким покачиванием
      //   PLAYING + intro — анимированный переход в игровую позицию
      //   иначе       — на player.x / player.y
      let displayX = this.player.x;
      let displayY = this.player.y;
      let displayScale = 1;
      if (this.state === STATE.MENU) {
        displayX = this.w / 2;
        displayY = this.h / 2 + Math.sin(this.menuHoverPhase) * 10;
        displayScale = MENU_PROBE_SCALE;
      } else if (this._isIntroPlaying()) {
        const tRaw = (performance.now() - this.introAt) / INTRO_DURATION_MS;
        const t = Math.min(1, Math.max(0, tRaw));
        // ease-in-out-cubic для плавного старта и финиша
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const startX = this.w / 2;
        const startY = this.h / 2 + Math.sin(this.menuHoverPhase) * 10;
        displayX = startX + (this.player.x - startX) * eased;
        displayY = startY + (this.player.y - startY) * eased;
        displayScale = MENU_PROBE_SCALE + (1 - MENU_PROBE_SCALE) * eased;
      }

      const invulnerable = performance.now() < this.invulnerableUntil;
      if (invulnerable) {
        const f = Math.sin(performance.now() / 70);
        ctx.globalAlpha = f > 0 ? 0.5 : 0.95;
      }
      drawProbe(
        ctx,
        displayX,
        displayY,
        Storage.get('skin') || 'default',
        this.player.lastThrustAt,
        this.player.thrustDir,
        0,
        displayScale
      );
      ctx.globalAlpha = 1;
    }

    // Частицы и вспышка взрыва — рисуем в правильном порядке слоёв.
    if (isCrashing && this.crashExploded) {
      this._renderExplosion(ctx);
    } else if (this.crashParticles && this.crashParticles.length) {
      // Уже DEAD, но частицы ещё долетают
      this._renderExplosion(ctx);
    }

    // Затемнение нижней четверти — чтобы фразы нарратива читались лучше.
    // Рисуется поверх всего на канвасе, но НИЖЕ DOM-узла .narrative (тот z-index:4).
    const fadeStart = this.h * 0.74;
    const fadeGrad = ctx.createLinearGradient(0, fadeStart, 0, this.h);
    fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    fadeGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
    fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, fadeStart, this.w, this.h - fadeStart);
  }

  // Рендер взрыва: сначала дым (сзади), потом обломки, потом огонь, потом вспышка.
  _renderExplosion(ctx) {
    const px = this.player.x;
    const py = this.player.y;

    // --- Слой 1: дым (мягкие радиальные клубы) ---
    for (const p of this.crashParticles) {
      if (p.type !== 'smoke') continue;
      const t = 1 - p.life / p.maxLife;          // 0 в начале → 1 в конце
      if (t < 0 || t > 1) continue;
      const size = p.size + t * p.growMax;        // дым растёт
      const baseAlpha = (1 - t) * 0.6;            // и медленно прозрачнеет
      // оттенок: первые 30% — тёмно-серо-коричневый, потом светлее (остатки гари)
      const gray = Math.floor(38 + t * 28);
      const r = gray + 6;
      const g = gray;
      const b = gray - 4;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
      grad.addColorStop(0, `rgba(${r},${g},${b},${baseAlpha})`);
      grad.addColorStop(0.55, `rgba(${r-8},${g-8},${b-8},${baseAlpha * 0.55})`);
      grad.addColorStop(1, `rgba(${r-14},${g-14},${b-14},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Слой 2: вспышка (короткая, 180мс с момента удара) — поверх дыма ---
    const flashT = performance.now() - this.crashAt;
    if (flashT >= 0 && flashT < 180) {
      const fa = 1 - flashT / 180;
      const fr = 35 + flashT * 0.8;
      const fgrad = ctx.createRadialGradient(px, py, 0, px, py, fr);
      fgrad.addColorStop(0,    `rgba(255, 250, 230, ${fa})`);
      fgrad.addColorStop(0.25, `rgba(255, 210, 120, ${fa * 0.9})`);
      fgrad.addColorStop(0.55, `rgba(255, 130, 50,  ${fa * 0.55})`);
      fgrad.addColorStop(1,    `rgba(180, 40, 10,   0)`);
      ctx.fillStyle = fgrad;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // --- Слой 3: обломки (вращающиеся прямоугольники) ---
    for (const p of this.crashParticles) {
      if (p.type !== 'debris') continue;
      const a = Math.max(0, Math.min(1, p.life / 30));
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // --- Слой 4: огонь — поверх всего, с glow, цвет меняется от белого к красному ---
    for (const p of this.crashParticles) {
      if (p.type !== 'fire') continue;
      const t = 1 - p.life / p.maxLife;
      if (t < 0 || t > 1) continue;
      // Палитра: белый-жёлтый → оранжевый → красный → темно-красный
      const r = 255;
      const g = Math.max(30, Math.floor(245 * (1 - t * 1.1)));
      const b = Math.max(15, Math.floor(120 * (1 - t * 2)));
      const alpha = Math.max(0, 1 - t * 0.85);
      // Мягкое внешнее сияние
      const outerR = p.size * 1.7;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, outerR);
      grad.addColorStop(0, `rgba(${r},${Math.min(255, g + 30)},${b + 20},${alpha})`);
      grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.7})`);
      grad.addColorStop(1, `rgba(${r},${Math.max(20, g - 60)},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, outerR, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
