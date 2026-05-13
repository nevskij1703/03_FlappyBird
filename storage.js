// storage.js — обёртка над localStorage с дефолтами.
// Все ключи имеют префикс 'cosmo.' чтобы не конфликтовать с другими приложениями.

const PREFIX = 'cosmo.';

const DEFAULTS = {
  bestScore: 0,
  attempts: 0,
  deathsSinceAd: 0,
  soundOn: true,
  vibrationOn: true,
  skin: 'default',
  coins: 0,
};

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return DEFAULTS[key];
    return JSON.parse(raw);
  } catch (e) {
    return DEFAULTS[key];
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // localStorage может быть недоступен (приватный режим) — игнорируем
  }
}

export const Storage = {
  get(key) {
    return read(key);
  },
  set(key, value) {
    write(key, value);
  },
  // Удобный инкремент для счётчиков
  increment(key, delta = 1) {
    const current = read(key) || 0;
    const next = current + delta;
    write(key, next);
    return next;
  },
  // Сброс конкретного ключа в дефолт
  reset(key) {
    if (key in DEFAULTS) write(key, DEFAULTS[key]);
  },
  // Полный сброс прогресса
  resetAll() {
    Object.keys(DEFAULTS).forEach((k) => write(k, DEFAULTS[k]));
  },
  // Toggles
  toggle(key) {
    const v = !read(key);
    write(key, v);
    return v;
  },
};
