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
      btnVibration: document.getElementById('btn-vibration'),

      gameover: document.getElementById('screen-gameover'),
      gameoverScore: document.getElementById('gameover-score'),
      gameoverBest: document.getElementById('gameover-best'),
      gameoverNewRecord: document.getElementById('gameover-newrecord'),
      btnRevive: document.getElementById('btn-revive'),
      btnRestart: document.getElementById('btn-restart'),
      btnMenu: document.getElementById('btn-menu'),

      pause: document.getElementById('screen-pause'),
      btnPause: document.getElementById('btn-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnPauseMenu: document.getElementById('btn-pause-menu'),
      btnSoundPause: document.getElementById('btn-sound-pause'),
      btnVibrationPause: document.getElementById('btn-vibration-pause'),
    };
    this.allScreens = [this.el.start, this.el.gameover, this.el.pause];
  }

  _hideAll() {
    for (const s of this.allScreens) s.classList.add('hidden');
  }

  // Скрыть и экраны, и HUD (используется на время показа interstitial-рекламы).
  hideAll() {
    this._hideAll();
    this.el.hud.classList.add('hidden');
  }

  showStart() {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.el.startBest.textContent = String(Storage.get('bestScore') || 0);
    this._syncSoundButtons();
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
    this.el.best.textContent = '★ ' + String(best);
  }

  showGameOver(score, best, isNewRecord) {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.el.gameoverScore.textContent = String(score);
    this.el.gameoverBest.textContent = String(best);
    this.el.gameoverNewRecord.classList.toggle('hidden', !isNewRecord);
    this.el.gameover.classList.remove('hidden');
  }

  showPause() {
    this._syncSoundButtons();
    this.el.pause.classList.remove('hidden');
  }

  hidePause() {
    this.el.pause.classList.add('hidden');
  }

  _syncSoundButtons() {
    const sound = Storage.get('soundOn') !== false;
    const vib = Storage.get('vibrationOn') !== false;
    [this.el.btnSound, this.el.btnSoundPause].forEach((b) => {
      if (!b) return;
      b.textContent = sound ? '🔊' : '🔇';
      b.classList.toggle('off', !sound);
    });
    [this.el.btnVibration, this.el.btnVibrationPause].forEach((b) => {
      if (!b) return;
      b.textContent = vib ? '📳' : '📴';
      b.classList.toggle('off', !vib);
    });
  }

  // Удобный bind — Game подаёт колбэки, UI подвешивает на все кнопки.
  bind(handlers) {
    this.el.btnEndless.onclick      = () => handlers.startEndless?.();
    this.el.btnRevive.onclick       = () => handlers.revive?.();
    this.el.btnRestart.onclick      = () => handlers.restart?.();
    this.el.btnMenu.onclick         = () => handlers.toMenu?.();
    this.el.btnPause.onclick        = () => handlers.pause?.();
    this.el.btnResume.onclick       = () => handlers.resume?.();
    this.el.btnPauseMenu.onclick    = () => handlers.toMenu?.();

    const onToggleSound = () => { handlers.toggleSound?.(); this._syncSoundButtons(); };
    const onToggleVib = () => { handlers.toggleVibration?.(); this._syncSoundButtons(); };
    this.el.btnSound.onclick = onToggleSound;
    this.el.btnVibration.onclick = onToggleVib;
    this.el.btnSoundPause.onclick = onToggleSound;
    this.el.btnVibrationPause.onclick = onToggleVib;
  }
}
