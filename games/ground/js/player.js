// The climber: tight platforming movement with coyote time, buffered jumps,
// variable jump height, wall slide and a forgiving three-heart health model.
import { PHYS, PLAYER } from './config.js';

const EPS = 0.01;

export class Player {
  constructor(game) {
    this.game = game;
    this.reset(0, 0);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.w = PLAYER.w;
    this.h = PLAYER.h;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false;
    this.wallDir = 0;
    this.wallSliding = false;
    this.facing = 1;
    this.anim = 0;
    this.squash = 0;
    this.stretch = 0;
    this.invuln = 0;
    this.hits = 3;
    this.maxHits = 3;
    this.muddy = false;
    this.groundKind = '';
    this.lastSafeX = x;
    this.lastSafeY = y;
    this.safeT = 0;
    this.stepT = 0;
    this.dustT = 0;
    this.dead = false;
    this.spawnGrace = 0.4;
  }

  get centerX() {
    return this.x + this.w * 0.5;
  }

  get centerY() {
    return this.y + this.h * 0.5;
  }

  get handX() {
    return this.x + this.w * 0.5 + this.facing * 9;
  }

  get handY() {
    return this.y + 16;
  }

  savePrev() {
    this.px = this.x;
    this.py = this.y;
  }

  overlapPlatform(p) {
    return this.x + this.w > p.x + EPS && this.x < p.x + p.w - EPS
      && this.y + this.h > p.y + EPS && this.y < p.y + p.h - EPS;
  }

