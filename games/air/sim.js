/* Sky Lantern: the simulation. One lantern, heat and fuel, the scroll, collisions, pickups, weather, the finale.
   Pure logic with no DOM, so tools can run whole nights under Node. Other modules read the state object S and drain the
   event queue S.ev after each update. At the end of the file: a test pilot that plans a couple of seconds ahead with the
   same physics (used by tools and by ?auto=1). */

(function (SKY) {
  "use strict";

  var U = SKY.U, W = SKY.W, Gen = SKY.Gen;
  var S = {};

  /* ---- Tuning ---- */
  var P = {
    R: W.RL,
    HEQ: 0.42,               // heat at which the lantern hovers
    BUOY: 700,               // lift per unit of heat away from HEQ, units per second squared
    DRAG: 2.2,               // velocity decay per second
    TAU_UP: 0.16,            // seconds for the flame to build up
    TAU_DOWN: 0.38,          // seconds for the air to cool
    FUEL_BASE: 0.0095,       // burn per second with the flame idle
    FUEL_HEAT: 0.0095,       // extra burn per second at full heat
    FUEL_RAIN: 0.095,        // extra burn per second inside rain
    COLD: 0.35,              // burn grows by this much over the whole night
    EMBER: 0.13, FIREFLY: 0.03,
    MAG: 64,                 // pickups slide toward the lantern inside this radius
    MAX_TEARS: 3, INVUL: 2.2,
    STAR_POINTS: 5,
    FINISH_BONUS: 600, TEAR_BONUS: 250,
    METER: 20                // units per metre
  };
  S.P = P;

  var E = { STAR: 1, EMBER: 2, FIREFLY: 3, TEAR: 4, FLOOR: 5, RAIN_ON: 6, RAIN_OFF: 7, SMOKE_ON: 8, ZONE: 9, DYING: 10,
            OVER: 11, FINALE: 12, FINISH: 13, LOWFUEL: 14, HINT: 15, EMBER_FULL: 16, START: 17, GUST_ON: 18 };
  S.E = E;
  var H = { RAIN: 1, SMOKE: 2, WIND: 3, LOW: 4, EMBER: 5, THIN: 6 };
  S.H = H;

  var EVN = 160;
  S.ev = { n: 0, t: new Int32Array(EVN), a: new Float32Array(EVN), b: new Float32Array(EVN), c: new Float32Array(EVN) };
  function emit(t, a, b, c) {
    var e = S.ev;
    if (e.n >= EVN) return;
    e.t[e.n] = t; e.a[e.n] = a || 0; e.b[e.n] = b || 0; e.c[e.n] = c || 0; e.n++;
  }

  /* ---- State ---- */
  S.mode = "title";          // title | play | dying | over | finale | finish
  S.clock = 0;               // always advances, for ambient motion
  S.t = 0;                   // run time in seconds
  S.D = 0;                   // distance flown, world units
  S.camBase = 0;             // scenery camera = D + camBase
  S.camX = 0;
  S.speed = 40;
  S.windMul = 1;
  S.speedGain = 1;
  S.y = 360; S.vy = 0; S.heat = 0.42; S.fuel = 1;
  S.tears = 0; S.invul = 0;
  S.stars = 0; S.embers = 0; S.flies = 0; S.bonus = 0; S.chain = 0; S.lastStar = -9;
  S.zone = 0;
  S.cause = "";              // "flame" or "paper"
  S.won = false;
  S.wet = 0;                 // 0..1, how soaked the flame is
  S.smother = 0;             // 0..1, smoke on the flame
  S.gust = 0;                // 0..1, strength of the gust at the lantern
  S.inRain = false; S.inSmoke = false;
  S.held = false;
  S.modeT = 0;               // seconds in the current mode
  S.viewW = 1200;            // set by the renderer
  S.lx = 260;                // lantern's x on screen, set by the renderer
  S.god = false;
  S.bot = null;              // optional autopilot: function () -> boolean
  S.seed = 1;
  S.hinted = {};             // hints already shown this page load
  S.lowSent = false;
  S.ground = 650;
  S.floorHit = 0;            // seconds since the last floor touch, for the renderer
  S.nearHint = 0;
  S.thinT = 0;
  S.stat = { scuff: 0, floor: 0, obstacle: 0, rainTime: 0, smokeTime: 0, gustTime: 0, burn: 0 };

  S.score = function () {
    return Math.floor(S.D / (P.METER)) + S.stars * P.STAR_POINTS + S.bonus + (S.won ? P.FINISH_BONUS + P.TEAR_BONUS * (P.MAX_TEARS - S.tears) : 0);
  };
  S.distanceM = function () { return Math.floor(S.D / P.METER); };

  /* Title scene: the lantern floats, the scenery drifts, nothing is generated. */
  S.toTitle = function () {
    S.mode = "title"; S.modeT = 0;
    S.D = 0; S.y = 350; S.vy = 0; S.heat = P.HEQ; S.fuel = 1; S.tears = 0; S.invul = 0;
    S.speedGain = 1; S.windMul = 1; S.wet = 0; S.smother = 0; S.gust = 0;
    S.won = false; S.cause = "";
    W.reset();
  };

  /* Starts a run. opts: seed, zone (0..4), at (start distance), finale, god */
  S.begin = function (opts) {
    opts = opts || {};
    var zone = U.clamp(opts.zone | 0, 0, W.ZONES.length - 1);
    var d0 = zone > 0 ? W.START[zone] - 120 : 0;
    S.seed = (opts.seed >>> 0) || ((Math.random() * 4294967295) >>> 0) || 7;
    S.god = !!opts.god;
    if (opts.at > 0) d0 = opts.at;
    if (opts.finale) d0 = W.LTOTAL - 1500;
    S.mode = "play"; S.modeT = 0;
    S.t = 0; S.D = d0;
    S.camBase = S.camX - d0;
    S.y = U.clamp(S.y, 120, 440); S.vy = 0; S.heat = P.HEQ; S.fuel = 1;
    S.tears = 0; S.invul = 1.0;
    S.stars = 0; S.embers = 0; S.flies = 0; S.bonus = 0; S.chain = 0; S.lastStar = -9;
    S.zone = W.zoneIndex(d0);
    S.cause = ""; S.won = false;
    S.wet = 0; S.smother = 0; S.gust = 0; S.inRain = false; S.inSmoke = false;
    S.speedGain = 1; S.windMul = 1; S.lowSent = false; S.floorHit = 9;
    S.stat.scuff = 0; S.stat.floor = 0; S.stat.obstacle = 0; S.stat.rainTime = 0; S.stat.smokeTime = 0; S.stat.gustTime = 0; S.stat.burn = 0;
    Gen.start(S.seed, d0);
    Gen.fill(d0 + S.viewW + 1500);
    W.updateDynamic(0, d0);
    emit(E.START, S.zone);
  };

  function tear(nx, ny, ground) {
    S.tears++;
    S.invul = P.INVUL;
    S.vy = ground ? -210 : S.vy + ny * 190 - 30;
    if (ground) S.stat.floor++; else S.stat.obstacle++;
    emit(ground ? E.FLOOR : E.TEAR, 2, nx, ny);
    if (ground) emit(E.TEAR, S.tears, nx, ny);
    if (S.tears >= P.MAX_TEARS) die("paper");
  }

  function die(cause) {
    if (S.mode !== "play") return;
    S.mode = "dying"; S.modeT = 0; S.cause = cause;
    emit(E.DYING, cause === "paper" ? 1 : 0);
  }

  function collect(it) {
    it.on = false;
    switch (it.type) {
      case 0:
        S.chain = (S.t - S.lastStar < 1.9) ? S.chain + 1 : 0;
        S.lastStar = S.t; S.stars++;
        emit(E.STAR, S.chain, it.x, it.y);
        break;
      case 1:
        if (S.fuel > 0.97) { S.bonus += 10; emit(E.EMBER_FULL, 0, it.x, it.y); }
        else { S.fuel = Math.min(1, S.fuel + P.EMBER); emit(E.EMBER, S.fuel, it.x, it.y); }
        S.embers++;
        break;
      default:
        S.fuel = Math.min(1, S.fuel + P.FIREFLY); S.flies++;
        emit(E.FIREFLY, S.fuel, it.x, it.y);
    }
  }

  /* Looks a little ahead for the first rain, smoke or gust of the session, so the interface can say a word about it. */
  function scanHints() {
    var VT = W.VT, V = W.VOLS, j, v, ahead, items = W.ITEMS, it;
    if (!S.hinted[H.EMBER] && S.t > 1.5) {
      for (j = 0; j < items.length; j++) {
        it = items[j];
        if (it.on && it.type === 1 && it.x - S.D > 120 && it.x - S.D < S.viewW - S.lx - 60) { S.hinted[H.EMBER] = 1; emit(E.HINT, H.EMBER); break; }
      }
    }
    for (j = 0; j < V.length; j++) {
      v = V[j];
      if (!v.on) continue;
      ahead = v.x0 - S.D;
      if (ahead < 80 || ahead > 760) continue;
      if (v.type === VT.RAIN && !S.hinted[H.RAIN]) { S.hinted[H.RAIN] = 1; emit(E.HINT, H.RAIN); }
      else if (v.type === VT.SMOKE && !S.hinted[H.SMOKE]) { S.hinted[H.SMOKE] = 1; emit(E.HINT, H.SMOKE); }
      else if (v.type >= VT.GUST_DOWN && !S.hinted[H.WIND]) { S.hinted[H.WIND] = 1; emit(E.HINT, H.WIND); }
    }
  }

  /* One fixed-size step of the world. */
  function step(h, held) {
    var playing = S.mode === "play", fx, target, tau, ay, burn;

    S.t += h;
    S.modeT += h;
    if (S.invul > 0) S.invul -= h;

    /* speed: ramp in at the start, slow down when dying or finishing, wind on top */
    if (S.mode === "play") {
      var ramp = U.smooth(S.t / 3.6);
      S.speedGain = (40 + 60 * ramp) / 100;
    } else if (S.mode === "dying") S.speedGain = Math.max(0, 1 - S.modeT / 1.5) * 0.6;
    else if (S.mode === "finale") S.speedGain = 0.3 + 0.7 * Math.max(0, 1 - S.modeT / 2.5);
    else S.speedGain = 0;

    fx = W.volumesAt(S.D, S.y, P.R);
    S.windMul += ((1 + fx.gSpeed) - S.windMul) * Math.min(1, h * 3.5);
    S.speed = W.speedAt(S.D) * S.speedGain * S.windMul;
    S.D += S.speed * h;
    S.gust = fx.gust;

    /* heat */
    target = (held && S.fuel > 0 && playing) ? 1 : 0;
    if (S.mode === "finale") target = U.clamp(P.HEQ + (S.y - 300) * 0.0045 - S.vy * 0.0034, 0.05, 0.95);
    S.smother += ((fx.smoke ? 1 : 0) - S.smother) * Math.min(1, h * 6);
    if (S.smother > 0.01) target = Math.min(target, 1 - 0.76 * S.smother);
    S.wet += ((fx.rain ? 1 : 0) - S.wet) * Math.min(1, h * (fx.rain ? 7 : 1.1));
    target *= 1 - 0.3 * S.wet;
    tau = target > S.heat ? P.TAU_UP : P.TAU_DOWN;
    S.heat += (target - S.heat) * (1 - Math.exp(-h / tau));

    /* vertical motion */
    ay = (P.HEQ - S.heat) * P.BUOY + fx.gAy;
    if (S.y < 110) {
      var thin = U.sat((110 - S.y) / 90);
      if (ay < 0) ay *= 1 - 0.8 * thin;
      ay += thin * 140;
    }
    S.vy += ay * h;
    S.vy *= Math.exp(-P.DRAG * h);
    S.y += S.vy * h;
    if (S.y < 26) { S.y = 26; if (S.vy < 0) S.vy *= -0.2; }

    /* the thin air under the ceiling */
    if (S.mode === "play") {
      if (S.y < 72) S.thinT += h; else S.thinT = Math.max(0, S.thinT - h * 2);
      if (S.thinT > 0.9 && !S.hinted[H.THIN]) { S.hinted[H.THIN] = 1; emit(E.HINT, H.THIN); }
    }

    /* fuel */
    if (S.mode === "play" || S.mode === "dying") {
      if (!S.god && S.mode === "play") {
        burn = (P.FUEL_BASE + P.FUEL_HEAT * S.heat) * (1 + P.COLD * U.sat(S.D / W.LTOTAL));
        if (S.y < 110) burn *= 1 + 0.6 * U.sat((110 - S.y) / 90);
        burn += P.FUEL_RAIN * S.wet;
        S.fuel -= burn * h;
        S.stat.burn += burn * h;
        if (S.fuel < 0.2 && !S.lowSent) { S.lowSent = true; emit(E.LOWFUEL, S.fuel); if (!S.hinted[H.LOW]) { S.hinted[H.LOW] = 1; emit(E.HINT, H.LOW); } }
        if (S.fuel > 0.3) S.lowSent = false;
        if (S.fuel <= 0) { S.fuel = 0; die("flame"); }
      }
    }

    /* weather bookkeeping and events */
    if (fx.rain && !S.inRain) { S.inRain = true; emit(E.RAIN_ON); } else if (!fx.rain && S.inRain) { S.inRain = false; emit(E.RAIN_OFF); }
    if (fx.smoke && !S.inSmoke) { S.inSmoke = true; emit(E.SMOKE_ON); } else if (!fx.smoke) S.inSmoke = false;
    if (fx.rain) S.stat.rainTime += h;
    if (fx.smoke) S.stat.smokeTime += h;
    if (fx.gust > 0.2) S.stat.gustTime += h;

    /* ground */
    var gy = Math.min(W.groundY(S.D - 12), W.groundY(S.D), W.groundY(S.D + 12));
    S.ground = gy;
    S.floorHit += h;
    if (S.y + P.R > gy) {
      var fz = W.zoneIndex(S.D), mat = W.FLOOR[fz];
      if (S.mode === "dying" || S.mode === "over" || S.mode === "finish") {
        S.y = gy - P.R; S.vy = 0;
      } else if (mat === 2 && S.invul <= 0 && !S.god) {
        S.y = gy - P.R - 1;
        tear(0, -1, true);
      } else {
        /* a bump: bounce a little, and the flame pays for it where the ground is not soft */
        S.y = gy - P.R;
        if (S.vy > 0) S.vy *= -0.3;
        if (mat === 2 && S.vy > -80) S.vy = -80;
        if (S.floorHit > (mat === 3 ? 1.1 : 0.55)) {
          S.floorHit = 0;
          if (!S.god) S.fuel = Math.max(0.0005, S.fuel - W.FLOOR_COST[fz]);
          if (mat === 3) S.wet = 1;
          S.stat.scuff++;
          emit(E.FLOOR, mat, 0, -1);
        }
      }
    }

    /* obstacles */
    W.updateDynamic(S.t, S.D);
    if (playing && S.mode === "play" && S.invul <= 0 && !S.god && W.hitAt(S.D, S.y, P.R, S.t, S.D, true)) tear(W.hitNX, W.hitNY, false);

    /* pickups */
    if (playing && S.mode === "play") {
      var items = W.ITEMS, j, it, dx, dy, d2, k, mag2 = P.MAG * P.MAG, r2 = (P.R + 11) * (P.R + 11);
      for (j = 0; j < items.length; j++) {
        it = items[j];
        if (!it.on) continue;
        dx = it.x - S.D;
        if (dx > P.MAG + 6 || dx < -P.MAG) continue;
        dy = it.y - S.y;
        d2 = dx * dx + dy * dy;
        if (d2 < mag2) {
          k = 1 - Math.exp(-(6 + 22 * (1 - d2 / mag2)) * h);
          it.x -= dx * k; it.y -= dy * k;
          dx = it.x - S.D; dy = it.y - S.y; d2 = dx * dx + dy * dy;
        }
        if (d2 < r2) collect(it);
      }
    }
  }

  /* Advances the simulation by dt seconds. held: is the player heating. */
  S.update = function (dt, held) {
    var n, h, k;
    S.clock += dt;
    S.floorHit = Math.min(S.floorHit, 99);

    if (S.mode === "title") {
      S.camX += 40 * dt;
      S.y = 350 + Math.sin(S.clock * 0.8) * 14 + Math.sin(S.clock * 1.7) * 4;
      S.vy = Math.cos(S.clock * 0.8) * 11;
      S.heat = P.HEQ + Math.sin(S.clock * 2.1) * 0.05;
      S.speed = 40;
      return;
    }

    if (S.bot && S.mode === "play") held = S.bot();
    S.held = held;

    if (S.mode === "over" || S.mode === "finish") {
      S.modeT += dt;
      S.speed = 0;
      if (S.mode === "finish") {                       // the lantern floats on in the sunrise
        S.camX += 20 * dt;
        S.y += (290 - S.y) * Math.min(1, dt * 0.9) + Math.cos(S.clock * 0.9) * dt * 7;
        S.heat = 0.56 + 0.05 * Math.sin(S.clock * 2.1);
      } else S.heat = Math.max(0, S.heat - dt * 0.6);
      return;
    }

    n = Math.max(1, Math.ceil(dt * 120));
    h = dt / n;
    for (k = 0; k < n; k++) {
      step(h, held);
      if (S.mode === "dying" && S.modeT > 2.3) {
        S.mode = "over"; S.modeT = 0; S.speed = 0;
        emit(E.OVER, S.cause === "paper" ? 1 : 0);
        break;
      }
      if (S.mode === "finale" && S.modeT > 6.4) {
        S.mode = "finish"; S.modeT = 0; S.speed = 0;
        emit(E.FINISH);
        break;
      }
      if (S.mode === "play" && S.D >= W.LTOTAL) {
        S.mode = "finale"; S.modeT = 0; S.won = true; S.invul = 99;
        emit(E.FINALE);
      }
    }
    S.camX = S.D + S.camBase;

    if (S.mode === "play" || S.mode === "finale") {
      var z = W.zoneIndex(S.D);
      if (z !== S.zone) { S.zone = z; emit(E.ZONE, z); }
      Gen.fill(S.D + S.viewW + 1500);
      W.release(S.D - S.lx - 600);
      S.nearHint -= dt;
      if (S.nearHint <= 0) { S.nearHint = 0.3; scanHints(); }
    }
  };

  /* Compact state for tests and the debug overlay. */
  S.snapshot = function () {
    return { mode: S.mode, t: +S.t.toFixed(2), D: Math.round(S.D), zone: S.zone, y: Math.round(S.y), fuel: +S.fuel.toFixed(3), tears: S.tears,
             stars: S.stars, embers: S.embers, score: S.score(), seed: S.seed, speed: Math.round(S.speed) };
  };

  SKY.Sim = S;
})(window.SKY = window.SKY || {});

