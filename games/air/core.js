/* Sky Lantern: the basics every other file leans on. Part 1: maths, hash noise, seeded random, colour, safe storage
   (no DOM, so the simulation runs under Node). Part 2: the one dictionary, English and Russian, and the language choice. */

/* ---- Part 1: helpers ---- */
(function (SKY) {
  "use strict";

  var U = {};

  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.sat = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.mod = function (a, n) { return ((a % n) + n) % n; };
  U.smooth = function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  U.smoother = function (t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * t * (t * (t * 6 - 15) + 10); };
  /* Moves v toward target with an exponential approach; k is "per second". */
  U.approach = function (v, target, k, dt) { return v + (target - v) * (1 - Math.exp(-k * dt)); };
  U.outCubic = function (t) { t = 1 - U.sat(t); return 1 - t * t * t; };
  U.inOutSine = function (t) { return 0.5 - 0.5 * Math.cos(Math.PI * U.sat(t)); };
  U.outBack = function (t) { t = U.sat(t) - 1; return 1 + t * t * (2.70158 * t + 1.70158); };

  /* Integer hash to [0,1). Stable for any integer, never repeats on a short period. */
  U.hash = function (i) {
    i = i | 0;
    i = Math.imul(i ^ (i >>> 16), 0x7feb352d);
    i = Math.imul(i ^ (i >>> 15), 0x846ca68b);
    i ^= i >>> 16;
    return (i >>> 0) / 4294967296;
  };
  U.hash2 = function (i, j) { return U.hash(Math.imul(i | 0, 0x27d4eb2d) + Math.imul(j | 0, 0x165667b1)); };

  /* 4096 hash values in a table. Hot drawing loops index it directly: TAB[i & 4095]. */
  U.TAB = new Float32Array(4096);
  for (var ti = 0; ti < 4096; ti++) U.TAB[ti] = U.hash(ti * 7 + 12345);

  /* Smooth 1D value noise in [0,1]. */
  U.noise = function (x) {
    var i = Math.floor(x), f = x - i;
    var s = f * f * f * (f * (f * 6 - 15) + 10);
    var a = U.hash(i), b = U.hash(i + 1);
    return a + (b - a) * s;
  };
  U.fbm = function (x, octaves) {
    var sum = 0, amp = 0.5, norm = 0;
    for (var o = 0; o < octaves; o++) {
      sum += amp * U.noise(x);
      norm += amp;
      x = x * 2.03 + 17.1;
      amp *= 0.5;
    }
    return sum / norm;
  };

  /* Small seeded generator (mulberry32). Methods instead of closures, so a run can be rebuilt from a seed. */
  function RNG(seed) { this.s = (seed >>> 0) || 1; }
  RNG.prototype.next = function () {
    var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.sign = function () { return this.next() < 0.5 ? -1 : 1; };
  U.RNG = RNG;

  /* Colour: arrays of three numbers 0..255. Strings are built only when a palette refreshes (about 10 times a second). */
  U.hex = function (s, out) {
    out = out || [0, 0, 0];
    var n = parseInt(s.charAt(0) === "#" ? s.slice(1) : s, 16);
    out[0] = (n >> 16) & 255; out[1] = (n >> 8) & 255; out[2] = n & 255;
    return out;
  };
  U.mix = function (a, b, t, out) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  };
  U.rgba = function (c, a) {
    return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a === undefined ? 1 : Math.round(a * 1000) / 1000) + ")";
  };

  /* Storage that never throws (private windows, blocked cookies). */
  U.store = {
    get: function (key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } },
    set: function (key, value) { try { window.localStorage.setItem(key, String(value)); return true; } catch (e) { return false; } }
  };

  SKY.U = U;
})(window.SKY = window.SKY || {});

