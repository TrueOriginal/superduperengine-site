// The live world: chunk streaming, the collapse front, crumbling blocks,
// falling rocks, hazards and pickups. All updates are fixed-step and pooled.
import {
  BIOMES, BIOME_STARTS, GOAL_X, START_X, START_Y, WORLD_START_X,
  COLLAPSE, PLAYER, PHYS, biomeIndexAt, biomeKeyAt,
} from './config.js';
import { generateChunk } from './terrain.js';

const ROCKS = 26;

export class World {
  constructor(game) {
    this.game = game;
    this.chunks = [];
    this.rocks = new Array(ROCKS);
    for (let i = 0; i < ROCKS; i += 1) {
      this.rocks[i] = { alive: false, x: 0, y: 0, vy: 0, rot: 0, spin: 0, size: 14 };
    }
    this.rockCursor = 0;
    this.reset(0, 0);
  }

  reset(runSeed, biomeIndex) {
    this.seed = runSeed >>> 0;
    this.chunks.length = 0;
    this.nextIndex = 0;
    this.nextX = WORLD_START_X;
    this.nextY = START_Y;
    this.spawnX = START_X;
    this.spawnY = START_Y;
    this.goalX = 0;
    this.goalHit = false;
    this.biomeIndex = 0;
    this.frontX = 0;
    this.frontSpeed = COLLAPSE.baseSpeed;
    this.frontFrozen = false;
    this.quake = 0;
    this.rockT = 2;
    this.debrisT = 0;
    this.rumbleT = 0;
    this.rockCursor = 0;
    for (let i = 0; i < this.rocks.length; i += 1) this.rocks[i].alive = false;

    const startAt = biomeIndex > 0 ? BIOME_STARTS[biomeIndex] + 280 : START_X;
    this.ensure(startAt + 4200);
    const spawn = this.spotAt(startAt) || { x: startAt, y: START_Y };
    this.spawnX = spawn.x;
    this.spawnY = spawn.y - PLAYER.h;
    this.frontX = this.spawnX - COLLAPSE.startGap;
    this.biomeIndex = biomeIndexAt(this.spawnX);
  }

  ensure(x) {
    let guard = 0;
    while (this.nextX < x && guard < 80) {
      guard += 1;
      const force = this.nextIndex === 0 ? 'flat' : undefined;
      const chunk = generateChunk(this.seed, this.nextIndex, this.nextX, this.nextY, undefined, force);
      this.chunks.push(chunk);
      this.nextX = chunk.endX;
      this.nextY = chunk.nextY;
      this.nextIndex += 1;
      if (chunk.goalX) this.goalX = chunk.goalX;
      if (chunk.goalX) break;
    }
    while (this.chunks.length > 9 && this.chunks[0].endX < this.frontX - 1600) {
      this.chunks.shift();
    }
  }

