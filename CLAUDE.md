# CLAUDE.md — 03_FlappyBird

## Preview-сервер: порт 8773

Этот проект — часть мульти-проектной мастерской из 4 параллельно ведущихся проектов
в `C:\Users\Александр\Desktop\Claude\`. У каждого закреплён **уникальный порт**,
чтобы preview-серверы могли работать одновременно и не перебивать друг друга.

### Карта портов мастерской

| Проект            | Порт  |
|-------------------|-------|
| 01_RS_GlitterSort | 8771  |
| 02_Words          | 8772  |
| 03_FlappyBird     | 8773  |
| 04_True-or-Do     | 8774  |

**Этот проект всегда работает на порту 8773.**

### Правила (важно для будущих сессий Claude)

- **НЕ меняй** значение `port` в `.claude/launch.json`. Оно зафиксировано намеренно.
- **НЕ ставь** `autoPort: true` — это приведёт к захвату соседнего порта другого проекта мастерской.
- **НЕ добавляй** альтернативные preview-конфигурации (`npx serve`, `npm run dev`, `http-server` и т.п.) на других портах. Если действительно нужен другой запуск — используй тот же порт 8773.
- Если 8773 «занят» — это, скорее всего, прежний инстанс **этого же** проекта. Останови его (`Get-Process python | Stop-Process`), а не переключайся на 8000/5173/8080 — это порты соседей.
- Эта мастерская специально разнесена по портам 8771–8774; не выходи за эти границы и не выбирай порт сам.

## Монетизация: Yandex Mobile Ads (нативный SDK через WebView-bridge)

Проект целится в РуСтор APK. Реклама работает через **нативный Yandex Mobile Ads SDK**, который встраивается в APK инструментом `html2apk` (флаг `-YandexAdsBridge`). JS-сторона дёргает `window.YandexAds.showInterstitial(unitId)` / `showRewarded(unitId)` и слушает `window.__yandexAdsCallback(kind, event)`. В браузерном dev-режиме `window.YandexAds` отсутствует, и `ads.js` автоматически падает в mock с DOM-оверлеем по `#ad-overlay`.

**Полный контракт и Java-код моста:** [docs/ADS.md](docs/ADS.md).

### Unit-ID (Yandex Mobile Ads)

В [config.js](config.js), секция `CONFIG.ads`:
- `unitInterstitial: 'R-M-19273499-1'`
- `unitRewarded:     'R-M-19273499-2'`

Источник: [Yandex Partner / Mobile Ads](https://partner.yandex.ru/mobile-ads).

### Что делает APK-сборщик

`html2apk -YandexAdsBridge -ProjectFolder <thisDir> -AppName "..." -AppId com.terekh.cosmoflight -OutputFile <...>.apk` дополнительно встраивает gradle-зависимость, ACCESS_NETWORK_STATE, `YandexAdsBridge.java` и патчит MainActivity (см. [docs/ADS.md](docs/ADS.md)).

### Правила (для будущих сессий)

- **НЕ возвращай** TODO под `ya.context.AdvManager.render(...)` — это РСЯ для веба, не подходит для APK в РуСтор.
- **НЕ убирай** mock-fallback из `_ensureBackend()` — он нужен для dev-режима в браузере.
- Backend определяется **лениво** при первом показе рекламы. Если хочешь увидеть `[ads] backend=...` лог при старте — потриггерь interstitial или rewarded.
- Контракт `window.__yandexAdsCallback(kind, event)` зафиксирован на стороне Java в html2apk — не меняй имя callback'а в JS.
- Точки вызова рекламы из gameplay (interstitial перед попыткой, rewarded на revive) — в [game.js](game.js). Каденс через `Storage.get('deathsSinceAd')`.

## Сейвы и миграции

Сейв в `localStorage['cosmo.save']` — единый JSON с полем `schemaVersion`. Раньше storage был multi-key (`cosmo.bestScore`, `cosmo.attempts`, ...) — это всё ещё подхватывается через legacy-коллектор при первом запуске и автоматически переезжает в single-key. Спецификация — в [docs/SAVES.md](docs/SAVES.md). Файлы: [storage.js](storage.js), [migrations.js](migrations.js).

### Правила (для будущих сессий)

- **Любое изменение формата сейва ОБЯЗАНО иметь миграцию.** Если меняешь `DEFAULTS` в `storage.js` — добавь функцию в `migrations.js` (ключ N+1).
- **НЕ возвращай multi-key хранение.** Все поля живут в одном JSON под `cosmo.save`. API `Storage.get/set/...` остался прежним.
- **НЕ удаляй и НЕ меняй уже опубликованные миграции.**
- **При запросе релиз-кандидата** используй skill `prepare-release-candidate`.
- Состояние последнего опубликованного релиза — `.claude/release-state.json`. Обновляется автоматически skill'ом `prepare-release-candidate` — после сборки APK он спрашивает «отправляешь в стор?», и при ответе «да» записывает текущую `schemaVersion`/`versionCode`/`versionName` в файл.
