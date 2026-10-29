// Fixed-size particle pool (no per-frame allocation): dust, debris, sparks, trails, confetti.

export const PT = {
  DUST: 0,
  DEBRIS: 1,
  SPARK: 2,
  TRAIL: 3,
  CONFETTI: 4,
  SPLASH: 5,
  EMBER: 6,
  RING: 7,
};

export class Particles {
  constructor(max = 560) {
    this.max = max;
    this.cursor = 0;
    this.pool = new Array(max);
    for (let i = 0; i < max; i += 1) {
      this.pool[i] = {
        alive: false, type: 0, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 1, size: 4, gravity: 0, drag: 0,
        color: '#ffffff', rot: 0, spin: 0,
      };
    }
  }

  clear() {
    for (let i = 0; i < this.max; i += 1) this.pool[i].alive = false;
    this.cursor = 0;
  }

  spawn(type, x, y, vx, vy, life, size, color, gravity = 0, drag = 0) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.alive = true;
    p.type = type;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.gravity = gravity;
    p.drag = drag;
    p.rot = Math.random() * 6.283;
    p.spin = (Math.random() * 2 - 1) * 12;
    return p;
  }

  dust(x, y, count, color, spread = 60, up = -20) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * 6.283;
      const speed = Math.random() * spread;
      this.spawn(0, x, y, Math.cos(angle) * speed, Math.sin(angle) * speed * 0.5 + up,
        0.35 + Math.random() * 0.45, 3 + Math.random() * 5, color, -20, 2.2);
    }
  }

  trailDot(x, y, color) {
    this.spawn(3, x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.3, 2 + Math.random() * 3, color, 0, 1);
  }

  update(dt) {
    for (let i = 0; i < this.max; i += 1) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }
}
