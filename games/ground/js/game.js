// Entry module: run state machine, fixed-step loop, scoring, collapse pressure,
// pause on blur, and the debug API used by the browser checks.
//
// Debug query flags (kept in for checks and manual QA):
//   ?lang=ru|en     force the interface language
//   ?biome=last|0..4  start at the given biome (last = safe valley) and skip the title
//   ?seed=<uint>    use a fixed world seed (repeatable runs)
// window.__ground exposes pose(), warp(x), scene(name), freeze(on), front(offset),
// metrics(), restart(), start() and hideHints() for scripted checks.
import {
  FIXED_DT, GOAL_X, BIOMES, SCORE, WEDGE,
} from './config.js';
import { pickLang, createI18n } from './i18n.js';
import { GameAudio } from './audio.js';
import { Particles, PT } from './particles.js';
import { Input } from './input.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Wedge } from './wedge.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';

const DIE_TIME = 0.9;
const FINISH_TIME = 2.4;
const CONFETTI_COLORS = ['#c8ff4d', '#ff7a45', '#fff1bd', '#f2f1e8'];
const CRYSTALS_PER_HEART = 10;

function parseBiome(raw) {
  if (raw === 'last') return BIOMES.length - 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(BIOMES.length - 1, n));
}

class Game {
  constructor() {
    this.query = new URLSearchParams(window.location.search);
    this.i18n = createI18n(pickLang(window.location.search));
    this.canvas = document.getElementById('game-canvas');
    this.audio = new GameAudio();
    this.particles = new Particles();
    this.world = new World(this);
    this.player = new Player(this);
    this.wedge = new Wedge(this);
    this.input = new Input(this.canvas, {
      onGesture: () => this.onGesture(),
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      onAnyKey: () => this.onAnyKey(),
    });
    this.renderer = new Renderer(this.canvas, this);
    this.ui = new UI(this, this.i18n);

    this.state = 'title';
    this.time = 0;
    this.frameDt = 1 / 60;
    this.accum = 0;
    this.last = 0;
    this.hudT = 0;
    this.shake = 0;
    this.flash = 0;
    this.reducedMotion = false;
    try {
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      this.reducedMotion = false;
    }
    this.metrics = { frames: 0, elapsed: 0, avgFrameMs: 0, avgCostMs: 0, costMs: 0 };
    this.god = false;
    this.hintsShown = {};
    this.lastHurtAt = -10;
    this.finishInput = {
      left: false, right: false, jumpHeld: false,
      consumeJumpBuffer: () => 0,
    };

    const biomeParam = this.query.get('biome');
    this.startBiome = biomeParam !== null ? parseBiome(biomeParam) : 0;
    this.autoStart = biomeParam !== null;
    this.seedParam = null;
    const seedRaw = this.query.get('seed');
    if (seedRaw !== null) {
      const n = Number.parseInt(seedRaw, 10);
      if (Number.isFinite(n)) this.seedParam = n >>> 0;
    }
    this.newRun(this.startBiome);
    this.exposeDebug();
    this.bindWindow();
    this.loop = this.loop.bind(this);
    this.last = 0;
    requestAnimationFrame(this.loop);
    if (this.autoStart) this.start();
  }

  newRun(biomeIndex) {
    const seed = this.seedParam !== null ? this.seedParam : (Math.random() * 0xffffffff) >>> 0;
    this.runSeed = seed;
    this.world.reset(seed, biomeIndex);
    this.player.reset(this.world.spawnX, this.world.spawnY);
    this.wedge.reset();
    this.wedge.x = this.player.handX;
    this.wedge.y = this.player.handY;
    this.wedge.px = this.wedge.x;
    this.wedge.py = this.wedge.y;
    this.particles.clear();
    this.world.frontFrozen = false;
    this.god = false;
    this.crystals = 0;
    this.bonus = 0;
    this.maxX = this.player.x;
    this.runT = 0;
    this.finishT = 0;
    this.dieT = 0;
    this.endReason = '';
    this.goalY = 0;
    this.shake = 0;
    this.flash = 0;
    this.accum = 0;
    this.hudT = 0;
    this.lastHurtAt = -10;
    this.hintsShown = {};
    this.updateGoal();
    this.renderer.camReady = false;
    this.input.clearActions();
    this.input.left = false;
    this.input.right = false;
    this.input.jumpHeld = false;
  }

  bindWindow() {
    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
  }

