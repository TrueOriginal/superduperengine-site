/* Sky Lantern: start-up, the frame loop, layout and the flow between title, flight and the end screens.

   Debug and test flags (query string):
     ?lang=ru|en     interface language
     ?zone=0..4      start the flight at the beginning of that zone (0 town, 1 forest, 2 mountains, 3 sea cliffs, 4 sunrise)
     ?at=N           start the flight N units into the night (any distance, 0 to about 35000)
     ?finale=1       start 1500 units before the end of the night, so the finale is a few seconds away
     ?god=1          no tears, no fuel burn
     ?auto=1         the test pilot flies (watch it, or use it to check the night is passable)
     ?seed=N         fixed level seed; the same seed always builds the same night
     ?speed=N        run the simulation N times faster
     ?dpr=1          force the canvas pixel ratio
     ?debug=1        small frame-time overlay; the same numbers are in window.SKY.stats */
(function (SKY) {
  "use strict";

  var U = SKY.U, L = SKY.L, W = SKY.W, S = SKY.Sim, Gen = SKY.Gen, Fx = SKY.Fx, Sc = SKY.Sc, Act = SKY.Act, Hud = SKY.Hud, UI = SKY.UI, A = SKY.Audio, V = SKY.V, Bot = SKY.Bot;
  var E = S.E, H = S.H;

  var q = new URLSearchParams(window.location.search);
  var OPT = {
    zone: parseInt(q.get("zone"), 10) || 0, at: parseInt(q.get("at"), 10) || 0, finale: q.get("finale") === "1", god: q.get("god") === "1", auto: q.get("auto") === "1",
    seed: parseInt(q.get("seed"), 10) || 0, speed: parseFloat(q.get("speed")) || 1, dpr: parseFloat(q.get("dpr")) || 0, debug: q.get("debug") === "1"
  };

  var canvas, ctx, box, stage;
  var quality = 1, qCool = 0, qFast = 0;
  var last = 0, running = true, restarting = false, started = false;
  var palTimer = 0, fade = 0, fadeTarget = 0, fadeCb = null;
  var lastMode = "", streakIn = 6, holdHint = 0, sparkAcc = 0, moteAcc = 0, fireAcc = 0, lanternAcc = 0, thunderIn = 0, lightningIn = 8;
  var stats = SKY.stats = { frames: 0, avgInterval: 0, avgWork: 0, maxInterval: 0, quality: 1, particles: 0, dpr: 1, sumWork: 0, sumInterval: 0, counted: 0, worst: 0 };
  var winN = 0, winInt = 0, winWork = 0, winMax = 0, debugEl = null, debugT = 0;
  var rm = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  /* ---- Layout ---- */
  function layout() {
    var bw = box.clientWidth, bh = box.clientHeight, w = bw, h = bh, dpr;
    if (bw < 10 || bh < 10) return;
    if (w / h > 2.3) w = h * 2.3; else if (w / h < 0.5) h = w / 0.5;
    w = Math.floor(w); h = Math.floor(h);
    stage.style.width = w + "px"; stage.style.height = h + "px";
    V.w = w; V.h = h;
    V.scale = Math.min(h / W.FH, w / 560);
    V.vw = w / V.scale; V.vh = h / V.scale; V.top = W.FH - V.vh;
    V.lx = U.clamp(V.vw * 0.27, 110, 300);
    S.viewW = V.vw; S.lx = V.lx;
    dpr = OPT.dpr || Math.min(window.devicePixelRatio || 1, 2);
    dpr = Math.max(0.5, dpr * quality);
    V.dpr = dpr;
    var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; ctx.imageSmoothingQuality = "high"; }
    Hud.reserveRight = w < 460 ? 92 : 100;
    stats.dpr = dpr;
    Sc.refresh(ctx, true);
  }

  /* ---- Run control ---- */
  function startRun() {
    S.viewW = V.vw; S.lx = V.lx;
    S.begin({ seed: OPT.seed, zone: OPT.zone, at: OPT.at, finale: OPT.finale, god: OPT.god });
    S.bot = OPT.auto ? Bot.make({ lag: 0.04, period: 0.1 }) : null;
    Fx.clear(); Hud.reset();
    UI.screen(null);
    UI.hideToast();
    Sc.refresh(ctx, true);
    started = true;
    var first = !S.hinted.hold;
    if (first) { S.hinted.hold = 1; holdHint = 6; setTimeout(function () { if (S.mode === "play" && holdHint > 0) UI.toast("hintHold", 5200); }, 900); }
    if (!OPT.finale) setTimeout(function () { if (S.mode === "play") UI.zoneCard(S.zone); }, 1800);
  }

  var handlers = {
    start: function () {
      if (S.mode !== "title" || UI.paused) return;
      A.unlock();
      startRun();
    },
    again: function () {
      if ((S.mode !== "over" && S.mode !== "finish") || !UI.canAgain() || restarting) return;
      restarting = true;
      fadeTarget = 1;
      fadeCb = function () { restarting = false; startRun(); };
      A.unlock(); A.click();
    },
    togglePause: function () { setPaused(!UI.paused); },
    resume: function () { if (UI.paused) setPaused(false); },
    toggleMute: function () { A.setMuted(!A.isMuted()); UI.syncMute(); }
  };

  function setPaused(p) {
    if (p === UI.paused) return;
    if (p && S.mode !== "play" && S.mode !== "dying" && S.mode !== "finale") return;
    UI.paused = p;
    if (p) {
      UI.releaseAll();
      UI.screen("pause");
      A.pause();
    } else {
      UI.screen(null);
      A.resume();
      last = performance.now();
    }
  }

  /* ---- Events from the simulation ---- */
  function burstAt(wx, wy, n, kind, color, speed, life, size) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, v = speed * (0.35 + Math.random() * 0.65);
      Fx.spawn(kind, wx, wy, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size * (0.7 + Math.random() * 0.6), color);
    }
  }

  function endInfo(cause) {
    return { cause: cause, score: S.score(), dist: S.distanceM(), stars: S.stars, tearsLeft: Math.max(0, 3 - S.tears), time: S.t };
  }
  // The end card, plus the shared leaderboard panel of the site's games (/assets/scores.js) if it loaded.
  function endNow(info, won) {
    UI.showEnd(info, won);
    if (window.SDEScores) window.SDEScores.mount(document.getElementById(won ? "f-board" : "o-board"), { game: "air", lang: L.lang, score: info.score, ms: Math.round(info.time * 1000) });
  }

  function dispatch() {
    var ev = S.ev, i, t, a, b, c, k;
    for (i = 0; i < ev.n; i++) {
      t = ev.t[i]; a = ev.a[i]; b = ev.b[i]; c = ev.c[i];
      switch (t) {
        case E.STAR:
          A.star(a);
          burstAt(b, c, 5, Fx.K.GLINT, 0, 70, 0.55, 9);
          burstAt(b, c, 4, Fx.K.SPARK, 5, 50, 0.7, 10);
          break;
        case E.EMBER:
          A.ember();
          burstAt(b, c, 10, Fx.K.SPARK, 1, 90, 0.8, 11);
          break;
        case E.EMBER_FULL: A.emberFull(); burstAt(b, c, 4, Fx.K.SPARK, 5, 50, 0.6, 9); break;
        case E.FIREFLY: A.firefly(); burstAt(b, c, 4, Fx.K.SPARK, 3, 50, 0.6, 10); break;
        case E.TEAR:
          A.tear();
          Fx.kick(11); Fx.flash = 1;
          burstAt(S.D, S.y, 14, Fx.K.SCRAP, 0, 130, 1.1, 2.6);
          burstAt(S.D, S.y, 6, Fx.K.SPARK, 0, 110, 0.7, 12);
          if (navigator.vibrate) { try { navigator.vibrate(35); } catch (err) { /* ignore */ } }
          break;
        case E.FLOOR:
          if (a === 3) {                                   // water: a splash
            A.splash();
            for (k = 0; k < 14; k++) Fx.spawn(Fx.K.DROP, S.D + (Math.random() - 0.5) * 30, S.ground - 4, (Math.random() - 0.5) * 140, -90 - Math.random() * 130, 0.8, 1, 0);
          } else if (a !== 0) {                            // roofs, leaves, rock
            A.floor();
            for (k = 0; k < 8; k++) Fx.spawn(Fx.K.DUST, S.D + (Math.random() - 0.5) * 24, S.ground - 2, (Math.random() - 0.5) * 90, -Math.random() * 60, 0.7, 5, 0);
          } else for (k = 0; k < 4; k++) Fx.spawn(Fx.K.DUST, S.D + (Math.random() - 0.5) * 30, S.ground - 6, (Math.random() - 0.5) * 50, -Math.random() * 30, 1.1, 8, 0);
          break;
        case E.RAIN_ON: A.douse(); break;
        case E.ZONE: UI.zoneCard(a); A.zone(a); break;
        case E.DYING:
          if (a) { A.paperDeath(); burstAt(S.D, S.y, 28, Fx.K.SCRAP, 1, 150, 1.6, 2.8); burstAt(S.D, S.y, 16, Fx.K.FIRE, 1, 150, 1.3, 16); Fx.kick(14); }
          else { A.flameOut(); for (k = 0; k < 6; k++) Fx.spawn(Fx.K.SMOKE, S.D + (Math.random() - 0.5) * 8, S.y + 18, (Math.random() - 0.5) * 12, -26 - Math.random() * 24, 2.4, 9 + Math.random() * 5, k); }
          UI.hideToast();
          break;
        case E.OVER: endNow(endInfo(a ? "paper" : "flame"), false); break;
        case E.FINALE:
          A.finale(); UI.hideToast();
          burstAt(S.D, S.y, 36, Fx.K.FIRE, 5, 190, 2.2, 16);
          break;
        case E.FINISH: endNow(endInfo(""), true); break;
        case E.HINT:
          if (a === H.RAIN) UI.toast("hintRain", 4200);
          else if (a === H.SMOKE) UI.toast("hintSmoke", 3600);
          else if (a === H.WIND) UI.toast("hintWind", 3600);
          else if (a === H.LOW) UI.toast("hintLow", 3600);
          else if (a === H.EMBER) UI.toast("hintEmber", 3600);
          else if (a === H.THIN) UI.toast("hintThin", 3200);
          break;
        default: break;
      }
    }
    ev.n = 0;
  }

  /* ---- Continuous effects: sparks, motes, steam, lightning ---- */
  function ambient(dt) {
    var live = S.mode === "play" || S.mode === "dying" || S.mode === "finale" || S.mode === "title" || S.mode === "finish";
    var heat = S.heat, flame = Act.lanternState.flame;
    if (live && flame > 0.1) {
      sparkAcc += dt * (3 + 20 * heat) * flame;
      while (sparkAcc >= 1) {
        sparkAcc -= 1;
        Fx.spawn(Fx.K.SPARK, S.D + (Math.random() - 0.5) * 10, S.y + 20, (Math.random() - 0.5) * 16, -14 - Math.random() * 30 - heat * 26, 0.7 + Math.random() * 0.7, 6 + Math.random() * 6, Math.random() < 0.3 ? 1 : 0);
      }
    }
    moteAcc += dt * (S.zone === 1 && S.mode !== "title" ? 3.4 : 2.2);
    if (live && Sc.Pal.starA > 0.5 && !Fx.reduced) {
      streakIn -= dt;
      if (streakIn <= 0) {
        streakIn = 12 + Math.random() * 16;
        Fx.spawn(Fx.K.STREAK, S.D + V.vw * (0.25 + Math.random() * 0.6) - V.lx, V.top + 30 + Math.random() * 220, -260 - Math.random() * 120, 70 + Math.random() * 80, 0.9, 1.6, 0);
      }
    }
    while (moteAcc >= 1) {
      moteAcc -= 1;
      Fx.spawn(Fx.K.MOTE, S.D + (Math.random() - 0.35) * V.vw, 80 + Math.random() * 520, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 4 + Math.random() * 3, 5 + Math.random() * 4, (S.zone === 1 && S.mode !== "title") ? (Math.random() < 0.75 ? 3 : 1) : (Math.random() < 0.6 ? 0 : 2));
    }
    if (S.wet > 0.25 && live) {
      fireAcc += dt * 22 * S.wet;
      while (fireAcc >= 1) {
        fireAcc -= 1;
        Fx.spawn(Fx.K.STEAM, S.D + (Math.random() - 0.5) * 22, S.y + 12, (Math.random() - 0.5) * 14, -20 - Math.random() * 20, 0.9, 12 + Math.random() * 8, (Math.random() * 3) | 0);
      }
    }
    if (S.mode === "finale" || S.mode === "finish") {
      fireAcc += dt * (S.mode === "finale" ? 26 : 8);
      while (fireAcc >= 1) {
        fireAcc -= 1;
        Fx.spawn(Fx.K.FIRE, S.D + (Math.random() - 0.5) * 300, S.y + (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 60, -10 - Math.random() * 30, 1.6, 12 + Math.random() * 10, Math.random() < 0.5 ? 5 : 1);
      }
    }
    /* festival lanterns drift up through the sunrise and during the finale */
    var fest = (S.mode === "finale" || S.mode === "finish") ? 1 : (Sc.Pal.sun > 0.2 ? 0.25 : 0);
    if (fest > 0 && live) {
      lanternAcc += dt * 5 * fest;
      while (lanternAcc >= 1) {
        lanternAcc -= 1;
        Fx.spawn(Fx.K.LANT, S.D + Math.random() * V.vw * 0.9, 780, 4 + Math.random() * 16, -24 - Math.random() * 30, 20, 9 + Math.random() * 8, 0);
      }
    }
    /* storm light: a flash now and then while rain is on screen */
    if (!Fx.reduced && live && S.mode === "play") {
      var rain = false, v, j;
      for (j = 0; j < W.VOLS.length; j++) { v = W.VOLS[j]; if (v.on && v.type === W.VT.RAIN && v.x0 - S.D < V.vw && v.x1 - S.D > -200) { rain = true; break; } }
      if (rain && S.zone >= 2) {
        lightningIn -= dt;
        if (lightningIn <= 0) { lightningIn = 9 + Math.random() * 12; Fx.lightning = 0.7; thunderIn = 0.5 + Math.random() * 0.9; }
      }
      if (thunderIn > 0) { thunderIn -= dt; if (thunderIn <= 0) A.thunder(); }
    }
    if (holdHint > 0 && S.mode === "play") {
      if (S.held) { holdHint = 0; UI.toast("hintRelease", 3200); }
      else holdHint -= dt;
    }
  }

  /* ---- Drawing ---- */
  function draw(t, dt) {
    var k = V.dpr * V.scale, sx = 0, sy = 0, ox = V.lx - S.D, f;
    if (Fx.shake > 0) { sx = (Math.random() - 0.5) * 2 * Fx.shake; sy = (Math.random() - 0.5) * 2 * Fx.shake; }
    palTimer -= dt;
    if (palTimer <= 0) { palTimer = 0.1; Sc.refresh(ctx, false); }

    ctx.setTransform(k, 0, 0, k, sx * V.dpr, (-V.top * V.scale + sy) * V.dpr);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    Sc.drawBackground(ctx, t);
    Sc.drawGround(ctx, t);
    Act.drawBehind(ctx, t);
    Fx.drawSolid(ctx, ox);
    Act.drawLantern(ctx, t);
    Act.drawFront(ctx, t);
    ctx.globalCompositeOperation = "lighter";
    Fx.drawGlow(ctx, ox);
    ctx.globalCompositeOperation = "source-over";
    Act.drawLight(ctx, t);

    /* screen space */
    ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(Fx.SP.vignette, 0, 0, V.w, V.h);
    if (Fx.flash > 0.01) { ctx.globalAlpha = Fx.flash * (Fx.reduced ? 0.35 : 0.9); ctx.drawImage(Fx.SP.vignetteRed, 0, 0, V.w, V.h); }
    if (Fx.lightning > 0.01) { ctx.globalAlpha = Fx.lightning * 0.2; ctx.fillStyle = "#cfe0ff"; ctx.fillRect(0, 0, V.w, V.h); }
    ctx.globalAlpha = 1;
    Hud.draw(ctx, t, dt);
    f = fade;
    if (f > 0.005) { ctx.globalAlpha = f; ctx.fillStyle = "#04060e"; ctx.fillRect(0, 0, V.w, V.h); ctx.globalAlpha = 1; }
  }

  /* ---- Frame loop ---- */
  function frame(now) {
    window.requestAnimationFrame(frame);
    if (!running) { last = now; return; }
    var t0 = performance.now(), interval = now - last, dt = interval / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    if (dt <= 0) return;

    var simDt = UI.paused ? 0 : dt * OPT.speed;
    if (simDt > 0) S.update(simDt, UI.held());
    else S.clock += dt;
    if (S.ev.n) dispatch();
    if (S.mode !== lastMode) { lastMode = S.mode; UI.syncTools(lastMode); }
    Fx.update(simDt > 0 ? dt : 0);
    Fx.tick(dt);
    if (simDt > 0) ambient(dt);
    UI.tick(dt);
    A.update(dt);

    if (fadeTarget !== fade) {
      fade += (fadeTarget - fade) * Math.min(1, dt * 10) + (fadeTarget > fade ? 0.02 : -0.02);
      if (fadeTarget > fade && fade > 0.985 && fadeCb) { fade = 1; var cb = fadeCb; fadeCb = null; cb(); fadeTarget = 0; }
      if (fadeTarget < fade && fade < 0.01) fade = 0;
    }

    draw(S.clock, dt);

    /* frame statistics and the resolution governor */
    var work = performance.now() - t0;
    stats.frames++;
    if (stats.frames > 30) {
      stats.sumWork += work; stats.sumInterval += interval; stats.counted++;
      if (interval > stats.worst) stats.worst = interval;
      winN++; winInt += interval; winWork += work; if (interval > winMax) winMax = interval;
      if (winN >= 60) {
        stats.avgInterval = winInt / winN; stats.avgWork = winWork / winN; stats.maxInterval = winMax;
        stats.particles = Fx.count(); stats.quality = quality;
        qCool -= winInt / 1000;
        if (stats.avgInterval > 21.5 && quality > 0.55 && qCool <= 0 && !UI.paused) { quality = Math.max(0.55, quality - 0.15); qCool = 3; qFast = 0; layout(); }
        else if (stats.avgWork < 5 && stats.avgInterval < 18 && quality < 1) { qFast += winInt / 1000; if (qFast > 9) { quality = Math.min(1, quality + 0.15); qFast = 0; qCool = 6; layout(); } }
        else qFast = 0;
        winN = 0; winInt = 0; winWork = 0; winMax = 0;
      }
    }
    if (debugEl) {
      debugT -= dt;
      if (debugT <= 0) {
        debugT = 0.25;
        debugEl.textContent = "frame " + stats.avgInterval.toFixed(1) + " ms (max " + stats.maxInterval.toFixed(0) + ")\nwork  " + stats.avgWork.toFixed(2) + " ms\nquality " + quality.toFixed(2) + "  dpr " + V.dpr.toFixed(2) + "\nparticles " + Fx.count() + "\n" +
          S.mode + " D " + Math.round(S.D) + " z" + S.zone + " fuel " + S.fuel.toFixed(2) + " tears " + S.tears;
      }
    }
  }

  /* ---- Boot ---- */
  function boot() {
    canvas = document.getElementById("game");
    stage = document.getElementById("stage");
    box = document.getElementById("box");
    ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) { box.textContent = L.t("noscript"); return; }

    L.set(L.detect());
    Fx.reduced = !!(rm && rm.matches);
    if (rm && rm.addEventListener) rm.addEventListener("change", function () { Fx.reduced = rm.matches; });

    Fx.build();
    Hud.build();
    UI.init(handlers);
    S.toTitle();
    layout();
    Sc.refresh(ctx, true);
    window.addEventListener("resize", layout);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", layout);
    window.addEventListener("orientationchange", function () { setTimeout(layout, 120); });

    var pauseNow = function () { if (S.mode === "play" || S.mode === "dying" || S.mode === "finale") setPaused(true); UI.releaseAll(); A.pause(); };
    window.addEventListener("blur", pauseNow);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pauseNow();
      else if (!UI.paused) { A.resume(); last = performance.now(); }
    });

    if (OPT.debug) {
      debugEl = document.createElement("div"); debugEl.id = "debug";
      document.getElementById("stage").appendChild(debugEl);
    }
    SKY.main = { opts: OPT, startRun: startRun, handlers: handlers, layout: layout };
    last = performance.now();
    window.requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})(window.SKY = window.SKY || {});
