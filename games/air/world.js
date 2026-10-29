/* Sky Lantern: the world model. Zones, speed and difficulty curves, the ground, and the pools that hold
   obstacles, pickups and weather volumes. All shapes are tapered capsules (x1,y1,r1,x2,y2,r2), so one
   collision routine covers kites, wires, branches, rocks and birds. No DOM access: runs under Node too.
   Coordinates: x grows with distance flown, y grows downwards, the playfield is 720 units tall. */
(function (SKY) {
  "use strict";

  var U = SKY.U;
  var W = {};

  var FH = 720;
  W.FH = FH;
  W.RL = 15;                        // collision radius of the lantern

  /* ---- Zones. Length in units; the run is about 300 s at the speeds below (checked by tools, not by faith). ---- */
  var ZONES = [
    { key: "town",   len: 5200, yLo: 150, yHi: 470, soft: false },
    { key: "forest", len: 6700, yLo: 130, yHi: 480, soft: false },
    { key: "mount",  len: 7400, yLo: 120, yHi: 480, soft: false },
    { key: "sea",    len: 7700, yLo: 120, yHi: 485, soft: false },
    { key: "dawn",   len: 7900, yLo: 110, yHi: 500, soft: true }
  ];
  /* Scroll speed at each zone boundary (units per second); linear in between. */
  var SPEEDS = [100, 108, 114, 120, 126, 132];
  var START = [0], LTOTAL = 0, i;
  for (i = 0; i < ZONES.length; i++) { LTOTAL += ZONES[i].len; START.push(LTOTAL); }
  W.ZONES = ZONES;
  /* What the ground does to a lantern that sinks onto it: 0 soft clouds, 1 scuffs the flame, 2 tears the paper, 3 splashes. */
  W.FLOOR = [1, 1, 2, 3, 0];
  W.FLOOR_COST = [0, 0.035, 0, 0.09, 0];
  W.START = START;
  W.LTOTAL = LTOTAL;
  W.SPEEDS = SPEEDS;
  W.BLEND = 640;                    // scenery blends between two zones over this many units

  W.zoneIndex = function (x) {
    for (var b = 1; b < ZONES.length; b++) if (x < START[b]) return b - 1;
    return ZONES.length - 1;
  };

  /* Sets W.zA, W.zB (zone indices) and W.zW (0..1 share of zB) for a world x. */
  W.zA = 0; W.zB = 0; W.zW = 0;
  W.blend = function (x) {
    var half = W.BLEND * 0.5;
    for (var b = 1; b < ZONES.length; b++) {
      var edge = START[b];
      if (x < edge - half) { W.zA = b - 1; W.zB = b - 1; W.zW = 0; return; }
      if (x < edge + half) { W.zA = b - 1; W.zB = b; W.zW = U.smooth((x - (edge - half)) / W.BLEND); return; }
    }
    W.zA = W.zB = ZONES.length - 1; W.zW = 0;
  };

  W.speedAt = function (D) {
    if (D <= 0) return SPEEDS[0];
    if (D >= LTOTAL) return SPEEDS[ZONES.length];
    var z = W.zoneIndex(D);
    return SPEEDS[z] + (SPEEDS[z + 1] - SPEEDS[z]) * ((D - START[z]) / ZONES[z].len);
  };

  /* 0..1. Rises over the run, dips a little at the start of each new zone while its hazards are new. */
  W.difficultyAt = function (D) {
    var p = U.sat(D / LTOTAL);
    var d = 0.03 + 0.78 * Math.pow(p, 0.95);
    var z = W.zoneIndex(D);
    if (z > 0) d *= 0.86 + 0.14 * U.sat(((D - START[z]) / ZONES[z].len) * 2.5);
    return U.clamp(d, 0, 1);
  };

  /* ---- Ground: a pure function of x, used for drawing and collision alike. The ground stays low (y >= ~560);
     the real challenge is made of obstacles, so the path never has to follow terrain. ---- */
  /* One house of a row: where it stands inside its cell (a..b, fractions), wall height, roof height. Shared with the scenery. */
  var GC = { a: 0, b: 1, wall: 0, roof: 0, kind: 0 };
  W.gableCell = function (k, lo, hi, rlo, rhi, seed) {
    var r1 = U.hash(k * 7 + seed), r2 = U.hash(k * 7 + seed + 1), r3 = U.hash(k * 7 + seed + 2), r4 = U.hash(k * 7 + seed + 3);
    GC.a = 0.05 + 0.1 * r1; GC.b = 0.95 - 0.08 * r2;
    GC.wall = lo + (hi - lo) * r3;
    GC.kind = r4 < 0.66 ? 0 : (r4 < 0.86 ? 1 : 2);
    GC.roof = GC.kind === 0 ? rlo + (rhi - rlo) * r2 : (GC.kind === 1 ? rlo * 0.4 : 0);
    return GC;
  };
  /* Height of that house above the ground line at fraction f of its cell (0 between houses). */
  W.gableHeight = function (g, f) {
    if (f < g.a || f > g.b) return 0;
    var mid = (g.a + g.b) * 0.5, half = (g.b - g.a) * 0.5;
    return g.wall + g.roof * (1 - Math.abs(f - mid) / half);
  };
  function groundTown(x) {
    var C = 118, k = Math.floor(x / C);
    return 680 - W.gableHeight(W.gableCell(k, 34, 74, 12, 34, 1), x / C - k);
  }
  function groundForest(x) {
    var C = 92, k = Math.floor(x / C), best = 0;
    for (var j = k - 1; j <= k + 1; j++) {
      var c = (j + 0.2 + 0.6 * U.hash(j * 5 + 1)) * C;
      var R = 38 + 30 * U.hash(j * 5 + 2);
      var h = 26 + 50 * U.hash(j * 5 + 3);
      var d = (x - c) / R;
      if (d > -1 && d < 1) { var v = h * Math.sqrt(1 - d * d); if (v > best) best = v; }
    }
    return 660 - best;
  }
  function groundMount(x) {
    var ridge = 1 - Math.abs(2 * U.noise(x / 130) - 1);
    return 678 - (12 + 80 * ridge * ridge + 18 * U.noise(x / 47 + 31));
  }
  function groundSea() { return 664; }
  function groundDawn(x) {
    return 664 - (22 + 34 * U.noise(x / 85 + 9) + 16 * U.noise(x / 33 + 2));
  }
  var GROUND = [groundTown, groundForest, groundMount, groundSea, groundDawn];
  W.groundFn = GROUND;

  W.groundY = function (x) {
    W.blend(x);
    var a = GROUND[W.zA](x);
    return W.zW > 0 ? a + (GROUND[W.zB](x) - a) * W.zW : a;
  };

  /* ---- Shapes ---- */
  var NSH = 20;                     // capsules per obstacle
  var K = { KITE: 1, WIRES: 2, BRANCH: 3, TREE: 4, SPIRE: 5, STACK: 6, CHIMNEY: 7, FLOCK: 8, RISER: 9 };
  W.K = K;

  function Ob() {
    this.on = false; this.kind = 0; this.dyn = false;
    this.x0 = 0; this.x1 = 0;
    this.n = 0; this.sh = new Float32Array(NSH * 6);
    this.cn = 0; this.cur = new Float32Array(NSH * 6);
    this.p = new Float64Array(12);
    this.seed = 0; this.gy = 0; this.top = 0;
    this.rib = new Float32Array(112); this.ribOK = false;      // cached outline of limbs, built on first draw
  }
  function Vol() { this.on = false; this.type = 0; this.x0 = 0; this.x1 = 0; this.y0 = 0; this.y1 = 0; this.a = 0; this.b = 0; this.seed = 0; }
  function Item() { this.on = false; this.type = 0; this.x = 0; this.y = 0; this.ay = 0; this.ph = 0; this.pull = 0; this.born = 0; }

  var OBS = [], VOLS = [], ITEMS = [];
  for (i = 0; i < 56; i++) OBS.push(new Ob());
  for (i = 0; i < 28; i++) VOLS.push(new Vol());
  for (i = 0; i < 240; i++) ITEMS.push(new Item());
  W.OBS = OBS; W.VOLS = VOLS; W.ITEMS = ITEMS;
  W.VT = { SMOKE: 1, RAIN: 2, GUST_DOWN: 3, GUST_HEAD: 4, GUST_TAIL: 5, GUST_UP: 6 };
  W.IT = { STAR: 0, EMBER: 1, FIREFLY: 2 };

  /* Path of the intended route (the generator writes it; pickups follow it; the test pilot reads it). */
  var PN = 192;
  var PX = new Float64Array(PN), PY = new Float64Array(PN);
  var pathHead = 0, pathCount = 0;
  W.pathPush = function (x, y) {
    if (pathCount > 0 && x <= PX[(pathHead + pathCount - 1) % PN] + 1) return;
    if (pathCount === PN) { pathHead = (pathHead + 1) % PN; pathCount--; }
    var k = (pathHead + pathCount) % PN;
    PX[k] = x; PY[k] = y; pathCount++;
  };
  W.pathLastX = function () { return pathCount ? PX[(pathHead + pathCount - 1) % PN] : 0; };
  W.pathLastY = function () { return pathCount ? PY[(pathHead + pathCount - 1) % PN] : 360; };
  /* Eased interpolation between waypoints; holds the first and last value outside. */
  W.pathY = function (x) {
    if (pathCount === 0) return 360;
    var a = pathHead, last = (pathHead + pathCount - 1) % PN;
    if (x <= PX[a]) return PY[a];
    if (x >= PX[last]) return PY[last];
    var lo = 0, hi = pathCount - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (PX[(pathHead + mid) % PN] <= x) lo = mid; else hi = mid;
    }
    var i0 = (pathHead + lo) % PN, i1 = (pathHead + hi) % PN;
    var u = (x - PX[i0]) / (PX[i1] - PX[i0]);
    return PY[i0] + (PY[i1] - PY[i0]) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  };

  /* ---- Allocation ---- */
  function allocOb(kind) {
    for (var j = 0; j < OBS.length; j++) {
      var o = OBS[j];
      if (!o.on) { o.on = true; o.kind = kind; o.dyn = false; o.n = 0; o.cn = 0; o.seed = 0; o.ribOK = false; return o; }
    }
    return null;
  }
  function push(o, x1, y1, r1, x2, y2, r2) {
    if (o.n >= NSH) return;
    var s = o.sh, b = o.n * 6;
    s[b] = x1; s[b + 1] = y1; s[b + 2] = r1; s[b + 3] = x2; s[b + 4] = y2; s[b + 5] = r2;
    o.n++;
  }
  function allocVol(type, x0, x1, y0, y1, a, b) {
    for (var j = 0; j < VOLS.length; j++) {
      var v = VOLS[j];
      if (!v.on) { v.on = true; v.type = type; v.x0 = x0; v.x1 = x1; v.y0 = y0; v.y1 = y1; v.a = a || 0; v.b = b || 0; v.seed = 0; return v; }
    }
    return null;
  }
  W.addItem = function (type, x, y, born) {
    for (var j = 0; j < ITEMS.length; j++) {
      var it = ITEMS[j];
      if (!it.on) { it.on = true; it.type = type; it.x = x; it.y = y; it.ay = y; it.ph = (x * 0.0137 + y * 0.0071) % 6.283; it.pull = 0; it.born = born || 0; return it; }
    }
    return null;
  };

  /* ---- Builders. Each returns the obstacle (or null when the pool is full). ---- */

  /* Kite: swaying circle, string to the ground. p: cx, cy, ampX, ampY, phX, phY, wX, wY, anchorX, anchorY, colour, size. */
  W.addKite = function (cx, cy, ampX, ampY, seed) {
    var o = allocOb(K.KITE); if (!o) return null;
    var r = new U.RNG(seed), p = o.p;
    o.dyn = true; o.seed = seed;
    p[0] = cx; p[1] = cy; p[2] = ampX; p[3] = ampY;
    p[4] = r.range(0, 6.28); p[5] = r.range(0, 6.28);
    p[6] = 6.283 / r.range(3.3, 4.8); p[7] = 6.283 / r.range(2.5, 3.9);
    p[8] = cx + r.range(-110, 110); p[9] = W.groundY(p[8]);
    p[10] = r.int(0, 3); p[11] = r.range(0.92, 1.1);
    o.x0 = cx - ampX - 30; o.x1 = cx + ampX + 30;
    o.top = cy - ampY - 24;
    return o;
  };

  /* Wire gate: two or three sagging wires between poles. Only the wires are solid; the poles stand in the
     background, so the lantern can fly through the gap between the wires. */
  W.addWires = function (xc, len, yUp, yLo, third, seed) {
    var o = allocOb(K.WIRES); if (!o) return null;
    var p = o.p, half = len * 0.5, sag = 13, segs = 5, w, k;
    var rows = third ? 3 : 2, ys0 = [yUp, yLo, yUp - 58];
    o.seed = seed;
    for (w = 0; w < rows; w++) {
      for (k = 0; k < segs; k++) {
        var u0 = -1 + (2 * k) / segs, u1 = -1 + (2 * (k + 1)) / segs;
        push(o, xc + u0 * half, ys0[w] + sag * (1 - u0 * u0), 3.4, xc + u1 * half, ys0[w] + sag * (1 - u1 * u1), 3.4);
      }
    }
    var topY = (third ? yUp - 58 : yUp) - 30;
    p[0] = xc - half; p[1] = xc + half; p[2] = yUp; p[3] = yLo; p[4] = sag; p[5] = third ? 1 : 0; p[6] = topY;
    p[7] = W.groundY(xc - half); p[8] = W.groundY(xc + half);
    o.x0 = xc - half - 14; o.x1 = xc + half + 14;
    o.top = topY;
    return o;
  };

  /* Branch hanging from the top of the screen: an S-shaped bough that droops to a tip. The tip is the lowest point
     (tipY plus its radius), so the gap under it is exactly what the generator asked for. */
  W.addBranch = function (x, tipY, side, seed) {
    var o = allocOb(K.BRANCH); if (!o) return null;
    var r = new U.RNG(seed), p = o.p, k, t, a, b, c, d;
    var ty = tipY - 5;
    var rx = x + side * r.range(150, 190), ry = -60;
    var c1x = x + side * r.range(120, 160), c1y = 40 + 0.12 * ty;
    var c2x = x + side * r.range(30, 70), c2y = ty * r.range(0.5, 0.62);
    var rad = [19, 16, 13, 10.5, 8, 5.2];
    var bx = [], by = [];
    for (k = 0; k < 6; k++) {
      t = k / 5; a = (1 - t) * (1 - t) * (1 - t); b = 3 * (1 - t) * (1 - t) * t; c = 3 * (1 - t) * t * t; d = t * t * t;
      bx.push(a * rx + b * c1x + c * c2x + d * x + (k > 0 && k < 5 ? r.range(-4, 4) : 0));
      by.push(Math.min(ty, a * ry + b * c1y + c * c2y + d * ty));
    }
    for (k = 0; k < 5; k++) push(o, bx[k], by[k], rad[k], bx[k + 1], by[k + 1], rad[k + 1]);
    /* twigs off the middle, always ending above the tip */
    var dir = r.sign();
    var tw1 = r.range(46, 70), tw2 = r.range(36, 56);
    push(o, bx[2], by[2], 6.5, bx[2] + dir * tw1 * 0.85, Math.min(by[2] + tw1 * 0.55, ty - 30), 3);
    push(o, bx[3], by[3], 5.5, bx[3] - dir * tw2 * 0.8, Math.min(by[3] + tw2 * 0.6, ty - 24), 2.6);
    p[0] = x; p[1] = tipY; p[2] = side; p[3] = dir;
    p[4] = rx; p[5] = ry; p[6] = c1x; p[7] = c1y; p[8] = c2x; p[9] = c2y; p[10] = ty;
    var minX = x, maxX = x;
    for (k = 0; k < o.n; k++) { minX = Math.min(minX, o.sh[k * 6], o.sh[k * 6 + 3]); maxX = Math.max(maxX, o.sh[k * 6], o.sh[k * 6 + 3]); }
    o.x0 = minX - 30; o.x1 = maxX + 30;
    o.top = ry;
    return o;
  };

  /* Tree growing from the ground; the canopy top is topY. */
  W.addTree = function (x, topY, seed) {
    var o = allocOb(K.TREE); if (!o) return null;
    var r = new U.RNG(seed), p = o.p;
    var gy = W.groundY(x), lean = r.range(-10, 10);
    o.seed = seed; o.gy = gy; o.top = topY;
    push(o, x + lean * 0.4, topY + 50, 10, x, gy + 16, 20);
    push(o, x + lean * 0.3, topY + 40, 38, x + lean * 0.3, topY + 40, 38);
    push(o, x - 32 + lean, topY + 66, 28, x - 32 + lean, topY + 66, 28);
    push(o, x + 34 + lean, topY + 58, 30, x + 34 + lean, topY + 58, 30);
    p[0] = x; p[1] = topY; p[2] = gy; p[3] = lean;
    o.x0 = x - 74; o.x1 = x + 76;
    return o;
  };

  /* Rock spire (mountains). A twin of lower height stands beside the main one. */
  W.addSpire = function (x, topY, seed) {
    var o = allocOb(K.SPIRE); if (!o) return null;
    var r = new U.RNG(seed), p = o.p;
    var gy = W.groundY(x), lean = r.range(-14, 14), baseR = r.range(40, 52);
    var twinDx = r.sign() * baseR * r.range(0.95, 1.2), twinTop = Math.min(gy - 40, topY + r.range(60, 120));
    o.seed = seed; o.gy = gy; o.top = topY;
    push(o, x + lean, topY + 9, 7, x, gy + 14, baseR);
    push(o, x + twinDx + lean * 0.4, twinTop + 8, 6, x + twinDx, gy + 14, baseR * 0.72);
    p[0] = x; p[1] = topY; p[2] = gy; p[3] = baseR; p[4] = lean; p[5] = twinDx; p[6] = twinTop;
    o.x0 = x - baseR - Math.abs(twinDx) - 20; o.x1 = x + baseR + Math.abs(twinDx) + 20;
    return o;
  };

  /* Sea stack: a blunt rock pillar standing in the water. */
  W.addStack = function (x, topY, seed) {
    var o = allocOb(K.STACK); if (!o) return null;
    var r = new U.RNG(seed), p = o.p;
    var gy = W.groundY(x), baseR = r.range(46, 62), topR = baseR * r.range(0.55, 0.7);
    o.seed = seed; o.gy = gy; o.top = topY;
    push(o, x, topY + topR + 1, topR, x, gy + 14, baseR);
    p[0] = x; p[1] = topY; p[2] = gy; p[3] = baseR; p[4] = topR;
    o.x0 = x - baseR - 20; o.x1 = x + baseR + 20;
    return o;
  };

  /* Chimney with a smoke column above it (the smoke is a volume, the chimney a small solid). */
  W.addChimney = function (x, smokeTopY, seed) {
    var o = allocOb(K.CHIMNEY); if (!o) return null;
    var gy = W.groundY(x) + 2;
    o.seed = seed; o.gy = gy; o.top = gy - 40;
    push(o, x, gy - 30, 11, x, gy + 8, 11);
    o.p[0] = x; o.p[1] = gy;
    o.x0 = x - 20; o.x1 = x + 20;
    var v = allocVol(W.VT.SMOKE, x - 80, x + 80, smokeTopY, gy - 40, 40, 66);
    if (v) v.seed = seed;
    return o;
  };

  /* Flock crossing the lantern's path. Bird x and y depend on the distance flown D, not on time, so the meeting
     point Xm is exact whatever the wind does. k is how much faster than the ground the flock flies at the lantern. */
  W.addFlock = function (Xm, yc, half, n, k, seed) {
    var o = allocOb(K.FLOCK); if (!o) return null;
    var r = new U.RNG(seed), p = o.p;
    o.dyn = true; o.seed = seed; o.n = Math.min(n, NSH);
    for (var j = 0; j < o.n; j++) {
      o.sh[2 * j] = r.range(-70, 70);
      o.sh[2 * j + 1] = r.range(-half, half);
    }
    p[0] = Xm; p[1] = yc; p[2] = k; p[3] = half;
    o.x0 = Xm - 240; o.x1 = Xm + 240;
    o.top = yc - half;
    return o;
  };

  /* Group of festival lanterns that rise as the lantern approaches. They meet the lantern's x at height ym + oy. */
  W.addRiser = function (xc, ym, slope, n, seed) {
    var o = allocOb(K.RISER); if (!o) return null;
    var r = new U.RNG(seed), p = o.p;
    o.dyn = true; o.seed = seed; o.n = Math.min(n, NSH);
    for (var j = 0; j < o.n; j++) {
      o.sh[3 * j] = r.range(-70, 70) * (j ? 1 : 0.2);
      o.sh[3 * j + 1] = r.range(-70, 70) * (j ? 1 : 0.2);
      o.sh[3 * j + 2] = r.range(0.85, 1.15);
    }
    p[0] = xc; p[1] = ym; p[2] = slope;
    o.x0 = xc - 170; o.x1 = xc + 170;
    o.top = ym - 100;
    return o;
  };

  W.addRain = function (xc, cy, w, len, seed) {
    /* cloud body is ~96 tall around cy; rain falls below it for len */
    var v = allocVol(W.VT.RAIN, xc - w * 0.5, xc + w * 0.5, cy - 46, cy + len, w, cy);
    if (v) v.seed = seed;
    return v;
  };
  /* type: GUST_*; strength: units per second squared (up/down) or speed share (head/tail) */
  W.addGust = function (type, x0, x1, y0, y1, strength, seed) {
    var v = allocVol(type, x0, x1, y0, y1, strength, 0);
    if (v) v.seed = seed;
    return v;
  };

  /* ---- Dynamic positions ---- */
  /* Writes the current capsules of a dynamic obstacle into out; returns how many. */
  W.dynShapes = function (o, t, D, out) {
    var p = o.p, j, x, y, base;
    switch (o.kind) {
      case K.KITE:
        x = p[0] + p[2] * Math.sin(p[6] * t + p[4]);
        y = p[1] + p[3] * Math.sin(p[7] * t + p[5]);
        out[0] = x; out[1] = y; out[2] = 21; out[3] = x; out[4] = y; out[5] = 21;
        return 1;
      case K.FLOCK:
        base = p[0] + p[2] * (p[0] - D);
        for (j = 0; j < o.n; j++) {
          x = base + o.sh[2 * j];
          y = p[1] + o.sh[2 * j + 1] + 5 * Math.sin(D * 0.045 + j * 1.7);
          out[6 * j] = x; out[6 * j + 1] = y; out[6 * j + 2] = 8; out[6 * j + 3] = x; out[6 * j + 4] = y; out[6 * j + 5] = 8;
        }
        return o.n;
      case K.RISER:
        for (j = 0; j < o.n; j++) {
          x = p[0] + o.sh[3 * j];
          y = p[1] + o.sh[3 * j + 1] + p[2] * (x - D);
          out[6 * j] = x; out[6 * j + 1] = y; out[6 * j + 2] = 19 * o.sh[3 * j + 2]; out[6 * j + 3] = x; out[6 * j + 4] = y; out[6 * j + 5] = 19 * o.sh[3 * j + 2];
        }
        return o.n;
    }
    return 0;
  };

  /* Refreshes o.cur for every live dynamic obstacle; the renderer and the live collision test read it. */
  W.updateDynamic = function (t, D) {
    for (var j = 0; j < OBS.length; j++) {
      var o = OBS[j];
      if (o.on && o.dyn) o.cn = W.dynShapes(o, t, D, o.cur);
    }
  };

  /* Drops everything that is behind the left edge of the screen. */
  W.release = function (xMin) {
    var j;
    for (j = 0; j < OBS.length; j++) if (OBS[j].on && OBS[j].x1 < xMin) OBS[j].on = false;
    for (j = 0; j < VOLS.length; j++) if (VOLS[j].on && VOLS[j].x1 < xMin) VOLS[j].on = false;
    for (j = 0; j < ITEMS.length; j++) if (ITEMS[j].on && ITEMS[j].x < xMin) ITEMS[j].on = false;
  };

  W.reset = function () {
    var j;
    for (j = 0; j < OBS.length; j++) OBS[j].on = false;
    for (j = 0; j < VOLS.length; j++) VOLS[j].on = false;
    for (j = 0; j < ITEMS.length; j++) ITEMS[j].on = false;
    pathHead = 0; pathCount = 0;
  };

  /* ---- Collision ---- */
  W.hitNX = 0; W.hitNY = -1; W.hitOb = null;
  var SCR = new Float32Array(NSH * 6);

  function capsule(cx, cy, cr, a, o6) {
    var ax = a[o6], ay = a[o6 + 1], ar = a[o6 + 2], bx = a[o6 + 3], by = a[o6 + 4], br = a[o6 + 5];
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 > 1e-6 ? ((cx - ax) * dx + (cy - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var px = ax + dx * t, py = ay + dy * t, rr = ar + (br - ar) * t + cr;
    var ex = cx - px, ey = cy - py, d2 = ex * ex + ey * ey;
    if (d2 >= rr * rr) return false;
    var d = Math.sqrt(d2);
    if (d < 1e-4) { W.hitNX = 0; W.hitNY = -1; } else { W.hitNX = ex / d; W.hitNY = ey / d; }
    return true;
  }

  /* Does a circle touch any obstacle? live=true reads the shapes the frame already computed; false computes them for time t, distance D. */
  W.hitAt = function (x, y, r, t, D, live) {
    for (var j = 0; j < OBS.length; j++) {
      var o = OBS[j];
      if (!o.on || x < o.x0 - r || x > o.x1 + r) continue;
      var arr, n, k;
      if (o.dyn) {
        if (live) { arr = o.cur; n = o.cn; } else { n = W.dynShapes(o, t, D, SCR); arr = SCR; }
      } else { arr = o.sh; n = o.n; }
      for (k = 0; k < n; k++) {
        if (capsule(x, y, r, arr, k * 6)) { W.hitOb = o; return true; }
      }
    }
    return false;
  };

  /* True if a circle is clear of every static obstacle (used when placing pickups). */
  W.staticFree = function (x, y, r) {
    for (var j = 0; j < OBS.length; j++) {
      var o = OBS[j];
      if (!o.on || o.dyn || x < o.x0 - r || x > o.x1 + r) continue;
      for (var k = 0; k < o.n; k++) if (capsule(x, y, r, o.sh, k * 6)) return false;
    }
    return true;
  };

  /* Weather at a point. Writes into the shared result object. */
  var FX = { smoke: 0, rain: 0, gAy: 0, gSpeed: 0, gust: 0 };
  W.FX = FX;
  W.volumesAt = function (x, y, r) {
    FX.smoke = 0; FX.rain = 0; FX.gAy = 0; FX.gSpeed = 0; FX.gust = 0;
    for (var j = 0; j < VOLS.length; j++) {
      var v = VOLS[j];
      if (!v.on || x < v.x0 - r || x > v.x1 + r) continue;
      switch (v.type) {
        case 1: { // smoke: a column that widens upwards
          if (y < v.y0 - r * 0.5 || y > v.y1 + r) break;
          var tt = U.sat((y - v.y0) / (v.y1 - v.y0));
          var hw = v.b + (v.a - v.b) * tt, cxs = (v.x0 + v.x1) * 0.5;
          if (Math.abs(x - cxs) < hw * 0.6 + r * 0.4) FX.smoke = 1;
          break;
        }
        case 2: { // rain: the cloud and the curtain under it
          if (y < v.y0 - r * 0.3 || y > v.y1 || x < v.x0 + r * 0.3 || x > v.x1 - r * 0.3) break;
          FX.rain = 1;
          break;
        }
        default: { // gusts
          if (y < v.y0 || y > v.y1 || x < v.x0 || x > v.x1) break;
          var u = (x - v.x0) / (v.x1 - v.x0), s = Math.sin(Math.PI * u);
          var env = s * s;
          if (env > FX.gust) FX.gust = env;
          if (v.type === 3) FX.gAy += v.a * env;
          else if (v.type === 6) FX.gAy -= v.a * env;
          else if (v.type === 4) FX.gSpeed -= v.a * env;
          else FX.gSpeed += v.a * env;
        }
      }
    }
    return FX;
  };

  SKY.W = W;
})(window.SKY = window.SKY || {});
