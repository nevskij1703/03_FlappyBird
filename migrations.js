// migrations.js — реестр миграций сейва. См. docs/SAVES.md.
//
// Контракт:
//   migrations[N]: state v(N-1) → state vN  (чистая функция, без сайд-эффектов)
//   getCurrentSchemaVersion() — авто-вывод из max(keys), не дублируем константу
//   runMigrations(state, fromVersion) — каскад от fromVersion до текущей
//
// ⚠️ ПРАВИЛО: после публикации релиза НЕ меняй существующие миграции.

export const migrations = {
  1: (state) => {
    // v0 → v1: переход на single-key схему. К моменту вызова уже произошёл
    // collect из legacy multi-keys (см. storage.js → loadFromLegacyMultiKeys),
    // здесь финализируем структуру. Поля приходят как есть из старого
    // multi-key хранилища — никаких изменений не требуется.
    return state;
  },
};

export function getCurrentSchemaVersion() {
  const keys = Object.keys(migrations).map(Number);
  return keys.length ? Math.max(...keys) : 1;
}

export function runMigrations(state, fromVersion) {
  const current = getCurrentSchemaVersion();
  let v = (typeof fromVersion === 'number') ? fromVersion : 0;
  while (v < current) {
    const fn = migrations[v + 1];
    if (typeof fn !== 'function') {
      throw new Error(`[migrations] Missing migration ${v + 1} (target schemaVersion=${current})`);
    }
    state = fn(state);
    v++;
  }
  return { state, schemaVersion: current };
}
