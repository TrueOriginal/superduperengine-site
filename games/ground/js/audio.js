// Synthesized sound for Landslide (WebAudio, no files): steps, wedge, crystals,
// and a continuous rumble that follows the collapse pressure.
import { STORAGE } from './config.js';

function loadMuted() {
  try {
    return localStorage.getItem(STORAGE.muted) === '1';
  } catch (error) {
    return false;
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = loadMuted();
    this.ready = false;
    this.rumbleGain = null;
    this.rumbleFilter = null;
    this.noiseBuffer = null;
    this.lastStep = 0;
    this.active = true;
  }

  unlock() {
    if (this.muted) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.active) this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch (error) {
      this.ctx = null;
      return;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const len = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    this.noiseBuffer = buffer;
    this.startRumble();
    this.ready = true;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  startRumble() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 110;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    this.rumbleGain = gain;
    this.rumbleFilter = filter;
  }

  setActive(active) {
    this.active = active;
    if (!this.ctx) return;
    if (!active) {
      this.updateRumble(0);
      if (this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = muted;
    try {
      localStorage.setItem(STORAGE.muted, muted ? '1' : '0');
    } catch (error) {
      // private mode: sound setting simply does not persist
    }
    if (this.master) {
      const t = this.now();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.55, t, 0.03);
    }
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  updateRumble(pressure) {
    if (!this.ready || !this.rumbleGain) return;
    const target = Math.max(0, Math.min(1, pressure)) * 0.22;
    const t = this.now();
    this.rumbleGain.gain.setTargetAtTime(target, t, 0.18);
    if (this.rumbleFilter) {
      this.rumbleFilter.frequency.setTargetAtTime(90 + pressure * 120, t, 0.2);
    }
  }

  tone(from, to, dur, type, level, delay = 0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noise(dur, freq, q, level, kind = 'bandpass', delay = 0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = kind;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.03);
  }

  play(name) {
    if (!this.ready || this.muted) return;
    switch (name) {
      case 'step':
        this.noise(0.055, 780 + Math.random() * 260, 1.4, 0.045);
        break;
      case 'jump':
        this.tone(300, 540, 0.11, 'sine', 0.09);
        this.noise(0.05, 1200, 1.2, 0.025);
        break;
      case 'land':
        this.tone(120, 52, 0.12, 'sine', 0.16);
        this.noise(0.07, 420, 0.8, 0.06, 'lowpass');
        break;
      case 'throw':
        this.noise(0.16, 1900, 0.9, 0.07, 'bandpass');
        this.tone(820, 280, 0.16, 'sine', 0.035);
        break;
      case 'thunk':
        this.tone(190, 120, 0.07, 'square', 0.06);
        this.noise(0.045, 1500, 1.1, 0.06);
        this.tone(640, 600, 0.06, 'triangle', 0.045);
        break;
      case 'recall':
        this.tone(260, 1150, 0.2, 'sine', 0.055);
        this.noise(0.16, 2600, 2, 0.025);
        break;
      case 'crystal':
        this.tone(880, 880, 0.1, 'sine', 0.065);
        this.tone(1320, 1320, 0.14, 'sine', 0.045, 0.045);
        break;
      case 'heart':
        this.tone(440, 440, 0.22, 'sine', 0.06);
        this.tone(660, 660, 0.26, 'sine', 0.05, 0.06);
        this.tone(880, 880, 0.3, 'sine', 0.04, 0.12);
        break;
      case 'hurt':
        this.tone(280, 80, 0.24, 'sawtooth', 0.09);
        this.noise(0.2, 700, 0.7, 0.08, 'lowpass');
        break;
      case 'crumble':
        this.noise(0.34, 260, 0.6, 0.08, 'lowpass');
        this.tone(90, 45, 0.28, 'sine', 0.06);
        break;
      case 'finish':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, f, 0.42, 'triangle', 0.06, i * 0.13));
        break;
      case 'gameover':
        [330, 262, 196, 147].forEach((f, i) => this.tone(f, f * 0.98, 0.34, 'sine', 0.06, i * 0.16));
        break;
      case 'heartFull':
        this.tone(700, 900, 0.12, 'sine', 0.05);
        break;
      case 'rock':
        this.noise(0.22, 300, 0.6, 0.06, 'lowpass');
        break;
      case 'warn':
        this.noise(0.16, 520, 1.5, 0.03);
        break;
      default:
        break;
    }
  }
}
