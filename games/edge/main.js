// Over the Edge: the page. Input (mouse with pointer lock, keyboard, touch), the fixed-step
// loop, scene items for the renderer, particles, HUD, screens and the two languages.
// Test hooks: ?wave=N starts at wave N, ?bot=1 plays by itself, window.__edge exposes state.
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var LANG = params.get("lang") === "ru" || params.get("lang") === "en" ? params.get("lang") : /^(ru|be|kk)\b/i.test(navigator.language || "") ? "ru" : "en";
  var TEXT = {
    en: {
      title: "Over the Edge", tagline: "Knock the bots off the island before they knock you off.",
      how: "WASD move · mouse aim · click shoot · Space jump · Shift dash · E or right click shockwave",
      howTouch: "Left stick moves · drag on the right to aim · buttons shoot, jump, dash and push",
      play: "Play", best: "Best", wave: "Wave", left: "left", paused: "Paused", resume: "Resume", restart: "Restart",
      over: "You fell off", overText: "Wave {w} · score {s}", win: "The island is yours", winText: "All {n} waves held · score {s}",
      again: "Play again", combo: "×{n}", incoming: "Wave {n}", incomingSub: "{c} bots on the way", cleared: "Wave cleared",
      heavy: "Heavy shots for the next wave", life: "Extra life", lastLife: "Last life", dash: "Dash", shock: "Shockwave",
      fire: "Fire", jump: "Jump", soundOn: "Sound on", soundOff: "Sound off", record: "New best", nogl: "This game needs WebGL2, and this browser does not have it.",
      madeBy: "First version by Claude Opus 5.5 in {m} minutes", back: "← Super Duper Engine", quit: "Quit",
      keyDash: "Shift", keyShock: "RMB · E", retry: "Wave {n} again", retrySub: "Lives left: {l}",
      hintFire: "[Click] to shoot. A shot pushes a bot: drive it over the edge",
      hintMove: "[Shift] dashes, [Space] jumps. Dash away when bots close in",
      hintShock: "[Right click] or [E]: shockwave, throws back every bot around you",
      hintFireTouch: "Fire pushes a bot: drive it over the edge",
      hintMoveTouch: "Dash gets you out of trouble, Jump goes over bots",
      hintShockTouch: "Shockwave throws back every bot around you",
      hintDasher: "Red bots glow before they lunge. Step aside, and near the edge they fly off",
      hintDasherTouch: "Red bots glow before they lunge. Step aside, and near the edge they fly off",
      shotgun: "A shotgun is on the island: grab it", shotgunGot: "Shotgun: a fan of pellets, a huge push up close",
    },
    ru: {
      title: "За край", tagline: "Сбросьте ботов с острова, пока они не сбросили вас.",
      how: "WASD — ходить · мышь — целиться · клик — стрелять · пробел — прыжок · Shift — рывок · E или правая кнопка — волна",
      howTouch: "Левый стик — ходить · справа тяните — целиться · кнопки: выстрел, прыжок, рывок, волна",
      play: "Играть", best: "Рекорд", wave: "Волна", left: "осталось", paused: "Пауза", resume: "Продолжить", restart: "Заново",
      over: "Вы упали", overText: "Волна {w} · счёт {s}", win: "Остров ваш", winText: "Все {n} волн выдержаны · счёт {s}",
      again: "Ещё раз", combo: "×{n}", incoming: "Волна {n}", incomingSub: "ботов на подходе: {c}", cleared: "Волна отбита",
      heavy: "Тяжёлые выстрелы на следующую волну", life: "Лишняя жизнь", lastLife: "Последняя жизнь", dash: "Рывок", shock: "Волна",
      fire: "Огонь", jump: "Прыжок", soundOn: "Звук вкл", soundOff: "Звук выкл", record: "Новый рекорд", nogl: "Игре нужен WebGL2, а в этом браузере его нет.",
      madeBy: "Первую версию сделал Claude Opus 5.5 за {m} мин", back: "← Super Duper Engine", quit: "Выйти",
      keyDash: "Shift", keyShock: "ПКМ · E", retry: "Волна {n} заново", retrySub: "Жизней осталось: {l}",
      hintFire: "[Клик] — выстрел. Он толкает бота: сбросьте его за край",
      hintMove: "[Shift] — рывок, [Пробел] — прыжок. Рывком уходите, когда боты рядом",
      hintShock: "[Правая кнопка] или [E] — ударная волна: отбрасывает всех ботов вокруг",
      hintFireTouch: "«Огонь» толкает бота: сбросьте его за край",
      hintMoveTouch: "«Рывок» уводит из-под удара, «Прыжок» — над ботами",
      hintShockTouch: "«Волна» отбрасывает всех ботов вокруг",
      hintDasher: "Красный бот светится перед рывком — отойдите в сторону, а у края он улетит сам",
      hintDasherTouch: "Красный бот светится перед рывком — отойдите в сторону, а у края он улетит сам",
      shotgun: "На острове дробовик — подберите", shotgunGot: "Дробовик: веер дроби, мощный толчок вблизи",
    },
  }[LANG];
  var MADE_MINUTES = 13; // the agent's working time, from the brief to the first playable build
  document.documentElement.lang = LANG;
  function fmt(text, values) {
    return text.replace(/\{(\w)\}/g, function (_, k) { return values[k]; });
  }
  function $(id) { return document.getElementById(id); }
  Array.prototype.forEach.call(document.querySelectorAll("[data-t]"), function (node) {
    node.textContent = TEXT[node.getAttribute("data-t")];
  });
  document.title = TEXT.title + " · Super Duper Engine";
  $("back").href = "/" + LANG + "/";
  $("back").textContent = TEXT.back;
  if (MADE_MINUTES) $("made-by").textContent = fmt(TEXT.madeBy, { m: MADE_MINUTES });

  var TOUCH = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  var BOT = params.get("bot") === "1";
  $("how").textContent = TOUCH ? TEXT.howTouch : TEXT.how;
  if (TOUCH) document.body.classList.add("touch-mode");

  var canvas = $("game");
  var R = window.EdgeRender && window.EdgeRender.create(canvas);
  if (!R) {
    $("screen-title").hidden = true;
    $("screen-nogl").hidden = false;
    return;
  }
  var M4 = R.M4;
  var EW = window.EdgeWorld;
  var sound = new window.EdgeSound();
  var best = 0;
  try { best = Number(localStorage.getItem("sde.game.edge.best")) || 0; } catch (error) {}
  function showBest() {
    $("best").textContent = best ? TEXT.best + ": " + best : "";
  }
  showBest();
  function syncMute() { $("mute").textContent = sound.muted ? TEXT.soundOff : TEXT.soundOn; }
  syncMute();
  $("mute").addEventListener("click", function () { sound.unlock(); sound.setMuted(!sound.muted); syncMute(); });

  // ---------------------------------------------------------------- particles

  var MAXP = 1300;
  var P = [];
  for (var pi = 0; pi < MAXP; pi++) P.push({ life: 0 });
  var partOut = { data: new Float32Array(MAXP * 8), count: 0 };
  var cursor = 0;
  function emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, gravity, drag) {
    var p = P[cursor];
    cursor = (cursor + 1) % MAXP;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life; p.max = life; p.size = size; p.r = r; p.g = g; p.b = b; p.a = a;
    p.gravity = gravity || 0; p.drag = drag || 0;
  }
  function burst(x, y, z, n, speed, color, size, life, gravity) {
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6), q = Math.sqrt(1 - u * u);
      emit(x, y, z, Math.cos(th) * q * s, u * s + speed * 0.3, Math.sin(th) * q * s, life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), color[0], color[1], color[2], 1, gravity, 1.5);
    }
  }
  var clouds = [];
  for (var ci = 0; ci < 46; ci++) {
    var ca = Math.random() * Math.PI * 2, cd = 8 + Math.random() * 70;
    clouds.push({ x: Math.cos(ca) * cd, y: -20 - Math.random() * 14, z: Math.sin(ca) * cd, s: 7 + Math.random() * 12, a: 0.1 + Math.random() * 0.12 });
  }
  function updateParticles(dt, t) {
    var out = partOut.data, n = 0;
    for (var c = 0; c < clouds.length; c++) {
      var cl = clouds[c];
      cl.x += dt * 0.6;
      if (cl.x > 80) cl.x -= 160;
      var o = n * 8;
      out[o] = cl.x; out[o + 1] = cl.y; out[o + 2] = cl.z; out[o + 3] = cl.s;
      out[o + 4] = 0.95; out[o + 5] = 0.66; out[o + 6] = 0.58; out[o + 7] = cl.a;
      n++;
    }
    for (var i = 0; i < MAXP; i++) {
      var p = P[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      var k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k - p.gravity * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      var f = p.life / p.max;
      o = n * 8;
      out[o] = p.x; out[o + 1] = p.y; out[o + 2] = p.z; out[o + 3] = p.size * (0.5 + f * 0.5);
      out[o + 4] = p.r; out[o + 5] = p.g; out[o + 6] = p.b; out[o + 7] = p.a * f;
      n++;
    }
    partOut.count = n;
  }

  // ---------------------------------------------------------------- HUD

  var banner = { el: $("banner"), until: 0 };
  function say(main, sub, seconds) {
    banner.el.innerHTML = "";
    banner.el.appendChild(document.createTextNode(main));
    if (sub) {
      var small = document.createElement("small");
      small.textContent = sub;
      banner.el.appendChild(small);
    }
    banner.el.classList.add("show");
    banner.until = now() + (seconds || 1.8) * 1000;
  }
  var hudCache = {};
  function setText(id, value) {
    if (hudCache[id] === value) return;
    hudCache[id] = value;
    $(id).textContent = value;
  }
  function updateHud(w) {
    setText("hud-wave", Math.max(1, w.wave) + "/" + EW.WAVES.length);
    setText("hud-left", w.state === "fight" ? w.remaining() + " " + TEXT.left : "");
    setText("hud-score", String(w.score));
    setText("hud-combo", w.combo > 1 && w.time - w.lastKnock < 1.8 ? fmt(TEXT.combo, { n: w.combo }) : "");
    var lives = "";
    for (var i = 0; i < Math.max(3, w.lives); i++) lives += i < w.lives ? "<i></i>" : '<i class="lost"></i>';
    if (hudCache.lives !== lives) { hudCache.lives = lives; $("hud-lives").innerHTML = lives; }
    cool("cool-dash", w.player.dashCool / 1.4);
    cool("cool-shock", w.player.shockCool / 7);
    if (TOUCH) {
      $("t-dash").classList.toggle("cooling", w.player.dashCool > 0);
      $("t-shock").classList.toggle("cooling", w.player.shockCool > 0);
    }
    $("hurt").style.opacity = String(Math.min(0.7, w.player.hurt * 0.6));
    if (banner.until && now() > banner.until) { banner.el.classList.remove("show"); banner.until = 0; }
    checkHints(w);
  }
  function cool(id, frac) {
    var el = $(id), ready = frac <= 0;
    el.firstElementChild.style.transform = "scaleX(" + (1 - Math.min(1, frac)).toFixed(3) + ")";
    el.classList.toggle("ready", ready);
  }

  // ---------------------------------------------------------------- world and events

  var world = null;
  function onEvent(name, info) {
    sound.play(name, info);
    var p = world.player;
    if (name === "shot") {
      for (var i = 0; i < 4; i++) emit(info.x, info.y, info.z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.12, 0.08, 0.65, 0.88, 1, 1, 0, 3);
    } else if (name === "hit") {
      burst(info.x, info.y, info.z, info.heavy ? 22 : 14, info.heavy ? 9 : 7, info.heavy ? [1, 0.75, 0.3] : [0.6, 0.85, 1], 0.09, 0.5, 14);
    } else if (name === "spark") {
      burst(info.x, info.y, info.z, 7, 4, [1, 0.9, 0.6], 0.06, 0.3, 12);
    } else if (name === "shock") {
      for (var k = 0; k < 64; k++) {
        var a = (k / 64) * Math.PI * 2;
        emit(info.x + Math.cos(a) * 0.6, 0.35, info.z + Math.sin(a) * 0.6, Math.cos(a) * 12, 0.4, Math.sin(a) * 12, 0.45, 0.22, info.fromPlayer ? 0.8 : 1, info.fromPlayer ? 1 : 0.6, info.fromPlayer ? 0.4 : 0.35, 1, 0, 2.5);
      }
      if (info.fromPlayer) p.shake = Math.max(p.shake, 0.5);
    } else if (name === "wave") {
      hints.waveTime = world.time;
      say(fmt(TEXT.incoming, { n: info.wave }), fmt(TEXT.incomingSub, { c: info.count }), 2.2);
    } else if (name === "retry") {
      say(fmt(TEXT.retry, { n: info.wave }), fmt(TEXT.retrySub, { l: info.lives }), 2.2);
    } else if (name === "cleared") {
      say(TEXT.cleared, info.drop ? TEXT[info.drop] : "", 2.4);
    } else if (name === "pickup") {
      say(TEXT[info.kind === "shotgun" ? "shotgunGot" : info.kind], "", info.kind === "shotgun" ? 2.6 : 1.8);
      burst(p.x, 0.8, p.z, 30, 6, PICKUP_COLOR[info.kind], 0.1, 0.6, 4);
    } else if (name === "lunge") {
      burst(info.x, 0.3, info.z, 12, 5, CORAL, 0.08, 0.4, 8);
    } else if (name === "knock") {
      if (info.combo >= 3) say(fmt(TEXT.combo, { n: info.combo }), "+" + info.points, 0.9);
    } else if (name === "fall") {
      if (info.lives === 1) say(TEXT.lastLife, "", 1.6);
    } else if (name === "over" || name === "win") {
      setTimeout(function () { finish(name === "win"); }, name === "win" ? 900 : 1300);
    }
  }

  function edgePuffs(w) {
    for (var i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (e.falling && !e.puffed) {
        e.puffed = true;
        burst(e.x, Math.max(-0.5, e.y), e.z, 18, 5, [1, 0.5, 0.3], 0.14, 0.6, 6);
      }
    }
  }

  // ---------------------------------------------------------------- hints

  // Each control is explained once per visit, at the moment it is useful. Keys come in [brackets].
  var hints = { shown: {}, until: 0, next: 0, waveTime: 0 };
  function hint(w, key, seconds) {
    hints.shown[key] = true;
    $("hint").innerHTML = TEXT[TOUCH ? key + "Touch" : key].replace(/\[([^\]]+)\]/g, "<kbd>$1</kbd>");
    $("hint").classList.add("show");
    hints.until = w.time + seconds;
  }
  function checkHints(w) {
    if (hints.until) {
      if (w.time < hints.until) return;
      $("hint").classList.remove("show");
      hints.until = 0;
      hints.next = w.time + 1.5;
    }
    if (w.time < hints.next || w.state !== "fight" || w.player.respawn > 0) return;
    var sinceWave = w.time - hints.waveTime;
    if (!hints.shown.hintDasher && w.enemies.some(function (e) { return e.windup > 0; })) {
      hint(w, "hintDasher", 5);
    } else if (!hints.shown.hintFire) {
      if (sinceWave > 2.4) hint(w, "hintFire", 6);
    } else if (!hints.shown.hintShock && w.player.shockCool <= 0 && (botsNear(w, 5) >= 2 || (w.wave >= 2 && sinceWave > 2.4))) {
      hint(w, "hintShock", 6);
    } else if (!hints.shown.hintMove && (w.knocked > 0 || sinceWave > 14)) {
      hint(w, "hintMove", 5);
    }
  }
  function clearHint() {
    hints.until = hints.next = 0;
    $("hint").classList.remove("show");
  }
  function botsNear(w, radius) {
    var n = 0, p = w.player;
    for (var i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (!e.falling && Math.hypot(e.x - p.x, e.z - p.z) < radius) n++;
    }
    return n;
  }

  // ---------------------------------------------------------------- input

  var keys = {}, firing = false;
  var once = { jump: false, dash: false, shock: false };
  var stick = { id: null, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 };
  var SENS = 0.0022;
  window.addEventListener("keydown", function (e) {
    if (e.target && e.target.tagName === "INPUT") return; // typing a leaderboard name
    if (mode === "playing") {
      if (e.code === "Space") once.jump = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") once.dash = true;
      if (e.code === "KeyE") once.shock = true;
      if (e.code === "KeyP" || e.code === "Escape") pause();
      if (e.code === "Space" || e.code.indexOf("Arrow") === 0) e.preventDefault();
    }
    if (e.code === "KeyM") { sound.setMuted(!sound.muted); syncMute(); }
    keys[e.code] = true;
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  canvas.addEventListener("mousedown", function (e) {
    if (mode !== "playing") return;
    if (!TOUCH && document.pointerLockElement !== canvas) { lock(); return; }
    if (e.button === 0) firing = true;
    if (e.button === 2) once.shock = true;
  });
  window.addEventListener("mouseup", function (e) { if (e.button === 0) firing = false; });
  window.addEventListener("contextmenu", function (e) { if (mode === "playing") e.preventDefault(); });
  document.addEventListener("mousemove", function (e) {
    if (mode !== "playing" || document.pointerLockElement !== canvas) return;
    turn(-e.movementX * SENS, -e.movementY * SENS);
  });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement !== canvas && mode === "playing" && !TOUCH) pause();
  });
  function turn(dyaw, dpitch) {
    var p = world.player;
    p.yaw += dyaw;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch + dpitch));
  }
  function lock() {
    if (TOUCH || BOT || !canvas.requestPointerLock) return;
    try {
      var r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(function () {});
    } catch (error) {
      // Some browsers refuse without a fresh gesture; the next click locks.
    }
  }

  // Touch: a stick on the left, drag anywhere else to look, buttons on the right.
  function hold(id, on, off) {
    var el = $(id);
    el.addEventListener("touchstart", function (e) { e.preventDefault(); sound.unlock(); on(); }, { passive: false });
    el.addEventListener("touchend", function (e) { e.preventDefault(); if (off) off(); }, { passive: false });
  }
  if (TOUCH) {
    hold("t-fire", function () { firing = true; }, function () { firing = false; });
    hold("t-jump", function () { once.jump = true; });
    hold("t-dash", function () { once.dash = true; });
    hold("t-shock", function () { once.shock = true; });
    var stickEl = $("stick");
    stickEl.addEventListener("touchstart", function (e) {
      e.preventDefault();
      var t = e.changedTouches[0], r = stickEl.getBoundingClientRect();
      stick.id = t.identifier; stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2;
      moveStick(t);
    }, { passive: false });
    canvas.addEventListener("touchstart", function (e) {
      e.preventDefault();
      var t = e.changedTouches[0];
      if (look.id === null) { look.id = t.identifier; look.x = t.clientX; look.y = t.clientY; }
    }, { passive: false });
    window.addEventListener("touchmove", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === stick.id) moveStick(t);
        if (t.identifier === look.id && mode === "playing") {
          turn(-(t.clientX - look.x) * 0.006, -(t.clientY - look.y) * 0.006);
          look.x = t.clientX; look.y = t.clientY;
        }
      }
    }, { passive: true });
    window.addEventListener("touchend", function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === stick.id) { stick.id = null; stick.x = 0; stick.y = 0; stickEl.firstElementChild.style.transform = ""; }
        if (t.identifier === look.id) look.id = null;
      }
    });
  }
  function moveStick(t) {
    var dx = t.clientX - stick.cx, dy = t.clientY - stick.cy, max = 52, d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    stick.x = dx / max; stick.y = dy / max;
    $("stick").firstElementChild.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  function readInput() {
    var mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz += 1;
    if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (stick.id !== null) { mx = stick.x; mz = -stick.y; }
    var input = { mx: mx, mz: mz, jump: once.jump, dash: once.dash, fire: firing, shock: once.shock };
    once.jump = once.dash = once.shock = false;
    if (BOT) autopilot(input);
    return input;
  }

  // A simple bot for tests: face the nearest bot, keep shooting, stay near the middle.
  function autopilot(input) {
    var w = world, p = w.player, target = null, bestD = 1e9, close = 0;
    for (var i = 0; i < w.enemies.length; i++) {
      var e = w.enemies[i];
      if (e.falling) continue;
      var d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < 3.2) close++;
      if (d < bestD) { bestD = d; target = e; }
    }
    input.fire = !!target;
    if (target) {
      var want = Math.atan2(-(target.x - p.x), -(target.z - p.z));
      var diff = Math.atan2(Math.sin(want - p.yaw), Math.cos(want - p.yaw));
      p.yaw += diff * 0.25;
      p.pitch += (Math.atan2(target.y + target.k.r - (p.y + 1.55), bestD) - p.pitch) * 0.2;
    }
    var dc = Math.hypot(p.x, p.z);
    input.mz = dc > 5 ? 1 : 0;
    if (dc > 5) {
      var toCenter = Math.atan2(p.x, p.z);
      var rel = Math.atan2(Math.sin(toCenter - p.yaw), Math.cos(toCenter - p.yaw));
      input.mz = Math.cos(rel); input.mx = -Math.sin(rel);
    } else {
      input.mx = Math.sin(w.time * 0.9);
    }
    if (close >= 3) input.shock = true;
  }

  // ---------------------------------------------------------------- screens

  var mode = "title";
  function start() {
    sound.unlock();
    world = new EW.World(onEvent);
    var startWave = Math.max(1, Math.min(EW.WAVES.length, Number(params.get("wave")) || 1));
    world.wave = startWave - 1;
    mode = "playing";
    document.body.classList.add("playing");
    $("screen-title").hidden = true;
    $("screen-end").hidden = true;
    $("screen-pause").hidden = true;
    $("hud").hidden = false;
    $("touch").hidden = !TOUCH;
    firing = false;
    clearHint();
    lock();
  }
  function pause() {
    if (mode !== "playing") return;
    mode = "paused";
    firing = false;
    $("screen-pause").hidden = false;
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
  }
  function resume() {
    mode = "playing";
    $("screen-pause").hidden = true;
    lock();
  }
  function quit() {
    mode = "title";
    firing = false;
    document.body.classList.remove("playing");
    world = new EW.World(onEvent);
    clearHint();
    $("screen-pause").hidden = true;
    $("hud").hidden = true;
    $("touch").hidden = true;
    $("screen-title").hidden = false;
    showBest();
  }
  function finish(won) {
    mode = "end";
    firing = false;
    document.body.classList.remove("playing");
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    var record = world.score > best;
    if (record) {
      best = world.score;
      try { localStorage.setItem("sde.game.edge.best", String(best)); } catch (error) {}
    }
    $("end-title").textContent = won ? TEXT.win : TEXT.over;
    $("end-text").textContent = fmt(won ? TEXT.winText : TEXT.overText, { w: world.wave, s: world.score, n: EW.WAVES.length });
    $("end-best").textContent = record ? TEXT.record + ": " + best : TEXT.best + ": " + best;
    $("hud").hidden = true;
    $("touch").hidden = true;
    $("screen-end").hidden = false;
    if (window.SDEScores) window.SDEScores.mount($("board"), { game: "edge", lang: LANG, score: world.score, ms: Math.round(world.time * 1000) });
    showBest();
  }
  $("play").addEventListener("click", start);
  $("again").addEventListener("click", start);
  $("restart").addEventListener("click", start);
  $("resume").addEventListener("click", resume);
  $("quit").addEventListener("click", quit);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

  // ---------------------------------------------------------------- scene

  // Amber is the site's accent, ice is the player's side, coral-red the bots.
  var AMBER = [1, 0.66, 0.22], ICE = [0.5, 0.8, 1], CORAL = [1, 0.36, 0.24];
  var PICKUP_COLOR = { heavy: [0.55, 0.85, 1], life: [1, 0.36, 0.5], shotgun: [1, 0.78, 0.25] };

  // Scenery that does not play: amber crystals along the rim and small islets drifting far out.
  var CRYSTALS = [], ISLETS = [];
  (function () {
    var seed = 7;
    function rand() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var c = 0; c < 14; c++) {
      var a = (c / 14) * Math.PI * 2 + 0.2 + rand() * 0.25;
      var m = (((a - Math.PI / 4) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      if (Math.min(m, Math.PI / 2 - m) < 0.22) a += 0.3; // keep the bots' portals clear
      for (var k = 0; k < 3; k++) {
        var r = EW.R - 0.6 - rand() * 0.9, b = a + (rand() - 0.5) * 0.08;
        CRYSTALS.push({ x: Math.cos(b) * r, z: Math.sin(b) * r, h: 0.35 + rand() * 0.7, yaw: rand() * 3, tilt: (rand() - 0.5) * 0.5, phase: rand() * 6 });
      }
    }
    // Below eye level, so their tops show against the clouds instead of dark undersides against the sky.
    for (var i = 0; i < 9; i++) {
      var w = rand() * Math.PI * 2, d = 42 + rand() * 48;
      ISLETS.push({ x: Math.cos(w) * d, y: -12 + rand() * 10, z: Math.sin(w) * d, s: 0.16 + rand() * 0.24, yaw: rand() * 6, phase: rand() * 6 });
    }
  })();
  var IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  var X_AXIS = [1, 0, 0];
  function items(w, t) {
    var list = [
      { mesh: "islandTop", model: IDENT, mat: 3, color: [0.3, 0.25, 0.22], accent: AMBER },
      { mesh: "islandRock", model: IDENT, mat: 4, color: [0.32, 0.24, 0.24], noShadow: true },
    ];
    EW.PILLARS.forEach(function (c) {
      list.push({ mesh: "cylinder", model: M4.model(c.x, c.h / 2, c.z, 0, 0, null, c.r, c.h, c.r), mat: 0, color: [0.46, 0.4, 0.38] });
      list.push({ mesh: "cylinder", model: M4.model(c.x, c.h + 0.03, c.z, 0, 0, null, c.r * 1.03, 0.06, c.r * 1.03), mat: 5, color: [1, 0.62, 0.2], noShadow: true });
    });
    CRYSTALS.forEach(function (c) {
      var glow = 0.75 + 0.25 * Math.sin(t * 1.7 + c.phase);
      list.push({ mesh: "cube", model: M4.model(c.x, c.h * 0.5 - 0.05, c.z, c.yaw, c.tilt, X_AXIS, 0.16, c.h, 0.16), mat: 5, color: [glow, 0.62 * glow, 0.24 * glow], noShadow: true });
    });
    ISLETS.forEach(function (s) {
      var y = s.y + Math.sin(t * 0.3 + s.phase) * 0.6, model = M4.model(s.x, y, s.z, s.yaw + t * 0.01, 0, null, s.s, s.s, s.s);
      list.push({ mesh: "islandTop", model: model, mat: 3, color: [0.36, 0.3, 0.25], accent: AMBER, noShadow: true });
      list.push({ mesh: "islandRock", model: model, mat: 4, color: [0.4, 0.3, 0.28], noShadow: true });
    });
    var fight = w.state === "fight" && w.queue.length > 0;
    w.portals.forEach(function (po, i) {
      var pulse = fight ? 0.35 + 0.25 * Math.sin(t * 4 + i) : 0.15;
      var g = Math.min(1, pulse + po.glow * 0.8);
      list.push({ mesh: "cylinder", model: M4.model(po.x, 0.015, po.z, 0, 0, null, 1.15, 0.03, 1.15), mat: 5, color: [0.12 + 0.88 * g, 0.05 + 0.4 * g, 0.04 + 0.22 * g], noShadow: true });
    });
    w.pickups.forEach(function (u) {
      var y = 0.9 + Math.sin(u.t * 3) * 0.15;
      var long = u.kind === "shotgun" ? 0.8 : 0.42, thin = u.kind === "shotgun" ? 0.24 : 0.42;
      list.push({ mesh: "cube", model: M4.model(u.x, y, u.z, u.t * 2, 0.6, X_AXIS, thin, thin, long), mat: 5, color: PICKUP_COLOR[u.kind] });
    });
    w.enemies.forEach(function (e) {
      var k = e.k, sq = e.squash, s = k.r * 2, sy = 1 - 0.28 * sq, sxz = 1 + 0.16 * sq;
      if (e.kind === "roller") {
        list.push({ mesh: "sphere", model: M4.model(e.x, e.y + k.r, e.z, 0, e.roll, e.spinAxis, k.r, k.r, k.r), mat: 2, color: [0.16, 0.18, 0.22], accent: CORAL, flash: e.flash });
      } else if (e.kind === "dasher") {
        // Long and low, nose first; it glows while it aims and leaves a trail while it lunges.
        list.push({ mesh: "cube", model: M4.model(e.x, e.y + (s * 0.8 * sy) / 2, e.z, e.yaw, e.spin, e.spinAxis, s * 0.72 * sxz, s * 0.8 * sy, s * 1.35 * sxz), mat: 6, color: [0.5, 0.13, 0.12], accent: CORAL, flash: Math.max(e.flash, e.charge) });
        if (e.dashTime > 0) emit(e.x, e.y + 0.45, e.z, 0, 0.3, 0, 0.3, 0.14, 1, 0.42, 0.2, 0.9, 0, 0);
      } else {
        var mat = e.kind === "brute" ? 7 : 6;
        var color = e.kind === "brute" ? [0.2, 0.22, 0.27] : e.kind === "hopper" ? [0.76, 0.58, 0.36] : [0.6, 0.4, 0.22];
        list.push({ mesh: "cube", model: M4.model(e.x, e.y + (s * sy) / 2, e.z, e.yaw, e.spin, e.spinAxis, s * sxz, s * sy, s * sxz), mat: mat, color: color, accent: CORAL, flash: e.flash });
      }
    });
    w.shots.forEach(function (s) {
      var size = s.pellet ? 0.07 : 0.11;
      list.push({ mesh: "sphere", model: M4.model(s.x, s.y, s.z, 0, 0, null, size, size, size), mat: 5, color: s.pellet ? [1, 0.8, 0.4] : [0.65, 0.88, 1], noShadow: true });
      emit(s.x, s.y, s.z, 0, 0, 0, 0.16, 0.08, 0.45, 0.75, 1, 0.9, 0, 0);
    });
    return list;
  }

  // The weapon, in camera space: it kicks back on each shot and bobs while walking.
  function weapon(w, t) {
    var p = w.player, kick = p.recoil * 0.05, bob = p.onGround ? Math.sin(p.walk * 2.2) * 0.008 : 0;
    var x = 0.3, y = -0.255 + bob, z = -0.74 + kick;
    var core = 0.6 + p.recoil * 0.4 + 0.08 * Math.sin(t * 5);
    var shockReady = p.shockCool <= 0;
    if (w.shotgun) {
      // Two short barrels on a wider body, an amber stripe instead of the lime core.
      return [
        { mesh: "cube", model: M4.model(x, y - 0.005, z + 0.02, 0, 0, null, 0.085, 0.07, 0.3), mat: 0, color: [0.2, 0.15, 0.12] },
        { mesh: "cylinder", model: M4.model(x - 0.022, y + 0.012, z - 0.21, 0, Math.PI / 2, X_AXIS, 0.022, 0.2, 0.022), mat: 0, color: [0.11, 0.12, 0.15] },
        { mesh: "cylinder", model: M4.model(x + 0.022, y + 0.012, z - 0.21, 0, Math.PI / 2, X_AXIS, 0.022, 0.2, 0.022), mat: 0, color: [0.11, 0.12, 0.15] },
        { mesh: "cube", model: M4.model(x, y + 0.045, z + 0.06, 0, 0, null, 0.05, 0.012, 0.12), mat: 5, color: [1 * core, 0.72 * core, 0.25 * core] },
        { mesh: "cube", model: M4.model(x - 0.046, y + 0.005, z + 0.03, 0, 0, null, 0.006, 0.022, 0.1), mat: 5, color: shockReady ? [1, 0.5, 0.3] : [0.22, 0.1, 0.07] },
      ];
    }
    return [
      { mesh: "cube", model: M4.model(x, y, z, 0, 0, null, 0.06, 0.065, 0.26), mat: 0, color: [0.15, 0.17, 0.21] },
      { mesh: "cube", model: M4.model(x, y + 0.042, z + 0.02, 0, 0, null, 0.03, 0.02, 0.16), mat: 0, color: [0.1, 0.11, 0.14] },
      { mesh: "cylinder", model: M4.model(x, y + 0.008, z - 0.2, 0, Math.PI / 2, X_AXIS, 0.02, 0.16, 0.02), mat: 0, color: [0.11, 0.12, 0.15] },
      { mesh: "sphere", model: M4.model(x, y + 0.058, z + 0.07, 0, 0, null, 0.017, 0.017, 0.017), mat: 5, color: [0.5 * core, 0.8 * core, 1 * core] },
      { mesh: "cube", model: M4.model(x - 0.032, y + 0.005, z + 0.03, 0, 0, null, 0.006, 0.022, 0.1), mat: 5, color: shockReady ? [1, 0.5, 0.3] : [0.22, 0.1, 0.07] },
    ];
  }

  // ---------------------------------------------------------------- loop

  var STEP = 1 / 120;
  var acc = 0, last = now(), t0 = last, frames = 0, frameMs = 0;
  function now() { return performance.now(); }
  world = new EW.World(onEvent);
  window.__edge = { get world() { return world; }, get mode() { return mode; }, stats: { frames: 0, avgMs: 0 }, start: start };
  if (BOT) start();

  function frame() {
    var tNow = now(), dt = Math.min(0.1, (tNow - last) / 1000);
    last = tNow;
    var t = (tNow - t0) / 1000;
    if (mode === "playing") {
      acc += dt;
      while (acc >= STEP) {
        world.step(STEP, readInput());
        acc -= STEP;
      }
      edgePuffs(world);
      updateHud(world);
    } else {
      acc = 0;
    }
    updateParticles(dt, t);
    // Warm motes rising past the island and sparks off the crystals.
    if (!REDUCED && Math.random() < 0.6) emit((Math.random() - 0.5) * 44, -2 + Math.random() * 5, (Math.random() - 0.5) * 44, 0, 0.35, 0, 5, 0.05, 1, 0.72, 0.45, 0.5, -0.03, 0.2);
    if (!REDUCED && Math.random() < 0.2) {
      var cr = CRYSTALS[(Math.random() * CRYSTALS.length) | 0];
      emit(cr.x, cr.h, cr.z, 0, 0.6, 0, 0.8, 0.07, 1, 0.75, 0.4, 0.8, 0, 0.5);
    }
    if (mode === "playing" && world.state === "fight") {
      for (var i = 0; i < world.portals.length; i++) {
        var po = world.portals[i];
        if (Math.random() < 0.35) emit(po.x + (Math.random() - 0.5) * 1.6, 0.05, po.z + (Math.random() - 0.5) * 1.6, 0, 1.2 + Math.random(), 0, 0.9, 0.09, 1, 0.5, 0.3, 0.9, -0.5, 0.5);
      }
    }

    R.resize(TOUCH ? 0.8 : 1);
    var p = world.player, eye, at;
    if (mode === "title") {
      // Title: a slow orbit around the island.
      var a = t * 0.12;
      eye = [Math.cos(a) * 29, 12, Math.sin(a) * 29];
      at = [0, -1, 0];
    } else {
      var shake = REDUCED ? 0 : p.shake * 0.08;
      var f = world.forward();
      eye = [p.x + (Math.random() - 0.5) * shake, p.y + EW.PLAYER.eye + (Math.random() - 0.5) * shake, p.z + (Math.random() - 0.5) * shake];
      at = [eye[0] + f[0], eye[1] + f[1], eye[2] + f[2]];
    }
    var scene = items(world, t);
    R.render({
      eye: eye, at: at, fov: (TOUCH ? 80 : 76) * Math.PI / 180, time: t,
      items: scene, overlay: mode === "title" || p.respawn > 0 ? [] : weapon(world, t), particles: partOut,
    });

    frames++;
    frameMs += (now() - tNow);
    if (frames % 60 === 0) {
      window.__edge.stats.frames = frames;
      window.__edge.stats.avgMs = Math.round((frameMs / frames) * 100) / 100;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
