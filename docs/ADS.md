# Яндекс-реклама — интеграция (03_FlappyBird / Космо-Полёт)

Игра использует синглтон `Ads` из [ads.js](../ads.js), который определяет backend **лениво** при первом показе:

| Backend | Условие | Когда применяется |
|---|---|---|
| `native` | `window.YandexAds.showInterstitial` существует | Production APK (html2apk c `-YandexAdsBridge`) |
| `mock` | `window.YandexAds` отсутствует или `CONFIG.ads.mockAds = true` | dev в браузере |

Никакой веб-SDK слой (`ya.context.AdvManager.render`, РСЯ `context.js`) **не подключается** — проект целится только в РуСтор APK.

## Слоты рекламы

| Слот | Когда показывается | Метод | unit-ID |
|---|---|---|---|
| **Interstitial** | Перед началом новой попытки, если `shouldShowInterstitialBeforeAttempt()` вернул true | `Ads.showInterstitialAd()` | `CONFIG.ads.unitInterstitial` |
| **Rewarded** | По клику «ВОЗРОДИТЬСЯ» на экране смерти (только по инициативе игрока) | `Ads.showRewardedAd()` | `CONFIG.ads.unitRewarded` |

Точки вызова — [game.js](../game.js):147–153 (interstitial перед раундом), 210–213 (rewarded на revive).

**Каденс interstitial:**
- Первые `CONFIG.ads.firstAttemptsWithoutAds` попыток (по умолчанию 2) — без рекламы.
- Дальше — каждый `CONFIG.ads.interstitialAfterDeaths`-й death подряд (по умолчанию 3).
- Счётчик `deathsSinceAd` в [storage.js](../storage.js); сбрасывается `Ads.markInterstitialShown()`.

Unit-ID в [config.js](../config.js):
- Interstitial: `R-M-19273499-1`
- Rewarded: `R-M-19273499-2`

Источник: [Yandex Partner Mobile Ads](https://partner.yandex.ru/mobile-ads).

## Сборка APK с включённым Yandex Mobile Ads

```
& "$env:LOCALAPPDATA\Programs\html2apk\html2apk.ps1" `
  -ProjectFolder "C:\Users\Александр\Desktop\Claude\03_FlappyBird" `
  -AppName "Космо-Полёт" `
  -AppId "com.terekh.cosmoflight" `
  -OutputFile "$env:USERPROFILE\Downloads\CosmoFlight.apk" `
  -YandexAdsBridge
```

html2apk автоматически добавляет gradle-зависимость, ACCESS_NETWORK_STATE, `YandexAdsBridge.java` и патчит MainActivity. Подробности — в `01_RS_GlitterSort/docs/ADS.md` (там же полный исходник Java-моста).

## Контракт callback'ов от Java

```js
window.__yandexAdsCallback(kind, event)
// kind:  'interstitial' | 'rewarded'
// event: 'closed' | 'rewarded'
```

- `interstitial` всегда завершается событием `closed`.
- `rewarded` приходит с `rewarded`, если пользователь досмотрел до конца; иначе `closed`.

Имя callback'а зафиксировано в Java-классе `YandexAdsBridge` и не должно меняться в JS.

## Mock backend (dev)

В браузере без bridge'а `ads.js` показывает фиксированный DOM-оверлей `#ad-overlay` (он лежит в `index.html`) со счётчиком секунд. Длительности — `CONFIG.ads.mockInterstitialSeconds` / `mockRewardedSeconds`.

`Ads.showInterstitialAd()` → resolves когда оверлей закрылся.
`Ads.showRewardedAd()` → `true` (mock всегда даёт reward).

## Проверка backend

В DevTools-консоли (после первого показа рекламы, потому что lazy-init):
```js
import('./ads.js').then(m => console.log(m.Ads.getBackend()));  // 'native' | 'mock'
```

Если ещё ничего не показывалось — будет `'mock'` дефолт (потому что initial value backend=null трактуется как 'mock'). Подожди первого триггера.

## Где смотреть в коде

- Backend detection: [ads.js](../ads.js) → `_ensureBackend()`.
- Native bridge logic: [ads.js](../ads.js) → `showInterstitialAd()` / `showRewardedAd()` (ветка `if (this.backend === 'native')`).
- Mock fallback: [ads.js](../ads.js) → `_showMock()`.
- Каденс: [ads.js](../ads.js) → `shouldShowInterstitialBeforeAttempt()` + [game.js](../game.js) триггеры.
