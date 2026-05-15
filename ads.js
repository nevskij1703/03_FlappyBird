// ads.js — менеджер рекламы.
//
// Архитектура (см. docs/ADS.md):
//   native — html2apk с -YandexAdsBridge экспонирует window.YandexAds.*
//            и шлёт результаты в window.__yandexAdsCallback(kind, event).
//   mock   — DOM-overlay (#ad-overlay) для dev-режима в браузере.
//
// API (совместим с предыдущей версией):
//   Ads.showInterstitialAd()  → Promise<void>
//   Ads.showRewardedAd()      → Promise<boolean>  (true если пользователь досмотрел до награды)
//   Ads.shouldShowInterstitialBeforeAttempt() / markInterstitialShown()  — правила частоты
//   Ads.getBackend()          → 'native' | 'mock'

import { CONFIG } from './config.js';
import { Storage } from './storage.js';

// Минимальный кулдаун между показами interstitial.
// Хранится только в памяти текущей сессии — после перезагрузки сбрасывается.
const INTERSTITIAL_COOLDOWN_MS = 2 * 60 * 1000;

class AdManager {
  constructor() {
    this.overlay = null;
    this.titleEl = null;
    this.timerEl = null;
    this.busy = false;
    this.backend = null;             // определяется в _ensureBackend() ниже
    this.pendingInterstitial = null;
    this.pendingRewarded = null;
    // Время последнего УСПЕШНОГО показа interstitial (performance.now()).
    // Сессионная переменная, не сохраняется в Storage.
    this.lastInterstitialAt = 0;

    // Eager init: определяем backend и запускаем preload СРАЗУ при создании
    // синглтона, не дожидаясь первого showInterstitialAd. Иначе lazy-init
    // запускает preload одновременно с первым show — и Java не успевает
    // прогреть рекламу, первый показ висит 2-3 секунды на сетевой загрузке.
    // К моменту new AdManager() импорты CONFIG/Storage уже резолвлены,
    // а Capacitor зарегистрировал window.YandexAds bridge до загрузки страницы.
    this._ensureBackend();
  }

  _ensureBackend() {
    if (this.backend !== null) return;
    if (CONFIG.ads.mockAds) {
      this.backend = 'mock';
      console.log('[ads] backend=mock (forced by CONFIG.ads.mockAds)');
      return;
    }
    if (typeof window !== 'undefined'
        && window.YandexAds
        && typeof window.YandexAds.showInterstitial === 'function') {
      this.backend = 'native';
      this._setupNativeCallback();
      console.log('[ads] backend=native (YandexAds bridge detected)');
      // Preload первой пары реклам, чтобы первый показ был мгновенным.
      try {
        window.YandexAds.preloadInterstitial(CONFIG.ads.unitInterstitial);
        window.YandexAds.preloadRewarded(CONFIG.ads.unitRewarded);
      } catch (e) { console.warn('[ads] preload skipped:', e); }
      return;
    }
    this.backend = 'mock';
    console.log('[ads] backend=mock (window.YandexAds not present — dev browser)');
  }

  _setupNativeCallback() {
    // Глобальный канал событий от Java-стороны:
    //   window.__yandexAdsCallback(kind, event)
    //     kind:  'interstitial' | 'rewarded'
    //     event: 'closed' | 'rewarded'
    window.__yandexAdsCallback = (kind, event) => {
      if (kind === 'interstitial' && this.pendingInterstitial) {
        const resolve = this.pendingInterstitial;
        this.pendingInterstitial = null;
        resolve();
      }
      if (kind === 'rewarded' && this.pendingRewarded) {
        const resolve = this.pendingRewarded;
        this.pendingRewarded = null;
        resolve(event === 'rewarded');
      }
    };
  }

  _ensureOverlay() {
    if (this.overlay) return;
    this.overlay = document.getElementById('ad-overlay');
    this.titleEl = document.getElementById('ad-title');
    this.timerEl = document.getElementById('ad-timer');
  }

  _showMock(title, seconds) {
    this._ensureOverlay();
    if (!this.overlay) return Promise.resolve();
    this.titleEl.textContent = title;
    this.overlay.classList.remove('hidden');
    return new Promise((resolve) => {
      let left = seconds;
      this.timerEl.textContent = String(left);
      const tick = () => {
        left -= 1;
        if (left <= 0) {
          this.overlay.classList.add('hidden');
          resolve();
          return;
        }
        this.timerEl.textContent = String(left);
        setTimeout(tick, 1000);
      };
      setTimeout(tick, 1000);
    });
  }

  // Interstitial — блокирующая реклама перед стартом следующей попытки.
  async showInterstitialAd() {
    if (this.busy) return;
    this.busy = true;
    try {
      this._ensureBackend();
      if (this.backend === 'native') {
        await new Promise((resolve) => {
          this.pendingInterstitial = resolve;
          try {
            window.YandexAds.showInterstitial(CONFIG.ads.unitInterstitial);
          } catch (err) {
            console.warn('[ads] native interstitial failed', err);
            this.pendingInterstitial = null;
            resolve();
          }
        });
        return;
      }
      await this._showMock('РЕКЛАМА', CONFIG.ads.mockInterstitialSeconds);
    } finally {
      this.busy = false;
    }
  }

  // Rewarded — показывается только по тапу игрока. Возвращает true, если просмотр завершён.
  async showRewardedAd() {
    if (this.busy) return false;
    if (!CONFIG.ads.rewardedReviveEnabled) return false;
    this.busy = true;
    try {
      this._ensureBackend();
      if (this.backend === 'native') {
        return await new Promise((resolve) => {
          this.pendingRewarded = resolve;
          try {
            window.YandexAds.showRewarded(CONFIG.ads.unitRewarded);
          } catch (err) {
            console.warn('[ads] native rewarded failed', err);
            this.pendingRewarded = null;
            resolve(false);
          }
        });
      }
      await this._showMock('РЕКЛАМА (продолжение)', CONFIG.ads.mockRewardedSeconds);
      return true;
    } finally {
      this.busy = false;
    }
  }

  // === Правила показа ===
  shouldShowInterstitialBeforeAttempt() {
    // Сессионный кулдаун. После последнего показа должно пройти минимум
    // INTERSTITIAL_COOLDOWN_MS, даже если игрок успел десяток раз разбиться.
    if (this.lastInterstitialAt > 0) {
      const elapsed = performance.now() - this.lastInterstitialAt;
      if (elapsed < INTERSTITIAL_COOLDOWN_MS) return false;
    }
    const attempts = Storage.get('attempts') || 0;
    if (attempts <= CONFIG.ads.firstAttemptsWithoutAds) return false;
    const deathsSinceAd = Storage.get('deathsSinceAd') || 0;
    return deathsSinceAd >= CONFIG.ads.interstitialAfterDeaths;
  }

  // Вызывается после того, как игрок досмотрел рекламу и вернулся в игру.
  // Сбрасывает счётчик смертей и стартует кулдаун до следующего показа.
  markInterstitialShown() {
    Storage.set('deathsSinceAd', 0);
    this.lastInterstitialAt = performance.now();
  }

  getBackend() {
    return this.backend || 'mock';
  }
}

export const Ads = new AdManager();
