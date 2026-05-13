// ui.js — управление DOM-экранами поверх канваса.
// Game вызывает методы UI для переключения между экранами.
import { Storage } from './storage.js';
import { LEVELS } from './levels.js';

export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      score: document.getElementById('hud-score'),
      best: document.getElementById('hud-best'),

      start: document.getElementById('screen-start'),
      startBest: document.getElementById('start-best'),
      btnEndless: document.getElementById('btn-mode-endless'),
      btnLevels: document.getElementById('btn-mode-levels'),
      btnSound: document.getElementById('btn-sound'),
      btnVibration: document.getElementById('btn-vibration'),

      gameover: document.getElementById('screen-gameover'),
      gameoverScore: document.getElementById('gameover-score'),
      gameoverBest: document.getElementById('gameover-best'),
      gameoverNewRecord: document.getElementById('gameover-newrecord'),
      btnRevive: document.getElementById('btn-revive'),
      btnRestart: document.getElementById('btn-restart'),
      btnMenu: document.getElementById('btn-menu'),

      levelwin: document.getElementById('screen-levelwin'),
      levelwinNum: document.getElementById('levelwin-num'),
      levelwinReward: document.getElementById('levelwin-reward'),
      btnNextLevel: document.getElementById('btn-next-level'),
      btnLevelwinMenu: document.getElementById('btn-levelwin-menu'),

      levelselect: document.getElementById('screen-levelselect'),
      levelGrid: document.getElementById('level-grid'),
      btnLevelsBack: document.getElementById('btn-levels-back'),

      pause: document.getElementById('screen-pause'),
      btnPause: document.getElementById('btn-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnPauseMenu: document.getElementById('btn-pause-menu'),
      btnSoundPause: document.getElementById('btn-sound-pause'),
      btnVibrationPause: document.getElementById('btn-vibration-pause'),
    };
    this.allScreens = [this.el.start, this.el.gameover, this.el.levelwin, this.el.levelselect, this.el.pause];
  }

  _hideAll() {
    for (const s of this.allScreens) s.classList.add('hidden');
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

  showLevelWin(levelId, reward) {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this.el.levelwinNum.textContent = 'Уровень ' + levelId;
    this.el.levelwinReward.textContent = '+' + reward + ' ⛂';
    this.el.levelwin.classList.remove('hidden');
  }

  showLevelSelect() {
    this._hideAll();
    this.el.hud.classList.add('hidden');
    this._buildLevelGrid();
    this.el.levelselect.classList.remove('hidden');
  }

  _buildLevelGrid() {
    const completed = Storage.get('levelsCompleted') || [];
    this.el.levelGrid.innerHTML = '';
    let highestUnlocked = 1;
    LEVELS.forEach((lvl) => {
      if (completed.includes(lvl.id)) {
        highestUnlocked = Math.max(highestUnlocked, lvl.id + 1);
      }
    });
    LEVELS.forEach((lvl) => {
      const cell = document.createElement('button');
      cell.className = 'level-cell';
      const isCompleted = completed.includes(lvl.id);
      const isLocked = lvl.id > highestUnlocked;
      if (isCompleted) cell.classList.add('completed');
      if (isLocked) cell.classList.add('locked');
      cell.textContent = isLocked ? '🔒' : String(lvl.id);
      cell.dataset.levelId = lvl.id;
      cell.disabled = isLocked;
      this.el.levelGrid.appendChild(cell);
    });
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
    this.el.btnLevels.onclick       = () => handlers.openLevelSelect?.();
    this.el.btnLevelsBack.onclick   = () => handlers.toMenu?.();
    this.el.btnRevive.onclick       = () => handlers.revive?.();
    this.el.btnRestart.onclick      = () => handlers.restart?.();
    this.el.btnMenu.onclick         = () => handlers.toMenu?.();
    this.el.btnNextLevel.onclick    = () => handlers.nextLevel?.();
    this.el.btnLevelwinMenu.onclick = () => handlers.toMenu?.();
    this.el.btnPause.onclick        = () => handlers.pause?.();
    this.el.btnResume.onclick       = () => handlers.resume?.();
    this.el.btnPauseMenu.onclick    = () => handlers.toMenu?.();

    const onToggleSound = () => { handlers.toggleSound?.(); this._syncSoundButtons(); };
    const onToggleVib = () => { handlers.toggleVibration?.(); this._syncSoundButtons(); };
    this.el.btnSound.onclick = onToggleSound;
    this.el.btnVibration.onclick = onToggleVib;
    this.el.btnSoundPause.onclick = onToggleSound;
    this.el.btnVibrationPause.onclick = onToggleVib;

    // Уровни — делегируем клик на сетку
    this.el.levelGrid.addEventListener('click', (e) => {
      const cell = e.target.closest('.level-cell');
      if (!cell || cell.disabled) return;
      const id = Number(cell.dataset.levelId);
      handlers.startLevel?.(id);
    });
  }
}
