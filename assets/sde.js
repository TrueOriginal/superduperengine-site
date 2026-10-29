// Behaviour of superduperengine.top: the theme toggle, the language choice, the peeking mark's eyes,
// the hero demo controls, the game records and the copy button. Works without any of it, too.
(function () {
  "use strict";
  var root = document.documentElement;
  var REDUCED = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  // ------------------------------------------------------------------ theme: system, dark, light
  var toggle = document.querySelector("[data-theme-toggle]");
  var mode = "system";
  try { var saved = localStorage.getItem("sde.theme"); if (saved === "dark" || saved === "light") mode = saved; } catch (e) {}
  function isLight() {
    if (mode !== "system") return mode === "light";
    return !!(window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches);
  }
  function applyTheme() {
    if (mode === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
    if (toggle) {
      var label = toggle.getAttribute("data-label-" + mode);
      toggle.setAttribute("data-mode", mode); toggle.setAttribute("aria-label", label); toggle.title = label;
    }
    if (player) player.setLight(isLight());
  }
  if (toggle) toggle.addEventListener("click", function () {
    mode = { system: "dark", dark: "light", light: "system" }[mode];
    try { if (mode === "system") localStorage.removeItem("sde.theme"); else localStorage.setItem("sde.theme", mode); } catch (e) {}
    applyTheme();
  });
  if (window.matchMedia) {
    var scheme = matchMedia("(prefers-color-scheme: light)");
    if (scheme.addEventListener) scheme.addEventListener("change", function () { if (mode === "system" && player) player.setLight(isLight()); });
  }

  // ------------------------------------------------------------------ header line and language memory
  var bar = document.querySelector(".bar");
  function syncBar() { if (bar) bar.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", syncBar, { passive: true });
  syncBar();
  each(document.querySelectorAll("[data-lang]"), function (link) {
    if (link.tagName !== "A") return;
    link.addEventListener("click", function () {
      var choice = link.getAttribute("data-lang");
      try { localStorage.setItem("sde.lang", choice); } catch (e) {}
      document.cookie = "nf_lang=" + choice + "; path=/; max-age=31536000; samesite=lax";
    });
  });

  // ------------------------------------------------------------------ copy the address
  each(document.querySelectorAll("[data-copy]"), function (button) {
    var label = button.textContent;
    button.addEventListener("click", function () {
      var text = button.getAttribute("data-copy");
      function done() { button.textContent = button.getAttribute("data-copied"); setTimeout(function () { button.textContent = label; }, 2000); }
      function select() {
        var link = button.parentNode.querySelector("a");
        if (!link) return;
        var range = document.createRange(); range.selectNodeContents(link);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, select); else select();
    });
  });

  // ------------------------------------------------------------------ records of the games (best effort)
  var games = document.querySelector("[data-records-api]");
  if (games && window.fetch) {
    var api = games.getAttribute("data-records-api");
    var lang = root.lang === "ru" ? "ru-RU" : "en-US";
    each(games.querySelectorAll("[data-record]"), function (row) {
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 5000);
      fetch(api + "?game=" + encodeURIComponent(row.getAttribute("data-record")), ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) { return r.json(); })
        .then(function (data) {
          clearTimeout(timer);
          var top = data && data.entries && data.entries[0];
          if (!top) return;
          row.querySelector("dd").textContent = Number(top.score).toLocaleString(lang) + ", " + top.name;
          row.hidden = false;
        })
        .catch(function () { clearTimeout(timer); });
    });
  }

  // ------------------------------------------------------------------ hero demo
  var player = null;
  var fig = document.querySelector("[data-demo]");
  if (fig && window.SDEPlayer) {
    var demos = window.SDEPlayer.collect(fig.getAttribute("data-lang") || "en");
    var canvas = fig.querySelector("[data-demo-canvas]");
    var $ = function (sel) { return fig.querySelector(sel); };
    var tickWord = fig.getAttribute("data-tick");
    var pauseBtn = $("[data-demo-pause]");
    function onState(s) {
      $("[data-demo-title]").textContent = s.title;
      $("[data-demo-tick]").textContent = s.kind === "play" || s.kind === "hold" ? tickWord + " " + s.tick : "";
      $("[data-demo-run]").textContent = s.run;
      var line = $("[data-demo-change]");
      line.textContent = s.line;
      line.setAttribute("data-kind", s.result || s.kind);
    }
    if (demos.length) {
      try { player = window.SDEPlayer.mount(canvas, { demos: demos, light: isLight(), paused: REDUCED, onState: onState, onShow: function (i) {
        each($("[data-demo-tabs]").children, function (x, k) { x.setAttribute("aria-selected", k === i ? "true" : "false"); });
      }, onProgress: function (p) {
        // The active tab's bar shows how far the demo is, so the switch to the next one is no surprise.
        var on = $("[data-demo-tabs] [aria-selected=\"true\"]");
        if (on) on.style.setProperty("--p", p.toFixed(4));
      } }); } catch (e) { player = null; }
    }
    if (!player) {
      $("[data-demo-nogl]").hidden = false;
      canvas.hidden = true;
      if (pauseBtn) pauseBtn.hidden = true;
    } else {
      var tabs = $("[data-demo-tabs]");
      if (demos.length > 1) {
        demos.forEach(function (d, i) {
          var b = document.createElement("button");
          b.type = "button"; b.setAttribute("role", "tab"); b.textContent = d.title.split(/:\s/)[0]; b.title = d.title;
          b.setAttribute("aria-selected", i === 0 ? "true" : "false");
          b.addEventListener("click", function () {
            each(tabs.children, function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
            player.show(i);
          });
          tabs.appendChild(b);
        });
        tabs.classList.add("hello");
      } else tabs.hidden = true;
      function syncPause() { pauseBtn.textContent = player.playing() ? fig.getAttribute("data-pause") : fig.getAttribute("data-resume"); }
      pauseBtn.addEventListener("click", function () { if (player.playing()) player.pause(); else player.resume(); syncPause(); if (start) start.remove(); });
      var start = null;
      if (REDUCED) {
        start = document.createElement("button");
        start.type = "button"; start.className = "btn btn-play demo-start"; start.textContent = fig.getAttribute("data-start");
        start.addEventListener("click", function () { player.resume(); syncPause(); start.remove(); start = null; });
        $(".demo-stage").appendChild(start);
      }
      syncPause();
    }
  }
  applyTheme();

  // ------------------------------------------------------------------ the mark's eyes follow the pointer, or the ball when idle
  var pupils = document.querySelectorAll("svg.peek .pupil");
  if (pupils.length && !REDUCED) {
    var px = 0, py = 0, idleSince = 0, queued = false;
    function aim(x, y) {
      each(pupils, function (g) {
        var box = g.ownerSVGElement.getBoundingClientRect(), vb = g.ownerSVGElement.viewBox.baseVal;
        if (!box.width) return;
        var k = box.width / vb.width;
        var cx = box.left + (Number(g.getAttribute("data-cx")) - vb.x) * k, cy = box.top + (Number(g.getAttribute("data-cy")) - vb.y) * k;
        var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 220);
        g.setAttribute("transform", "translate(" + (dx / d * 8 * m).toFixed(1) + " " + (dy / d * 10 * m).toFixed(1) + ")");
      });
    }
    function tick() {
      queued = false;
      var now = performance.now();
      if (player && now - idleSince > 2500) {
        var f = player.focus();
        if (f) {
          var box = canvas.getBoundingClientRect();
          aim(box.left + f.x, box.top + f.y);
        }
        requestAnimationFrame(function () { if (!queued) { queued = true; tick(); } });
        return;
      }
      aim(px, py);
    }
    window.addEventListener("pointermove", function (e) {
      px = e.clientX; py = e.clientY; idleSince = performance.now();
      if (!queued) { queued = true; requestAnimationFrame(tick); }
    }, { passive: true });
    if (player) { queued = true; requestAnimationFrame(tick); }
  }
})();
