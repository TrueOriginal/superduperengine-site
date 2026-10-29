/* Sky Lantern: sound, all synthesised with WebAudio. No files. The context is created on the first
   key press or tap (browsers keep sound off until then); a mute button and the M key switch it off again.
   Layers: a slow lo-fi loop in the zone's key (chords, bass, soft drums, plucks into an echo), the flame
   (a soft crackle), rain, wind, an alarm only while the flame runs low or just after the paper tears, and
   one-shot effects (star chimes, ember, tear, flame out, thunder, dawn). */
(function (SKY) {
  "use strict";

  var U = SKY.U, S = SKY.Sim, W = SKY.W;
  var A = {};
  var KEY = "sde.game.air.mute";

  var ctx = null, master = null, sfx = null, amb = null, send = null, noise = null, crackleBuf = null, rumbleBuf = null;
  var gFlame, fFlame, gCrack, gRain, gWind, fWind, music, musicLp;
  var muted = U.store.get(KEY) === "1";
  var suspended = false;
  var nextStep = 0, step = 0, alarm = 0, tearPulse = 0, beatIn = 0, sirenIn = 0, gFlameV = 0, gRainV = 0, gWindV = 0, gCrackV = 0;
  var okInit = false;

  /* Scales as semitone steps from the zone root. */
  var ROOTS = [110.0, 98.0, 87.31, 82.41, 130.81];
  var SCALES = [[0, 3, 5, 7, 10], [0, 3, 5, 7, 10], [0, 2, 5, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 7, 9]];
  var CHIME = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  function hz(root, semis) { return root * Math.pow(2, semis / 12); }

  function makeNoise(seconds, kind) {
    var rate = ctx.sampleRate, n = Math.floor(rate * seconds), buf = ctx.createBuffer(1, n, rate), d = buf.getChannelData(0), i, last = 0, b0 = 0, b1 = 0, b2 = 0, w;
    for (i = 0; i < n; i++) {
      w = Math.random() * 2 - 1;
      if (kind === "pink") { b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      else if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  function loopSource(buf, dest, type, freq, q) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = buf; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
    src.connect(f); f.connect(dest);
    src.start(0, Math.random() * 1.5);
    return f;
  }

  function init() {
    var AC = window.AudioContext || window.webkitAudioContext, comp, d, fb, lp, i, g;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.9; sfx.connect(master);
    amb = ctx.createGain(); amb.gain.value = 0.8; amb.connect(master);

    /* a soft echo shared by bells and chimes */
    send = ctx.createGain(); send.gain.value = 0.34;
    d = ctx.createDelay(1.0); d.delayTime.value = 0.34;
    fb = ctx.createGain(); fb.gain.value = 0.4;
    lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2300;
    send.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);

    noise = makeNoise(2.2, "pink");
    rumbleBuf = makeNoise(3.5, "brown");
    /* crackle: sparse little pops */
    var rate = ctx.sampleRate, n = Math.floor(rate * 3), data;
    crackleBuf = ctx.createBuffer(1, n, rate); data = crackleBuf.getChannelData(0);
    for (i = 0; i < 70; i++) {
      var at = Math.floor(Math.random() * (n - 800)), len = 60 + Math.floor(Math.random() * 500), amp = 0.25 + Math.random() * 0.75;
      for (var j = 0; j < len; j++) data[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len * 0.28));
    }

    g = ctx.createGain(); g.gain.value = 0; gFlame = g; g.connect(amb);
    fFlame = loopSource(noise, g, "bandpass", 500, 0.7);
    gCrack = ctx.createGain(); gCrack.gain.value = 0; gCrack.connect(amb);
    loopSource(crackleBuf, gCrack, "highpass", 1400, 0.5);
    gRain = ctx.createGain(); gRain.gain.value = 0; gRain.connect(amb);
    loopSource(makeNoise(2, "white"), gRain, "highpass", 2400, 0.5);
    gWind = ctx.createGain(); gWind.gain.value = 0; gWind.connect(amb);
    fWind = loopSource(rumbleBuf, gWind, "bandpass", 380, 0.6);

    /* the music bus: everything musical goes through one low-pass that danger closes */
    musicLp = ctx.createBiquadFilter(); musicLp.type = "lowpass"; musicLp.frequency.value = 2400; musicLp.Q.value = 0.3;
    music = ctx.createGain(); music.gain.value = 0;
    music.connect(musicLp); musicLp.connect(amb); musicLp.connect(send);
    okInit = true;
    A.graph = { ctx: ctx, master: master };
    return true;
  }

  /* Call from a user gesture. Safe to call many times. */
  A.unlock = function () {
    if (!ctx && !init()) return;
    if (ctx.state === "suspended" && !suspended) { try { ctx.resume(); } catch (e) { /* ignore */ } }
  };
  A.isMuted = function () { return muted; };
  A.setMuted = function (m) {
    muted = !!m;
    U.store.set(KEY, muted ? "1" : "0");
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.04);
  };
  A.pause = function () { suspended = true; if (ctx && ctx.state === "running") { try { ctx.suspend(); } catch (e) { /* ignore */ } } };
  A.resume = function () { suspended = false; if (ctx && ctx.state === "suspended") { try { ctx.resume(); } catch (e) { /* ignore */ } } };

  /* ---- Building blocks ---- */
  function tone(freq, t0, dur, type, gain, dest, slideTo, attack) {
    var o = ctx.createOscillator(), g = ctx.createGain(), at = attack || 0.012;
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function burst(t0, dur, type, f0, f1, q, gain, dest, buf) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf || noise;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.2, dur + 0.05);
  }
  function ready() { return ctx && okInit && !muted && ctx.state === "running"; }

  /* ---- One-shot effects ---- */
  A.star = function (chain) {
    if (!ready()) return;
    var t0 = ctx.currentTime, f = hz(659.25, CHIME[Math.min(chain, CHIME.length - 1)] - 12 + (chain > 5 ? 0 : 0));
    tone(f, t0, 1.1, "sine", 0.17, sfx);
    tone(f * 2.003, t0, 0.7, "sine", 0.06, sfx);
    tone(f * 3.01, t0, 0.35, "sine", 0.03, sfx);
    tone(f, t0, 1.1, "sine", 0.06, send);
  };
  A.ember = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 0.28, "lowpass", 1800, 260, 0.8, 0.16, sfx);
    tone(180, t0, 0.3, "sine", 0.16, sfx, 440);
    tone(660, t0 + 0.08, 0.5, "triangle", 0.07, sfx);
    tone(990, t0 + 0.14, 0.45, "sine", 0.045, send);
  };
  A.emberFull = function () { if (ready()) tone(880, ctx.currentTime, 0.22, "sine", 0.05, sfx); };
  A.firefly = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    tone(1250, t0, 0.14, "sine", 0.06, sfx, 1650);
    tone(1850, t0 + 0.05, 0.18, "sine", 0.03, send);
  };
  A.tear = function () {
    tearPulse = 1;
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 0.26, "bandpass", 3200, 700, 0.8, 0.34, sfx);
    burst(t0 + 0.02, 0.12, "highpass", 3800, 1800, 0.5, 0.2, sfx);
    tone(98, t0, 0.3, "sine", 0.3, sfx, 52);
  };
  A.floor = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 0.2, "lowpass", 900, 150, 0.7, 0.22, sfx);
    tone(120, t0, 0.22, "sine", 0.22, sfx, 60);
  };
  A.splash = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 0.5, "bandpass", 2400, 500, 0.7, 0.26, sfx);
    burst(t0 + 0.03, 0.3, "highpass", 4000, 2000, 0.5, 0.14, sfx);
    tone(180, t0, 0.25, "sine", 0.16, sfx, 70);
  };
  A.flameOut = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 1.1, "bandpass", 1500, 120, 0.9, 0.22, sfx);
    tone(330, t0, 1.0, "sine", 0.1, sfx, 70, 0.04);
  };
  A.paperDeath = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 0.9, "bandpass", 2600, 400, 0.6, 0.3, sfx);
    tone(220, t0, 0.8, "triangle", 0.12, sfx, 55);
  };
  A.douse = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 0.5, "highpass", 4200, 1800, 0.5, 0.18, sfx);
  };
  A.thunder = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    burst(t0, 2.2, "lowpass", 260, 50, 0.6, 0.5, sfx, rumbleBuf);
  };
  A.zone = function (z) {
    if (!ready()) return;
    var t0 = ctx.currentTime, r = ROOTS[z] * 4, sc = SCALES[z], i;
    for (i = 0; i < 3; i++) tone(hz(r, sc[(i * 2) % 5] + (i > 2 ? 12 : 0)), t0 + i * 0.22, 1.6, "sine", 0.07, sfx);
    tone(hz(r, sc[0]), t0, 2.2, "sine", 0.05, send);
  };
  A.finale = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime, i, notes = [0, 4, 7, 12, 16, 19, 24, 28];
    for (i = 0; i < notes.length; i++) {
      tone(hz(261.63, notes[i]), t0 + i * 0.32, 2.6, "sine", 0.13 - i * 0.005, sfx);
      tone(hz(261.63, notes[i]) * 2, t0 + i * 0.32, 1.8, "sine", 0.04, send);
    }
    tone(hz(130.81, 0), t0, 6, "triangle", 0.12, sfx, undefined, 1.5);
    tone(hz(130.81, 7), t0, 6, "triangle", 0.08, sfx, undefined, 1.8);
  };
  A.click = function () { if (ready()) tone(520, ctx.currentTime, 0.07, "triangle", 0.07, sfx, 380); };
  A.lowPulse = function () {
    if (!ready()) return;
    var t0 = ctx.currentTime;
    tone(150, t0, 0.18, "sine", 0.16, sfx, 90);
    tone(150, t0 + 0.2, 0.2, "sine", 0.12, sfx, 80);
  };

  /* ---- Per-frame mix ---- */
  function nearestRain() {
    var V = W.VOLS, i, v, best = 1e9, dx;
    for (i = 0; i < V.length; i++) {
      v = V[i];
      if (!v.on || v.type !== 2) continue;
      dx = S.D < v.x0 ? v.x0 - S.D : (S.D > v.x1 ? S.D - v.x1 : 0);
      if (dx < best) best = dx;
    }
    return best;
  }

  A.update = function (dt) {
    if (!ctx || !okInit || suspended) return;
    var now = ctx.currentTime, playing = S.mode === "play" || S.mode === "finale";
    var heat = playing ? S.heat : 0, held = S.held && playing;
    // The flame and the wind stay quiet and high: low steady noise is what read as a hum.
    var targetFlame = playing ? Math.pow(Math.max(0, heat - 0.1), 1.2) * 0.06 * (S.fuel > 0 ? 1 : 0) : 0;
    var rd = nearestRain();
    var targetRain = playing ? Math.min(0.32, S.wet * 0.3 + Math.max(0, 1 - rd / 700) * 0.1) : 0;
    var targetWind = playing ? Math.min(0.14, S.gust * 0.14 + Math.abs(S.windMul - 1) * 0.2) : 0;
    var k = 1 - Math.exp(-9 * dt);
    gFlameV += (targetFlame - gFlameV) * k;
    gRainV += (targetRain - gRainV) * k;
    gWindV += (targetWind - gWindV) * k;
    gCrackV += ((playing ? 0.05 + 0.2 * heat : 0.02) * (S.fuel > 0 ? 1 : 0) - gCrackV) * k;
    gFlame.gain.setTargetAtTime(gFlameV, now, 0.03);
    fFlame.frequency.setTargetAtTime(900 + heat * 1500, now, 0.05);
    gCrack.gain.setTargetAtTime(gCrackV, now, 0.03);
    gRain.gain.setTargetAtTime(gRainV, now, 0.05);
    gWind.gain.setTargetAtTime(gWindV, now, 0.05);
    fWind.frequency.setTargetAtTime(420 + 700 * S.gust, now, 0.1);

    /* danger: the flame running low, or the paper just torn. Only then the alarm and the closed filter. */
    var fuelDanger = playing && S.fuel > 0 ? U.sat((0.28 - S.fuel) / 0.2) : 0;
    tearPulse = Math.max(0, tearPulse - dt / 3);
    alarm += (Math.max(fuelDanger, tearPulse * 0.9) - alarm) * (1 - Math.exp(-4 * dt));
    var z = S.mode === "title" ? 0 : S.zone;
    var level = S.mode === "over" ? 0.2 : S.mode === "title" ? 0.55 : S.mode === "finish" || S.mode === "finale" ? 0.45 : 0.75;
    music.gain.setTargetAtTime(level * (1 - 0.3 * alarm), now, 0.8);
    musicLp.frequency.setTargetAtTime(2400 - 1700 * alarm + 600 * Pal(), now, 0.3);
    if (!muted && ctx.state === "running") schedule(now, z, S.mode === "play");
    if (alarm > 0.15 && playing && !muted) {
      beatIn -= dt;
      if (beatIn <= 0) { beatIn = 0.86 - 0.3 * alarm; heartbeat(now, 0.1 + 0.16 * alarm); }
      if (alarm > 0.5) { sirenIn -= dt; if (sirenIn <= 0) { sirenIn = 0.5; siren(now, 0.025 + 0.04 * alarm); } }
    } else {
      beatIn = sirenIn = 0;
    }
  };

  /* ---- Music: a slow lo-fi loop in the zone's key; drums only in flight ---- */
  var EIGHTH = 60 / 76 / 2;
  var MINOR = [[0, 3, 7, 10], [8, 12, 15, 19], [3, 7, 10, 14], [10, 14, 17, 22]];
  var MAJOR = [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 19]];
  var PROG = [MINOR, MINOR, MAJOR, MINOR, MAJOR]; // town, forest, mountains, sea cliffs, sunrise
  function keys(freq, t0, dur, gain) {
    // a soft electric-piano note: quick attack, long fall, a faint octave on top
    tone(freq, t0, dur, "sine", gain, music, undefined, 0.02);
    tone(freq * 2, t0, dur * 0.45, "sine", gain * 0.18, music, undefined, 0.01);
  }
  function schedule(now, z, drums) {
    if (nextStep < now) nextStep = now + 0.05;
    while (nextStep < now + 0.25) {
      var s = step % 8, chord = PROG[z][Math.floor(step / 8) % 4], low = ROOTS[z] / 2;
      var t = nextStep + (step % 2 ? EIGHTH * 0.12 : 0); // a little swing on the off-beats
      if (s === 0) {
        for (var i = 0; i < chord.length; i++) keys(hz(ROOTS[z] * 2, chord[i]), t + i * 0.014, EIGHTH * 8 + 0.6, 0.03);
        tone(hz(low, chord[0]), t, EIGHTH * 3.6, "sine", 0.1, music, undefined, 0.03);
      }
      if (s === 5) tone(hz(low, chord[0] + 7), t, EIGHTH * 2.6, "sine", 0.06, music, undefined, 0.03);
      if (drums) {
        if (s === 0 || s === 3) tone(64, t, 0.3, "sine", s === 0 ? 0.12 : 0.07, music, 40, 0.005);
        if (s === 4) burst(t, 0.09, "bandpass", 1900, 1200, 1.2, 0.05, music);
        burst(t, 0.04, "highpass", 7400, 5600, 0.7, s % 2 ? 0.006 : 0.011, music);
      }
      if (Math.random() < 0.18) {
        var sc = SCALES[z], f = hz(ROOTS[z] * 4, sc[Math.floor(Math.random() * sc.length)] + (Math.random() < 0.3 ? 12 : 0));
        tone(f, t, 1.6, "sine", 0.03, send, undefined, 0.01);
      }
      step++;
      nextStep += EIGHTH;
    }
  }
  function heartbeat(t, gain) {
    tone(56, t, 0.18, "sine", gain, sfx, 42, 0.004);
    tone(56, t + 0.17, 0.16, "sine", gain * 0.7, sfx, 42, 0.004);
  }
  function siren(t, gain) {
    tone(520, t, 0.22, "triangle", gain, sfx, 500);
    tone(470, t + 0.24, 0.22, "triangle", gain, sfx, 450);
  }
  function Pal() { return SKY.Sc && SKY.Sc.Pal ? SKY.Sc.Pal.dawn : 0; }

  SKY.Audio = A;
})(window.SKY = window.SKY || {});
