/* Sky Lantern: everything the player reads or presses. The page around the canvas (screens, buttons, zone titles, hints,
   language switch, all input: mouse, touch and keyboard end up as one "held" flag) and the HUD drawn on the canvas
   (fuel gauge, torn-paper counter, score, a night-to-dawn track). */

(function (SKY) {
  "use strict";

  var U = SKY.U, L = SKY.L, S = SKY.Sim, A = SKY.Audio;
  var UI = {};
  var BEST_KEY = "sde.game.air.best";

  function $(id) { return document.getElementById(id); }
  var el = {}, handlers = null;
  var ptr = [], keys = { space: false, up: false, w: false };
  var toastTimer = 0, againLock = 0, countFrom = 0, countTo = 0, countT = 0, countEl = null, countDur = 1;
  var overInfo = null, current = "title";

  UI.best = 0;
  UI.paused = false;

  UI.held = function () { return ptr.length > 0 || keys.space || keys.up || keys.w; };
  UI.releaseAll = function () { ptr.length = 0; keys.space = keys.up = keys.w = false; };

  function setScreen(name) {
    current = name;
    var names = ["title", "over", "finish", "pause"], i;
    for (i = 0; i < names.length; i++) el["s_" + names[i]].classList.toggle("on", names[i] === name);
  }
  UI.screen = setScreen;
  UI.current = function () { return current; };

  function loadBest() {
    var v = parseInt(U.store.get(BEST_KEY), 10);
    UI.best = v > 0 ? v : 0;
  }
  function saveBest(v) { UI.best = v; U.store.set(BEST_KEY, v); }

  UI.updateBestLine = function () {
    el.bestLine.textContent = UI.best > 0 ? L.fmt("bestLine", { n: L.num(UI.best) }) : "";
  };

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function fillStats(dl, info) {
    var rows = [
      ["distance", L.fmt("meters", { n: L.num(info.dist) })],
      ["stars", L.num(info.stars)],
      ["tearsLeft", L.fmt("ofN", { a: info.tearsLeft, b: 3 })],
      ["time", fmtTime(info.time)]
    ], i, dt, dd;
    while (dl.firstChild) dl.removeChild(dl.firstChild);
    for (i = 0; i < rows.length; i++) {
      dt = document.createElement("dt"); dt.textContent = L.t(rows[i][0]);
      dd = document.createElement("dd"); dd.textContent = rows[i][1];
      dl.appendChild(dt); dl.appendChild(dd);
    }
  }

  function countUp(node, to, dur) {
    countEl = node; countFrom = 0; countTo = to; countT = 0; countDur = dur;
    node.textContent = "0";
  }

  /* info: { cause, score, dist, stars, tearsLeft, time } */
  UI.showEnd = function (info, finished) {
    overInfo = info;
    var prev = UI.best, isNew = info.score > prev && info.score > 0;
    if (isNew) saveBest(info.score);
    var bestEl = finished ? el.fBest : el.oBest;
    bestEl.classList.toggle("new", isNew);
    bestEl.textContent = isNew ? L.t("newBest") : L.t("best") + ": " + L.num(UI.best);
    if (finished) {
      fillStats(el.fStats, info);
      countUp(el.fScore, info.score, 1.5);
    } else {
      el.oTitle.textContent = L.t(info.cause === "paper" ? "overPaperTitle" : "overFlameTitle");
      el.oSub.textContent = L.t(info.cause === "paper" ? "overPaperSub" : "overFlameSub");
      fillStats(el.oStats, info);
      countUp(el.oScore, info.score, 1.1);
    }
    againLock = finished ? 1.4 : 0.9;
    el.again.disabled = true; el.again2.disabled = true;
    setScreen(finished ? "finish" : "over");
    UI.announce(finished ? L.t("finishTitle") : el.oTitle.textContent);
    UI.updateBestLine();
  };

  UI.canAgain = function () { return againLock <= 0; };

  /* The pause button only makes sense during a flight. */
  UI.syncTools = function (mode) {
    var playing = mode === "play" || mode === "dying" || mode === "finale";
    el.pause.style.visibility = playing ? "visible" : "hidden";
  };

  UI.tick = function (dt) {
    if (againLock > 0) {
      againLock -= dt;
      if (againLock <= 0) {
        el.again.disabled = false; el.again2.disabled = false;
        var b = current === "finish" ? el.again2 : el.again;
        if (current === "over" || current === "finish") { try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
      }
    }
    if (countEl) {
      countT += dt;
      var k = U.outCubic(countT / countDur);
      countEl.textContent = L.num(countFrom + (countTo - countFrom) * k);
      if (countT >= countDur) { countEl.textContent = L.num(countTo); countEl = null; }
    }
  };

  UI.zoneCard = function (z) {
    el.zoneNum.textContent = L.zoneNumeral(z);
    el.zoneName.textContent = L.zoneName(z);
    el.zoneCard.classList.remove("run");
    void el.zoneCard.offsetWidth;                     // restart the animation
    el.zoneCard.classList.add("run");
    UI.announce(L.zoneNumeral(z) + ". " + L.zoneName(z));
  };

  UI.toast = function (key, ms) {
    el.toast.textContent = L.t(key);
    el.toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("on"); }, ms || 3200);
  };
  UI.hideToast = function () { clearTimeout(toastTimer); el.toast.classList.remove("on"); };
  UI.announce = function (text) { el.sr.textContent = ""; el.sr.textContent = text; };

  UI.refreshLang = function () {
    L.apply(document);
    el.back.setAttribute("href", L.lang === "ru" ? "/ru/" : "/en/");
    var b = document.querySelectorAll(".lang button"), i;
    for (i = 0; i < b.length; i++) b[i].setAttribute("aria-pressed", b[i].getAttribute("data-lang") === L.lang ? "true" : "false");
    UI.syncMute();
    UI.updateBestLine();
    if (overInfo && (current === "over" || current === "finish")) {
      if (current === "over") {
        el.oTitle.textContent = L.t(overInfo.cause === "paper" ? "overPaperTitle" : "overFlameTitle");
        el.oSub.textContent = L.t(overInfo.cause === "paper" ? "overPaperSub" : "overFlameSub");
        fillStats(el.oStats, overInfo);
      } else fillStats(el.fStats, overInfo);
    }
  };

  UI.syncMute = function () {
    var m = A.isMuted();
    el.mute.setAttribute("aria-pressed", m ? "true" : "false");
    el.mute.setAttribute("data-i18n-aria", m ? "muteOff" : "muteOn");
    el.mute.setAttribute("aria-label", L.t(m ? "muteOff" : "muteOn"));
  };

  function blurButtons() {
    var a = document.activeElement;
    if (a && a.tagName === "BUTTON") a.blur();
  }

  UI.init = function (h) {
    handlers = h;
    var ids = { stage: "stage", canvas: "game", back: "back", mute: "btn-mute", pause: "btn-pause", start: "btn-start", again: "btn-again", again2: "btn-again2",
                resume: "btn-resume", zoneCard: "zone-card", zoneNum: "zone-num", zoneName: "zone-name", toast: "toast", sr: "sr", bestLine: "best-line",
                oTitle: "o-title", oSub: "o-sub", oScore: "o-score", oBest: "o-best", oStats: "o-stats", fScore: "f-score", fBest: "f-best", fStats: "f-stats",
                s_title: "screen-title", s_over: "screen-over", s_finish: "screen-finish", s_pause: "screen-pause" };
    for (var k in ids) if (Object.prototype.hasOwnProperty.call(ids, k)) el[k] = $(ids[k]);
    loadBest();
    UI.refreshLang();

    /* pointers: hold anywhere on the stage */
    el.stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest && e.target.closest("button")) return;
      A.unlock();
      if (UI.paused || current === "over" || current === "finish" || current === "pause") return;
      e.preventDefault();
      if (current === "title") handlers.start();
      if (ptr.indexOf(e.pointerId) < 0) ptr.push(e.pointerId);
      try { el.stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    function up(e) { var i = ptr.indexOf(e.pointerId); if (i >= 0) ptr.splice(i, 1); }
    el.stage.addEventListener("pointerup", up);
    el.stage.addEventListener("pointercancel", up);
    el.stage.addEventListener("lostpointercapture", up);
    el.stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    /* keyboard */
    window.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.tagName === "INPUT") return; // typing a leaderboard name
      var code = e.code;
      if (code === "KeyM") { A.unlock(); handlers.toggleMute(); return; }
      if (code === "KeyP" || code === "Escape") {
        if (S.mode === "play" || UI.paused) { e.preventDefault(); handlers.togglePause(); }
        return;
      }
      if (code === "Space" || code === "ArrowUp" || code === "KeyW" || code === "Enter") {
        e.preventDefault();                                 // also stops Space from clicking a focused button
        if (e.repeat) return;
        A.unlock();
        if (UI.paused) { if (code === "Enter" || code === "Space") handlers.resume(); return; }
        if (current === "over" || current === "finish") { if (code === "Enter" || code === "Space") handlers.again(); return; }
        if (current === "title") handlers.start();
        blurButtons();
        if (code === "Space") keys.space = true;
        else if (code === "ArrowUp") keys.up = true;
        else if (code === "KeyW") keys.w = true;
      }
    });
    window.addEventListener("keyup", function (e) {
      if (e.code === "Space") keys.space = false;
      else if (e.code === "ArrowUp") keys.up = false;
      else if (e.code === "KeyW") keys.w = false;
      if (e.code === "Space" || e.code === "Enter") e.preventDefault();
    });

    el.start.addEventListener("click", function () { A.unlock(); if (current === "title") handlers.start(); });
    el.again.addEventListener("click", function () { handlers.again(); });
    el.again2.addEventListener("click", function () { handlers.again(); });
    el.resume.addEventListener("click", function () { handlers.resume(); });
    el.mute.addEventListener("click", function () { A.unlock(); handlers.toggleMute(); el.mute.blur(); });
    el.pause.addEventListener("click", function () { handlers.togglePause(); el.pause.blur(); });

    /* iOS only starts sound from some gestures; asking on each of them is cheap once the context runs */
    ["pointerup", "touchend", "click", "keyup"].forEach(function (ev) { window.addEventListener(ev, A.unlock, { passive: true }); });

    var lb = document.querySelectorAll(".lang button"), i;
    for (i = 0; i < lb.length; i++) {
      lb[i].addEventListener("click", function (ev) {
        var lang = ev.currentTarget.getAttribute("data-lang");
        L.set(lang);
        try {
          var u = new URL(window.location.href);
          u.searchParams.set("lang", lang);
          window.history.replaceState(null, "", u.toString());
        } catch (err) { /* ignore */ }
        UI.refreshLang();
        ev.currentTarget.blur();
      });
    }
  };

  SKY.UI = UI;
})(window.SKY = window.SKY || {});