  // A safe standing point on a route platform near x, used by spawns and debug.
  spotAt(x) {
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      for (let j = 0; j < c.route.length; j += 1) {
        const n = c.route[j];
        if (x >= n.x + 50 && x <= n.x + n.w - 50) return { x, y: n.y };
      }
    }
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      for (let j = 0; j < c.route.length; j += 1) {
        const n = c.route[j];
        if (n.x + n.w > x && n.kind !== 'crumble') return { x: Math.max(x, n.x + 40), y: n.y };
      }
    }
    return null;
  }

  update(dt, player, particles, audio) {
    const wanted = player.x + 3800;
    if (this.nextX < wanted) this.ensure(wanted);

    const progress = Math.max(0, Math.min(1, this.frontX / GOAL_X));
    this.frontSpeed = COLLAPSE.baseSpeed + (COLLAPSE.endSpeed - COLLAPSE.baseSpeed) * progress;
    if (!this.frontFrozen) this.frontX += this.frontSpeed * dt;

    const gap = player.x - this.frontX;
    this.quake = Math.max(0, Math.min(1, 1 - gap / 1000));

    // Crumbling fronts: debris and dust.
    this.debrisT -= dt;
    if (this.debrisT <= 0) {
      this.debrisT = 0.03 + Math.random() * 0.025;
      const y = player.y - 260 + Math.random() * 560;
      particles.spawn(1, this.frontX + Math.random() * 34, y,
        -40 - Math.random() * 90, -30 - Math.random() * 80,
        0.6 + Math.random() * 0.6, 3 + Math.random() * 5, '#c99a74', 850, 0.3);
      if (Math.random() < 0.45) {
        particles.spawn(0, this.frontX + 20, y, 20 + Math.random() * 50, -20, 0.5, 3 + Math.random() * 4,
          'rgba(190,150,115,0.55)', -10, 1.4);
      }
      if (Math.random() < 0.3) {
        particles.spawn(2, this.frontX + 10 + Math.random() * 22, y,
          -20 - Math.random() * 40, -30 - Math.random() * 50,
          0.45 + Math.random() * 0.4, 2.2, '#ff9a5a', 420, 0.8);
      }
    }

    // Remove terrain that the front has eaten.
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      for (let j = 0; j < c.platforms.length; j += 1) {
        const p = c.platforms[j];
        if (!p.dead && p.x + p.w < this.frontX - 2) p.dead = true;
      }
    }

    this.updateRocks(dt, player, particles, audio);
    this.updateCrumble(dt, particles, audio);

    const rockBiome = this.biome === 'hills' || this.biome === 'canyon' || this.biome === 'cave';
    if (rockBiome && this.quake > 0.32) {
      this.rockT -= dt;
      if (this.rockT <= 0) {
        this.rockT = 1.1 + Math.random() * 1.5 - this.quake * 0.55;
        this.spawnRock(player);
      }
    }

    const nextBiome = biomeIndexAt(player.x);
    if (nextBiome !== this.biomeIndex) {
      this.biomeIndex = nextBiome;
      this.game.onBiomeChange(nextBiome);
    }

    this.rumbleT -= dt;
    if (this.rumbleT <= 0) {
      this.rumbleT = 0.1;
      const pressure = Math.max(this.quake * 0.9, this.goalHit ? 0 : 0.06);
      audio.updateRumble(pressure);
    }
  }

  updateRocks(dt, player, particles, audio) {
    for (let i = 0; i < this.rocks.length; i += 1) {
      const r = this.rocks[i];
      if (!r.alive) continue;
      r.prevY = r.y;
      r.vy += 980 * dt;
      r.y += r.vy * dt;
      r.rot += r.spin * dt;
      if (r.y > player.y + 700) {
        r.alive = false;
        continue;
      }
      const pcx = player.centerX;
      const pcy = player.centerY;
      if (Math.abs(r.x - pcx) < r.size + 14 && Math.abs(r.y - pcy) < r.size + 18) {
        r.alive = false;
        this.game.hurt(r.x);
        continue;
      }
      let hit = false;
      for (let c = 0; c < this.chunks.length && !hit; c += 1) {
        const chunk = this.chunks[c];
        if (chunk.endX < r.x - 40 || chunk.startX > r.x + 40) continue;
        for (let j = 0; j < chunk.platforms.length; j += 1) {
          const p = chunk.platforms[j];
          if (p.dead) continue;
          if (r.x > p.x && r.x < p.x + p.w && r.y + r.size > p.y && r.y - r.size < p.y + p.h) {
            hit = true;
            break;
          }
        }
      }
      if (hit) {
        r.alive = false;
        audio.play('rock');
        for (let k = 0; k < 7; k += 1) {
          particles.spawn(1, r.x, r.y, (Math.random() - 0.5) * 220, -80 - Math.random() * 160,
            0.45 + Math.random() * 0.4, 2 + Math.random() * 4, '#8d8579', 800, 0.3);
        }
      }
    }
  }

  spawnRock(player) {
    const r = this.rocks[this.rockCursor];
    this.rockCursor = (this.rockCursor + 1) % this.rocks.length;
    r.alive = true;
    r.x = player.x + 120 + Math.random() * 520;
    r.y = player.y - 420;
    r.vy = 140 + Math.random() * 120;
    r.rot = Math.random() * 6.283;
    r.spin = (Math.random() - 0.5) * 7;
    r.size = 10 + Math.random() * 8;
    r.prevY = r.y;
  }

  touchCrumble(p) {
    if (p.crumbleT < 0) p.crumbleT = 0;
  }

  updateCrumble(dt, particles, audio) {
    for (let i = 0; i < this.chunks.length; i += 1) {
      const list = this.chunks[i].platforms;
      for (let j = 0; j < list.length; j += 1) {
        const p = list[j];
        if (p.crumbleT < 0 || p.crumbleT >= 1) continue;
        p.crumbleT += dt;
        if (p.crumbleT > 0.7) {
          p.crumbleT = 1;
          p.dead = true;
          audio.play('crumble');
          this.game.addShake(2);
          for (let k = 0; k < 10; k += 1) {
            particles.spawn(1, p.x + Math.random() * p.w, p.y + 6,
              (Math.random() - 0.5) * 130, -30 - Math.random() * 120,
              0.5 + Math.random() * 0.5, 2 + Math.random() * 5, '#9a8b78', 900, 0.2);
          }
        }
      }
    }
  }

  isMud(player) {
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      if (c.endX < player.x - 40 || c.startX > player.x + 40) continue;
      for (let j = 0; j < c.hazards.length; j += 1) {
        const h = c.hazards[j];
        if (h.type !== 'mud') continue;
        if (player.x + player.w > h.x && player.x < h.x + h.w
          && player.y + player.h > h.y - 6 && player.y < h.y + h.h) return true;
      }
    }
    return false;
  }

  thornHit(player) {
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      if (c.endX < player.x - 40 || c.startX > player.x + 40) continue;
      for (let j = 0; j < c.hazards.length; j += 1) {
        const h = c.hazards[j];
        if (h.type !== 'thorn') continue;
        if (player.x + player.w - 4 > h.x && player.x + 4 < h.x + h.w
          && player.y + player.h > h.y + 8 && player.y < h.y + h.h) return h;
      }
    }
    return null;
  }

  collect(player, game) {
    const cx = player.centerX;
    const cy = player.centerY;
    for (let i = 0; i < this.chunks.length; i += 1) {
      const c = this.chunks[i];
      if (c.endX < player.x - 40 || c.startX > player.x + 60) continue;
      for (let j = 0; j < c.pickups.length; j += 1) {
        const p = c.pickups[j];
        if (p.taken) continue;
        if (p.x < this.frontX + 20) {
          p.taken = true;
          continue;
        }
        if (Math.abs(p.x - cx) < 30 && Math.abs(p.y - cy) < 38) {
          p.taken = true;
          game.collect(p);
        }
      }
    }
  }

  caught(player) {
    return player.centerX < this.frontX + COLLAPSE.catchX;
  }

  reachedGoal(player) {
    if (!this.goalX) return false;
    return player.centerX >= this.goalX;
  }

  get biome() {
    return BIOMES[this.biomeIndex].key;
  }

  highlightChunk(predicate) {
    for (let i = 0; i < this.chunks.length; i += 1) {
      if (predicate(this.chunks[i])) return this.chunks[i];
    }
    return null;
  }
}

export const WORLD_LIMITS = { rocks: ROCKS, physics: PHYS, biomeKeys: BIOMES.map((b) => b.key), biomeStarts: BIOME_STARTS, goalX: GOAL_X, startX: START_X };
