// Over the Edge: the game simulation. A floating island, waves of bots that try to shove the
// player off, impulse shots and a shockwave that knock them over the edge. Fixed 120 Hz step;
// everything the page shows or plays comes out of `events`.
(function () {
  "use strict";

  var R = 18;
  var GRAVITY = 26;
  var FALL_Y = -16;
  var KINDS = {
    cube: { r: 0.55, mass: 1.0, speed: 4.8, accel: 18, shove: 8.2, points: 100 },
    roller: { r: 0.5, mass: 1.3, speed: 7.8, accel: 9.5, shove: 10.5, points: 150 },
    hopper: { r: 0.42, mass: 0.8, speed: 5.6, accel: 14, shove: 7.2, points: 150 },
    dasher: { r: 0.45, mass: 0.9, speed: 5.4, accel: 16, shove: 6, lunge: 13, points: 250 },
    brute: { r: 1.05, mass: 4.0, speed: 3.1, accel: 8, shove: 16, points: 400 },
  };
  var WAVES = [
    { cube: 6 },
    { cube: 8, roller: 2 },
    { cube: 6, roller: 4, hopper: 2 },
    { cube: 6, roller: 3, dasher: 2, brute: 1 },
    { cube: 6, roller: 5, hopper: 4, dasher: 2 },
    { cube: 8, hopper: 4, dasher: 3, brute: 2 },
    { roller: 6, hopper: 6, dasher: 3, brute: 3 },
    { cube: 8, roller: 4, dasher: 5, brute: 3 },
    { roller: 8, hopper: 6, dasher: 5, brute: 3 },
    { cube: 10, dasher: 8, brute: 4 },
    { cube: 10, roller: 8, hopper: 6, dasher: 8, brute: 5 },
  ];
  // What a cleared wave leaves on the island.
  var DROPS = { 2: "heavy", 4: "life", 6: "heavy", 7: "shotgun", 9: "life" };
  var PILLARS = [
    { x: 7.4, z: 3.1, r: 0.85, h: 4.2 },
    { x: -6.5, z: 6.2, r: 0.85, h: 4.2 },
    { x: -5.0, z: -7.4, r: 0.85, h: 4.2 },
    { x: 6.5, z: -6.7, r: 0.85, h: 4.2 },
    { x: 0.6, z: 10.4, r: 0.85, h: 4.2 },
    { x: -0.9, z: -10.6, r: 0.85, h: 4.2 },
  ];
  var MAX_ALIVE = 16;
  var PLAYER = { r: 0.45, speed: 7.6, accel: 62, airAccel: 18, friction: 12, jump: 8.8, eye: 1.55 };
  var DASH = { windup: 0.5, time: 0.34, speed: 16 };
  var SHOT = { speed: 50, life: 1.1, power: 7.5, lift: 2.6, cool: 0.15 };
  var PELLETS = { count: 7, spread: 0.3, speed: 46, life: 0.32, power: 5.2, lift: 1.0, cool: 0.62 };

  // Small deterministic random so every run has the same wave order.
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function World(events) {
    this.events = events || function () {};
    this.reset();
  }

  World.prototype.reset = function () {
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.lastKnock = -10;
    this.lives = 3;
    this.wave = 0;
    this.state = "break";
    this.stateTime = 3.5;
    this.queue = [];
    this.spawnTimer = 0;
    this.enemies = [];
    this.shots = [];
    this.pickups = [];
    this.heavy = false;
    this.shotgun = false;
    this.knocked = 0;
    this.finished = false;
    this.over = false;
    this.retry = false;
    this.random = rng(20261026);
    this.player = {
      x: 0, y: 0, z: 7, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: -0.05,
      onGround: true, dashTime: 0, dashCool: 0, shockCool: 0, fireCool: 0,
      invuln: 1.5, respawn: 0, shake: 0, hurt: 0, recoil: 0, falling: false, walk: 0,
    };
    this.portals = [0, 1, 2, 3].map(function (i) {
      var a = (i * Math.PI) / 2 + Math.PI / 4;
      return { x: Math.cos(a) * (R - 1.8), z: Math.sin(a) * (R - 1.8), glow: 0 };
    });
  };

  World.prototype.forward = function () {
    var p = this.player;
    return [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
  };

  // input: { mx, mz (local move, -1..1), jump, dash, fire, shock } — one-shot flags are cleared by the caller.
  World.prototype.step = function (dt, input) {
    if (this.over || this.finished) return;
    this.time += dt;
    this.updateWaves(dt);
    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateShots(dt);
    this.updatePickups(dt);
    this.collide();
    for (var i = 0; i < this.portals.length; i++) this.portals[i].glow = Math.max(0, this.portals[i].glow - dt * 1.5);
  };

  // ---------------------------------------------------------------- waves

  World.prototype.updateWaves = function (dt) {
    if (this.state === "break") {
      this.stateTime -= dt;
      if (this.stateTime <= 0) this.startWave();
      return;
    }
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.enemies.length < MAX_ALIVE) {
      this.spawn(this.queue.shift());
      this.spawnTimer = Math.max(0.3, 0.9 - this.wave * 0.06);
    }
    if (!this.queue.length && !this.enemies.length) {
      this.heavy = false;
      if (this.wave >= WAVES.length) {
        this.finished = true;
        this.events("win", { score: this.score });
        return;
      }
      this.state = "break";
      this.stateTime = 4.5;
      var drop = DROPS[this.wave] || "";
      if (drop) this.dropPickup(drop);
      this.events("cleared", { wave: this.wave, drop: drop });
    }
  };

  World.prototype.startWave = function () {
    // A retry replays the same wave; a new wave first records where a fall sends the player back to.
    if (this.retry) this.retry = false;
    else {
      this.checkpoint = { score: this.score, knocked: this.knocked };
      this.wave++;
    }
    var plan = WAVES[this.wave - 1];
    this.state = "fight";
    var list = [];
    Object.keys(plan).forEach(function (kind) {
      for (var i = 0; i < plan[kind]; i++) list.push(kind);
    });
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(this.random() * (i + 1));
      var t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    this.queue = list;
    this.spawnTimer = 0.6;
    this.events("wave", { wave: this.wave, total: WAVES.length, count: list.length });
  };

  World.prototype.spawn = function (kind) {
    var portal = this.portals[Math.floor(this.random() * this.portals.length)];
    portal.glow = 1;
    var k = KINDS[kind];
    this.enemies.push({
      kind: kind, k: k, x: portal.x, y: 7, z: portal.z, vx: 0, vy: 0, vz: 0,
      onGround: false, stunned: 0.4, flash: 0, falling: false, yaw: 0, spin: 0, spinAxis: [1, 0, 0],
      roll: 0, hop: 1 + this.random() * 1.5, shoveCool: 0, squash: 0,
      flank: (this.random() - 0.5) * 1.6, dashCool: 1.5 + this.random(), windup: 0, dashTime: 0, ddx: 0, ddz: 0, charge: 0,
    });
    this.events("spawn", { x: portal.x, z: portal.z });
  };

  World.prototype.dropPickup = function (kind) {
    var a = this.random() * Math.PI * 2, d = 3 + this.random() * 5;
    this.pickups.push({ kind: kind, x: Math.cos(a) * d, z: Math.sin(a) * d, t: 0 });
  };

  World.prototype.remaining = function () {
    return this.queue.length + this.enemies.length;
  };

  // ---------------------------------------------------------------- player

  World.prototype.updatePlayer = function (dt, input) {
    var p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.shake = Math.max(0, p.shake - dt * 3);
    p.hurt = Math.max(0, p.hurt - dt * 2.5);
    p.recoil = Math.max(0, p.recoil - dt * 7);
    p.dashCool = Math.max(0, p.dashCool - dt);
    p.shockCool = Math.max(0, p.shockCool - dt);
    p.fireCool = Math.max(0, p.fireCool - dt);

    if (p.respawn > 0) {
      p.respawn -= dt;
      if (p.respawn <= 0) this.respawn();
      return;
    }

    var fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    var rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    var mx = input.mz * fx + input.mx * rx, mz = input.mz * fz + input.mx * rz;
    var len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }

    if (p.dashTime > 0) {
      p.dashTime -= dt;
    } else {
      var accel = p.onGround ? PLAYER.accel : PLAYER.airAccel;
      var tx = mx * PLAYER.speed, tz = mz * PLAYER.speed;
      var dvx = tx - p.vx, dvz = tz - p.vz, dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
      if (len < 0.01 && p.onGround) maxDv = PLAYER.friction * dt * Math.max(1, Math.hypot(p.vx, p.vz));
      if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      p.vx += dvx;
      p.vz += dvz;
    }
    if (input.jump && p.onGround) {
      p.vy = PLAYER.jump;
      p.onGround = false;
      this.events("jump", {});
    }
    if (input.dash && p.dashCool <= 0) {
      var dx = len > 0.01 ? mx : fx, dz = len > 0.01 ? mz : fz, dn = Math.hypot(dx, dz) || 1;
      p.vx = (dx / dn) * 18;
      p.vz = (dz / dn) * 18;
      p.dashTime = 0.17;
      p.dashCool = 1.4;
      this.events("dash", {});
    }
    if (input.fire && p.fireCool <= 0) this.fire();
    if (input.shock && p.shockCool <= 0) this.shockwave(p.x, p.z, 1, true);

    this.integrate(p, dt, PLAYER.r);
    if (p.onGround) p.walk += Math.hypot(p.vx, p.vz) * dt;
    if (p.y < FALL_Y) this.playerFell();
  };

  World.prototype.fire = function () {
    var p = this.player, f = this.forward();
    var rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    var ex = p.x + rx * 0.28 + f[0] * 0.6, ey = p.y + PLAYER.eye - 0.22 + f[1] * 0.6, ez = p.z + rz * 0.28 + f[2] * 0.6;
    var boost = this.heavy ? 1.6 : 1;
    if (this.shotgun) {
      // A fixed fan of pellets: weak one by one, a wall of push up close.
      for (var i = 0; i < PELLETS.count; i++) {
        var yaw = p.yaw + ((i + 0.5) / PELLETS.count - 0.5) * PELLETS.spread, pitch = p.pitch + (i % 2 ? 0.035 : -0.02);
        var cp = Math.cos(pitch), dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
        this.shots.push({
          x: ex, y: ey, z: ez, vx: dx * PELLETS.speed, vy: dy * PELLETS.speed, vz: dz * PELLETS.speed, dx: dx, dz: dz,
          life: PELLETS.life, fade: PELLETS.life, power: PELLETS.power * boost, lift: PELLETS.lift, heavy: this.heavy, pellet: true,
        });
      }
      p.fireCool = PELLETS.cool;
      p.recoil = 1.6;
    } else {
      this.shots.push({
        x: ex, y: ey, z: ez, vx: f[0] * SHOT.speed, vy: f[1] * SHOT.speed, vz: f[2] * SHOT.speed, dx: f[0], dz: f[2],
        life: SHOT.life, fade: 0, power: SHOT.power * boost, lift: SHOT.lift, heavy: this.heavy, pellet: false,
      });
      p.fireCool = SHOT.cool;
      p.recoil = 1;
    }
    this.events("shot", { x: ex, y: ey, z: ez, shotgun: this.shotgun });
  };

  // Push every bot within reach away from (x, z). From the player it costs the cooldown.
  World.prototype.shockwave = function (x, z, strength, fromPlayer) {
    var reach = 6.5;
    for (var i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i], dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
      if (d > reach || e.falling) continue;
      var n = d > 0.01 ? 1 / d : 0, power = ((1 - d / reach) * 15 + 5) * strength / e.k.mass;
      e.vx += dx * n * power;
      e.vz += dz * n * power;
      e.vy += (5 * strength) / e.k.mass;
      e.onGround = false;
      e.stunned = 1.0;
      e.flash = 1;
    }
    if (fromPlayer) this.player.shockCool = 7;
    this.events("shock", { x: x, z: z, fromPlayer: !!fromPlayer });
  };

  World.prototype.playerFell = function () {
    var p = this.player;
    if (p.respawn > 0) return;
    this.lives--;
    this.events("fall", { lives: this.lives });
    if (this.lives <= 0) {
      this.over = true;
      this.events("over", { score: this.score, wave: this.wave });
      return;
    }
    p.respawn = 1.3;
  };

  World.prototype.respawn = function () {
    var p = this.player;
    p.x = 0; p.y = 4; p.z = 0; p.vx = 0; p.vy = 0; p.vz = 0;
    p.falling = false;
    p.invuln = 2.5;
    if (this.state === "fight") this.restartWave();
    this.shockwave(0, 0, 1.4, false);
    this.events("respawn", {});
  };

  // After a fall the wave starts over: its bots are gone, the score goes back to the wave's start,
  // and the same wave comes again after a short break. Picked-up bonuses stay.
  World.prototype.restartWave = function () {
    var cp = this.checkpoint;
    this.score = cp.score;
    this.knocked = cp.knocked;
    this.combo = 0;
    this.lastKnock = -10;
    this.enemies = [];
    this.shots = [];
    this.queue = [];
    this.retry = true;
    this.state = "break";
    this.stateTime = 2.5;
    this.events("retry", { wave: this.wave, lives: this.lives });
  };

  // ---------------------------------------------------------------- bots

  World.prototype.updateEnemies = function (dt) {
    var p = this.player;
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i], k = e.k;
      e.flash = Math.max(0, e.flash - dt * 3);
      e.shoveCool = Math.max(0, e.shoveCool - dt);
      e.squash = Math.max(0, e.squash - dt * 4);
      if (e.stunned > 0) {
        e.stunned -= dt;
        // A hit breaks a dasher's aim or lunge.
        e.windup = e.dashTime = e.charge = 0;
        e.spin += dt * (e.falling ? 7 : 4) * Math.min(1, Math.hypot(e.vx, e.vz) / 4 + (e.falling ? 1 : 0));
        if (e.onGround) {
          // Sliding after a hit: little grip, so a good hit carries them far.
          var slide = Math.exp(-2.4 * dt);
          e.vx *= slide;
          e.vz *= slide;
        }
      } else if (!e.falling && p.respawn <= 0) {
        var dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz) || 1;
        if (e.kind !== "dasher" || !this.dasherStep(e, dx, dz, d, dt)) {
          // On the way in bots fan out, so they arrive from the sides instead of in a queue.
          var turn = e.flank * Math.min(1, Math.max(0, (d - 2.5) / 7)), c = Math.cos(turn), sn = Math.sin(turn);
          var tx = ((dx * c - dz * sn) / d) * k.speed, tz = ((dx * sn + dz * c) / d) * k.speed;
          var ax = tx - e.vx, az = tz - e.vz, al = Math.hypot(ax, az), max = k.accel * dt * (e.onGround ? 1 : 0.25);
          if (al > max) { ax *= max / al; az *= max / al; }
          e.vx += ax;
          e.vz += az;
        }
        e.spin = Math.max(0, e.spin - dt * 6);
        if (e.kind === "hopper" && e.onGround) {
          e.hop -= dt;
          if (e.hop <= 0) {
            e.vy = 8.5;
            e.vx += (dx / d) * 3;
            e.vz += (dz / d) * 3;
            e.onGround = false;
            e.hop = 1.2 + this.random() * 1.4;
          }
        }
      }
      if (e.kind === "roller") e.roll += (Math.hypot(e.vx, e.vz) * dt) / k.r;
      var speed = Math.hypot(e.vx, e.vz);
      if (speed > 0.3 && e.kind !== "roller" && e.windup <= 0) e.yaw = Math.atan2(e.vx, e.vz);
      if (speed > 0.3) e.spinAxis = [e.vz / speed, 0, -e.vx / speed];
      var wasGround = e.onGround;
      this.integrate(e, dt, k.r);
      if (!wasGround && e.onGround) e.squash = 1;
      if (e.y < FALL_Y) {
        this.enemies.splice(i, 1);
        this.knock(e);
      }
    }
  };

  // Dashers close in, stop and glow while they aim, then lunge along the line they aimed at:
  // a player who keeps moving sidesteps it, and a lunge near the edge can carry them off.
  World.prototype.dasherStep = function (e, dx, dz, d, dt) {
    if (e.dashTime > 0) {
      e.dashTime -= dt;
      e.vx = e.ddx * DASH.speed;
      e.vz = e.ddz * DASH.speed;
      if (e.dashTime <= 0) e.dashCool = 1.6 + this.random() * 1.2;
      return true;
    }
    if (e.windup > 0) {
      e.windup -= dt;
      e.charge = 1 - Math.max(0, e.windup) / DASH.windup;
      var brake = Math.exp(-9 * dt);
      e.vx *= brake;
      e.vz *= brake;
      if (e.windup <= 0) {
        e.charge = 0;
        e.dashTime = DASH.time;
        this.events("lunge", { x: e.x, z: e.z });
      }
      return true;
    }
    e.dashCool -= dt;
    if (e.dashCool > 0 || d > 7.5 || !e.onGround) return false;
    e.windup = DASH.windup;
    e.ddx = dx / d;
    e.ddz = dz / d;
    e.yaw = Math.atan2(e.ddx, e.ddz);
    this.events("windup", { x: e.x, z: e.z });
    return true;
  };

  World.prototype.knock = function (e) {
    this.knocked++;
    this.combo = this.time - this.lastKnock < 1.8 ? this.combo + 1 : 1;
    this.lastKnock = this.time;
    var mult = Math.min(4, 1 + 0.5 * (this.combo - 1));
    var points = Math.round(e.k.points * mult);
    this.score += points;
    this.events("knock", { kind: e.kind, points: points, combo: this.combo, x: e.x, z: e.z });
  };

  // ---------------------------------------------------------------- shots and pickups

  World.prototype.updateShots = function (dt) {
    for (var i = this.shots.length - 1; i >= 0; i--) {
      var s = this.shots[i];
      s.life -= dt;
      var nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, nz = s.z + s.vz * dt, hit = null;
      for (var j = 0; j < this.enemies.length && !hit; j++) {
        var e = this.enemies[j];
        if (segmentSphere(s.x, s.y, s.z, nx, ny, nz, e.x, e.y + e.k.r, e.z, e.k.r + 0.18)) hit = e;
      }
      if (hit) {
        // Pellets push harder up close: their push fades over their short flight.
        var dn = Math.hypot(s.dx, s.dz) || 1, power = s.power * (s.fade ? 0.55 + (0.45 * Math.max(0, s.life)) / s.fade : 1);
        hit.vx += (s.dx / dn) * power / hit.k.mass;
        hit.vz += (s.dz / dn) * power / hit.k.mass;
        hit.vy += s.lift / hit.k.mass;
        hit.onGround = false;
        hit.stunned = 0.6;
        hit.flash = 1;
        this.events("hit", { x: nx, y: ny, z: nz, heavy: s.heavy, pellet: s.pellet });
        this.shots.splice(i, 1);
        continue;
      }
      var blocked = false;
      for (j = 0; j < PILLARS.length; j++) {
        var c = PILLARS[j];
        if (ny < c.h && ny > 0 && Math.hypot(nx - c.x, nz - c.z) < c.r) blocked = true;
      }
      if (blocked || s.life <= 0 || (ny < 0 && Math.hypot(nx, nz) < R)) {
        if (blocked || ny < 0) this.events("spark", { x: nx, y: Math.max(ny, 0.02), z: nz });
        this.shots.splice(i, 1);
        continue;
      }
      s.x = nx; s.y = ny; s.z = nz;
    }
  };

  World.prototype.updatePickups = function (dt) {
    var p = this.player;
    for (var i = this.pickups.length - 1; i >= 0; i--) {
      var u = this.pickups[i];
      u.t += dt;
      if (Math.hypot(p.x - u.x, p.z - u.z) < 1.3 && p.y < 1.5) {
        if (u.kind === "heavy") this.heavy = true;
        if (u.kind === "life") this.lives = Math.min(5, this.lives + 1);
        if (u.kind === "shotgun") this.shotgun = true;
        this.pickups.splice(i, 1);
        this.events("pickup", { kind: u.kind });
      }
    }
  };

  function segmentSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var fx = ax - cx, fy = ay - cy, fz = az - cz;
    var a = dx * dx + dy * dy + dz * dz, b = 2 * (fx * dx + fy * dy + fz * dz), c = fx * fx + fy * fy + fz * fz - r * r;
    if (c <= 0) return true;
    var disc = b * b - 4 * a * c;
    if (disc < 0 || a === 0) return false;
    var t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1;
  }

  // ---------------------------------------------------------------- physics

  // Gravity, the island top as ground, pillars as walls. Off the edge there is nothing.
  World.prototype.integrate = function (b, dt, r) {
    b.vy -= GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    var d = Math.hypot(b.x, b.z);
    if (!b.falling && (b.y < -0.5 || (d > R && b.y < 0.05))) b.falling = true;
    if (!b.falling && d <= R && b.y <= 0) {
      b.y = 0;
      if (b.vy < 0) b.vy = 0;
      b.onGround = true;
    } else if (b.y > 0.001 || b.falling) {
      b.onGround = false;
    }
    if (b.falling) return;
    for (var i = 0; i < PILLARS.length; i++) {
      var c = PILLARS[i];
      if (b.y > c.h) continue;
      var dx = b.x - c.x, dz = b.z - c.z, dist = Math.hypot(dx, dz), min = c.r + r;
      if (dist < min && dist > 0.0001) {
        var nx = dx / dist, nz = dz / dist;
        b.x = c.x + nx * min;
        b.z = c.z + nz * min;
        var vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= 1.4 * vn * nx; b.vz -= 1.4 * vn * nz; }
      }
    }
  };

  // Bots push each other; bots shove the player.
  World.prototype.collide = function () {
    var list = this.enemies, p = this.player;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        separate(a, b, a.k.r, b.k.r, a.k.mass, b.k.mass);
      }
      if (p.respawn > 0 || a.falling || p.falling) continue;
      var dx = p.x - a.x, dz = p.z - a.z, d = Math.hypot(dx, dz), min = a.k.r + PLAYER.r;
      if (d < min && Math.abs(p.y - a.y) < 1.4 && d > 0.0001) {
        var nx = dx / d, nz = dz / d;
        p.x = a.x + nx * min;
        p.z = a.z + nz * min;
        if (a.shoveCool <= 0 && p.invuln <= 0) {
          var shove = a.dashTime > 0 ? a.k.lunge : a.k.shove;
          p.vx += nx * shove;
          p.vz += nz * shove;
          if (a.dashTime > 0) { a.dashTime = 0; a.dashCool = 1.6; }
          p.vy += 2.5;
          p.onGround = false;
          p.shake = 1;
          p.hurt = 1;
          a.shoveCool = 0.55;
          a.vx -= nx * 1.5;
          a.vz -= nz * 1.5;
          this.events("hurt", { kind: a.kind });
        }
      }
    }
  };

  function separate(a, b, ra, rb, ma, mb) {
    if (a.falling || b.falling) return;
    var dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = ra + rb;
    if (d >= min || d < 0.0001 || Math.abs(a.y - b.y) > Math.max(ra, rb) * 1.6) return;
    var nx = dx / d, nz = dz / d, push = min - d, wa = mb / (ma + mb), wb = ma / (ma + mb);
    a.x -= nx * push * wa;
    a.z -= nz * push * wa;
    b.x += nx * push * wb;
    b.z += nz * push * wb;
    var rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rel < 0) {
      var j = (-(1 + 0.35) * rel) / (1 / ma + 1 / mb);
      a.vx -= (j / ma) * nx;
      a.vz -= (j / ma) * nz;
      b.vx += (j / mb) * nx;
      b.vz += (j / mb) * nz;
      // A bot shoved hard by another one loses its footing too: chains are part of the fun.
      if (Math.abs(j / mb) > 3) b.stunned = Math.max(b.stunned, 0.4);
      if (Math.abs(j / ma) > 3) a.stunned = Math.max(a.stunned, 0.4);
    }
  }

  window.EdgeWorld = { World: World, R: R, PILLARS: PILLARS, KINDS: KINDS, WAVES: WAVES, PLAYER: PLAYER };
})();
