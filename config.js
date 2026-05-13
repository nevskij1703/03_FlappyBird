// config.js — все балансные параметры игры.
// Меняй здесь, чтобы настроить сложность, скорость и поведение рекламы.

export const CONFIG = {
  // === Канвас (логические размеры) ===
  canvasLogicalWidth: 432,
  canvasLogicalHeight: 768,

  // === Физика ===
  gravity: 0.45,           // ускорение свободного падения (px/tick²)
  jumpForce: -8.0,         // вертикальный импульс при тапе
  maxFallSpeed: 11,        // ограничение скорости падения
  rotationFactor: 0.06,    // насколько vy влияет на угол ракеты

  // === Игрок ===
  player: {
    x: 110,                // постоянная горизонтальная позиция
    width: 36,
    height: 48,
    hitboxScale: 0.72,     // bbox чуть меньше визуала — честнее
  },

  // === Препятствия ===
  obstacleSpeed: 2.6,
  obstacleGap: 175,        // вертикальный проход
  obstacleSpacing: 250,    // горизонт. дистанция между парами
  obstacleWidth: 72,
  obstacleMinMargin: 60,   // отступ прохода от верха/низа

  // === Плавная прогрессия сложности ===
  difficultyGrowth: {
    speedPer10Points: 0.25,
    gapShrinkPer10Points: 6,
    spacingShrinkPer10Points: 8,
    maxSpeed: 5.5,
    minGap: 125,
    minSpacing: 190,
    maxGapDelta: 150,      // насколько gapY может сместиться от предыдущего
  },

  // === Реклама ===
  ads: {
    mockAds: true,                        // TODO: false — для боевого режима с реальной рекламой
    interstitialAfterDeaths: 3,           // показывать каждую N-ную смерть
    interstitialAfterLevels: 2,           // показывать после каждого N уровня
    firstAttemptsWithoutAds: 2,           // первые N попыток — без рекламы
    rewardedReviveEnabled: true,
    mockInterstitialSeconds: 2,
    mockRewardedSeconds: 3,
  },

  // === Игровая экономика ===
  startingCoins: 0,
  reviveInvulnerabilitySeconds: 2,
  levelReward: 10,

  // === Цвета фона / темы ===
  bg: {
    gradient: ['#0a0e2a', '#1d1145', '#000000'],
    starLayers: 3,
  },
};
