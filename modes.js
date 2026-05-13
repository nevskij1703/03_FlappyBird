// modes.js — режимы игры: бесконечный и уровневый.
// Каждый режим описывает: стартовые параметры (speed/gap/spacing), условие победы и пересчёт сложности.
import { CONFIG } from './config.js';
import { getLevel } from './levels.js';

export class EndlessMode {
  constructor() {
    this.id = 'endless';
    this.baseSpeed = CONFIG.obstacleSpeed;
    this.baseGap = CONFIG.obstacleGap;
    this.baseSpacing = CONFIG.obstacleSpacing;
  }

  // Динамическая сложность от очков (плавный рост).
  paramsForScore(score) {
    const g = CONFIG.difficultyGrowth;
    const tier = Math.floor(score / 10);
    return {
      speed:   Math.min(g.maxSpeed,    this.baseSpeed + tier * g.speedPer10Points),
      gap:     Math.max(g.minGap,      this.baseGap   - tier * g.gapShrinkPer10Points),
      spacing: Math.max(g.minSpacing,  this.baseSpacing - tier * g.spacingShrinkPer10Points),
    };
  }

  isWon(/* state */) { return false; }
}

export class LevelMode {
  constructor(levelId) {
    this.id = 'level';
    this.level = getLevel(levelId);
  }

  paramsForScore(/* score */) {
    return {
      speed: this.level.speed,
      gap: this.level.gap,
      spacing: this.level.spacing,
    };
  }

  isWon(state) {
    return state.score >= this.level.target;
  }

  getTarget() {
    return this.level.target;
  }

  getLevelId() {
    return this.level.id;
  }

  getName() {
    return this.level.name;
  }
}
