// ads.js — менеджер рекламы.
// Сейчас работает в mock-режиме (CONFIG.ads.mockAds = true).
// Для подключения Яндекс.Рекламы см. комментарии // TODO: ниже.
import { CONFIG } from './config.js';
import { Storage } from './storage.js';

class AdManager {
  constructor() {
    this.overlay = null;
    this.titleEl = null;
    this.timerEl = null;
    // Текущий промис показа, чтобы не показывать рекламу поверх рекламы
    this.busy = false;
  }

  // Лениво подбирает DOM-узлы overlay.
  _ensureOverlay() {
    if (this.overlay) return;
    this.overlay = document.getElementById('ad-overlay');
    this.titleEl = document.getElementById('ad-title');
    this.timerEl = document.getElementById('ad-timer');
  }

  _show(title, seconds) {
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
      if (CONFIG.ads.mockAds) {
        await this._show('РЕКЛАМА', CONFIG.ads.mockInterstitialSeconds);
        return;
      }
      // TODO: Yandex.Ads — здесь вызвать ya.context.AdvManager.render({...})
      // Пример (после подключения SDK):
      // await new Promise((resolve) => {
      //   window.ya.context.AdvManager.render({
      //     blockId: 'YOUR-BLOCK-ID',
      //     type: 'fullscreen',
      //     onClose: resolve,
      //     onError: resolve,
      //   });
      // });
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
      if (CONFIG.ads.mockAds) {
        await this._show('РЕКЛАМА (продолжение)', CONFIG.ads.mockRewardedSeconds);
        return true;
      }
      // TODO: Yandex.Ads — rewarded
      // return await new Promise((resolve) => {
      //   window.ya.context.AdvManager.render({
      //     blockId: 'YOUR-REWARDED-BLOCK-ID',
      //     type: 'rewarded',
      //     onRewarded: () => resolve(true),
      //     onClose: () => resolve(false),
      //     onError: () => resolve(false),
      //   });
      // });
      return false;
    } finally {
      this.busy = false;
    }
  }

  // === Правила показа ===
  // Вызывать в начале новой попытки (после увеличения attempts).
  shouldShowInterstitialBeforeAttempt() {
    const attempts = Storage.get('attempts') || 0;
    if (attempts <= CONFIG.ads.firstAttemptsWithoutAds) return false;
    const deathsSinceAd = Storage.get('deathsSinceAd') || 0;
    return deathsSinceAd >= CONFIG.ads.interstitialAfterDeaths;
  }

  // Сбрасывает счётчик смертей после показа interstitial.
  markInterstitialShown() {
    Storage.set('deathsSinceAd', 0);
  }
}

export const Ads = new AdManager();
