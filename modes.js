// modes.js — бесконечный режим с плавной прогрессией.
// Первые 3 попытки игрока проходят с увеличенным коридором и расстоянием
// между поясами — даём новичку освоиться. Дальше — обычная стартовая сложность.
import { CONFIG } from './config.js';
import { Storage } from './storage.js';

// Стартовая поблажка для первых N попыток.
// attempt 1 → multiplier ≈ 1.5, attempt 2 ≈ 1.33, attempt 3 ≈ 1.17, attempt 4+ = 1.
function starterEaseMul(attempts) {
  const RAMP_ATTEMPTS = 3;
  const MAX_EASE = 0.5; // 1 + 0.5 = в полтора раза легче
  const ramp = Math.max(0, (RAMP_ATTEMPTS + 1 - attempts) / RAMP_ATTEMPTS);
  return 1 + MAX_EASE * ramp;
}

export class EndlessMode {
  constructor() {
    this.id = 'endless';
    this.baseSpeed = CONFIG.obstacleSpeed;
    this.baseGap = CONFIG.obstacleGap;
    this.baseSpacing = CONFIG.obstacleSpacing;
  }

  // Динамическая сложность от очков (плавный рост).
  // Учитывается стартовая поблажка по количеству попыток игрока.
  paramsForScore(score) {
    const g = CONFIG.difficultyGrowth;
    const tier = Math.floor(score / 10);
    let speed   = Math.min(g.maxSpeed,    this.baseSpeed + tier * g.speedPer10Points);
    let gap     = Math.max(g.minGap,      this.baseGap   - tier * g.gapShrinkPer10Points);
    let spacing = Math.max(g.minSpacing,  this.baseSpacing - tier * g.spacingShrinkPer10Points);

    const attempts = Storage.get('attempts') || 0;
    const ease = starterEaseMul(attempts);
    if (ease > 1) {
      gap *= ease;
      spacing *= ease;
      // Слегка тормозим первые попытки — даём время сориентироваться.
      speed = speed / (1 + (ease - 1) * 0.5);
    }
    return { speed, gap, spacing };
  }
}