  onGesture() {
    if (this.state === 'title') {
      this.start();
      return;
    }
    if (this.state === 'playing') this.audio.unlock();
  }

  onAnyKey() {
    if (this.state === 'title') this.start();
  }

  start() {
    if (this.state !== 'title') return;
    this.state = 'playing';
    this.runT = 0;
    this.accum = 0;
    this.audio.unlock();
    this.audio.setActive(true);
    this.input.clearActions();
    this.ui.setState('playing');
    this.ui.showBiome(this.world.biome);
    this.ui.hint('hintThrow', 6500);
    this.hintsShown.intro = true;
  }

  restart() {
    this.newRun(this.startBiome);
    this.state = 'playing';
    this.runT = 0;
    this.audio.unlock();
    this.audio.setActive(true);
    this.ui.setState('playing');
    this.ui.showBiome(this.world.biome);
    this.ui.hint('hintThrow', 6500);
    this.hintsShown.intro = true;
    this.renderer.camReady = false;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.setState('paused');
    this.audio.setActive(false);
    this.input.left = false;
    this.input.right = false;
    this.input.jumpHeld = false;
    this.input.clearActions();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.accum = 0;
    this.input.clearActions();
    this.audio.unlock();
    this.audio.setActive(true);
    this.ui.setState('playing');
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  toggleMute() {
    const muted = this.audio.toggleMuted();
    if (!muted) {
      this.audio.unlock();
      this.audio.setActive(this.state === 'playing');
    }
    this.ui.setMuted(muted);
  }

  addShake(amount) {
    if (this.reducedMotion) return;
    this.shake = Math.min(7, this.shake + amount);
  }

  handleIntent() {
    const source = this.input.consumeThrow();
    if (source && this.runT > 0.12) {
      if (source === 'pointer' || source === 'touch') {
        const aim = this.renderer.screenToWorld(this.input.aimScreenX, this.input.aimScreenY);
        this.wedge.request(source, this.player, aim.x, aim.y, this.audio, this.particles);
      } else {
        this.wedge.request('key', this.player, 0, 0, this.audio, this.particles);
      }
    }
    if (this.input.consumeRecall()) {
      this.wedge.forceRecall(this.player, this.audio, this.particles);
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (!this.last) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.25) dt = 0.25;
    this.frameDt = dt;
    this.metrics.frames += 1;
    this.metrics.elapsed += dt;
    this.metrics.avgFrameMs = (this.metrics.elapsed * 1000) / this.metrics.frames;
    this.metrics.avgCostMs = this.metrics.frames ? this.metrics.costMs / this.metrics.frames : 0;

    const t0 = performance.now();
    if (this.state !== 'paused') this.time += Math.min(dt, 0.05);
    if (this.state === 'playing' || this.state === 'finishing' || this.state === 'dying') {
      this.accum += dt;
      let steps = 0;
      while (this.accum >= FIXED_DT && steps < 8) {
        this.step(FIXED_DT);
        this.accum -= FIXED_DT;
        steps += 1;
      }
      if (steps === 8) this.accum = 0;
    } else {
      this.accum = 0;
    }
    const alpha = this.state === 'playing' || this.state === 'finishing'
      ? Math.min(1, this.accum / FIXED_DT) : 1;
    this.renderer.draw(alpha);
    this.updateHud(dt);
    this.decay(dt);
    this.metrics.costMs += performance.now() - t0;
  }

  step(dt) {
    if (this.state === 'playing') this.stepPlaying(dt);
    else if (this.state === 'finishing') this.stepFinishing(dt);
    else if (this.state === 'dying') {
      this.dieT -= dt;
      this.particles.update(dt);
      if (this.dieT <= 0) this.showOver();
    }
  }

  stepPlaying(dt) {
    this.handleIntent();
    this.player.update(dt, this.world, this.wedge, this.particles, this.audio, this.input);
    if (this.state !== 'playing') return;
    this.wedge.update(dt, this.world, this.player, this.particles, this.audio);
    this.world.update(dt, this.player, this.particles, this.audio);
    this.terrainHints();
    this.particles.update(dt);
    this.maxX = Math.max(this.maxX, this.player.x);
    this.runT += dt;
    if (!this.goalY) this.updateGoal();
    if (this.world.caught(this.player)) {
      this.die('caught');
      return;
    }
    if (this.world.reachedGoal(this.player)) this.beginFinish();
  }

  stepFinishing(dt) {
    this.finishT += dt;
    this.finishInput.right = this.finishT < 0.8;
    this.player.update(dt, this.world, this.wedge, this.particles, this.audio, this.finishInput);
    this.wedge.update(dt, this.world, this.player, this.particles, this.audio);
    this.particles.update(dt);
    this.maxX = Math.max(this.maxX, this.player.x);
    this.runT += dt;
    this.confettiT -= dt;
    if (this.confettiT <= 0) {
      this.confettiT = 0.14;
      const goal = this.world.goalX || GOAL_X;
      const y = this.goalY || this.player.y;
      for (let i = 0; i < 3; i += 1) {
        this.confetti(goal + (Math.random() - 0.5) * 300, y - 140 - Math.random() * 180);
      }
    }
    if (this.finishT > FINISH_TIME) this.finishRun();
  }

  updateHud(dt) {
    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    if (this.state === 'title' || this.state === 'gameover' || this.state === 'finished') return;
    this.ui.updateHud({
      distance: this.maxX / 60,
      crystals: this.crystals,
      seconds: this.runT,
      hearts: this.player.hits,
      wedgeHeld: this.wedge.state === 'held',
    });
  }

  decay(dt) {
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3);
  }

