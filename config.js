// config.js — все балансные параметры игры.
// Меняй здесь, чтобы настроить сложность, скорость и поведение рекламы.

export const CONFIG = {
  // === Канвас (логические размеры) ===
  canvasLogicalWidth: 432,
  canvasLogicalHeight: 768,

  // === Физика (zero-G) ===
  // Гравитации нет. Каждый тап переключает направление вертикального движения:
  // 1-й тап → вверх (vy = -thrustSpeed), 2-й → вниз (+thrustSpeed), и так далее.
  thrustSpeed: 3.6,        // модуль скорости после "пшика" (px/tick at 60fps)
  thrustPuffMs: 320,       // длительность визуального облачка после тапа

  // === Игрок ===
  player: {
    x: 110,                // постоянная горизонтальная позиция
    width: 44,             // Voyager шире из-за параболической антенны
    height: 52,
    hitboxScale: 0.62,     // bbox заметно меньше визуала — честнее с торчащими антеннами
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
    interstitialAfterDeaths: 3,           // показывать перед каждой N-ной попыткой (после стольких смертей подряд)
    firstAttemptsWithoutAds: 2,           // первые N попыток — без рекламы
    rewardedReviveEnabled: true,
    mockInterstitialSeconds: 2,
    mockRewardedSeconds: 3,
  },

  // === Игровая экономика ===
  startingCoins: 0,
  reviveInvulnerabilitySeconds: 2,

  // === Цвета фона / темы ===
  bg: {
    gradient: ['#0a0e2a', '#1d1145', '#000000'],
    starLayers: 3,
  },
};
