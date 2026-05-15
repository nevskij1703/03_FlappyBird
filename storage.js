// storage.js — обёртка над localStorage с системой миграций сейва.
// См. docs/SAVES.md (контракт) и migrations.js (реестр миграций).
//
// Внутри single-key: всё хранится в одном localStorage entry `cosmo.save`.
// Внешний API (Storage.get/set/increment/reset/toggle) совместим с прошлой
// multi-key версией — gameplay-код не нужно править.

import { runMigrations, getCurrentSchemaVersion } from './migrations.js';

const STORAGE_KEY = 'cosmo.save';

// Legacy multi-key поля — оставлены здесь для одноразового collect'а
// при первом запуске нового кода. После миграции v0→v1 эти ключи
// в localStorage удаляются.
const LEGACY_PREFIX = 'cosmo.';
const LEGACY_FIELDS = [
  'bestScore', 'attempts', 'deathsSinceAd', 'soundOn',
  'vibrationOn', 'lang', 'skin', 'coins', 'ratedInStore'
];

const DEFAULTS = () => ({
  schemaVersion: getCurrentSchemaVersion(),
  bestScore: 0,
  attempts: 0,
  deathsSinceAd: 0,
  soundOn: true,
  vibrationOn: true,  // вибрация по умолчанию включена, тумблер удалён из UI
  lang: 'ru',         // зарезервировано под локализацию
  skin: 'default',
  coins: 0,
  ratedInStore: false,
});

let cached = null;

function loadFromLegacyMultiKeys() {
  // Считываем старые отдельные ключи. Возвращает собранный объект
  // или null если ни одного legacy-ключа не найдено (= свежий юзер).
  const collected = {};
  let foundAny = false;
  for (const field of LEGACY_FIELDS) {
    const raw = localStorage.getItem(LEGACY_PREFIX + field);
    if (raw !== null) {
      foundAny = true;
      try { collected[field] = JSON.parse(raw); } catch { /* skip битое */ }
    }
  }
  return foundAny ? collected : null;
}

function cleanupLegacyKeys() {
  for (const field of LEGACY_FIELDS) {
    try { localStorage.removeItem(LEGACY_PREFIX + field); } catch {}
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (e) {
    console.warn('[storage] save failed', e);
  }
}

function load() {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let parsed = null;
    let fromVersion = 0;
    let cameFromLegacy = false;

    if (raw) {
      parsed = JSON.parse(raw);
      fromVersion = (typeof parsed.schemaVersion === 'number') ? parsed.schemaVersion : 0;
    } else {
      // Single-key entry нет — возможно legacy multi-key сейв.
      const legacy = loadFromLegacyMultiKeys();
      if (legacy) {
        parsed = legacy;
        fromVersion = 0;
        cameFromLegacy = true;
      }
    }

    if (parsed === null) {
      // Совсем новый юзер — никаких сейвов нет.
      cached = DEFAULTS();
      persist();
      return cached;
    }

    const target = getCurrentSchemaVersion();

    if (fromVersion > target) {
      // Сейв из будущего (даунгрейд кода). Бэкап, дефолты.
      console.warn(`[storage] save schemaVersion=${fromVersion} > code=${target}, resetting`);
      try { localStorage.setItem(`${STORAGE_KEY}_backup_future_v${fromVersion}`, raw || JSON.stringify(parsed)); } catch {}
      cached = DEFAULTS();
      persist();
      return cached;
    }

    let state = parsed;
    if (fromVersion < target) {
      const result = runMigrations(parsed, fromVersion);
      state = result.state;
      state.schemaVersion = result.schemaVersion;
    }

    cached = { ...DEFAULTS(), ...state, schemaVersion: target };
    persist();
    if (cameFromLegacy) cleanupLegacyKeys();
    return cached;
  } catch (e) {
    console.warn('[storage] load failed, using defaults', e);
    cached = DEFAULTS();
    return cached;
  }
}

export const Storage = {
  get(key) {
    const state = load();
    if (key in state) return state[key];
    const def = DEFAULTS();
    return (key in def) ? def[key] : undefined;
  },
  set(key, value) {
    load();
    cached[key] = value;
    persist();
  },
  // Инкремент для счётчиков (attempts, deathsSinceAd, ...)
  increment(key, delta = 1) {
    load();
    const current = (typeof cached[key] === 'number') ? cached[key] : 0;
    cached[key] = current + delta;
    persist();
    return cached[key];
  },
  // Сброс конкретного ключа в дефолт
  reset(key) {
    const def = DEFAULTS();
    if (key in def) {
      load();
      cached[key] = def[key];
      persist();
    }
  },
  // Полный сброс прогресса (но сохраняем schemaVersion = current)
  resetAll() {
    cached = DEFAULTS();
    persist();
  },
  // Toggle для boolean флагов (soundOn, vibrationOn, ...)
  toggle(key) {
    load();
    cached[key] = !cached[key];
    persist();
    return cached[key];
  },
};