  update(dt, world, wedge, particles, audio, input) {
    this.savePrev();
    this.invuln = Math.max(0, this.invuln - dt);
    this.spawnGrace = Math.max(0, this.spawnGrace - dt);
    this.squash = Math.max(0, this.squash - dt * 3.2);
    this.stretch = Math.max(0, this.stretch - dt * 2.2);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    const buffered = input.consumeJumpBuffer();
    if (buffered > 0) this.jumpBuffer = PHYS.buffer;

    const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.muddy = world.isMud(this);
    const maxSpeed = this.muddy ? PHYS.runSpeed * PHYS.mudFactor : PHYS.runSpeed;

    // Wall slide: hold toward a wall while falling.
    this.wallSliding = false;
    if (!this.onGround && this.wallDir !== 0 && move === this.wallDir && this.vy > 0) {
      this.vy = Math.min(this.vy, PHYS.wallSlide);
      this.wallSliding = true;
      if (Math.random() < 0.25) {
        particles.spawn(0, this.x + (this.wallDir > 0 ? this.w : 0), this.y + this.h * 0.4,
          -this.wallDir * 18, -12, 0.3, 3, '#b9a58a', -10, 2);
      }
    }

    if (this.jumpBuffer > 0) {
      if (this.wallDir !== 0 && !this.onGround) {
        this.jumpBuffer = 0;
        this.vx = -this.wallDir * PHYS.wallJumpX;
        this.vy = -PHYS.wallJumpY;
        this.facing = this.wallDir;
        this.wallDir = 0;
        this.wallSliding = false;
        this.jumping = true;
        this.stretch = 0.5;
        audio.play('jump');
        particles.dust(this.x + this.w * 0.5, this.y + this.h * 0.5, 4, '#c9b493', 60, -10);
      } else if (this.onGround || this.coyote > 0) {
        this.jumpBuffer = 0;
        this.coyote = 0;
        this.onGround = false;
        this.vy = -PHYS.jumpSpeed;
        this.jumping = true;
        this.stretch = 0.55;
        this.squash = 0;
        audio.play('jump');
        particles.dust(this.x + this.w * 0.5, this.y + this.h, 5, '#c9b493', 70, -30);
      }
    }

    // Variable jump height: releasing early cuts the rise once.
    if (this.jumping && !input.jumpHeld && this.vy < -160) {
      this.vy *= PHYS.jumpCut;
      this.jumping = false;
    }
    if (this.vy >= 0) this.jumping = false;

    const accel = this.onGround ? PHYS.groundAccel : PHYS.airAccel;
    const decel = this.onGround ? PHYS.groundDecel : PHYS.airDecel;
    if (move !== 0) {
      this.vx += move * accel * dt;
      if (Math.abs(this.vx) > maxSpeed) this.vx = move * maxSpeed;
      this.facing = move;
    } else if (this.onGround) {
      const drop = decel * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    } else {
      const drop = decel * dt;
      if (Math.abs(this.vx) <= drop) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * drop;
    }

    this.vy += PHYS.gravity * dt;
    if (this.vy > PHYS.maxFall) this.vy = PHYS.maxFall;

    this.wallDir = 0;
    this.moveX(dt, world, wedge);
    const wasGround = this.onGround;
    const fallSpeed = this.vy;
    this.onGround = false;
    this.ground = null;
    this.moveY(dt, world, wedge);

    if (this.onGround) {
      this.coyote = PHYS.coyote;
      if (!wasGround && fallSpeed > 260) {
        this.squash = Math.min(1, fallSpeed / 900);
        this.stretch = 0;
        audio.play('land');
        particles.dust(this.x + this.w * 0.5, this.y + this.h, fallSpeed > 700 ? 9 : 5,
          this.muddy ? '#6b5a3c' : '#c9b493', 80, -10);
        if (fallSpeed > 780) this.game.addShake(3.5);
      }
      this.jumping = false;
      if (this.ground && this.ground.kind === 'crumble') world.touchCrumble(this.ground);
      if (this.ground && this.ground.kind !== 'crumble') {
        this.safeT += dt;
        if (this.safeT > 0.2) {
          this.safeT = 0;
          this.lastSafeX = this.x;
          this.lastSafeY = this.y;
        }
      }
    }

    // Running animation and steps.
    if (this.onGround && Math.abs(this.vx) > 30) {
      this.anim += Math.abs(this.vx) * dt * 0.05;
      this.stepT -= dt;
      const cadence = this.muddy ? 0.34 : 0.21;
      if (this.stepT <= 0) {
        this.stepT = cadence;
        audio.play('step');
        if (this.muddy) {
          particles.spawn(5, this.x + this.w * 0.5, this.y + this.h - 2,
            (Math.random() - 0.5) * 70, -40 - Math.random() * 60, 0.35, 3, '#5c4a32', 400, 0);
        }
      }
    } else {
      this.anim += dt * 1.2;
    }
    if (this.onGround && Math.abs(this.vx) > 260) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.16;
        particles.spawn(0, this.x + this.w * 0.5 - this.facing * 10, this.y + this.h - 2,
          -this.facing * 30, -18, 0.35, 3, 'rgba(210,190,160,0.55)', -10, 2);
      }
    }

    const thorn = world.thornHit(this);
    if (thorn) this.game.hurt(thorn.x + thorn.w * 0.5);
    world.collect(this, this.game);

    if (this.y > this.lastSafeY + 430 || this.y > 1100) {
      this.game.onPitFall();
    }
  }

  moveX(dt, world, wedge) {
    this.x += this.vx * dt;
    const candidates = world.chunks;
    for (let i = 0; i < candidates.length; i += 1) {
      const chunk = candidates[i];
      if (chunk.endX < this.x - 40 || chunk.startX > this.x + this.w + 40) continue;
      const list = chunk.platforms;
      for (let j = 0; j < list.length; j += 1) {
        const p = list[j];
        if (p.dead || !this.overlapPlatform(p)) continue;
        if (this.vx > 0) this.x = p.x - this.w;
        else if (this.vx < 0) this.x = p.x + p.w;
        else continue;
        this.vx = 0;
        this.wallDir = Math.sign(this.x + this.w * 0.5 - (p.x + p.w * 0.5)) || 1;
      }
    }
    const ledge = wedge.ledge;
    if (ledge.active && this.vx !== 0) {
      if (this.x + this.w > ledge.x + EPS && this.x < ledge.x + ledge.w - EPS
        && this.y + this.h > ledge.y + EPS && this.y < ledge.y + ledge.h - EPS) {
        if (this.vx > 0) this.x = ledge.x - this.w;
        else this.x = ledge.x + ledge.w;
        this.vx = 0;
        this.wallDir = Math.sign(this.x + this.w * 0.5 - (ledge.x + ledge.w * 0.5)) || 1;
      }
    }
  }

  moveY(dt, world, wedge) {
    this.y += this.vy * dt;
    const candidates = world.chunks;
    for (let i = 0; i < candidates.length; i += 1) {
      const chunk = candidates[i];
      if (chunk.endX < this.x - 40 || chunk.startX > this.x + this.w + 40) continue;
      const list = chunk.platforms;
      for (let j = 0; j < list.length; j += 1) {
        const p = list[j];
        if (p.dead || !this.overlapPlatform(p)) continue;
        if (this.vy > 0) {
          this.y = p.y - this.h;
          this.onGround = true;
          this.ground = p;
        } else if (this.vy < 0) {
          this.y = p.y + p.h;
        }
        this.vy = 0;
      }
    }
    const ledge = wedge.ledge;
    if (ledge.active && this.vy !== 0) {
      if (this.x + this.w > ledge.x + EPS && this.x < ledge.x + ledge.w - EPS
        && this.y + this.h > ledge.y + EPS && this.y < ledge.y + ledge.h - EPS) {
        if (this.vy > 0) {
          this.y = ledge.y - this.h;
          this.onGround = true;
          this.ground = ledge.platformRef || null;
        } else {
          this.y = ledge.y + ledge.h;
        }
        this.vy = 0;
      }
    }
  }

  knockback(fromX) {
    const dir = Math.sign(this.centerX - fromX) || 1;
    this.vx = dir * 290;
    this.vy = -400;
    this.onGround = false;
    this.invuln = 1.3;
    this.squash = 0.3;
  }

  respawn(x, y) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.onGround = false;
    this.invuln = 1.6;
    this.spawnGrace = 0.8;
    this.safeT = 0;
    this.lastSafeX = x;
    this.lastSafeY = y;
  }
}

export const PLAYER_START_HITS = 3;
