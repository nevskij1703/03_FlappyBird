// ui.js — управление DOM-экранами поверх канваса.
// Game вызывает методы UI для переключения между экранами.
import { Storage } from './storage.js';

export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      score: document.getElementById('hud-score'),
      best: document.getElementById('hud-best'),

      start: document.getElementById('screen-start'),
      startBest: document.getElementById('start-best'),
      btnEndless: document.getElementById('btn-mode-endless'),
      btnSound: document.getElementById('btn-sound'),
      btnLang: document.getElementById('btn-lang'),

      gameover: document.getElementById('screen-gameover'),
      gameoverScore: document.getElementById('gameover-score'),
      gameoverBest: document.getElementById('gameover-best'),
      gameoverNewRecord: document.getElementById('gameover-newrecord'),
      btnRevive: document.getElementById('btn-revive'),
      btnRestart: document.getElementById('btn-restart'),

      pause: document.getElementById('screen-pause'),
      pauseScore: document.getElementById('pause-score'),
      pauseBest: document.getElementById('pause-best'),
      btnPause: document.getElementById('btn-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnSoundPause: document.getElementById('btn-sound-pause'),
      btnLangPause: document.getElementById('btn-lang-pause'),
      btnPrivacy: document.getElementById('btn-privacy'),

      countdown: document.getElementById('countdown'),
      countdownNum: document.getElementById('countdown-num'),
    };
    this.allScreens = [this.el.start, this.el.gameover, this.el.pause];
    this._countdownTimer = null;
  }

  _hideAll() {
    for (const s of this.allScreens) s.classList.add('hidden');
  }

  hideAll() {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.hideCountdown();
  }

  showStart() {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.el.startBest.textContent = String(Storage.get('bestScore') || 0);
    this._syncSoundButtons();
    this._syncLangButton();
    this.el.start.classList.remove('hidden');
  }

  showHud() {
    this._hideAll();
    this.el.hud.classList.remove('hidden');
  }

  updateScore(score) {
    this.el.score.textContent = String(score);
  }

  updateBest(best) {
    this.el.best.textContent = 'Рекорд: ' + String(best);
  }

  showGameOver(score, best, isNewRecord) {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.el.gameoverScore.textContent = String(score);
    this.el.gameoverBest.textContent = String(best);
    this.el.gameoverNewRecord.classList.toggle('hidden', !isNewRecord);
    this.el.gameover.classList.remove('hidden');
  }

  showPause(score, best) {
    this.el.pauseScore.textContent = String(score);
    this.el.pauseBest.textContent = String(best);
    this._syncSoundButtons();
    this._syncLangButton();
    this.el.pause.classList.remove('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
  }

  // Отсчёт 3..2..1 перед возобновлением игры.
  showCountdown(seconds, onDone) {
    this.hideCountdown();
    const overlay = this.el.countdown;
    const num = this.el.countdownNum;
    overlay.classList.remove('hidden');
    let left = seconds;
    this._renderCountdownTick(num, left);

    const step = () => {
      left--;
      if (left <= 0) {
        overlay.classList.add('hidden');
        this._countdownTimer = null;
        onDone?.();
        return;
      }
      this._renderCountdownTick(num, left);
      this._countdownTimer = setTimeout(step, 1000);
    };
    this._countdownTimer = setTimeout(step, 1000);
  }

  _renderCountdownTick(num, value) {
    num.textContent = String(value);
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }

  hideCountdown() {
    if (this._countdownTimer) {
      clearTimeout(this._countdownTimer);
      this._countdownTimer = null;
    }
    this.el.countdown.classList.add('hidden');
  }

  _syncSoundButtons() {
    const sound = Storage.get('soundOn') !== false;
    // Иконка в верхнем левом углу старта — диагональная полоса через ::after
    if (this.el.btnSound) {
      this.el.btnSound.classList.toggle('off', !sound);
    }
    // Слайдер-тоггл в паузе: .off → кружочек слева
    if (this.el.btnSoundPause) {
      this.el.btnSoundPause.classList.toggle('off', !sound);
      this.el.btnSoundPause.setAttribute('aria-checked', String(sound));
    }
  }

  _syncLangButton() {
    const lang = Storage.get('lang') || 'ru';
    const label = lang === 'ru' ? 'RU' : 'ENG';
    // Корнер-кнопка на стартовом экране
    if (this.el.btnLang) {
      this.el.btnLang.textContent = label;
    }
    // Пилюля в окне паузы
    if (this.el.btnLangPause) {
      const t = this.el.btnLangPause.querySelector('.toggle-text');
      if (t) t.textContent = label;
    }
  }

  // Game подаёт колбэки, UI подвешивает на все кнопки.
  bind(handlers) {
    const setClick = (el, fn) => { if (el) el.onclick = fn; };
    setClick(this.el.btnEndless,  () => handlers.startEndless?.());
    setClick(this.el.btnRevive,   () => handlers.revive?.());
    setClick(this.el.btnRestart,  () => handlers.restart?.());
    setClick(this.el.btnPause,    () => handlers.pause?.());
    setClick(this.el.btnResume,   () => handlers.resume?.());

    const onToggleSound = () => { handlers.toggleSound?.(); this._syncSoundButtons(); };
    setClick(this.el.btnSound, onToggleSound);
    setClick(this.el.btnSoundPause, onToggleSound);
    const onToggleLang = () => { handlers.toggleLang?.(); this._syncLangButton(); };
    setClick(this.el.btnLang, onToggleLang);
    setClick(this.el.btnLangPause, onToggleLang);

    setClick(this.el.btnPrivacy, () => handlers.openPrivacy?.());
  }
}
