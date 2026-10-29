// Over the Edge: synthesized sound. No files: oscillators and filtered noise, started on
// the first input because browsers block audio before it.
(function () {
  "use strict";

  function Sound() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem("sde.game.edge.muted") === "1";
    } catch (error) {
      // Storage can be blocked; sound stays on.
    }
  }

  Sound.prototype.unlock = function () {
    if (!this.ctx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      var length = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      var data = this.noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  };

  Sound.prototype.setMuted = function (muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
    try {
      localStorage.setItem("sde.game.edge.muted", muted ? "1" : "0");
    } catch (error) {
      // Not remembered across visits then.
    }
  };

  Sound.prototype.tone = function (type, from, to, duration, volume, delay) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime + (delay || 0);
    var osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  };

  Sound.prototype.noise = function (duration, volume, filterType, from, to, delay) {
    if (!this.ctx || this.muted) return;
    var t = this.ctx.currentTime + (delay || 0);
    var src = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    src.buffer = this.noiseBuffer;
    filter.type = filterType;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  };

  Sound.prototype.play = function (name, info) {
    switch (name) {
      case "shot":
        if (info && info.shotgun) {
          this.tone("square", 380, 80, 0.16, 0.1);
          this.noise(0.16, 0.24, "lowpass", 2400, 300);
        } else {
          this.tone("square", 900, 280, 0.08, 0.06);
          this.noise(0.05, 0.08, "highpass", 3000, 1500);
        }
        break;
      case "windup":
        this.tone("sawtooth", 260, 620, 0.42, 0.035);
        break;
      case "lunge":
        this.noise(0.22, 0.14, "bandpass", 700, 2200);
        break;
      case "hit":
        // A shotgun blast lands several pellets at once: one sound for them.
        if (info && info.pellet && this.ctx) {
          if (this.ctx.currentTime - (this.lastPellet || 0) < 0.06) break;
          this.lastPellet = this.ctx.currentTime;
        }
        this.tone("triangle", info && info.heavy ? 160 : 240, 70, 0.14, 0.22);
        this.noise(0.09, 0.15, "lowpass", 1800, 300);
        break;
      case "knock":
        this.tone("sine", 620, 90, 0.8, 0.12);
        this.tone("triangle", 880 + Math.min(6, info.combo) * 120, 880 + Math.min(6, info.combo) * 120, 0.12, 0.08, 0.05);
        break;
      case "shock":
        this.noise(0.55, 0.35, "lowpass", 1400, 80);
        this.tone("sine", 140, 40, 0.5, 0.3);
        break;
      case "hurt":
        this.tone("sawtooth", 180, 70, 0.22, 0.12);
        break;
      case "jump":
        this.tone("sine", 320, 560, 0.12, 0.06);
        break;
      case "dash":
        this.noise(0.18, 0.18, "bandpass", 2400, 600);
        break;
      case "spawn":
        this.tone("sine", 200, 420, 0.3, 0.05);
        break;
      case "pickup":
        [660, 880, 1320].forEach(function (f, i) { this.tone("triangle", f, f, 0.12, 0.1, i * 0.07); }, this);
        break;
      case "wave":
        this.tone("sawtooth", 220, 220, 0.25, 0.07);
        this.tone("sawtooth", 330, 330, 0.35, 0.07, 0.2);
        break;
      case "cleared":
        [523, 659, 784].forEach(function (f, i) { this.tone("triangle", f, f, 0.18, 0.09, i * 0.09); }, this);
        break;
      case "fall":
        this.tone("sine", 500, 60, 1.1, 0.18);
        break;
      case "over":
        [392, 330, 262].forEach(function (f, i) { this.tone("triangle", f, f * 0.98, 0.3, 0.1, i * 0.22); }, this);
        break;
      case "win":
        [523, 659, 784, 1046].forEach(function (f, i) { this.tone("triangle", f, f, 0.3, 0.1, i * 0.14); }, this);
        break;
    }
  };

  window.EdgeSound = Sound;
})();
