# DEV_NOTES.md — где что лежит и что важно не сломать

## Карта кода

| Что | Где |
|---|---|
| Game loop, state machine, координация модулей | [`game.js`](game.js) — класс `Game`, метод `_tick()` |
| Физика (гравитация, прыжок, поворот, хитбокс) | [`physics.js`](physics.js) — объект `Physics` |
| Генератор препятствий + AABB-коллизии | [`obstacles.js`](obstacles.js) — класс `ObstacleField` |
| Рендер ракеты | [`skins.js`](skins.js) — функция `drawRocket()` |
| Параллакс звёзд + фон | [`game.js`](game.js) — методы `_makeStars()`, `_updateStars()`, `_render()` |
| HUD + DOM-экраны | [`ui.js`](ui.js) — класс `UI` |
| Звук (Web Audio синтез) | [`audio.js`](audio.js) — объект `Audio` |
| Реклама + правила показа | [`ads.js`](ads.js) — объект `Ads`, класс `AdManager` |
| Локальное хранилище | [`storage.js`](storage.js) — объект `Storage`, префикс `cosmo.` |
| Конфиги уровней | [`levels.js`](levels.js) — массив `LEVELS` |
| Режимы (Endless / Level) | [`modes.js`](modes.js) — `EndlessMode`, `LevelMode` |
| Баланс и константы | [`config.js`](config.js) — `CONFIG` |

## Что важно НЕ ломать

### 1. Инвариант "честной" генерации препятствий

В [`obstacles.js`](obstacles.js) `spawn()` ограничивает разницу высоты прохода между соседними столбами через `CONFIG.difficultyGrowth.maxGapDelta` (по умолчанию 150 px). Без этого может появиться пара астероидов, которую физически нельзя пройти при текущей скорости и силе прыжка. **При тюнинге `gravity` / `jumpForce` нужно перепроверить maxGapDelta.**

### 2. Правила показа рекламы

В [`ads.js`](ads.js) методы `shouldShowInterstitialOnDeath()` и `shouldShowInterstitialOnLevelEnd()` — это договор с UX:

- Первые `firstAttemptsWithoutAds` попыток (по умолчанию 2) — без interstitial.
- Затем — каждые `interstitialAfterDeaths` смертей (по умолчанию 3).
- Между уровнями — каждые `interstitialAfterLevels` пройденных (по умолчанию 2).
- **Rewarded запускается ТОЛЬКО по тапу игрока** (`tryRevive` в `game.js`). Никогда автоматически.

### 3. Game loop dt-нормализация

В `_tick(ts)`:
```js
const rawDt = Math.min(40, ts - this.lastTs);
const dt = rawDt / 16.67;
```
`dt` — относительное (1 = кадр 60fps). Все формулы физики и движения умножают на `dt`. Это даёт независимость от FPS. Cap 40ms нужен, чтобы при сворачивании вкладки игра не «прыгала» вперёд.

### 4. Hitbox меньше визуала

`CONFIG.player.hitboxScale = 0.72`. Это намеренно — даёт ощущение «справедливости». Не ставь 1.0, иначе игра будет казаться душной.

### 5. Логические размеры канваса

Канвас всегда 432×768 (`canvasLogicalWidth/Height`). CSS масштабирует под viewport с сохранением пропорций 9:16. Все игровые координаты — в логических пикселях, не зависят от реального размера экрана.

### 6. Audio context — после user gesture

`Audio.ensure()` создаёт AudioContext лениво, при первом тапе. iOS Safari блокирует звук до первого жеста — это обработано. Не зови `Audio.playTap()` в конструкторе.

### 7. localStorage может быть недоступен

В приватном режиме / при квоте — `Storage` молча игнорирует ошибки. Никогда не предполагай, что запись точно прошла.

## Состояния игры (state machine)

```
            ┌──────────┐
            │   MENU   │←──────────────────┐
            └────┬─────┘                   │
              start                        │
            ┌────▼─────┐  pause   ┌──────────┐
            │ PLAYING  │─────────►│  PAUSED  │
            └────┬─────┘  resume  └────┬─────┘
              die│             ▲       │
                 ▼             └───────┘
            ┌──────────┐
            │   DEAD   │──revive──► PLAYING (с invulnerability 2с)
            └────┬─────┘
                 ├─restart─────► PLAYING
                 └─menu────────► MENU

            (LevelMode only)
            ┌─────────────┐
            │  LEVEL_WIN  │─next─► PLAYING (next level)
            └─────────────┘
```

Между `DEAD` и `gameover screen` может быть `AD` (interstitial по правилам).

## Как игра упаковывается в APK

Через WebView. Рекомендуемые варианты:

1. **Cordova / Capacitor** — оборачивают `index.html` в нативное приложение, дают плагины для рекламы, вибрации и т.п. Подходит проще всего.
2. **TWA (Trusted Web Activity)** — для Android, если игра захостена. Уровень native-API ограничен.
3. **Custom WebView в нативном Android-проекте** — максимальный контроль, но больше работы.

В любом случае точка входа — `index.html`. Все ассеты статичные.

### Что учесть при упаковке

- `viewport-fit=cover` в `<meta>` — уже стоит, нужно для notch-устройств.
- `touch-action: manipulation` в CSS — отключает double-tap zoom.
- Если используется Capacitor — настрой `webDir`, чтобы все наши файлы попали в bundle. Полезно сначала минифицировать.
- iOS WebView требует `webkit-` префиксов для некоторых CSS — уже стоят (`-webkit-backdrop-filter`).
- Реклама в WebView: Яндекс.Реклама для веба отлично работает в WebView, отдельной SDK для нативки не нужно. Но проверь, что `document.referrer` приходит правильно — иначе Yandex может не показать ads.

## Отладка

- `window.__game` — экспорт игры для DevTools console. Можно `__game.state`, `__game.score`, `__game.player`, и т.д.
- `localStorage.clear()` или `Storage.resetAll()` — сброс всего прогресса.
- В Chrome DevTools mobile mode (iPhone 12) — портретный режим для проверки.

## Производительность

Текущая нагрузка на render:
- Параллакс: ~160 fillRect per frame (3 слоя звёзд).
- Препятствия: 1-3 пары на экране, ~30 fillRect суммарно (включая кратеры).
- Игрок: ~10 path-операций.

На бюджетных Android — стабильные 60fps. Если оптимизировать дальше — кэшировать астероиды в offscreen-canvas, нарисованные один раз по seed.
