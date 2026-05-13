// audio.js — синтез звуков через Web Audio API (без файлов).
// AudioContext создаётся при первом user-gesture, иначе многие браузеры блокируют звук.
import { Storage } from './storage.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ready = false;
  }

  ensure() {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.ctx.destination);
      this.ready = true;
    } catch (e) {
      this.ctx = null;
    }
  }

  // Безопасный резюм для iOS Safari после suspend.
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  enabled() {
    return Storage.get('soundOn') !== false;
  }

  // === SFX ===

  playTap() {
    if (!this.enabled()) return;
    this.ensure();
    if (!this.ready) return;
    this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(440, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.1);
  }

  playScore() {
    if (!this.enabled()) return;
    this.ensure();
    if (!this.ready) return;
    this.resume();
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.18);
  }

  playCrash() {
    if (!this.enabled()) return;
    this.ensure();
    if (!this.ready) return;
    this.resume();
    const t = this.ctx.currentTime;
    // Шум через BufferSource
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.4);
  }

  playWin() {
    if (!this.enabled()) return;
    this.ensure();
    if (!this.ready) return;
    this.resume();
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const start = t + i * 0.09;
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.32, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      o.connect(g).connect(this.master);
      o.start(start);
      o.stop(start + 0.2);
    });
  }

  playBuy() {
    if (!this.enabled()) return;
    this.ensure();
    if (!this.ready) return;
    this.resume();
    const t = this.ctx.currentTime;
    [880, 1175].forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const start = t + i * 0.07;
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.28, start + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      o.connect(g).connect(this.master);
      o.start(start);
      o.stop(start + 0.12);
    });
  }

  // === Вибрация ===
  vibrate(pattern) {
    if (Storage.get('vibrationOn') === false) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  }
}

export const Audio = new AudioEngine();