/* ---- HUD on the canvas ---- */
(function (SKY) {
  "use strict";

  var U = SKY.U, W = SKY.W, S = SKY.Sim, L = SKY.L, Fx = SKY.Fx, SP = Fx.SP, V = SKY.V;
  var H = {};

  var fuelBar = null, track = null;
  var shownFuel = 1, shownScore = -1, scoreStr = "0", shownDist = -1, distStr = "0", lowPulse = 0;
  H.reserveRight = 100;               // pixels the page buttons take at the top right

  H.build = function () {
    fuelBar = document.createElement("canvas"); fuelBar.width = 256; fuelBar.height = 12;
    var x = fuelBar.getContext("2d"), g = x.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, "#ff7a30"); g.addColorStop(0.55, "#ffb347"); g.addColorStop(1, "#ffe08a");
    x.fillStyle = g; x.fillRect(0, 0, 256, 12);
    x.fillStyle = "rgba(255,255,255,0.28)"; x.fillRect(0, 0, 256, 4);

    track = document.createElement("canvas"); track.width = 360; track.height = 8;
    x = track.getContext("2d");
    g = x.createLinearGradient(0, 0, 360, 0);
    g.addColorStop(0, "#2a3578"); g.addColorStop(0.2, "#1b2a66"); g.addColorStop(0.5, "#26376f");
    g.addColorStop(0.72, "#7a4a8a"); g.addColorStop(0.88, "#d9637a"); g.addColorStop(1, "#ffc470");
    x.fillStyle = g; x.fillRect(0, 0, 360, 8);
  };

  function pill(ctx, x, y, w, h) {
    var r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -1.5708, 1.5708);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, 1.5708, 4.7124); ctx.closePath();
  }

  H.draw = function (ctx, t, dt) {
    var m = 14, wide = V.w >= 720, barW = U.clamp(V.w * 0.24, 100, 200), i, x, y, f;
    var showing = S.mode === "play" || S.mode === "dying" || S.mode === "finale" || S.mode === "over" || S.mode === "finish";
    if (!showing) return;
    shownFuel += (S.fuel - shownFuel) * Math.min(1, dt * 9);
    f = U.sat(shownFuel);
    var low = f < 0.2 && f > 0;
    lowPulse = low ? 0.5 + 0.5 * Math.sin(t * 7) : 0;

    /* fuel */
    x = m; y = m + 2;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 + 0.45 * (low ? lowPulse : 1);
    ctx.drawImage(SP.glowWarm, x - 10, y - 12, 38, 38);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(SP.flame, x + 2, y - 3, 11, 22);
    x += 22;
    ctx.fillStyle = "rgba(255,255,255,0.14)";
    pill(ctx, x, y + 4, barW, 10); ctx.fill();
    if (f > 0.005) {
      ctx.save();
      pill(ctx, x, y + 4, barW, 10); ctx.clip();
      ctx.drawImage(fuelBar, 0, 0, 256 * f, 12, x, y + 4, barW * f, 10);
      if (low) { ctx.globalAlpha = 0.5 * lowPulse; ctx.fillStyle = "#ff3b2a"; ctx.fillRect(x, y + 4, barW * f, 10); ctx.globalAlpha = 1; }
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1;
    pill(ctx, x + 0.5, y + 4.5, barW - 1, 9); ctx.stroke();

    /* torn paper: three little lanterns */
    x += barW + 14;
    for (i = 0; i < 3; i++) {
      var intact = i < 3 - S.tears;
      ctx.globalAlpha = intact ? 1 : 0.45;
      ctx.drawImage(intact ? SP.lantern : SP.lanternDark, 32, 32, 192, 288, x + i * 19, y - 4, 14, 21);
      if (!intact) {
        ctx.strokeStyle = "rgba(255,120,80,0.9)"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x + i * 19 + 3, y + 3); ctx.lineTo(x + i * 19 + 8, y + 8); ctx.lineTo(x + i * 19 + 5, y + 14); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    /* score and distance, right aligned */
    var sc = S.score();
    if (sc !== shownScore) { shownScore = sc; scoreStr = L.num(sc); }
    var dm = S.distanceM();
    if (dm !== shownDist) { shownDist = dm; distStr = L.fmt("meters", { n: L.num(dm) }); }
    var rx = V.w - m - H.reserveRight;
    ctx.textAlign = "right"; ctx.textBaseline = "alphabetic";
    ctx.font = '700 20px ui-monospace, "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillText(scoreStr, rx + 1, m + 20);
    ctx.fillStyle = "#fff1c0"; ctx.fillText(scoreStr, rx, m + 19);
    ctx.font = '500 12px ui-monospace, "Cascadia Mono", Consolas, monospace';
    ctx.fillStyle = "rgba(220,230,255,0.62)"; ctx.fillText(distStr, rx, m + 36);

    /* progress track */
    var tw = wide ? U.clamp(V.w * 0.28, 200, 380) : V.w - m * 2;
    var tx = wide ? (V.w - tw) / 2 : m, ty = wide ? m + 12 : m + 52;
    var prog = U.sat(S.D / W.LTOTAL);
    ctx.globalAlpha = 0.28;
    pill(ctx, tx, ty, tw, 5); ctx.save(); ctx.clip();
    ctx.drawImage(track, tx, ty, tw, 5);
    ctx.restore();
    ctx.globalAlpha = 0.95;
    ctx.save(); pill(ctx, tx, ty, tw, 5); ctx.clip();
    ctx.drawImage(track, 0, 0, 360 * prog, 8, tx, ty, tw * prog, 5);
    ctx.restore();
    ctx.globalAlpha = 0.5; ctx.fillStyle = "#fff";
    for (i = 1; i < 5; i++) ctx.fillRect(tx + tw * (W.START[i] / W.LTOTAL) - 0.5, ty - 1, 1, 7);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(SP.glowWarm, tx + tw * prog - 13, ty + 2.5 - 13, 26, 26);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff6d8";
    ctx.beginPath(); ctx.arc(tx + tw * prog, ty + 2.5, 3.2, 0, 6.283); ctx.fill();
  };

  H.reset = function () { shownFuel = 1; shownScore = -1; shownDist = -1; };

  SKY.Hud = H;
})(window.SKY = window.SKY || {});