/* ---- Part 2: words ---- */
(function (SKY) {
  "use strict";

  var DICT = {
    en: {
      pageTitle: "Sky Lantern",
      back: "← Super Duper Engine",
      canvasLabel: "Sky Lantern, a one-button flying game. Hold to heat the flame and rise.",
      noscript: "This game needs JavaScript.",

      title: "Sky Lantern",
      tagline: "Hold to rise, let go to sink. Catch embers to keep the flame alive until dawn.",
      start: "Press or tap to start",
      keys: "Space, Up arrow, mouse or touch: hold to heat the flame. M mutes, P pauses.",
      bestLine: "Best score: {n}",

      score: "Score",
      best: "Best",
      newBest: "New best!",
      distance: "Distance",
      stars: "Stars",
      tearsLeft: "Tears left",
      time: "Time",
      ofN: "{a} of {b}",
      meters: "{n} m",
      playAgain: "Play again",

      overFlameTitle: "The flame went out",
      overFlameSub: "The fuel ran out before dawn.",
      overPaperTitle: "The paper gave way",
      overPaperSub: "Three tears were too many.",
      finishTitle: "Dawn",
      finishSub: "The lantern made it through the night.",

      paused: "Paused",
      resume: "Continue",
      pause: "Pause",
      muteOn: "Turn sound off",
      muteOff: "Turn sound on",
      langLabel: "Language",

      hintHold: "Hold to heat the flame",
      hintRelease: "Let go to cool down and sink",
      hintEmber: "Embers feed the flame",
      hintRain: "Rain puts the flame out. Fly around it.",
      hintSmoke: "Smoke chokes the flame",
      hintWind: "Wind pushes the lantern around",
      hintLow: "The flame is low. Find an ember.",
      hintThin: "The air is thin up here",

      zone1: "Sleeping town",
      zone2: "The forest",
      zone3: "Mountains",
      zone4: "Sea cliffs",
      zone5: "Sunrise"
    },
    ru: {
      pageTitle: "Небесный фонарик",
      back: "← Super Duper Engine",
      canvasLabel: "Небесный фонарик, игра в одну кнопку. Держите, чтобы разжечь пламя и подняться.",
      noscript: "Для игры нужен JavaScript.",

      title: "Небесный фонарик",
      tagline: "Держите — подниметесь, отпустите — опуститесь. Ловите угольки, чтобы огонь дожил до рассвета.",
      start: "Нажмите или коснитесь, чтобы начать",
      keys: "Пробел, стрелка вверх, мышь или касание: держите, чтобы греть пламя. M — звук, P — пауза.",
      bestLine: "Рекорд: {n}",

      score: "Счёт",
      best: "Рекорд",
      newBest: "Новый рекорд!",
      distance: "Путь",
      stars: "Звёзды",
      tearsLeft: "Запас бумаги",
      time: "Время",
      ofN: "{a} из {b}",
      meters: "{n} м",
      playAgain: "Играть ещё раз",

      overFlameTitle: "Огонь погас",
      overFlameSub: "Топливо кончилось раньше рассвета.",
      overPaperTitle: "Бумага не выдержала",
      overPaperSub: "Три разрыва — это слишком много.",
      finishTitle: "Рассвет",
      finishSub: "Фонарик пережил ночь.",

      paused: "Пауза",
      resume: "Продолжить",
      pause: "Пауза",
      muteOn: "Выключить звук",
      muteOff: "Включить звук",
      langLabel: "Язык",

      hintHold: "Держите, чтобы греть пламя",
      hintRelease: "Отпустите — остынете и опуститесь",
      hintEmber: "Угольки подкармливают огонь",
      hintRain: "Дождь тушит огонь. Облетайте его.",
      hintSmoke: "Дым душит пламя",
      hintWind: "Ветер сносит фонарик",
      hintLow: "Огонь догорает. Ищите уголёк.",
      hintThin: "Наверху воздух разрежен",

      zone1: "Спящий город",
      zone2: "Лес",
      zone3: "Горы",
      zone4: "Скалы у моря",
      zone5: "Рассвет"
    }
  };

  var ROMAN = ["I", "II", "III", "IV", "V"];

  var L = { lang: "en", dict: DICT.en };

  L.detect = function () {
    var q = null;
    try { q = new URLSearchParams(window.location.search).get("lang"); } catch (e) { q = null; }
    if (q === "ru" || q === "en") return q;
    var saved = SKY.U ? SKY.U.store.get("sde.lang") : null;
    if (saved === "ru" || saved === "en") return saved;
    var nav = (window.navigator && ((window.navigator.languages && window.navigator.languages[0]) || window.navigator.language)) || "en";
    return /^(ru|be|kk)(\b|-|_)/i.test(nav) ? "ru" : "en";
  };

  L.set = function (lang) {
    L.lang = lang === "ru" ? "ru" : "en";
    L.dict = DICT[L.lang];
  };

  L.t = function (key) {
    var v = L.dict[key];
    return v === undefined ? (DICT.en[key] === undefined ? key : DICT.en[key]) : v;
  };

  /* Text with {name} slots. Only called when the shown value changes, never every frame. */
  L.fmt = function (key, vars) {
    var s = L.t(key);
    for (var k in vars) if (Object.prototype.hasOwnProperty.call(vars, k)) s = s.split("{" + k + "}").join(String(vars[k]));
    return s;
  };

  L.num = function (n) {
    try { return Math.round(n).toLocaleString(L.lang === "ru" ? "ru-RU" : "en-US"); } catch (e) { return String(Math.round(n)); }
  };

  L.zoneName = function (i) { return L.t("zone" + (i + 1)); };
  L.zoneNumeral = function (i) { return ROMAN[i] || String(i + 1); };

  /* Fills every [data-i18n] element, plus aria-label and title when asked for. */
  L.apply = function (root) {
    root = root || document;
    var i, el, list = root.querySelectorAll("[data-i18n]");
    for (i = 0; i < list.length; i++) { el = list[i]; el.textContent = L.t(el.getAttribute("data-i18n")); }
    list = root.querySelectorAll("[data-i18n-aria]");
    for (i = 0; i < list.length; i++) { el = list[i]; el.setAttribute("aria-label", L.t(el.getAttribute("data-i18n-aria"))); }
    list = root.querySelectorAll("[data-i18n-title]");
    for (i = 0; i < list.length; i++) { el = list[i]; el.setAttribute("title", L.t(el.getAttribute("data-i18n-title"))); }
    document.documentElement.setAttribute("lang", L.lang);
    document.title = L.t("pageTitle");
  };

  SKY.L = L;
})(window.SKY = window.SKY || {});
