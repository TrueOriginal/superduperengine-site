// Frame composition: camera, DPR-aware viewport, collapse void and front,
// entities with interpolated positions, particles, aim arc and screen effects.
import { VIEW_HEIGHT, DPR_CAP, WEDGE, BIOME_STARTS, biomeIndexAt } from './config.js';
import { Scenery } from './scenery.js';
import { drawPlayer, drawWedge, drawLedge, drawRock } from './sprites.js';
import { PT } from './particles.js';

const MIN_VIEW_W = 620;

function makeGlow(color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, color);
  grad.addColorStop(0.4, color.replace(')', ', 0.45)').replace('rgb', 'rgba'));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function makeVoidStrip() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 4;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 256, 0);
  // Solid black almost everywhere: the hole must read as a hole, not as a wall.
  // Only the last ~15% warms up, as embers on the lip.
  grad.addColorStop(0, 'rgba(5,6,10,1)');
  grad.addColorStop(0.62, 'rgba(5,6,10,1)');
  grad.addColorStop(0.85, 'rgba(14,8,7,0.94)');
  grad.addColorStop(0.97, 'rgba(58,24,11,0.85)');
  grad.addColorStop(1, 'rgba(90,34,12,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 4);
  return c;
}

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.scenery = new Scenery();
    this.dpr = 1;
    this.lastDpr = 1;
    this.cssW = 800;
    this.cssH = 540;
    this.scale = 1;
    this.viewW = 800;
    this.viewH = 540;
    this.camX = 0;
    this.camY = -260;
    this.camReady = false;
    this.time = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.glowLime = makeGlow('rgb(200,255,77)');
    this.glowCoral = makeGlow('rgb(255,122,69)');
    this.voidStrip = makeVoidStrip();
    this.vignette = null;
    this.caveShade = null;
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const cssW = Math.round(rect.width);
    const cssH = Math.round(rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.dpr = dpr;
    this.lastDpr = dpr;
    this.cssW = cssW;
    this.cssH = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    let scale = cssH / VIEW_HEIGHT;
    let viewW = cssW / scale;
    if (viewW < MIN_VIEW_W) {
      viewW = MIN_VIEW_W;
      scale = cssW / viewW;
    }
    this.scale = scale;
    this.viewW = viewW;
    this.viewH = cssH / scale;
    this.scenery.resize(cssW, cssH);
    const ctx = this.ctx;
    const v = ctx.createRadialGradient(
      cssW * 0.5, cssH * 0.48, Math.min(cssW, cssH) * 0.34,
      cssW * 0.5, cssH * 0.48, Math.max(cssW, cssH) * 0.74,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    this.vignette = v;
    const r = Math.max(170, VIEW_HEIGHT * scale * 0.62);
    const c = ctx.createRadialGradient(0, 0, r * 0.16, 0, 0, r);
    c.addColorStop(0, 'rgba(3,4,8,0)');
    c.addColorStop(0.5, 'rgba(3,4,8,0.12)');
    c.addColorStop(1, 'rgba(3,4,8,0.9)');
    this.caveShade = c;
  }

  screenToWorld(sx, sy) {
    return { x: this.camX + sx / this.scale, y: this.camY + sy / this.scale };
  }

  playerScreenX(alpha) {
    const p = this.game.player;
    return (p.px + (p.x - p.px) * alpha - this.camX) * this.scale;
  }

  playerScreenY(alpha) {
    const p = this.game.player;
    return (p.py + (p.y - p.py) * alpha - this.camY) * this.scale;
  }

  updateCamera(dt, alpha) {
    const game = this.game;
    const p = game.player;
    const ix = p.px + (p.x - p.px) * alpha;
    const iy = p.py + (p.y - p.py) * alpha;
    const finishing = game.state === 'finishing' || game.state === 'finished';
    let tx;
    let ty;
    let rate = 9;
    if (finishing) {
      tx = game.world.goalX - this.viewW * 0.5;
      ty = (game.goalY || 0) - this.viewH * 0.56;
      rate = 2.4;
    } else {
      const front = game.world.frontX;
      const gap = ix - front;
      const normal = ix - this.viewW * 0.34;
      const near = front - this.viewW * 0.05;
      const pull = Math.max(0, Math.min(1, (this.viewW * 0.75 - gap) / (this.viewW * 0.3)));
      tx = normal + (near - normal) * pull;
      tx = Math.min(tx, ix - this.viewW * 0.16);
      ty = iy - this.viewH * 0.56;
    }
    if (!this.camReady || Math.abs(tx - this.camX) > 520 || Math.abs(ty - this.camY) > 420) {
      this.camX = tx;
      this.camY = ty;
      this.camReady = true;
    } else {
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * rate);
      this.camX += (tx - this.camX) * k;
      this.camY += (ty - this.camY) * k;
    }
    const s = game.reducedMotion ? 0 : game.shake;
    if (s > 0.04) {
      this.shakeX = Math.sin(this.time * 61) * s + Math.sin(this.time * 37.7) * s * 0.5;
      this.shakeY = Math.cos(this.time * 53.3) * s * 0.8;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  draw(alpha) {
    const game = this.game;
    if ((window.devicePixelRatio || 1) > DPR_CAP) {
      if (this.lastDpr !== DPR_CAP) this.resize();
    } else if (window.devicePixelRatio !== this.lastDpr) {
      this.resize();
    }
    this.time = game.time;
    this.updateCamera(game.frameDt, alpha);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;

    this.drawSky();
    ctx.save();
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.camX + this.shakeX, -this.camY + this.shakeY);
    this.drawVoid(ctx);
    this.scenery.drawTerrain(ctx, game.world, this.camX, this.camY, this.viewW, this.viewH,
      this.time, this.glowLime, this.glowCoral);
    this.drawFront(ctx);
    this.drawRocks(ctx, alpha);
    this.drawWedge(ctx, alpha);
    this.drawPlayer(ctx, alpha);
    this.drawParticles(ctx);
    this.drawAim(ctx, alpha);
    ctx.restore();
    this.drawOverlays(ctx, alpha);
  }

  drawSky() {
    const game = this.game;
    const center = this.camX + this.viewW * 0.5;
    const idx = biomeIndexAt(center);
    const ctx = this.ctx;
    this.scenery.drawBackground(ctx, idx, this.camX, this.camY, this.time, 1);
    const nextStart = BIOME_STARTS[idx + 1];
    if (nextStart !== undefined) {
      const d = nextStart - center;
      if (d < 820 && d > -820) {
        const blend = Math.max(0, Math.min(1, 1 - d / 820));
        if (blend > 0.01) this.scenery.drawBackground(ctx, idx + 1, this.camX, this.camY, this.time, blend);
      }
    }
  }

  drawVoid(ctx) {
    const front = this.game.world.frontX;
    const left = this.camX - 220;
    if (front <= left) return;
    const top = this.camY - 140;
    const h = this.viewH + 280;
    ctx.fillStyle = '#05060a';
    ctx.fillRect(left, top, front - left, h);
    const stripW = Math.min(150, front - left);
    ctx.drawImage(this.voidStrip, front - stripW, top, stripW, h);
    ctx.fillStyle = 'rgba(255, 122, 69, 0.07)';
    ctx.fillRect(front - 10, top, 10, h);
  }

  drawFront(ctx) {
    const front = this.game.world.frontX;
    if (front < this.camX - 40) return;
    const top = this.camY - 120;
    const h = this.viewH + 240;
    const time = this.time;
    const sway = 0.5 + this.game.world.quake * 0.5;
    ctx.save();
    ctx.beginPath();
    let first = true;
    for (let y = top; y <= top + h; y += 18) {
      const x = front + Math.sin(y * 0.021 + time * 2.3) * 6
        + Math.sin(y * 0.0067 - 1.1) * 9
        + Math.sin(y * 0.11 + time * 3.7) * 2 + 3;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = '#ff7a45';
    ctx.globalAlpha = 0.08 + this.game.world.quake * 0.07;
    ctx.lineWidth = 26;
    ctx.stroke();
    ctx.globalAlpha = 0.6 + Math.sin(time * 7) * 0.12;
    ctx.lineWidth = 2.2 + sway * 1.4;
    ctx.stroke();
    ctx.strokeStyle = '#ffd9a8';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  drawPlayer(ctx, alpha) {
    const p = this.game.player;
    const dx = (p.px - p.x) * (1 - alpha);
    const dy = (p.py - p.y) * (1 - alpha);
    ctx.save();
    ctx.translate(dx, dy);
    drawPlayer(ctx, p, this.time);
    ctx.restore();
  }

  drawWedge(ctx, alpha) {
    const w = this.game.wedge;
    if (w.ledge.active) drawLedge(ctx, w.ledge, this.time);
    if (w.state === 'stuck' || w.state === 'unsticking') {
      drawWedge(ctx, w, this.time);
      return;
    }
    const dx = (w.px - w.x) * (1 - alpha);
    const dy = (w.py - w.y) * (1 - alpha);
    ctx.save();
    ctx.translate(dx, dy);
    drawWedge(ctx, w, this.time);
    ctx.restore();
  }

  drawRocks(ctx, alpha) {
    const rocks = this.game.world.rocks;
    for (let i = 0; i < rocks.length; i += 1) {
      const r = rocks[i];
      if (!r.alive) continue;
      const y = r.prevY !== undefined ? r.prevY + (r.y - r.prevY) * alpha : r.y;
      ctx.save();
      ctx.translate(0, y - r.y);
      drawRock(ctx, r);
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    const pool = this.game.particles.pool;
    for (let i = 0; i < pool.length; i += 1) {
      const p = pool[i];
      if (!p.alive) continue;
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      if (p.type === PT.DEBRIS || p.type === PT.CONFETTI) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = a;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.type === PT.RING) {
        ctx.save();
        ctx.globalAlpha = a * 0.7;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (2 - a) + 4, 0, 6.283);
        ctx.stroke();
        ctx.restore();
      } else {
        const grow = p.type === PT.DUST ? 1 + (1 - a) * 0.7 : 1;
        ctx.globalAlpha = p.type === PT.DUST ? a * 0.75 : a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * 0.5 * grow), 0, 6.283);
        ctx.fill();
        if (p.type === PT.SPARK || p.type === PT.EMBER) {
          ctx.globalAlpha = a * 0.22;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 1.9, 0, 6.283);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawAim(ctx, alpha) {
    const game = this.game;
    const w = game.wedge;
    const input = game.input;
    if (game.state !== 'playing' || w.state !== 'held' || !input.pointerInside || input.touch) return;
    const p = game.player;
    const hx = p.handX;
    const hy = p.handY;
    const aim = this.screenToWorld(input.aimScreenX, input.aimScreenY);
    let dx = aim.x - hx;
    let dy = aim.y - hy;
    const len = Math.hypot(dx, dy);
    if (len < 24) {
      dx = p.facing;
      dy = -1;
    } else {
      dx /= len;
      dy /= len;
    }
    let vx = dx * WEDGE.speed;
    let vy = dy * WEDGE.speed;
    let x = hx;
    let y = hy;
    const step = 1 / 40;
    ctx.save();
    ctx.fillStyle = '#c8ff4d';
    for (let i = 0; i < 30; i += 1) {
      vy += WEDGE.gravity * step;
      x += vx * step;
      y += vy * step;
      if (i % 3 === 0) {
        ctx.globalAlpha = 0.6 * (1 - i / 32);
        ctx.beginPath();
        ctx.arc(x, y, 2.2 - i * 0.04, 0, 6.283);
        ctx.fill();
      }
      if (this.aimBlocked(x, y)) break;
    }
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#c8ff4d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 7, 0, 6.283);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(aim.x - 11, aim.y);
    ctx.lineTo(aim.x - 4, aim.y);
    ctx.moveTo(aim.x + 4, aim.y);
    ctx.lineTo(aim.x + 11, aim.y);
    ctx.stroke();
    ctx.restore();
  }

  aimBlocked(x, y) {
    const chunks = this.game.world.chunks;
    const r = WEDGE.radius;
    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i];
      if (c.endX < x - 40 || c.startX > x + 40) continue;
      for (let j = 0; j < c.platforms.length; j += 1) {
        const p = c.platforms[j];
        if (p.dead) continue;
        if (x + r > p.x && x - r < p.x + p.w && y + r > p.y && y - r < p.y + p.h) return true;
      }
    }
    return false;
  }

  drawOverlays(ctx, alpha) {
    const game = this.game;
    if (this.vignette) {
      ctx.fillStyle = this.vignette;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    const cave = game.world.biomeIndex === 3 && game.state !== 'title';
    if (cave && this.caveShade) {
      const px = this.playerScreenX(alpha);
      const py = this.playerScreenY(alpha);
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = this.caveShade;
      ctx.fillRect(-6000, -6000, 12000, 12000);
      ctx.restore();
    }
    if (game.flash > 0.01) {
      const strength = game.reducedMotion ? 0.16 : 0.32;
      ctx.fillStyle = `rgba(255, 96, 62, ${(game.flash * strength).toFixed(3)})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    if (game.state === 'playing' && game.player.hits === 1) {
      ctx.fillStyle = `rgba(255, 80, 50, ${(0.045 + Math.sin(this.time * 5) * 0.03).toFixed(3)})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }
}
