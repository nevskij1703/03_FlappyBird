# Сейв и миграции (03_FlappyBird / Космо-Полёт)

## Структура (после миграции v0 → v1)

LocalStorage-ключ: `cosmo.save`. Единый JSON:

```json
{
  "schemaVersion": 1,
  "bestScore": 39,
  "attempts": 12,
  "deathsSinceAd": 1,
  "soundOn": true,
  "vibrationOn": true,
  "lang": "ru",
  "skin": "default",
  "coins": 0,
  "ratedInStore": false
}
```

**До миграции** (legacy v0) каждое поле жило в отдельном localStorage entry: `cosmo.bestScore`, `cosmo.attempts`, ..., `cosmo.ratedInStore`. При первом запуске нового кода [storage.js](../storage.js) автоматически собирает их в единый JSON и удаляет старые ключи.

## Контракт

- [migrations.js](../migrations.js) — реестр миграций. Каждая миграция — чистая функция `(state) => state`.
- [storage.js](../storage.js) при `load()`:
  1. Пытается прочитать single-key `cosmo.save`.
  2. Если его нет — ищет legacy multi-keys (`cosmo.bestScore`, ...) и собирает их в объект.
  3. Прогоняет результат через `runMigrations()` каскадно от `fromVersion` (default 0) до `getCurrentSchemaVersion()`.
  4. Сохраняет результат в single-key, удаляет legacy.

API `Storage.get/set/increment/reset/toggle/resetAll` — совместим с прошлой версией. Gameplay-код не правится.

## Как добавить новую миграцию

1. В коде поменялся формат сейва (добавили/переименовали/удалили поле). До этой правки `getCurrentSchemaVersion()` возвращал, например, 3.
2. В [migrations.js](../migrations.js) добавь функцию `4: (state) => { /* v3 → v4 */ return state; }`.
3. Обнови `DEFAULTS` в [storage.js](../storage.js) — новая структура.
4. После публикации в РуСтор обнови `.claude/release-state.json` (`lastPublishedSchemaVersion: 4`).

## ⚠️ Правила

- **Не меняй уже опубликованную миграцию.** Меняй только последнюю до публикации.
- **Миграции — defensive**: используй `?? defaultValue` для отсутствующих полей.
- **Каскадные** — каждая запускается ровно один раз для каждого юзера.

## Проверка перед релизом

Skill `prepare-release-candidate` перед сборкой запускает **полный self-test**: пустой сейв прогоняется через **все** миграции в реестре, проверяется корректность результата. Если что-то падает — сборка релиза не запускается.

## Опубликованный релиз

`.claude/release-state.json` обновляется **автоматически** skill'ом `prepare-release-candidate` после того, как пользователь подтвердил, что отправляет собранный APK в стор. Если не подтвердил — файл не трогается, при следующем RC та же база для сравнения.
