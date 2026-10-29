/* Sky Lantern: level generator. Builds the night ahead of the lantern from a seed.
   Each pattern first lays down a route (waypoints the lantern can follow), then places obstacles around it with
   a known clearance, then pickups along it. So every stretch is passable by construction; difficulty only shrinks
   the clearance, packs patterns closer and adds weather. No DOM access. */
(function (SKY) {
  "use strict";

  var U = SKY.U, W = SKY.W, IT = W.IT, VT = W.VT, ZONES = W.ZONES;
  var G = {};

  var rng = new U.RNG(1);
  var X = 0;                       // the generator's front: everything beyond it is still empty
  var emberAt = 0, hard = 0, lastKey = "", finished = false, forced = null;
  G.totals = { stars: 0, embers: 0, fireflies: 0 };
  G.seed = 1;

  function sd() { return rng.int(1, 2147483646); }
  function wp(x, y) { W.pathPush(x, y); }
  function star(x, y) { if (W.addItem(IT.STAR, x, y)) G.totals.stars++; }
  function ember(x, y) { if (W.addItem(IT.EMBER, x, y)) G.totals.embers++; }
  function firefly(x, y) { if (W.addItem(IT.FIREFLY, x, y)) G.totals.fireflies++; }

  function gapFor(d) { return U.lerp(300, 216, d); }

  /* Next route height: a random target inside [lo,hi], reached no faster than the slope limit allows. */
  function nextY(dx, d, lo, hi) {
    var py = W.pathLastY(), slope = 0.34 + 0.18 * d;
    var reach = slope * Math.max(dx, 40);
    return U.clamp(rng.range(lo, hi), Math.max(lo, py - reach), Math.min(hi, py + reach));
  }

  /* An arch of stars that follows the route between xa and xb. */
  function starRun(xa, xb, n, amp) {
    for (var k = 0; k < n; k++) {
      var u = (k + 0.5) / n, x = xa + (xb - xa) * u;
      star(x, W.pathY(x) - amp * Math.sin(Math.PI * u));
    }
  }
  function swarm(x, y, n) {
    for (var k = 0; k < n; k++) {
      var a = rng.range(0, 6.283), r = rng.range(6, 44);
      firefly(x + Math.cos(a) * r * 1.7, y + Math.sin(a) * r);
    }
  }
  function maybeEmber(x, d) {
    if (x < emberAt) return;
    ember(x, W.pathY(x) + rng.range(-16, 16));
    emberAt = x + rng.range(560, 760) * (1.1 - 0.2 * d);
  }

  /* ---- Patterns. Each starts at the front X and moves it to where it ends. ---- */

  function cruise(zi, d) {
    var z = ZONES[zi], len = rng.range(380, 600) * (1.1 - 0.35 * d), n = Math.max(2, Math.round(len / 300));
    var x0 = X, k;
    for (k = 1; k <= n; k++) {
      var xk = x0 + (len * k) / n;
      wp(xk, nextY(xk - W.pathLastX(), d * 0.7, z.yLo + 10, z.yHi - 30));
    }
    X = x0 + len;
    starRun(x0 + 60, X - 80, 4 + Math.round(len / 280), rng.range(18, 46));
    if (zi === 1 && rng.chance(0.65)) swarm(x0 + len * rng.range(0.35, 0.65), W.pathY(x0 + len * 0.5) + rng.range(-34, 34), rng.int(6, 9));
    maybeEmber(X - 20, d);
  }

  function wires(zi, d) {
    var z = ZONES[zi], L = rng.range(250, 340) * (1 - 0.1 * d), gp = gapFor(d), approach = rng.range(240, 300);
    var xs = X + approach, xc = xs + L * 0.5;
    var yc = nextY(approach - 40, d, Math.max(z.yLo, gp * 0.5 + 62), Math.min(z.yHi, 600 - gp * 0.5));
    wp(xs - 40, yc);
    W.addWires(xc, L, yc - gp * 0.5, yc + gp * 0.5, d > 0.5 && rng.chance(0.7), sd());
    wp(xs + L + 40, yc + 6);
    starRun(xs + 50, xs + L - 50, 4, 0);
    X = xs + L + 40;
    maybeEmber(X, d);
  }

  function kites(zi, d) {
    var z = ZONES[zi], m = (d > 0.45 ? rng.int(2, 4) : rng.int(1, 3)), sx = U.lerp(370, 300, d);
    var xk = X + 240, firstX = xk, k;
    for (k = 0; k < m; k++) {
      var ay = rng.range(22, 38) * (0.75 + 0.45 * d), ax = rng.range(26, 44);
      var gp = gapFor(d), half = gp * 0.5 + ay + 21;
      var yc = nextY(xk - 30 - W.pathLastX(), d, Math.max(z.yLo, 92), z.yHi);
      var upOK = yc - half >= 56, dnOK = yc + half + ay + 21 <= 620;
      var side = upOK && dnOK ? (d > 0.6 && rng.chance(0.2) ? 2 : rng.chance(0.5) ? 0 : 1) : (upOK ? 0 : 1);
      if (!upOK && !dnOK) { yc = U.clamp(yc, 56 + half, 620 - half - ay - 21); side = 2; }
      if (side === 0 || side === 2) W.addKite(xk, yc - half, ax, ay, sd());
      if (side === 1 || side === 2) W.addKite(xk + (side === 2 ? 90 : 0), yc + half, ax, ay, sd());
      wp(xk - 30, yc);
      wp(xk + 30, yc);
      if (k < m - 1) starRun(xk + 60, xk + sx * 0.85, 2, 0);
      xk += sx * rng.range(0.92, 1.2);
    }
    if (m === 1) starRun(firstX + 70, firstX + 300, 3, 14);
    X = xk - sx * 0.7 + 120;
    wp(X, W.pathLastY());
    maybeEmber(X, d);
  }

  function smoke(zi, d) {
    var z = ZONES[zi], m = d > 0.35 && rng.chance(0.55) ? 2 : 1, x = X + 260, k;
    for (k = 0; k < m; k++) {
      var gy = W.groundY(x);
      var yc = nextY(x - 90 - W.pathLastX(), d, z.yLo, Math.min(380, gy - 40 - 50 - 62));
      wp(x - 100, yc);
      W.addChimney(x, yc + 62, sd());
      wp(x + 100, yc);
      star(x - 40, yc - 26); star(x, yc - 34); star(x + 40, yc - 26);
      x += rng.range(340, 440);
    }
    X = x - 160;
    wp(X, W.pathLastY());
    maybeEmber(X, d);
  }

  function branches(zi, d) {
    var z = ZONES[zi], m = (d > 0.5 ? rng.int(2, 4) : rng.int(1, 3)), sx = U.lerp(400, 330, d);
    var xk = X + 240, k;
    for (k = 0; k < m; k++) {
      var gp = gapFor(d);
      var yc = nextY(xk - 55 - W.pathLastX(), d, Math.max(z.yLo, gp * 0.5 + 66), Math.min(z.yHi, 590 - gp * 0.5));
      var r = rng.next(), mode = (k === 0 && d < 0.2) ? 2 : (r < 0.6 ? 2 : (r < 0.8 ? 0 : 1));   // 0 hang only, 1 tree only, 2 both
      wp(xk - 55, yc);
      if (mode !== 1) W.addBranch(xk, yc - gp * 0.5 - 5, rng.sign(), sd());
      if (mode !== 0) W.addTree(xk, yc + gp * 0.5, sd());
      wp(xk + 55, yc);
      if (k < m - 1) starRun(xk + 80, xk + sx * 0.8, 2, 0);
      xk += sx * rng.range(0.92, 1.18);
    }
    X = xk - sx * 0.7 + 130;
    wp(X, W.pathLastY());
    maybeEmber(X, d);
  }

  function spires(zi, d) {
    var z = ZONES[zi], m = (d > 0.5 ? rng.int(2, 4) : rng.int(1, 3)), sx = U.lerp(420, 340, d);
    var xk = X + 250, k, clear = U.lerp(152, 122, d);
    for (k = 0; k < m; k++) {
      var gy = W.groundY(xk);
      var yc = nextY(xk - 80 - W.pathLastX(), d, z.yLo, Math.min(z.yHi - 20, gy - 90 - clear));
      wp(xk - 80, yc);
      W.addSpire(xk, yc + clear, sd());
      wp(xk + 80, yc);
      star(xk, yc - 22);
      if (k < m - 1) starRun(xk + 110, xk + sx * 0.8, 2, 0);
      xk += sx * rng.range(0.92, 1.2);
    }
    X = xk - sx * 0.7 + 130;
    wp(X, W.pathLastY());
    maybeEmber(X, d);
  }

  function stacks(zi, d) {
    var z = ZONES[zi], m = (d > 0.5 ? rng.int(2, 3) : rng.int(1, 3)), sx = U.lerp(430, 350, d);
    var xk = X + 260, k, clear = U.lerp(154, 124, d);
    for (k = 0; k < m; k++) {
      var gy = W.groundY(xk);
      var yc = nextY(xk - 90 - W.pathLastX(), d, z.yLo, Math.min(z.yHi - 10, gy - 100 - clear));
      wp(xk - 90, yc);
      W.addStack(xk, yc + clear, sd());
      wp(xk + 90, yc);
      star(xk, yc - 24);
      if (k < m - 1) starRun(xk + 120, xk + sx * 0.8, 2, 0);
      xk += sx * rng.range(0.92, 1.2);
    }
    X = xk - sx * 0.7 + 140;
    wp(X, W.pathLastY());
    maybeEmber(X, d);
  }

  function risers(zi, d) {
    var z = ZONES[zi], m = (d > 0.5 ? rng.int(2, 3) : rng.int(1, 3)), sx = U.lerp(430, 350, d);
    var xk = X + 250, k;
    for (k = 0; k < m; k++) {
      var gp = gapFor(d);
      var yc = nextY(xk - 60 - W.pathLastX(), d, Math.max(z.yLo, 150), Math.min(z.yHi, 560 - gp * 0.5));
      var below = yc < 330 ? true : (yc > 430 ? false : rng.chance(0.5));
      var ym = yc + (below ? 1 : -1) * (gp * 0.5 + 100);
      wp(xk - 60, yc);
      W.addRiser(xk, ym, rng.range(0.3, 0.5), rng.int(2, 3 + (d > 0.5 ? 1 : 0)), sd());
      wp(xk + 60, yc);
      if (k < m - 1) starRun(xk + 90, xk + sx * 0.8, 2, 0);
      xk += sx * rng.range(0.92, 1.2);
    }
    X = xk - sx * 0.7 + 130;
    wp(X, W.pathLastY());
    maybeEmber(X, d);
  }

  function flock(zi, d) {
    var z = ZONES[zi], xm = X + rng.range(420, 520), k = rng.range(0.5, 0.95);
    var n = rng.int(4, 6) + (d > 0.55 ? 2 : 0), half = rng.range(32, 48) + n * 2.5;
    var yp = nextY(xm - 150 - W.pathLastX(), d, Math.max(z.yLo, half * 2 + 90), Math.min(z.yHi, 590 - half * 2));
    var above = yp > 300 ? (rng.chance(0.65)) : false;       // flock above the route when the route is low, else below it
    var yc = yp + (above ? -1 : 1) * (half + 76);
    if (yc - half < 30) yc = yp + half + 76;
    wp(xm - 150, yp);
    W.addFlock(xm, yc, half, n, k, sd());
    wp(xm + 150, yp);
    starRun(xm - 110, xm + 110, 3, 0);
    X = xm + 210;
    maybeEmber(X, d);
  }

  function gust(zi, d) {
    var z = ZONES[zi], len = rng.range(380, 560), x0 = X + 260, type, strength, r = rng.next();
    if (zi === 1) type = VT.GUST_HEAD;
    else if (zi === 2) type = r < 0.55 ? VT.GUST_DOWN : VT.GUST_HEAD;
    else if (zi === 3) type = r < 0.45 ? VT.GUST_DOWN : (r < 0.75 ? VT.GUST_HEAD : VT.GUST_TAIL);
    else type = r < 0.35 ? VT.GUST_TAIL : (r < 0.65 ? VT.GUST_UP : VT.GUST_HEAD);
    if (type === VT.GUST_DOWN) strength = U.lerp(140, 205, d);
    else if (type === VT.GUST_UP) strength = U.lerp(130, 180, d);
    else strength = type === VT.GUST_HEAD ? U.lerp(0.2, 0.34, d) : U.lerp(0.2, 0.3, d);
    var hiY = type === VT.GUST_DOWN ? z.yLo + (z.yHi - z.yLo) * 0.6 : z.yHi - 30;
    var yc = nextY(x0 - W.pathLastX(), d * 0.6, z.yLo + 20, hiY);
    wp(x0 + len * 0.5, yc);
    W.addGust(type, x0, x0 + len, -80, 800, strength, sd());
    X = x0 + len + 60;
    wp(X, yc);
    starRun(x0 + 60, x0 + len - 40, 5, 22);
    maybeEmber(X, d);
  }

  function rain(zi, d) {
    var z = ZONES[zi], w = rng.range(230, 320), len = rng.range(240, 330), xc = X + 330 + w * 0.5;
    var gy = W.groundY(xc);
    /* route over the cloud needs the route high; route under needs room below the rain curtain */
    var overHi = Math.min(z.yHi - 40, gy - 60 - len - 110), overOK = overHi > z.yLo + 10;
    var underOK = (z.yHi - 70 - len) > 70;
    var over = overOK && (!underOK || rng.chance(0.5));
    var yp, cy;
    if (over) {
      yp = nextY(xc - w * 0.5 - 90 - W.pathLastX(), d, z.yLo, overHi);
      cy = yp + 128;
    } else {
      cy = rng.range(80, z.yHi - 70 - len);
      yp = Math.min(z.yHi, cy + len + 86);
    }
    wp(xc - w * 0.5 - 90, yp);
    W.addRain(xc, cy, w, len, sd());
    wp(xc + w * 0.5 + 90, yp);
    starRun(xc - w * 0.5, xc + w * 0.5, 4, 0);
    X = xc + w * 0.5 + 150;
    maybeEmber(X, d);
  }

  /* Last stretch: no obstacles, the route climbs toward the sun and the pickups make a bright arc. */
  function calm() {
    var x0 = X, n = 3, k;
    for (k = 1; k <= n; k++) wp(x0 + (k * 820) / n, U.lerp(W.pathLastY(), 300, k / n));
    X = x0 + 820 + 500;
    wp(X, 290);
    starRun(x0 + 80, x0 + 800, 8, 40);
    ember(x0 + 260, W.pathY(x0 + 260));
    ember(x0 + 640, W.pathY(x0 + 640));
    finished = true;
  }

  /* ---- Choosing ---- */
  var PATTERN = { cruise: cruise, wires: wires, kites: kites, smoke: smoke, branches: branches, spires: spires, stacks: stacks,
                  risers: risers, flock: flock, gust: gust, rain: rain };
  var TABLE = [
    [["cruise", 0.45, 0], ["kites", 3, 0], ["wires", 3, 0.05], ["smoke", 2, 0.1]],
    [["cruise", 0.45, 0], ["branches", 4.5, 0], ["flock", 2, 0.3], ["gust", 1, 0.3]],
    [["cruise", 0.45, 0], ["spires", 3.5, 0], ["flock", 2, 0], ["gust", 2, 0], ["rain", 2.2, 0.1]],
    [["cruise", 0.45, 0], ["stacks", 3.5, 0], ["flock", 2, 0], ["gust", 2, 0], ["rain", 2.6, 0]],
    [["cruise", 0.45, 0], ["risers", 3.5, 0], ["flock", 2.5, 0], ["gust", 2, 0], ["rain", 1.3, 0]]
  ];
  var SIGNATURE = ["kites", "branches", "spires", "stacks", "risers"];

  function pick(zi, d) {
    var t = TABLE[zi], total = 0, j, key;
    var sinceZone = X - W.START[zi];
    if (forced) { key = forced; forced = null; return key; }
    if (sinceZone < 520 && lastKey !== SIGNATURE[zi]) return SIGNATURE[zi];
    if (hard >= (d < 0.45 ? 3 : 4)) return "cruise";
    /* weather waits until the zone has been underway for a while */
    for (j = 0; j < t.length; j++) {
      key = t[j][0];
      if (d >= t[j][2] && key !== lastKey && !((key === "rain" || key === "gust") && sinceZone < 640)) total += t[j][1];
    }
    var roll = rng.next() * total;
    for (j = 0; j < t.length; j++) {
      key = t[j][0];
      if (!(d >= t[j][2] && key !== lastKey && !((key === "rain" || key === "gust") && sinceZone < 640))) continue;
      roll -= t[j][1];
      if (roll <= 0) return key;
    }
    return "cruise";
  }

  function step() {
    var d = W.difficultyAt(X);
    X += U.lerp(150, 90, d) * rng.range(0.9, 1.25);
    if (X + 900 > W.LTOTAL) { calm(); return; }
    var zi = W.zoneIndex(X), key = pick(zi, d);
    PATTERN[key](zi, d);
    hard = key === "cruise" ? 0 : hard + 1;
    lastKey = key;
  }

  /* ---- Public ---- */
  /* d0 is where the run begins (0, or the start of a later zone when testing). */
  G.start = function (seed, d0) {
    d0 = d0 || 0;
    G.seed = seed >>> 0 || 1;
    rng = new U.RNG(G.seed);
    W.reset();
    G.totals.stars = 0; G.totals.embers = 0; G.totals.fireflies = 0;
    finished = false; hard = 0; lastKey = "";
    wp(d0 - 600, 380);
    wp(d0, 380);
    wp(d0 + 380, 380);
    wp(d0 + 660, 260);
    wp(d0 + 940, 340);
    X = d0 + 940;
    starRun(d0 + 60, d0 + 340, 4, 0);
    starRun(d0 + 420, d0 + 900, 6, 0);
    ember(d0 + 880, 336);
    emberAt = d0 + 1700;
    forced = SIGNATURE[W.zoneIndex(d0 + 940)];
  };

  /* Generates until the front is at least `upTo` units from the start of the run. */
  G.fill = function (upTo) {
    var guard = 0;
    while (!finished && X < upTo && guard++ < 24) step();
  };
  G.front = function () { return X; };
  G.done = function () { return finished; };

  SKY.Gen = G;
})(window.SKY = window.SKY || {});
