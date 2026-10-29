// The one wedge: thrown on a ballistic arc, sticks in rock as a small ledge,
// and flies back to the climber's hand when called.
import { WEDGE, PLAYER } from './config.js';

const HAND_BACK = 9;

export class Wedge {
  constructor(game) {
    this.game = game;
    this.ledge = { x: 0, y: 0, w: WEDGE.ledgeWidth, h: WEDGE.ledgeHeight, active: false };
    this.reset();
  }

  reset() {
    this.state = 'held';
    this.x = 0;
    this.y = 0;
    this.px = 0;
    this.py = 0;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;
    this.angle = 0;
    this.timer = 0;
    this.trailT = 0;
    this.cooldown = 0;
    this.normal = 0;
    this.hitX = 0;
    this.hitY = 0;
    this.ledge.active = false;
    this.ledge.x = 0;
    this.ledge.y = 0;
  }

  get isOut() {
    return this.state !== 'held';
  }

  get isStuck() {
    return this.state === 'stuck' || this.state === 'unsticking';
  }

  // Called by the game when the throw / recall button is pressed.
  // source: 'key' | 'button' | 'pointer' | 'touch'; aim coordinates are world space.
  request(source, player, aimX, aimY, audio, particles) {
    if (this.cooldown > 0) return;
    if (this.state === 'held') {
      this.throwFrom(player, source, aimX, aimY, audio, particles);
    } else if (this.state === 'flying' || this.state === 'stuck') {
      this.recall(player, audio, particles);
    }
  }

  forceRecall(player, audio, particles) {
    if (this.state === 'flying' || this.state === 'stuck') this.recall(player, audio, particles);
  }

  throwFrom(player, source, aimX, aimY, audio, particles) {
    const handX = player.handX;
    const handY = player.handY;
    let dx;
    let dy;
    if (source === 'pointer' || source === 'touch') {
      dx = aimX - handX;
      dy = aimY - handY;
      const len = Math.hypot(dx, dy);
      if (len < 24) {
        dx = player.facing;
        dy = -1;
      } else {
        dx /= len;
        dy /= len;
      }
    } else {
      dx = player.facing * 0.7071;
      dy = -0.7071;
    }
    this.state = 'flying';
    this.x = handX;
    this.y = handY;
    this.px = this.x;
    this.py = this.y;
    this.vx = dx * WEDGE.speed;
    this.vy = dy * WEDGE.speed;
    this.spin = 0;
    this.angle = Math.atan2(dy, dx);
    this.timer = 0;
    this.ledge.active = false;
    this.cooldown = 0.06;
    audio.play('throw');
    particles.trailDot(handX, handY, '#ffb08a');
  }

  recall(player, audio, particles) {
    if (this.state === 'stuck') {
      this.state = 'unsticking';
      this.timer = WEDGE.recallDelay;
      this.cooldown = 0.04;
      audio.play('recall');
      particles.spawn(2, this.x, this.y, 0, -20, 0.3, 4, '#ff9a6b', 0, 1);
    } else if (this.state === 'flying') {
      this.state = 'returning';
      this.cooldown = 0.04;
      audio.play('recall');
    }
  }

