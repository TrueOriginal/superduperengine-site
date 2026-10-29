/* Sky Lantern: the backdrop. A sky that goes from dusk to sunrise over the run, stars, moon, sun, drifting
   clouds, four parallax silhouette layers and the ground the lantern flies over. Every zone has its own
   silhouette shapes; near a zone border the shapes blend, so the town shrinks into forest, forest into
   mountains and so on. Colours come from one palette that follows the night's progress. */
(function (SKY) {
  "use strict";

  var U = SKY.U, W = SKY.W, S = SKY.Sim, Fx = SKY.Fx, SP = Fx.SP;
  var Sc = {};

  /* View: the playfield is 720 units tall; vw is how many units fit across; top is <= 0 when the screen is taller. */
  var V = SKY.V = { w: 800, h: 600, dpr: 1, scale: 1, vw: 1000, vh: 720, top: 0, lx: 260 };

  /* ---- Palette ---- */
  var TOD = [
    { t: 0.00, top: "#0a1138", mid: "#2a3578", hor: "#7a5290", glow: "#ff9460", star: 0.5, moon: 0.55 },
    { t: 0.15, top: "#070d2c", mid: "#16215a", hor: "#3a3a80", glow: "#ff8a5c", star: 0.9, moon: 0.9 },
    { t: 0.38, top: "#040716", mid: "#0c1544", hor: "#223472", glow: "#6f93ff", star: 1.0, moon: 1.0 },
    { t: 0.60, top: "#050a1f", mid: "#101c50", hor: "#2b3f7c", glow: "#6f93ff", star: 1.0, moon: 0.9 },
    { t: 0.78, top: "#0f1a48", mid: "#3a3884", hor: "#b04e74", glow: "#ff8a6a", star: 0.55, moon: 0.4 },
    { t: 0.90, top: "#243f88", mid: "#b6588a", hor: "#ff9a58", glow: "#ffc079", star: 0.14, moon: 0.0 },
    { t: 1.00, top: "#4a6fb8", mid: "#f4907c", hor: "#ffd27c", glow: "#ffe6a2", star: 0.0, moon: 0.0 }
  ];
  var ZDARK = ["#0a0f24", "#07151c", "#0c1228", "#08172c", "#3d2d56"].map(function (h) { return U.hex(h); });
  var i, j;
  for (i = 0; i < TOD.length; i++) {
    TOD[i].top = U.hex(TOD[i].top); TOD[i].mid = U.hex(TOD[i].mid); TOD[i].hor = U.hex(TOD[i].hor); TOD[i].glow = U.hex(TOD[i].glow);
  }

  var Pal = Sc.Pal = {
    p: 0, top: [0, 0, 0], mid: [0, 0, 0], hor: [0, 0, 0], glow: [0, 0, 0], dark: [0, 0, 0],
    starA: 1, moonA: 1, sun: 0, dawn: 0, cloudA: 0.2,
    sky: null, layerGrad: [null, null, null, null], ground: null, rim: "", rimA: 0, window: "", water: null,
    layerCol: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], fog: "", key: ""
  };
  var tmpA = [0, 0, 0], tmpB = [0, 0, 0];
  var hsprite = null, hctx = null;

  var LAYERS = [
    { p: 0.05, base: 540, step: 7, gTop: 330, gBot: 640, mixTo: 0.34 },
    { p: 0.12, base: 578, step: 6, gTop: 400, gBot: 680, mixTo: 0.56 },
    { p: 0.26, base: 628, step: 5, gTop: 460, gBot: 730, mixTo: 0.78 },
    { p: 0.50, base: 670, step: 5, gTop: 540, gBot: 760, mixTo: 0.93 }
  ];

  /* Rebuilds colours and gradients. Called about ten times a second and after a resize, never per frame. */
  Sc.refresh = function (ctx, force) {
    var p = S.mode === "title" ? 0 : U.sat(S.D / W.LTOTAL), k, a, b, f, g;
    var key = Math.round(p * 600) + ":" + Math.round(V.top) + ":" + (S.mode === "title" ? 0 : S.zone);
    if (!force && key === Pal.key) return;
    Pal.key = key;
    Pal.p = p;
    for (k = 0; k < TOD.length - 2 && p > TOD[k + 1].t; k++) { /* find the segment */ }
    a = TOD[k]; b = TOD[k + 1];
    f = U.smooth((p - a.t) / (b.t - a.t));
    U.mix(a.top, b.top, f, Pal.top); U.mix(a.mid, b.mid, f, Pal.mid); U.mix(a.hor, b.hor, f, Pal.hor); U.mix(a.glow, b.glow, f, Pal.glow);
    Pal.starA = U.lerp(a.star, b.star, f);
    Pal.moonA = U.lerp(a.moon, b.moon, f);
    Pal.sun = U.smooth((p - 0.80) / 0.2);
    Pal.dawn = U.smooth((p - 0.70) / 0.3);
    W.blend(S.mode === "title" ? 0 : S.D);
    U.mix(ZDARK[W.zA], ZDARK[W.zB], W.zW, Pal.dark);
    Pal.cloudA = [0.16, 0.12, 0.3, 0.32, 0.5][W.zW > 0.5 ? W.zB : W.zA];

    g = ctx.createLinearGradient(0, V.top, 0, 600);
    g.addColorStop(0, U.rgba(Pal.top)); g.addColorStop(0.62, U.rgba(Pal.mid)); g.addColorStop(1, U.rgba(Pal.hor));
    Pal.sky = g;

    for (k = 0; k < 4; k++) {
      U.mix(Pal.hor, Pal.dark, LAYERS[k].mixTo, Pal.layerCol[k]);
      var c = Pal.layerCol[k];
      g = ctx.createLinearGradient(0, LAYERS[k].gTop, 0, LAYERS[k].gBot);
      g.addColorStop(0, U.rgba(c));
      U.mix(c, Pal.hor, 0.34 - 0.06 * k, tmpA);
      g.addColorStop(1, U.rgba(tmpA));
      Pal.layerGrad[k] = g;
    }
    U.mix(Pal.hor, Pal.dark, 0.93, tmpA);
    U.mix(Pal.hor, Pal.dark, 0.985, tmpB);
    g = ctx.createLinearGradient(0, 540, 0, 740);
    g.addColorStop(0, U.rgba(tmpA)); g.addColorStop(1, U.rgba(tmpB));
    Pal.ground = g;
    U.mix(Pal.hor, Pal.dark, 0.8, tmpA);
    g = ctx.createLinearGradient(0, 650, 0, 740);
    g.addColorStop(0, U.rgba(tmpA)); g.addColorStop(1, U.rgba(Pal.dark));
    Pal.water = g;
    /* rim light: cool moonlight at night, warm sunlight toward the end */
    U.mix([150, 180, 255], Pal.glow, U.sat(Pal.dawn * 1.4), tmpA);
    Pal.rimA = 0.16 + 0.3 * Pal.dawn;
    Pal.rim = U.rgba(tmpA, Pal.rimA);
    Pal.window = U.rgba([255, 205, 118], 0.9);
    Pal.fog = U.rgba(Pal.hor, 0.5);

    /* horizon glow strip, tinted */
    if (!hsprite) { hsprite = document.createElement("canvas"); hsprite.width = 256; hsprite.height = 64; hctx = hsprite.getContext("2d"); }
    hctx.clearRect(0, 0, 256, 64);
    g = hctx.createRadialGradient(128, 64, 0, 128, 64, 128);
    g.addColorStop(0, U.rgba(Pal.glow, 0.95)); g.addColorStop(0.45, U.rgba(Pal.glow, 0.3)); g.addColorStop(1, U.rgba(Pal.glow, 0));
    hctx.save(); hctx.translate(0, 64); hctx.scale(1, 0.5); hctx.translate(0, -64); hctx.fillStyle = g; hctx.fillRect(0, -64, 256, 192); hctx.restore();
  };

  /* ---- Silhouette shapes: height above the layer's base for layer-space x = u. ---- */
  function hBlocks(u, C, lo, hi, seed) {
    var k = Math.floor(u / C), f = u / C - k;
    var r = U.hash(k * 3 + seed);
    if (f < 0.07 || f > 0.93) return lo * 0.45;
    var h = lo + (hi - lo) * r * r;
    if (U.hash(k * 3 + seed + 1) > 0.93) h += hi * 0.55 * (1 - Math.abs(f - 0.5) * 2);   // a spire
    return h;
  }
  function hGables(u, C, lo, hi, rlo, rhi, seed) {
    var k = Math.floor(u / C);
    return W.gableHeight(W.gableCell(k, lo, hi, rlo, rhi, seed), u / C - k);
  }
  function hPines(u, C, lo, hi, seed) {
    var k = Math.floor(u / C), best = 0, j;
    for (j = k - 1; j <= k + 1; j++) {
      var c = (j + 0.5 + 0.35 * (U.hash(j * 5 + seed) - 0.5)) * C;
      var h = lo + (hi - lo) * U.hash(j * 5 + seed + 1);
      var d = Math.abs(u - c) / (C * 0.62);
      if (d < 1) { var v = h * (1 - d) * (0.84 + 0.16 * Math.sin(d * 19 + j)); if (v > best) best = v; }
    }
    return best;
  }
  function hRound(u, C, lo, hi, seed) {
    var k = Math.floor(u / C), best = 0, j;
    for (j = k - 1; j <= k + 1; j++) {
      var c = (j + 0.2 + 0.6 * U.hash(j * 5 + seed)) * C;
      var R = C * (0.4 + 0.3 * U.hash(j * 5 + seed + 1));
      var h = lo + (hi - lo) * U.hash(j * 5 + seed + 2);
      var d = (u - c) / R;
      if (d > -1 && d < 1) { var v = h * Math.sqrt(1 - d * d); if (v > best) best = v; }
    }
    return best;
  }
  function hHills(u, scale, amp, seed) { return amp * U.fbm(u / scale + seed * 11.3, 3); }
  function hRidge(u, scale, amp, seed) {
    var x = u / scale + seed * 7.7, sum = 0, a = 0.6, f = 1, j, n;
    for (j = 0; j < 3; j++) {
      n = 1 - Math.abs(2 * U.noise(x * f + j * 13.7) - 1);
      sum += a * n * n * n;
      a *= 0.46; f *= 2.4;
    }
    return amp * (0.1 + 0.9 * sum / 0.62);
  }
  function hCliff(u, scale, amp, seed) {
    var n = U.noise(u / scale + seed * 5.1);
    return amp * U.smooth((n - 0.44) / 0.1) * (0.85 + 0.15 * U.noise(u / 23 + seed)) + 5 * U.noise(u / 11 + seed);
  }
  function hLumps(u, scale, amp, seed) {
    var n = U.fbm(u / scale + seed * 3.7, 3);
    return amp * Math.sqrt(U.sat(n * 1.3 - 0.1)) + amp * 0.12;
  }

  var HFN = [
    function (u, k) {            // town
      switch (k) {
        case 0: return hBlocks(u, 36, 30, 96, 3);
        case 1: return hGables(u, 68, 24, 52, 10, 24, 5);
        case 2: return hGables(u, 104, 36, 74, 16, 32, 7);
        default: return hGables(u, 140, 50, 90, 22, 38, 9);
      }
    },
    function (u, k) {            // forest
      switch (k) {
        case 0: return 14 + hHills(u, 210, 90, 1);
        case 1: return hPines(u, 22, 30, 66, 5) + hHills(u, 170, 30, 2);
        case 2: return hPines(u, 38, 52, 112, 6);
        default: return hRound(u, 92, 52, 108, 8);
      }
    },
    function (u, k) {            // mountains
      switch (k) {
        case 0: return hRidge(u, 360, 175, 1);
        case 1: return hRidge(u, 230, 130, 2);
        case 2: return hRidge(u, 135, 108, 3);
        default: return hRidge(u, 82, 82, 4);
      }
    },
    function (u, k) {            // sea cliffs
      switch (k) {
        case 0: return hCliff(u, 520, 46, 1);
        case 1: return hCliff(u, 430, 120, 2);
        case 2: return hCliff(u, 310, 150, 3);
        default: return hCliff(u, 210, 96, 4);
      }
    },
    function (u, k) {            // sunrise clouds
      switch (k) {
        case 0: return hLumps(u, 310, 58, 1);
        case 1: return hLumps(u, 230, 76, 2);
        case 2: return hLumps(u, 170, 88, 3);
        default: return hLumps(u, 125, 98, 4);
      }
    }
  ];

  /* ---- Sky ---- */
  var NST = 170, stX = new Float32Array(NST), stY = new Float32Array(NST), stB = new Float32Array(NST), stS = new Float32Array(NST), stP = new Float32Array(NST);
  for (i = 0; i < NST; i++) {
    stX[i] = U.hash(i * 4 + 1) * 3200; stY[i] = Math.pow(U.hash(i * 4 + 2), 0.85);
    stB[i] = 0.35 + 0.65 * U.hash(i * 4 + 3); stS[i] = U.hash(i * 4 + 4) > 0.92 ? 2.1 : 1.15; stP[i] = U.hash(i * 4 + 5) * 6.283;
  }
  var NCL = 8, clX = new Float32Array(NCL), clD = new Float32Array(NCL), clY = new Float32Array(NCL), clS = new Float32Array(NCL);
  var NWI = 7, wiX = new Float32Array(NWI), wiY = new Float32Array(NWI), wiS = new Float32Array(NWI);
  for (i = 0; i < NCL; i++) { clD[i] = 0.03 + 0.06 * U.hash(i * 3 + 1); clX[i] = U.hash(i * 3 + 2) * 2600; clY[i] = U.hash(i * 3 + 3); clS[i] = 120 + 150 * U.hash(i * 3 + 4); }
  for (i = 0; i < NWI; i++) { wiX[i] = U.hash(i * 5 + 91) * 2200; wiY[i] = 16 + 11 * i + 8 * U.hash(i * 5 + 93); wiS[i] = 190 + 150 * U.hash(i * 5 + 92); }

  function drawSky(ctx, t) {
    var p = Pal.p, i, x, y, a, s, bottom = 760;
    ctx.fillStyle = Pal.sky;
    ctx.fillRect(-20, V.top - 20, V.vw + 40, bottom - V.top + 20);

    /* stars */
    if (Pal.starA > 0.01) {
      ctx.fillStyle = "#e8eeff";
      for (i = 0; i < NST; i++) {
        x = stX[i] - S.camX * 0.02; x -= Math.floor(x / 3200) * 3200;
        if (x > V.vw + 4) continue;
        y = V.top + stY[i] * (570 - V.top);
        a = Pal.starA * stB[i] * (0.62 + 0.38 * Math.sin(t * (0.9 + stB[i] * 1.6) + stP[i]));
        if (y > 380) a *= 1 - (y - 380) / 220;
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        s = stS[i];
        ctx.fillRect(x, y, s, s);
      }
      ctx.globalAlpha = 1;
    }

    /* horizon glow */
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 + 0.4 * Pal.dawn;
    ctx.drawImage(hsprite, -V.vw * 0.2, 590 - 230 - 90 * Pal.dawn, V.vw * 1.4, 230 + 90 * Pal.dawn);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    /* moon */
    if (Pal.moonA > 0.02) {
      var mu = U.sat(p / 0.8);
      var mx = V.vw * (0.86 - 0.62 * mu), my = 540 - 400 * Math.pow(Math.sin(Math.PI * mu), 0.8);
      ctx.globalAlpha = Pal.moonA;
      ctx.drawImage(SP.moon, mx - 90, my - 90, 180, 180);
      ctx.globalAlpha = 1;
    }

    /* sun, rising behind the far layers */
    if (Pal.sun > 0.002) {
      var sx = V.vw * 0.7, sy = 640 - 168 * Pal.sun;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 + 0.4 * Pal.sun;
      ctx.drawImage(SP.glowGold, sx - 360, sy - 360, 720, 720);
      ctx.globalAlpha = 0.6;
      ctx.drawImage(SP.glowHot, sx - 150, sy - 150, 300, 300);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff4cf";
      ctx.beginPath(); ctx.arc(sx, sy, 44, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = "#fff0b8";
      ctx.beginPath(); ctx.arc(sx, sy, 56, 0, 6.283); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* high drifting clouds */
    var ca = Pal.cloudA;
    for (i = 0; i < NCL; i++) {
      x = clX[i] - S.camX * clD[i] - t * (2 + 3 * clD[i]); x -= Math.floor(x / 2600) * 2600; x -= 300;
      if (x > V.vw + 200) continue;
      y = V.top + 40 + clY[i] * (430 - V.top);
      s = clS[i];
      ctx.globalAlpha = ca * (1 - Pal.dawn) * 0.7;
      if (ctx.globalAlpha > 0.01) ctx.drawImage(SP.puffGrey[i & 1], x - s, y - s * 0.5, s * 2, s);
      ctx.globalAlpha = ca * Pal.dawn * 0.85;
      if (ctx.globalAlpha > 0.01) ctx.drawImage(SP.puffLight[i % 3], x - s, y - s * 0.5, s * 2, s);
    }
    ctx.globalAlpha = 1;

    /* thin air: high wisps just under the ceiling, stronger when the lantern climbs into them */
    var thin = U.sat((110 - S.y) / 90), wa = 0.07 + 0.2 * thin;
    for (i = 0; i < 7; i++) {
      x = wiX[i] - S.camX * 0.4 - t * 5; x -= Math.floor(x / 2200) * 2200; x -= 320;
      if (x > V.vw + 100) continue;
      y = wiY[i];
      s = wiS[i];
      ctx.globalAlpha = wa * (1 - Pal.dawn * 0.4);
      ctx.drawImage(SP.puffGrey[i & 1], x - s, y - 16, s * 2, 34);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- Layers ----
     Silhouettes are sampled on a fixed lattice in layer space, so a vertex stays glued to the feature it belongs
     to while the layer scrolls (no crawling house walls). Each lattice column is computed once and kept in a ring. */
  var CN = 512, CM = CN - 1, HCOL = [], HTAG = [], zz, kk;
  for (zz = 0; zz < 5; zz++) for (kk = 0; kk < 4; kk++) { HCOL.push(new Float32Array(CN)); HTAG.push(new Int32Array(CN).fill(2147483647)); }
  var GCOL = new Float32Array(CN), GTAG = new Int32Array(CN).fill(2147483647);
  var GSTEP = 4;

  function drawLayer(ctx, k) {
    var L = LAYERS[k], step = L.step, camU = S.camX * L.p, base = L.base, wx = S.D - V.lx;
    var c0 = Math.floor((camU - 2 * step) / step), c1 = Math.ceil((camU + V.vw + 3 * step) / step);
    var c, vx, i, h, ia, ib, ha, za, zb, zw;
    ctx.beginPath();
    for (c = c0; c <= c1; c++) {
      vx = c * step - camU;
      W.blend(vx + wx);
      za = W.zA; zb = W.zB; zw = W.zW;
      i = c & CM; ia = za * 4 + k;
      if (HTAG[ia][i] !== c) { HTAG[ia][i] = c; HCOL[ia][i] = HFN[za](c * step, k); }
      h = HCOL[ia][i];
      if (zw > 0) {
        ib = zb * 4 + k;
        if (HTAG[ib][i] !== c) { HTAG[ib][i] = c; HCOL[ib][i] = HFN[zb](c * step, k); }
        h += (HCOL[ib][i] - h) * zw;
      }
      if (c === c0) ctx.moveTo(vx, base - h); else ctx.lineTo(vx, base - h);
    }
    ctx.lineTo(V.vw + 4 * step, 790); ctx.lineTo(-3 * step, 790); ctx.closePath();
    ctx.fillStyle = Pal.layerGrad[k];
    ctx.fill();
    if (k > 0) {
      ctx.strokeStyle = Pal.rim; ctx.lineWidth = 1.1;
      ctx.stroke();
    }
  }

  /* A soft band of mist at the foot of a layer: it lifts the far layers and makes the valleys read. */
  function drawMist(ctx, k, alpha) {
    var L = LAYERS[k];
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * (0.6 + 0.4 * Pal.starA + 0.5 * Pal.dawn);
    ctx.drawImage(hsprite, -V.vw * 0.1, L.base - 70, V.vw * 1.2, 110);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  var TOWN_C = [36, 68, 104, 140], TOWN_Q = [0.45, 0.6, 0.85, 1.1];
  var TOWN_P = [[0, 0, 0, 0, 0], [24, 52, 10, 24, 5], [36, 74, 16, 32, 7], [50, 90, 22, 38, 9]];
  /* Lit windows on the town layers. */
  function drawWindows(ctx, k, t) {
    var L = LAYERS[k], C = TOWN_C[k], q = TOWN_Q[k], pr = TOWN_P[k], camU = S.camX * L.p, wx = S.D - V.lx;
    var i0 = Math.floor((camU - 30) / C), i1 = Math.ceil((camU + V.vw + 30) / C), n, w, g, lit, vx0, litFrac;
    litFrac = 0.8 - 0.55 * U.sat(Pal.p / 0.25);
    ctx.beginPath();
    for (var ci = i0; ci <= i1; ci++) {
      vx0 = ci * C - camU;
      W.blend(vx0 + C * 0.5 + wx);
      var tw = W.zA === 0 ? 1 - W.zW : 0;
      if (tw < 0.55) continue;
      g = W.gableCell(ci, pr[0], pr[1], pr[2], pr[3], pr[4]);
      n = 1 + Math.floor(U.hash(ci * 11 + 3) * 3);
      for (w = 0; w < n; w++) {
        lit = U.hash(ci * 17 + w * 5 + 1);
        if (lit > litFrac) continue;
        if (lit > litFrac * 0.97 && Math.sin(t * 3 + ci + w) > 0.2) continue;       // a few flicker
        var fx = g.a + (g.b - g.a) * ((w + 0.5) / n);
        ctx.rect(vx0 + C * fx - 2 * q, L.base - g.wall * (0.3 + 0.35 * U.hash(ci * 5 + w)) - 3 * q, 4 * q, 5.5 * q);
      }
    }
    ctx.fillStyle = Pal.window;
    ctx.globalAlpha = 0.85 * (k === 1 ? 0.6 : 1);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* ---- Gameplay ground ---- */
  function drawGround(ctx, t) {
    var wx = S.D - V.lx, vx, y, c, c0 = Math.floor((wx - 8) / GSTEP), c1 = Math.ceil((wx + V.vw + 10) / GSTEP), i, w, n;
    ctx.beginPath();
    for (c = c0; c <= c1; c++) {
      i = c & CM;
      if (GTAG[i] !== c) { GTAG[i] = c; GCOL[i] = W.groundY(c * GSTEP); }
      vx = c * GSTEP - wx;
      if (c === c0) ctx.moveTo(vx, GCOL[i]); else ctx.lineTo(vx, GCOL[i]);
    }
    ctx.lineTo(V.vw + 12, 790); ctx.lineTo(-12, 790); ctx.closePath();
    W.blend(S.D);
    var seaW = W.zA === 3 ? 1 - W.zW : (W.zB === 3 ? W.zW : 0);
    ctx.fillStyle = seaW > 0.5 ? Pal.water : Pal.ground;
    ctx.fill();
    ctx.strokeStyle = Pal.rim; ctx.lineWidth = 1.4;
    ctx.stroke();

    /* town: windows in the front houses */
    var C = 118, i0 = Math.floor((wx - 20) / C), i1 = Math.ceil((wx + V.vw + 20) / C), g;
    ctx.beginPath();
    for (c = i0; c <= i1; c++) {
      W.blend(c * C + C * 0.5);
      if (W.zA !== 0 || 1 - W.zW < 0.55) continue;
      g = W.gableCell(c, 34, 74, 12, 34, 1);
      n = 1 + Math.floor(U.TAB[(c * 13 + 4) & 4095] * 3);
      for (w = 0; w < n; w++) {
        if (U.TAB[(c * 19 + w * 3 + 2) & 4095] > 0.7 - 0.45 * U.sat(Pal.p / 0.25)) continue;
        ctx.rect(c * C - wx + C * (g.a + (g.b - g.a) * ((w + 0.5) / n)) - 3, 680 - g.wall * 0.62 - 4 + 14 * U.TAB[(c * 3 + w) & 4095], 6, 8.5);
      }
    }
    ctx.fillStyle = Pal.window; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1;

    /* sea: the lantern's reflection, then moving wave lines */
    if (seaW > 0.3) {
      var rh = U.sat(1 - (664 - S.y) / 520) * seaW;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * rh;
      ctx.drawImage(SP.glowWarm, V.lx - 70, 664, 140, 70);
      ctx.globalAlpha = 0.28 * rh;
      for (c = 0; c < 7; c++) { var rw = 26 - c * 3 + 5 * Math.sin(t * 2.4 + c * 1.9); ctx.drawImage(SP.glowHot, V.lx - rw * 0.5 + 3 * Math.sin(t * 1.7 + c), 670 + c * 9, rw, 9); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(170,200,255,0.16)"; ctx.lineWidth = 1.2;
      for (c = 0; c < 6; c++) {
        ctx.beginPath();
        var yy = 674 + c * 12, amp = 1.4 + c * 0.4;
        for (vx = -12; vx <= V.vw + 12; vx += 14) {
          y = yy + Math.sin((vx + wx) * 0.03 + t * 1.3 + c * 1.7) * amp;
          if (vx === -12) ctx.moveTo(vx, y); else ctx.lineTo(vx, y);
        }
        ctx.stroke();
      }
    }
  }

  /* ---- Public drawing entry points ---- */
  Sc.drawBackground = function (ctx, t) {
    drawSky(ctx, t);
    drawLayer(ctx, 0);
    drawMist(ctx, 0, 0.5);
    drawLayer(ctx, 1);
    drawWindows(ctx, 1, t);
    drawMist(ctx, 1, 0.42);
    drawLayer(ctx, 2);
    drawWindows(ctx, 2, t);
    drawMist(ctx, 2, 0.3);
    drawLayer(ctx, 3);
    drawWindows(ctx, 3, t);
  };
  Sc.drawGround = drawGround;

  SKY.Sc = Sc;
})(window.SKY = window.SKY || {});