  computeScore(finished) {
    return Math.floor(Math.max(0, this.maxX) / 60)
      + this.crystals * SCORE.crystal
      + this.player.hits * SCORE.hitLeft
      + this.bonus
      + (finished ? SCORE.finish : 0);
  }

  collect(pickup) {
    const x = pickup.x;
    const y = pickup.y;
    if (pickup.type === 'heart') {
      if (this.player.hits < this.player.maxHits) {
        this.player.hits += 1;
        this.audio.play('heartFull');
      } else {
        this.bonus += SCORE.heartFull;
        this.audio.play('heart');
      }
      this.burst(x, y, 14, ['#ff7a45', '#ffd2b8', '#fff1bd'], 260);
      this.flash = Math.min(0.5, this.flash + 0.15);
      return;
    }
    this.crystals += 1;
    this.audio.play('crystal');
    this.burst(x, y, 8, ['#c8ff4d', '#e8ffb0', '#ffffff'], 190);
    // Every tenth crystal brings a heart back, or pays the full-heart bonus.
    if (this.crystals % CRYSTALS_PER_HEART === 0) {
      if (this.player.hits < this.player.maxHits) {
        this.player.hits += 1;
        this.audio.play('heartFull');
        this.ui.hint('hintCrystalHeart', 3200);
      } else {
        this.bonus += SCORE.heartFull;
      }
    } else if (!this.hintsShown.crystal) {
      this.hintsShown.crystal = true;
      this.ui.hint('hintCrystal', 4200);
    }
  }