  stick(world, platform, nx, ny, audio, particles) {
    const r = WEDGE.radius;
    this.state = 'stuck';
    this.vx = 0;
    this.vy = 0;
    this.normal = nx;
    this.x = Math.max(platform.x - r, Math.min(platform.x + platform.w + r, this.x));
    this.y = Math.max(platform.y - r, Math.min(platform.y + platform.h + r, this.y));
    this.hitX = this.x;
    this.hitY = this.y;
    const ledge = this.ledge;
    ledge.w = WEDGE.ledgeWidth;
    ledge.h = WEDGE.ledgeHeight;
    if (nx < 0) {
      this.x = platform.x - r;
      this.y = Math.max(platform.y + 6, Math.min(platform.y + platform.h - 6, this.y));
      ledge.x = platform.x - ledge.w;
      ledge.y = this.y;
    } else if (nx > 0) {
      this.x = platform.x + platform.w + r;
      this.y = Math.max(platform.y + 6, Math.min(platform.y + platform.h - 6, this.y));
      ledge.x = platform.x + platform.w;
      ledge.y = this.y;
    } else if (ny > 0) {
      this.y = platform.y - r;
      this.x = Math.max(platform.x + 10, Math.min(platform.x + platform.w - 10, this.x));
      ledge.x = this.x - ledge.w * 0.5;
      ledge.y = platform.y - ledge.h;
    } else {
      this.y = platform.y + platform.h + r;
      this.x = Math.max(platform.x + 10, Math.min(platform.x + platform.w - 10, this.x));
      ledge.x = this.x - ledge.w * 0.5;
      ledge.y = platform.y + platform.h;
    }
    ledge.active = true;
    this.angle = Math.atan2(ny, nx);
    audio.play('thunk');
    particles.spawn(2, this.x, this.y, 0, -40, 0.35, 5, '#fff0c8', 60, 1);
    for (let i = 0; i < 6; i += 1) {
      particles.spawn(1, this.x, this.y, (Math.random() - 0.5) * 160, -60 - Math.random() * 120,
        0.5 + Math.random() * 0.3, 2 + Math.random() * 3, '#d8c7a2', 700, 0.4);
    }
    this.game.addShake(2.2);
    this.stuckPlatform = platform;
    if (this.game.onWedgeStick) this.game.onWedgeStick();
  }

  update(dt, world, player, particles, audio) {
    this.px = this.x;
    this.py = this.y;
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.state === 'held') {
      this.x = player.handX;
      this.y = player.handY;
      this.ledge.active = false;
      return;
    }
    if (this.state === 'stuck') {
      if (this.stuckPlatform && this.stuckPlatform.dead) {
        this.state = 'returning';
        this.ledge.active = false;
        return;
      }
      this.ledge.active = true;
      return;
    }
    if (this.state === 'unsticking') {
      this.timer -= dt;
      this.ledge.active = true;
      this.x += (Math.random() - 0.5) * 2;
      if (this.timer <= 0) {
        this.state = 'returning';
        this.ledge.active = false;
      }
      return;
    }
    if (this.state === 'flying') {
      this.ledge.active = false;
      this.timer += dt;
      this.vy += WEDGE.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.spin += dt * 22;
      if (Math.random() < 0.35) particles.trailDot(this.x, this.y, '#ffc29a');
      if (this.timer > WEDGE.maxFlight || this.y > 4200) {
        this.state = 'returning';
        return;
      }
      const r = WEDGE.radius;
      for (let i = 0; i < world.chunks.length; i += 1) {
        const chunk = world.chunks[i];
        if (chunk.endX < this.x - 60 || chunk.startX > this.x + 60) continue;
        for (let j = 0; j < chunk.platforms.length; j += 1) {
          const p = chunk.platforms[j];
          if (p.dead) continue;
          const nearestX = Math.max(p.x, Math.min(p.x + p.w, this.x));
          const nearestY = Math.max(p.y, Math.min(p.y + p.h, this.y));
          const dx = this.x - nearestX;
          const dy = this.y - nearestY;
          if (dx * dx + dy * dy > r * r) continue;
          // Push out along the shallowest axis to find the face it hit.
          const ol = this.x + r - p.x;
          const or = p.x + p.w - (this.x - r);
          const ot = this.y + r - p.y;
          const ob = p.y + p.h - (this.y - r);
          const m = Math.min(ol, or, ot, ob);
          let nx = 0;
          let ny = 0;
          if (m === ol) nx = -1;
          else if (m === or) nx = 1;
          else if (m === ot) ny = -1;
          else ny = 1;
          this.stick(world, p, nx, ny, audio, particles);
          return;
        }
      }
      return;
    }
    if (this.state === 'returning') {
      this.ledge.active = false;
      const tx = player.handX;
      const ty = player.handY;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 22) {
        this.state = 'held';
        this.x = tx;
        this.y = ty;
        return;
      }
      const step = Math.min(dist, WEDGE.returnSpeed * dt);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
      this.spin += dt * 26;
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.016;
        particles.trailDot(this.x, this.y, '#d9ff7a');
      }
    }
  }
}

export const WEDGE_HAND = PLAYER.handHeight;
