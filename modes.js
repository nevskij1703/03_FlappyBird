// modes.js — бесконечный режим с плавной прогрессией.
import { CONFIG } from './config.js';

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
}