  burst(x, y, count, colors, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * 6.283;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.particles.spawn(2, x, y, Math.cos(a) * s, Math.sin(a) * s - 60,
        0.4 + Math.random() * 0.5, 2 + Math.random() * 3,
        colors[i % colors.length], 420, 1.4);
    }
  }

  hurt(fromX) {
    if (this.state !== 'playing' || this.player.invuln > 0 || this.player.spawnGrace > 0) return;
    if (this.god) return;
    this.player.hits = Math.max(0, this.player.hits - 1);
    this.player.knockback(fromX);
    this.lastHurtAt = this.runT;
    this.addShake(4.5);
    this.flash = 0.8;
    this.audio.play('hurt');
    const c = this.player.centerX;
    const cy = this.player.centerY;
    for (let i = 0; i < 10; i += 1) {
      this.particles.spawn(1, c, cy, (Math.random() - 0.5) * 240, -90 - Math.random() * 200,
        0.4 + Math.random() * 0.4, 2 + Math.random() * 4, i % 2 ? '#ff7a45' : '#ffd2b8', 900, 0.3);
    }
    if (this.player.hits <= 0) this.die('hearts');
  }

  onPitFall() {
    if (this.state !== 'playing' || this.player.spawnGrace > 0) return;
    if (this.god) {
      this.respawnAtLastSafe();
      return;
    }
    this.player.hits = Math.max(0, this.player.hits - 1);
    this.flash = 0.7;
    this.addShake(3);
    this.audio.play('hurt');
    if (this.player.hits <= 0) {
      this.die('hearts');
      return;
    }
    this.respawnAtLastSafe();
  }

  respawnAtLastSafe() {
    const minX = this.world.frontX + 260;
    const wantX = Math.max(this.player.lastSafeX, minX);
    let spot = this.world.spotAt(wantX);
    if (!spot) spot = this.world.spotAt(minX);
    const x = spot ? spot.x : wantX;
    const groundY = spot ? spot.y : this.player.lastSafeY + this.player.h;
    this.player.respawn(x, groundY - this.player.h);
    this.player.spawnGrace = 1;
    this.wedge.forceRecall(this.player, this.audio, this.particles);
  }

  die(reason) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.endReason = reason;
    this.dieT = DIE_TIME;
    this.player.dead = true;
    this.audio.play('gameover');
    this.addShake(6.5);
    this.flash = 0.9;
    const c = this.player.centerX;
    const cy = this.player.centerY;
    for (let i = 0; i < 16; i += 1) {
      this.particles.spawn(1, c, cy, (Math.random() - 0.5) * 260, -120 - Math.random() * 240,
        0.5 + Math.random() * 0.6, 2 + Math.random() * 5, i % 2 ? '#ff7a45' : '#d8c7a2', 950, 0.3);
    }
    this.particles.spawn(7, c, cy, 0, 0, 0.5, 22, '#ff7a45', 0, 0);
    this.world.frontFrozen = true;
  }

  showOver() {
    this.state = 'gameover';
    const score = this.computeScore(false);
    const newBest = score > this.ui.best;
    if (newBest) this.ui.setBest(score);
    this.ui.showOver(this.endReason, {
      distance: this.maxX / 60,
      crystals: this.crystals,
      hearts: this.player.hits,
      seconds: this.runT,
      score,
      newBest,
    });
    this.mountBoard('over-board', score);
    this.audio.updateRumble(0);
  }

  // The shared leaderboard panel of the site's games (assets/scores.js), if it loaded.
  mountBoard(id, score) {
    if (window.SDEScores) window.SDEScores.mount(document.getElementById(id), { game: 'ground', lang: this.i18n.lang, score, ms: Math.round(this.runT * 1000) });
  }

  beginFinish() {
    if (this.state !== 'playing') return;
    this.state = 'finishing';
    this.finishT = 0;
    this.finishInput.right = true;
    this.player.vx = 260;
    this.ui.hideToast();
    this.audio.play('finish');
    this.world.frontFrozen = true;
    const goal = this.world.goalX || GOAL_X;
    const y = this.goalY || this.player.y;
    this.confettiT = 0;
    for (let i = 0; i < 30; i += 1) this.confetti(goal + (Math.random() - 0.5) * 240, y - 120 - Math.random() * 160);
  }

  confetti(x, y) {
    this.particles.spawn(PT.CONFETTI, x, y, (Math.random() - 0.5) * 220, -160 - Math.random() * 220,
      1.6 + Math.random() * 1.2, 3 + Math.random() * 4,
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)], 380, 0.9);
  }

  finishRun() {
    this.state = 'finished';
    const score = this.computeScore(true);
    const newBest = score > this.ui.best;
    if (newBest) this.ui.setBest(score);
    this.ui.showFinish({
      distance: this.maxX / 60,
      crystals: this.crystals,
      hearts: this.player.hits,
      seconds: this.runT,
      score,
      newBest,
    });
    this.mountBoard('finish-board', score);
    this.audio.updateRumble(0);
  }

  updateGoal() {
    if (this.goalY) return;
    const chunk = this.world.highlightChunk((c) => c.goalX);
    if (chunk) {
      this.goalY = chunk.topY;
      this.world.goalX = chunk.goalX;
    }
  }

  onBiomeChange(index) {
    this.ui.showBiome(BIOMES[index].key);
    this.ui.hideToast();
    this.biomeAt = this.runT;
  }

  onWedgeStick() {
    if (this.hintsShown.stick) return;
    this.hintsShown.stick = true;
    this.ui.hint('hintRecall', 5600);
  }

  // How to cross a gap wider than a jump, or climb a wall higher than one, shown as the player runs up
  // to the first of each; the glowing crack on the wall marks the spot.
  terrainHints() {
    if (this.hintsShown.gap && this.hintsShown.wall) return;
    // The land's name banner clears hints; wait until it has had its moment.
    if (this.runT - (this.biomeAt ?? -10) < 2.5) return;
    const x = this.player.x;
    for (let i = 0; i < this.world.chunks.length; i += 1) {
      const c = this.world.chunks[i];
      if (!this.hintsShown.gap && c.gapX && x > c.gapX - 340 && x < c.gapX) {
        this.hintsShown.gap = true;
        this.ui.hint('hintGap', 6500);
        return;
      }
      if (!this.hintsShown.wall && c.wallX && x > c.wallX - 340 && x < c.wallX) {
        this.hintsShown.wall = true;
        this.ui.hint('hintWall', 6500);
        return;
      }
    }
  }

  // ------------------------------------------------------------ debug

  exposeDebug() {
    const game = this;
    window.__ground = {
      version: 1,
      pose() {
        return {
          state: game.state,
          x: game.player.x,
          y: game.player.y,
          centerX: game.player.centerX,
          centerY: game.player.centerY,
          biome: game.world.biome,
          biomeIndex: game.world.biomeIndex,
          frontX: game.world.frontX,
          goal: game.world.goalX || GOAL_X,
          hits: game.player.hits,
          crystals: game.crystals,
          score: game.computeScore(game.state === 'finished'),
          time: game.runT,
          maxX: game.maxX,
          wedge: game.wedge.state,
        };
      },
      warp(x) {
        return game.debugWarp(x);
      },
      front(offset) {
        game.world.frontX = game.player.centerX - offset;
        return game.world.frontX;
      },
      freeze(on = true) {
        game.world.frontFrozen = !!on;
      },
      scene(name) {
        return game.debugScene(name);
      },
      metrics() {
        return {
          frames: game.metrics.frames,
          elapsed: game.metrics.elapsed,
          avgFrameMs: game.metrics.avgFrameMs,
          avgCostMs: game.metrics.avgCostMs,
        };
      },
      restart() {
        game.restart();
      },
      start() {
        game.start();
      },
      hideHints() {
        game.ui.hideToast();
      },
      god(on = true) {
        game.god = !!on;
      },
      state() {
        return game.state;
      },
    };
  }

  debugWarp(x) {
    if (this.state === 'title') this.start();
    this.world.ensure(x + 3800);
    const spot = this.world.spotAt(x);
    if (!spot) return false;
    this.player.respawn(spot.x, spot.y - this.player.h);
    this.player.spawnGrace = 1;
    this.wedge.reset();
    this.wedge.x = this.player.handX;
    this.wedge.y = this.player.handY;
    this.wedge.px = this.wedge.x;
    this.wedge.py = this.wedge.y;
    this.world.frontX = spot.x - 960;
    this.world.frontFrozen = false;
    this.maxX = Math.max(this.maxX, this.player.x);
    this.renderer.camReady = false;
    this.updateGoal();
    return true;
  }

  debugScene(name) {
    if (this.state === 'title') this.start();
    if (name === 'wedge') return this.debugWedgeScene();
    if (name === 'collapse') {
      this.god = true;
      // Move to open ground ahead so the scene is about the front, not the ledge
      // a previous debug scene left behind.
      if (!this.debugWarp(this.player.x + 720)) return false;
      this.world.frontX = this.player.centerX - 250;
      this.world.frontFrozen = true;
      this.renderer.camReady = false;
      return true;
    }
    if (name === 'gameover') {
      this.god = false;
      this.player.invuln = 0;
      this.player.spawnGrace = 0;
      this.player.hits = 1;
      this.hurt(this.player.centerX + 12);
      return this.player.hits === 0;
    }
    return false;
  }

  debugWedgeScene() {
    this.world.ensure(this.player.x + 16000);
    let wall = null;
    for (let i = 0; i < this.world.chunks.length && !wall; i += 1) {
      const list = this.world.chunks[i].platforms;
      for (let j = 0; j < list.length; j += 1) {
        const p = list[j];
        if (p.dead || p.kind !== 'pillar') continue;
        if (p.x > this.player.x + 260) {
          wall = p;
          break;
        }
      }
    }
    if (!wall) return false;
    this.god = true;
    this.world.frontX = wall.x - 620;
    this.world.frontFrozen = true;
    this.wedge.reset();
    this.wedge.state = 'flying';
    this.wedge.x = wall.x - WEDGE.radius;
    this.wedge.y = wall.y + 64;
    this.wedge.stick(this.world, wall, -1, 0, this.audio, this.particles);
    const ledge = this.wedge.ledge;
    this.player.respawn(ledge.x + ledge.w * 0.5 - this.player.w * 0.5, ledge.y - this.player.h);
    this.player.facing = 1;
    this.player.invuln = 0;
    this.player.spawnGrace = 10;
    this.maxX = Math.max(this.maxX, this.player.x);
    this.renderer.camReady = false;
    return true;
  }
}

const game = new Game();
window.__groundReady = true;
