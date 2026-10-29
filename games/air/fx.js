/* Sky Lantern: pre-rendered sprites and the particle pool. Everything is drawn once into small canvases at
   start-up; the frame loop only blits them. Particles live in preallocated typed arrays. */
(function (SKY) {
  "use strict";

  var U = SKY.U;
  var Fx = {};
  var SP = {};               // sprites
  Fx.SP = SP;

  function mk(w, h, fn) {
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    fn(c.getContext("2d"), w, h);
    return c;
  }

  function glow(r, g, b, peak) {
    return mk(128, 128, function (x, w, h) {
      var gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      var c = r + "," + g + "," + b;
      gr.addColorStop(0, "rgba(" + c + "," + peak + ")");
      gr.addColorStop(0.22, "rgba(" + c + "," + peak * 0.55 + ")");
      gr.addColorStop(0.55, "rgba(" + c + "," + peak * 0.16 + ")");
      gr.addColorStop(1, "rgba(" + c + ",0)");
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    });
  }

  /* A lumpy soft blob: several soft discs on top of each other. tone is the rgb string. */
  function puff(rgb, seed, alpha) {
    return mk(160, 160, function (x, w, h) {
      var r = new U.RNG(seed), i;
      for (i = 0; i < 9; i++) {
        var a = r.range(0, 6.283), d = i === 0 ? 0 : r.range(18, 44), rad = i === 0 ? 52 : r.range(24, 40);
        var cx = w / 2 + Math.cos(a) * d, cy = h / 2 + Math.sin(a) * d * 0.8;
        var gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
        gr.addColorStop(0, "rgba(" + rgb + "," + alpha + ")");
        gr.addColorStop(0.55, "rgba(" + rgb + "," + alpha * 0.55 + ")");
        gr.addColorStop(1, "rgba(" + rgb + ",0)");
        x.fillStyle = gr; x.fillRect(0, 0, w, h);
      }
    });
  }

  /* A bunch of leaves, drawn outer ones first so the middle reads as a darker, fuller mass. */
  function leafCluster(seed, count, radius) {
    return mk(192, 192, function (x, w, h) {
      var r = new U.RNG(seed), i, list = [];
      var cols = ["#12302a", "#173b31", "#0f2823", "#1f4a3c", "#143329"], lite = "#38775f";
      for (i = 0; i < count; i++) {
        var a = r.range(0, 6.283), d = Math.sqrt(r.next()) * radius;
        list.push({ a: a, d: d, len: r.range(15, 26), k: r.range(0.34, 0.46), c: r.int(0, cols.length - 1), tilt: r.range(-0.8, 0.8), lit: r.next() < 0.18 });
      }
      list.sort(function (p, q) { return q.d - p.d; });
      for (i = 0; i < list.length; i++) {
        var e = list[i], lx = 96 + Math.cos(e.a) * e.d, ly = 96 + Math.sin(e.a) * e.d * 0.88;
        x.save(); x.translate(lx, ly); x.rotate(e.a + e.tilt);
        x.fillStyle = e.lit && e.d > radius * 0.35 ? lite : cols[e.c];
        x.globalAlpha = e.lit ? 0.75 : 1;
        x.beginPath(); x.moveTo(-e.len * 0.5, 0); x.quadraticCurveTo(0, -e.len * e.k, e.len * 0.5, 0); x.quadraticCurveTo(0, e.len * e.k, -e.len * 0.5, 0); x.fill();
        x.globalAlpha = 0.5; x.strokeStyle = "rgba(4,14,12,0.8)"; x.lineWidth = 0.8; x.stroke();
        x.restore();
      }
    });
  }

  function bodyPath(x) {
    x.beginPath();
    x.moveTo(-14, 26);
    x.bezierCurveTo(-20, 14, -25, -4, -21, -18);
    x.bezierCurveTo(-17, -31, -9, -39, 0, -39);
    x.bezierCurveTo(9, -39, 17, -31, 21, -18);
    x.bezierCurveTo(25, -4, 20, 14, 14, 26);
    x.closePath();
  }

  /* The lantern body. lit=true is the glowing paper, lit=false the same lantern with the flame out. */
  var LS = 4, LOX = 32, LOY = 48;             // sprite pixels per unit, and the origin inside the sprite in units
  function lantern(lit) {
    return mk(64 * LS, 84 * LS, function (x, w, h) {
      x.scale(LS, LS);
      x.translate(LOX, LOY);
      var gr, i;
      bodyPath(x);
      if (lit) {
        gr = x.createRadialGradient(0, 18, 1, 0, 18, 64);
        gr.addColorStop(0, "rgba(255,248,205,1)");
        gr.addColorStop(0.2, "rgba(255,216,124,1)");
        gr.addColorStop(0.48, "rgba(255,152,62,1)");
        gr.addColorStop(0.78, "rgba(216,80,36,1)");
        gr.addColorStop(1, "rgba(146,38,28,1)");
      } else {
        gr = x.createLinearGradient(0, -39, 0, 26);
        gr.addColorStop(0, "rgba(70,44,50,1)");
        gr.addColorStop(1, "rgba(104,62,52,1)");
      }
      x.fillStyle = gr; x.fill();
      x.save();
      x.clip();
      /* round the body: darker toward both edges */
      gr = x.createLinearGradient(-24, 0, 24, 0);
      gr.addColorStop(0, "rgba(60,12,10,0.55)");
      gr.addColorStop(0.28, "rgba(60,12,10,0)");
      gr.addColorStop(0.72, "rgba(60,12,10,0)");
      gr.addColorStop(1, "rgba(60,12,10,0.55)");
      x.fillStyle = gr; x.fillRect(-26, -42, 52, 72);
      /* paper ribs */
      x.strokeStyle = lit ? "rgba(120,36,18,0.34)" : "rgba(20,8,10,0.4)";
      x.lineWidth = 0.9;
      for (i = -2; i <= 2; i++) {
        x.beginPath();
        x.moveTo(i * 3.2, -39);
        x.bezierCurveTo(i * 9.5, -20, i * 9.5, 8, i * 5.4, 27);
        x.stroke();
      }
      /* gathered paper at the crown */
      x.fillStyle = lit ? "rgba(130,44,22,0.7)" : "rgba(26,12,14,0.6)";
      x.beginPath(); x.ellipse(0, -37, 6.2, 2.4, 0, 0, 6.283); x.fill();
      /* a hand-drawn wish mark on the front panel */
      x.strokeStyle = lit ? "rgba(150,52,24,0.55)" : "rgba(30,12,14,0.45)";
      x.lineWidth = 1.1; x.lineCap = "round"; x.lineJoin = "round";
      x.beginPath();
      x.moveTo(-3.4, -14); x.lineTo(3.4, -14); x.moveTo(0, -17.5); x.lineTo(0, -6);
      x.moveTo(-4.2, -9.5); x.lineTo(4.2, -9.5);
      x.moveTo(-2.4, -2); x.quadraticCurveTo(0, -5, 2.4, -2);
      x.stroke();
      x.restore();
      bodyPath(x);
      x.strokeStyle = lit ? "rgba(96,26,14,0.65)" : "rgba(18,8,10,0.8)";
      x.lineWidth = 1.2; x.stroke();
      /* bamboo ring at the mouth */
      x.strokeStyle = "rgba(58,34,20,0.95)"; x.lineWidth = 2.2;
      x.beginPath(); x.ellipse(0, 26, 14.2, 3.3, 0, 0, 6.283); x.stroke();
      x.fillStyle = "rgba(20,10,8,0.7)";
      x.beginPath(); x.ellipse(0, 26, 12.4, 2.2, 0, 0, 6.283); x.fill();
    });
  }

  function flame() {
    return mk(48, 96, function (x, w, h) {
      x.scale(4, 4);
      var gr = x.createLinearGradient(0, 24, 0, 0);
      gr.addColorStop(0, "rgba(255,255,236,1)");
      gr.addColorStop(0.3, "rgba(255,236,150,1)");
      gr.addColorStop(0.65, "rgba(255,150,44,0.95)");
      gr.addColorStop(1, "rgba(255,80,20,0)");
      x.fillStyle = gr;
      x.beginPath();
      x.moveTo(6, 24);
      x.bezierCurveTo(-0.5, 22, -0.5, 12, 6, 0);
      x.bezierCurveTo(12.5, 12, 12.5, 22, 6, 24);
      x.fill();
    });
  }

  function sparkle() {
    return mk(64, 64, function (x, w, h) {
      var gr = x.createRadialGradient(32, 32, 0, 32, 32, 30);
      gr.addColorStop(0, "rgba(255,255,255,0.95)");
      gr.addColorStop(0.18, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      x.fillStyle = "rgba(255,255,255,0.95)";
      x.beginPath(); x.moveTo(32, 2); x.quadraticCurveTo(34, 30, 62, 32); x.quadraticCurveTo(34, 34, 32, 62);
      x.quadraticCurveTo(30, 34, 2, 32); x.quadraticCurveTo(30, 30, 32, 2); x.fill();
    });
  }

  function moon() {
    return mk(256, 256, function (x, w, h) {
      var gr = x.createRadialGradient(128, 128, 20, 128, 128, 128);
      gr.addColorStop(0, "rgba(210,225,255,0.34)");
      gr.addColorStop(0.35, "rgba(170,195,255,0.12)");
      gr.addColorStop(1, "rgba(150,180,255,0)");
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
      /* the disc, then a shadow disc to make a thick crescent */
      x.fillStyle = "#eef3ff";
      x.beginPath(); x.arc(128, 128, 30, 0, 6.283); x.fill();
      gr = x.createRadialGradient(118, 118, 4, 128, 128, 32);
      gr.addColorStop(0, "rgba(255,255,255,0)");
      gr.addColorStop(1, "rgba(150,170,210,0.55)");
      x.fillStyle = gr; x.beginPath(); x.arc(128, 128, 30, 0, 6.283); x.fill();
      x.fillStyle = "rgba(120,140,190,0.35)";
      [[120, 120, 5], [137, 133, 4], [124, 140, 3]].forEach(function (c) { x.beginPath(); x.arc(c[0], c[1], c[2], 0, 6.283); x.fill(); });
    });
  }

  function vignette() {
    return mk(256, 256, function (x, w, h) {
      var gr = x.createRadialGradient(128, 128, 70, 128, 128, 182);
      gr.addColorStop(0, "rgba(2,4,12,0)");
      gr.addColorStop(1, "rgba(2,4,12,0.62)");
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    });
  }

  function vignetteRed() {
    return mk(256, 256, function (x, w, h) {
      var gr = x.createRadialGradient(128, 128, 60, 128, 128, 182);
      gr.addColorStop(0, "rgba(255,40,24,0)");
      gr.addColorStop(0.6, "rgba(255,40,24,0.28)");
      gr.addColorStop(1, "rgba(255,40,24,0.9)");
      x.fillStyle = gr; x.fillRect(0, 0, w, h);
    });
  }

  function hglow() {
    return mk(256, 64, function (x, w, h) {
      var gr = x.createRadialGradient(128, 64, 0, 128, 64, 128);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(0.4, "rgba(255,255,255,0.3)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      x.save(); x.scale(1, 0.5); x.fillStyle = gr; x.fillRect(0, 0, w, h * 2); x.restore();
    });
  }

  Fx.build = function () {
    SP.glowWarm = glow(255, 168, 80, 0.95);
    SP.glowHot = glow(255, 214, 140, 1);
    SP.glowWhite = glow(255, 255, 255, 0.9);
    SP.glowGreen = glow(196, 255, 120, 0.95);
    SP.glowBlue = glow(150, 190, 255, 0.9);
    SP.glowGold = glow(255, 205, 110, 0.95);
    SP.glowRose = glow(255, 140, 120, 0.9);
    SP.puffDark = [puff("30,36,56", 11, 0.8), puff("26,32,52", 23, 0.8), puff("38,44,66", 37, 0.8)];
    SP.puffGrey = [puff("92,100,128", 41, 0.55), puff("84,92,120", 53, 0.55)];
    SP.puffLight = [puff("255,244,230", 61, 0.8), puff("255,236,214", 73, 0.8), puff("255,250,240", 89, 0.8)];
    SP.puffSmoke = [puff("128,110,118", 101, 0.7), puff("112,98,108", 113, 0.7)];
    SP.puffStorm = [puff("66,78,112", 127, 0.95), puff("58,70,104", 131, 0.95), puff("72,84,120", 137, 0.95)];
    SP.puffStormLit = [puff("140,158,204", 149, 0.55), puff("150,166,210", 151, 0.55)];
    SP.leaves = [leafCluster(5, 46, 56), leafCluster(17, 46, 56), leafCluster(29, 46, 56)];
    SP.lantern = lantern(true);
    SP.lanternDark = lantern(false);
    SP.flame = flame();
    SP.sparkle = sparkle();
    SP.moon = moon();
    SP.vignette = vignette();
    SP.vignetteRed = vignetteRed();
    SP.hglow = hglow();
    SP.LS = LS; SP.LOX = LOX; SP.LOY = LOY;
    for (var gi = 0; gi < GLOWNAMES.length; gi++) GLOWS[gi] = SP[GLOWNAMES[gi]];
  };

  /* ---- Particles ---- */
  var MAXP = 480;
  var px = new Float32Array(MAXP), py = new Float32Array(MAXP), pvx = new Float32Array(MAXP), pvy = new Float32Array(MAXP);
  var pl = new Float32Array(MAXP), pml = new Float32Array(MAXP), ps = new Float32Array(MAXP), pr = new Float32Array(MAXP), pvr = new Float32Array(MAXP);
  var pk = new Uint8Array(MAXP), pc = new Uint8Array(MAXP);
  var live = 0, cursor = 0;
  /* kinds */
  var K = Fx.K = { SPARK: 0, SMOKE: 1, GLINT: 2, DROP: 3, SCRAP: 4, MOTE: 5, FIRE: 6, STEAM: 7, FLY: 8, DUST: 9, LANT: 10, STREAK: 11 };
  /* colour slots for glow kinds: 0 warm, 1 hot, 2 white, 3 green, 4 blue, 5 gold, 6 rose */
  Fx.count = function () { return live; };

  Fx.spawn = function (kind, x, y, vx, vy, life, size, color) {
    var i;
    if (live >= MAXP) {                      // replace the oldest-looking slot instead of growing
      i = cursor; cursor = (cursor + 1) % MAXP;
    } else {
      i = cursor; var guard = 0;
      while (pl[i] > 0 && guard++ < MAXP) i = (i + 1) % MAXP;
      cursor = (i + 1) % MAXP;
    }
    if (pl[i] <= 0) live++;
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pml[i] = life; ps[i] = size;
    pr[i] = Math.random() * 6.283; pvr[i] = (Math.random() - 0.5) * 6;
    pk[i] = kind; pc[i] = color || 0;
    return i;
  };

  Fx.clear = function () { for (var i = 0; i < MAXP; i++) pl[i] = 0; live = 0; };

  Fx.update = function (dt) {
    var i, k, n = 0;
    for (i = 0; i < MAXP; i++) {
      if (pl[i] <= 0) continue;
      pl[i] -= dt;
      if (pl[i] <= 0) { live--; continue; }
      n++;
      k = pk[i];
      switch (k) {
        case 0: pvy[i] -= 26 * dt; pvx[i] *= 1 - 0.8 * dt; pvy[i] *= 1 - 0.5 * dt; break;           // spark rises
        case 1: pvx[i] *= 1 - 0.5 * dt; pvy[i] *= 1 - 0.6 * dt; break;                              // smoke
        case 3: pvy[i] += 520 * dt; break;                                                          // drop
        case 4: pvy[i] += 150 * dt; pvx[i] *= 1 - 1.1 * dt; pvy[i] *= 1 - 0.7 * dt; pr[i] += pvr[i] * dt; break; // scrap
        case 5: pvx[i] += (Math.random() - 0.5) * 30 * dt; pvy[i] += (Math.random() - 0.5) * 30 * dt; break;
        case 6: pvy[i] += 34 * dt; pvx[i] *= 1 - 0.9 * dt; pvy[i] *= 1 - 0.9 * dt; break;           // finale fire
        case 7: pvy[i] -= 20 * dt; break;
        case 9: pvy[i] += 60 * dt; pvx[i] *= 1 - 1.6 * dt; break;
        case 10: pvx[i] += Math.sin(pl[i] * 1.3 + pr[i]) * 9 * dt; break;                          // festival lantern sways
        default: break;
      }
      px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
    }
    live = n;
  };

  var GLOWS = [null, null, null, null, null, null, null];
  var GLOWNAMES = ["glowWarm", "glowHot", "glowWhite", "glowGreen", "glowBlue", "glowGold", "glowRose"];

  /* Normal-blend particles (smoke, drops, scraps, dust). ox is the world-to-view x offset. */
  Fx.drawSolid = function (ctx, ox) {
    var i, k, t, a, s, sp;
    for (i = 0; i < MAXP; i++) {
      if (pl[i] <= 0) continue;
      k = pk[i];
      if (k === 1 || k === 7) {
        t = 1 - pl[i] / pml[i];
        a = (k === 1 ? 0.5 : 0.35) * (1 - t) * Math.min(1, t * 6);
        s = ps[i] * (1 + t * (k === 1 ? 2.2 : 1.6));
        sp = k === 1 ? SP.puffGrey[pc[i] & 1] : SP.puffLight[pc[i] % 3];
        ctx.globalAlpha = a;
        ctx.drawImage(sp, px[i] + ox - s, py[i] - s, s * 2, s * 2);
      } else if (k === 3) {
        ctx.globalAlpha = 0.7 * (pl[i] / pml[i]);
        ctx.fillStyle = "#cfe0ff";
        ctx.fillRect(px[i] + ox - 0.8, py[i] - 2, 1.6, 4.5);
      } else if (k === 4) {
        t = pl[i] / pml[i];
        ctx.globalAlpha = Math.min(1, t * 2.2);
        ctx.fillStyle = pc[i] ? "#ffe9c4" : "#ff9c4a";
        ctx.save();
        ctx.translate(px[i] + ox, py[i]); ctx.rotate(pr[i]);
        ctx.fillRect(-ps[i], -ps[i] * 0.5, ps[i] * 2, ps[i]);
        ctx.restore();
      } else if (k === 9) {
        t = pl[i] / pml[i];
        ctx.globalAlpha = 0.55 * t;
        ctx.fillStyle = "#c9b99a";
        ctx.beginPath(); ctx.arc(px[i] + ox, py[i], ps[i] * (1.4 - 0.4 * t), 0, 6.283); ctx.fill();
      } else if (k === 10) {
        a = Math.min(1, (pml[i] - pl[i]) * 0.6, pl[i] * 0.5);
        s = ps[i] * 0.34;
        ctx.globalAlpha = a * 0.92;
        ctx.save();
        ctx.translate(px[i] + ox, py[i]); ctx.rotate(Math.sin(pl[i] * 1.1 + pr[i]) * 0.12);
        ctx.drawImage(SP.lantern, -SP.LOX * s / 10, -SP.LOY * s / 10, 64 * s / 10, 84 * s / 10);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  };

  /* Additive particles: sparks, glints, motes, fire, fireflies. */
  Fx.drawGlow = function (ctx, ox) {
    var i, k, t, a, s, g;
    for (i = 0; i < MAXP; i++) {
      if (pl[i] <= 0) continue;
      k = pk[i];
      if (k === 0 || k === 5 || k === 6 || k === 8) {
        t = pl[i] / pml[i];
        a = k === 5 ? Math.sin(Math.PI * (1 - t)) * 0.8 : Math.min(1, t * 1.6);
        s = ps[i] * (k === 6 ? 0.5 + 0.5 * t : (0.5 + 0.5 * t));
        ctx.globalAlpha = a;
        ctx.drawImage(GLOWS[pc[i]], px[i] + ox - s, py[i] - s, s * 2, s * 2);
      } else if (k === 11) {
        t = pl[i] / pml[i];
        ctx.globalAlpha = Math.sin(Math.PI * (1 - t)) * 0.85;
        ctx.strokeStyle = "#dfe8ff"; ctx.lineWidth = ps[i]; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(px[i] + ox, py[i]); ctx.lineTo(px[i] + ox - pvx[i] * 0.16, py[i] - pvy[i] * 0.16); ctx.stroke();
      } else if (k === 10) {
        a = Math.min(1, (pml[i] - pl[i]) * 0.6, pl[i] * 0.5);
        ctx.globalAlpha = a * 0.5;
        s = ps[i] * 3.4;
        ctx.drawImage(SP.glowWarm, px[i] + ox - s, py[i] - s, s * 2, s * 2);
      } else if (k === 2) {
        t = pl[i] / pml[i];
        ctx.globalAlpha = t;
        s = ps[i] * (1.3 - 0.5 * t);
        ctx.save();
        ctx.translate(px[i] + ox, py[i]); ctx.rotate(pr[i] * 0.2);
        ctx.drawImage(SP.sparkle, -s, -s, s * 2, s * 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  };

  /* ---- Screen effects ---- */
  Fx.shake = 0;               // amplitude in px, decays
  Fx.flash = 0;               // 0..1 red flash on a tear
  Fx.lightning = 0;           // 0..1 white flash of a storm
  Fx.reduced = false;
  Fx.kick = function (amount) { if (!Fx.reduced) Fx.shake = Math.max(Fx.shake, amount); };
  Fx.tick = function (dt) {
    Fx.shake *= Math.exp(-7 * dt);
    if (Fx.shake < 0.05) Fx.shake = 0;
    Fx.flash = Math.max(0, Fx.flash - dt * 2.6);
    Fx.lightning = Math.max(0, Fx.lightning - dt * 5);
  };

  SKY.Fx = Fx;
})(window.SKY = window.SKY || {});