/* ---- Test pilot ---- */
(function (SKY) {
  "use strict";

  var U = SKY.U, W = SKY.W, S = SKY.Sim, P = S.P;
  var B = {};

  var DT = 0.075, N = 24;
  var eUp = 1 - Math.exp(-DT / P.TAU_UP), eDn = 1 - Math.exp(-DT / P.TAU_DOWN), eDrag = Math.exp(-P.DRAG * DT);

  /* A plan is [first action, switch time, second switch time]: hold or release first, flip at s1, flip back at s2. */
  var PLANS = [[1, 99, 99], [0, 99, 99]];
  (function build() {
    var s1s = [0.12, 0.25, 0.45, 0.7, 1.05], gaps = [99, 0.35, 0.8], f, a, g;
    for (f = 1; f >= 0; f--) for (a = 0; a < s1s.length; a++) for (g = 0; g < gaps.length; g++) PLANS.push([f, s1s[a], gaps[g] === 99 ? 99 : s1s[a] + gaps[g]]);
  })();

  function cost(plan, wTrack, limit) {
    var y = S.y, vy = S.vy, heat = S.heat, D = S.D, t = S.t, c = 0, i, tt, held, fx, target, ay, gy, dy, thin;
    var gain = S.speedGain > 0.05 ? S.speedGain : 1;
    for (i = 0; i < N; i++) {
      tt = i * DT;
      held = tt < plan[1] ? plan[0] : (tt < plan[2] ? 1 - plan[0] : plan[0]);
      fx = W.volumesAt(D, y, P.R);
      target = held ? 1 : 0;
      if (fx.smoke) { target = Math.min(target, 0.24); c += 30; }
      if (fx.rain) { target *= 0.7; c += 70; }
      heat += (target - heat) * (target > heat ? eUp : eDn);
      ay = (P.HEQ - heat) * P.BUOY + fx.gAy;
      if (y < 110) { thin = U.sat((110 - y) / 90); if (ay < 0) ay *= 1 - 0.8 * thin; ay += thin * 140; c += thin * 12; }
      vy += ay * DT;
      vy *= eDrag;
      y += vy * DT;
      if (y < 26) { y = 26; if (vy < 0) vy *= -0.2; }
      D += W.speedAt(D) * gain * (1 + fx.gSpeed) * DT;
      t += DT;
      gy = Math.min(W.groundY(D - 12), W.groundY(D), W.groundY(D + 12));
      if (y + P.R > gy - 3) c += 2500;
      if (W.hitAt(D, y, P.R + 7, t, D, false)) c += 1800;
      dy = y - W.pathY(D);
      c += dy * dy * wTrack;
      if (c > limit) return c;
    }
    c += vy * vy * 0.004;
    return c;
  }

  /* opts: lag, period, lapse, track */
  B.make = function (opts) {
    opts = opts || {};
    var lag = opts.lag || 0, period = opts.period || 0.1, lapse = opts.lapse || 0, wTrack = opts.track || 0.02;
    var rng = new U.RNG(opts.seed || 99);
    var nextAt = 0, blindUntil = -1, current = 0, applied = false;
    var qT = [0, 0, 0, 0, 0, 0, 0, 0], qV = [0, 0, 0, 0, 0, 0, 0, 0], qn = 0;
    return function () {
      var t = S.t, j, best = 1e18, bestFirst = current, c, plan;
      if (t >= nextAt) {
        nextAt = t + period;
        if (t < blindUntil) { /* looking away: keep the last decision */ }
        else if (lapse > 0 && rng.chance(lapse)) blindUntil = t + 0.5;
        else {
          for (j = 0; j < PLANS.length; j++) {
            plan = PLANS[j];
            c = cost(plan, wTrack, best) + (plan[0] !== current ? 6 : 0);
            if (c < best) { best = c; bestFirst = plan[0]; }
          }
          current = bestFirst;
        }
        if (lag > 0 && qn < 8) { qT[qn] = t + lag; qV[qn] = current; qn++; }
      }
      if (lag > 0) {
        while (qn > 0 && qT[0] <= t) {
          applied = qV[0] === 1;
          for (j = 1; j < qn; j++) { qT[j - 1] = qT[j]; qV[j - 1] = qV[j]; }
          qn--;
        }
        return applied;
      }
      return current === 1;
    };
  };

  SKY.Bot = B;
})(window.SKY = window.SKY || {});
