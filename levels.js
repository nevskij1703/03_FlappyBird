// levels.js — 10 предустановленных уровней с растущей сложностью.
// Каждый — фиксированные стартовые параметры и цель (target — очки для победы).
export const LEVELS = [
  { id: 1,  target: 8,   speed: 2.4, gap: 195, spacing: 270, name: 'Старт' },
  { id: 2,  target: 10,  speed: 2.6, gap: 185, spacing: 260, name: 'Орбита' },
  { id: 3,  target: 12,  speed: 2.8, gap: 175, spacing: 250, name: 'Пояс' },
  { id: 4,  target: 15,  speed: 3.0, gap: 170, spacing: 245, name: 'Сектор-7' },
  { id: 5,  target: 18,  speed: 3.2, gap: 165, spacing: 235, name: 'Туманность' },
  { id: 6,  target: 20,  speed: 3.5, gap: 160, spacing: 225, name: 'Метеоры' },
  { id: 7,  target: 25,  speed: 3.8, gap: 155, spacing: 215, name: 'Поток' },
  { id: 8,  target: 28,  speed: 4.1, gap: 148, spacing: 205, name: 'Шторм' },
  { id: 9,  target: 32,  speed: 4.4, gap: 142, spacing: 200, name: 'Бездна' },
  { id: 10, target: 40,  speed: 4.8, gap: 138, spacing: 195, name: 'Финал' },
];

export function getLevel(id) {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}

export function totalLevels() {
  return LEVELS.length;
}
