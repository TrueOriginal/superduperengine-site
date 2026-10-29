// Static world painting: biome skies and silhouettes, terrain bodies and crusts,
// decorations, hazards, pickups and the valley arch. No game state is mutated.
import { BIOMES } from './config.js';
import { drawDeco, drawThorn, drawMud, drawCrystal, drawHeart, drawGoal } from './sprites.js';

export const PALETTES = {
  meadow: {
    skyTop: '#0e1c2b', skyBottom: '#e7a262', sun: '#ffe3a8',
    far: '#344a52', far2: '#2a3d44', near: '#22352f', near2: '#1a2b27',
    body: '#2f3f33', bodyDark: '#233027', crust: '#7fae52', crustDark: '#5d833c',
    grass: '#9cc85e', flower: '#ffd36e', rock: '#6b6a5d', rockDark: '#4a4a40',
    glow: '#ffe0a0', hazard: '#ff7a45',
  },
  hills: {
    skyTop: '#0e1722', skyBottom: '#93a7bb', sun: '#ffe9c9',
    far: '#3a4d60', far2: '#2c3c4c', near: '#263440', near2: '#1d2833',
    body: '#3b3c3e', bodyDark: '#2c2d30', crust: '#8a8065', crustDark: '#665f4b',
    grass: '#8aa05a', flower: '#e8d27a', rock: '#75726a', rockDark: '#514f49',
    glow: '#d7e3f2', hazard: '#ff7a45',
  },
  canyon: {
    skyTop: '#21141d', skyBottom: '#d06f44', sun: '#ffd59a',
    far: '#6d3a31', far2: '#552b27', near: '#40201d', near2: '#301815',
    body: '#6c342a', bodyDark: '#51251f', crust: '#c47c4b', crustDark: '#9a5b36',
    grass: '#8b9550', flower: '#ffb066', rock: '#7a3d2e', rockDark: '#55271e',
    glow: '#ffb37a', hazard: '#ff7a45',
  },
  cave: {
    skyTop: '#04060a', skyBottom: '#171d26', sun: '#b9ff7a',
    far: '#12161d', far2: '#0c1015', near: '#171b21', near2: '#101319',
    body: '#272c34', bodyDark: '#1b1f25', crust: '#3f4852', crustDark: '#2e353d',
    grass: '#5d7350', flower: '#b9ff7a', rock: '#343941', rockDark: '#22262c',
    glow: '#c8ff4d', hazard: '#ff7a45',
  },
  valley: {
    skyTop: '#122320', skyBottom: '#e9c988', sun: '#fff0bd',
    far: '#3d5a49', far2: '#304a3c', near: '#2a4437', near2: '#21382d',
    body: '#36503a', bodyDark: '#283c2c', crust: '#9bc06c', crustDark: '#769a4f',
    grass: '#b3d878', flower: '#ffe28a', rock: '#6d6a58', rockDark: '#4b4a3e',
    glow: '#ffe9a3', hazard: '#ff7a45',
  },
};

export function paletteFor(key) {
  return PALETTES[key] || PALETTES.meadow;
}

function hash01(n) {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = Number.parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export class Scenery {
  constructor() {
    this.w = 800;
    this.h = 540;
    this.skyCache = {};
    this.sunCache = {};
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.skyCache = {};
    this.sunCache = {};
  }

  skyGrad(ctx, key) {
    if (this.skyCache[key]) return this.skyCache[key];
    const p = paletteFor(key);
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, p.skyTop);
    g.addColorStop(0.62, p.skyBottom);
    g.addColorStop(1, p.skyBottom);
    this.skyCache[key] = g;
    return g;
  }

  // A soft radial sun cached per biome; drawn under a translate so it can sit
  // anywhere on screen without a hard glow edge.
  sunGrad(ctx, key) {
    if (this.sunCache[key]) return this.sunCache[key];
    const p = paletteFor(key);
    const r = this.h * 0.34;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(p.sun, 0.5));
    g.addColorStop(0.28, rgba(p.sun, 0.24));
    g.addColorStop(0.62, rgba(p.sun, 0.07));
    g.addColorStop(1, rgba(p.sun, 0));
    this.sunCache[key] = { grad: g, r };
    return this.sunCache[key];
  }

  drawBackground(ctx, index, camX, camY, time, alpha) {
    const biome = BIOMES[index] ? BIOMES[index].key : 'meadow';
    const p = paletteFor(biome);
    const w = this.w;
    const h = this.h;
    const horizon = h * 0.64 - camY * 0.04;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.skyGrad(ctx, biome);
    ctx.fillRect(0, 0, w, h);

    if (biome === 'cave') {
      this.drawCave(ctx, camX, camY, time, horizon);
      ctx.restore();
      return;
    }

    // Sun / low light.
    const sunX = w * 0.72 - ((camX * 0.02) % (w * 1.7));
    const sunY = h * 0.23;
    const sun = this.sunGrad(ctx, biome);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sunX, sunY);
    ctx.fillStyle = sun.grad;
    ctx.beginPath();
    ctx.arc(0, 0, sun.r, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = p.sun;
    ctx.beginPath();
    ctx.arc(0, 0, h * 0.05, 0, 6.283);
    ctx.fill();
    ctx.restore();

    if (biome === 'canyon') {
      this.ridge(ctx, p.far2, horizon + 20, 40, 90, camX * 0.06, 'mesa', alpha * 0.75);
      this.ridge(ctx, p.far, horizon + 80, 70, 130, camX * 0.12, 'mesa', alpha);
      this.ridge(ctx, p.near2, horizon + 160, 60, 105, camX * 0.24, 'mesa', alpha);
      this.dustHaze(ctx, p, camX, horizon, alpha);
    } else if (biome === 'hills') {
      this.ridge(ctx, p.far2, horizon - 40, 90, 140, camX * 0.05, 'peak', alpha * 0.8);
      this.ridge(ctx, p.far, horizon + 30, 70, 100, camX * 0.1, 'peak', alpha);
      this.ridge(ctx, p.near2, horizon + 140, 60, 80, camX * 0.22, 'peak', alpha);
      this.birds(ctx, camX, alpha);
    } else {
      this.ridge(ctx, p.far2, horizon - 10, 24, 160, camX * 0.05, 'roll', alpha * 0.75);
      this.ridge(ctx, p.far, horizon + 40, 20, 120, camX * 0.1, 'roll', alpha);
      this.ridge(ctx, p.near2, horizon + 130, 16, 100, camX * 0.2, 'roll', alpha);
      this.clouds(ctx, camX, time, alpha, biome === 'valley');
      if (biome === 'valley') this.rays(ctx, sunX, sunY, time, alpha);
    }
    ctx.restore();
  }

  ridge(ctx, color, baseY, amp, step, worldOffset, kind, alpha) {
    const w = this.w;
    const h = this.h;
    const off = worldOffset % (step * 8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-20, h + 80);
    if (kind === 'mesa') {
      const period = step * 3.2;
      const start = -((worldOffset % period) + period) % period;
      for (let bx = start - period; bx < w + period; bx += period) {
        const n = hash01(Math.floor((bx - start + worldOffset) / period) + 17);
        const top = baseY - 20 - n * amp;
        const mw = period * 0.62;
        const left = bx + period * 0.12;
        ctx.lineTo(left, baseY + 160);
        ctx.lineTo(left, top);
        ctx.lineTo(left + mw * 0.18, top - 12 - n * 10);
        ctx.lineTo(left + mw, top - 6);
        ctx.lineTo(left + mw, baseY + 160);
      }
    } else {
      for (let x = -20; x <= w + 20; x += step) {
        const wx = worldOffset + x + off * 0;
        let y;
        if (kind === 'peak') {
          y = baseY - amp * (0.55 + Math.abs(Math.sin(wx * 0.0016)) * 0.45
            + Math.abs(Math.sin(wx * 0.0041 + 1.7)) * 0.3);
        } else {
          y = baseY - amp * (0.5 + Math.sin(wx * 0.0013) * 0.3 + Math.sin(wx * 0.0034 + 2.1) * 0.2);
        }
        ctx.lineTo(x, y);
      }
    }
    ctx.lineTo(w + 40, h + 80);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  clouds(ctx, camX, time, alpha, extra) {
    const period = 460;
    const base = -((camX * 0.04) % period);
    ctx.save();
    ctx.fillStyle = 'rgba(255, 244, 224, 0.16)';
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 5; i += 1) {
      const x = base + i * period;
      const y = this.h * (0.14 + (i % 3) * 0.07);
      const s = 26 + (i % 3) * 12;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.8, s * 0.45, 0, 0, 6.283);
      ctx.ellipse(x + s * 0.5, y - s * 0.25, s * 1.1, s * 0.4, 0, 0, 6.283);
      ctx.ellipse(x - s * 0.7, y - s * 0.1, s * 0.9, s * 0.32, 0, 0, 6.283);
      ctx.fill();
    }
    if (extra) {
      ctx.fillStyle = 'rgba(255, 246, 210, 0.1)';
      for (let i = 0; i < 4; i += 1) {
        const x = base + i * period + 120;
        const y = this.h * 0.4 + Math.sin(time * 0.3 + i) * 4;
        ctx.beginPath();
        ctx.ellipse(x, y, 60, 8, 0, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  rays(ctx, sunX, sunY, time, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.055;
    ctx.fillStyle = '#fff1bd';
    for (let i = 0; i < 3; i += 1) {
      const a = -0.85 + i * 0.32 + Math.sin(time * 0.15 + i) * 0.03;
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(sunX + Math.cos(a) * this.h * 1.4, sunY + Math.sin(a) * this.h * 1.4 + 100);
      ctx.lineTo(sunX + Math.cos(a + 0.09) * this.h * 1.4, sunY + Math.sin(a + 0.09) * this.h * 1.4 + 100);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  birds(ctx, camX, alpha) {
    ctx.save();
    ctx.strokeStyle = 'rgba(20, 28, 36, 0.55)';
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = alpha;
    const base = -((camX * 0.06) % 720);
    for (let i = 0; i < 3; i += 1) {
      const x = base + i * 260 + 120;
      const y = this.h * 0.28 + (i % 2) * 24;
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.quadraticCurveTo(x - 2, y - 5, x, y);
      ctx.quadraticCurveTo(x + 2, y - 5, x + 7, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  dustHaze(ctx, p, camX, horizon, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.18;
    ctx.fillStyle = p.glow;
    const base = -((camX * 0.3) % 520);
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.ellipse(base + i * 520, horizon + 120, 260, 26, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCave(ctx, camX, camY, time) {
    const w = this.w;
    const h = this.h;
    ctx.save();
    // distant pillars
    ctx.fillStyle = 'rgba(9, 12, 17, 0.85)';
    const period = 430;
    const base = -((camX * 0.1) % period);
    for (let i = -1; i < 4; i += 1) {
      const x = base + i * period;
      const hh = 90 + hash01(i + 33) * 150;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 12, h - hh);
      ctx.lineTo(x + 34, h - hh - 18);
      ctx.lineTo(x + 58, h - hh);
      ctx.lineTo(x + 74, h);
      ctx.fill();
    }
    // glowing spots
    const period2 = 370;
    const base2 = -((camX * 0.22) % period2);
    for (let i = 0; i < 5; i += 1) {
      const x = base2 + i * period2 + 60;
      const y = h * 0.4 + Math.sin(i * 2.1) * h * 0.12;
      const pulse = 0.35 + Math.sin(time * 1.4 + i) * 0.15;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#b9ff7a';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = pulse * 0.18;
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, 6.283);
      ctx.fill();
    }
    // ceiling teeth
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#080b10';
    const period3 = 210;
    const base3 = -((camX * 0.16) % period3);
    for (let i = -1; i < 7; i += 1) {
      const x = base3 + i * period3;
      const len = 40 + hash01(i + 91) * 80;
      ctx.beginPath();
      ctx.moveTo(x - 18, -10);
      ctx.lineTo(x + 8, len);
      ctx.lineTo(x + 30, -10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  drawTerrain(ctx, world, camX, camY, viewW, viewH, time, glowLime, glowCoral) {
    const right = camX + viewW + 80;
    const bottom = camY + viewH + 60;
    const chunks = world.chunks;
    ctx.save();
    ctx.beginPath();
    // From the collapse front to past the right edge of the view. Measured from the camera: measured
    // from the front, a player far ahead of the collapse saw the world vanish on the right.
    ctx.rect(world.frontX, camY - 320, Math.max(0, camX + viewW + 400 - world.frontX), viewH + 700);
    ctx.clip();

    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i];
      if (c.endX < camX - 100 || c.startX > right) continue;
      const p = paletteFor(c.biome);
      for (let j = 0; j < c.platforms.length; j += 1) {
        const plat = c.platforms[j];
        if (plat.dead) continue;
        if (plat.x > right || plat.x + plat.w < camX - 60) continue;
        this.platform(ctx, plat, p, time, camY, viewH);
      }
    }

    for (let i = 0; i < chunks.length; i += 1) {
      const c = chunks[i];
      if (c.endX < camX - 100 || c.startX > right) continue;
      const p = paletteFor(c.biome);
      for (let j = 0; j < c.deco.length; j += 1) {
        const d = c.deco[j];
        if (d.x < camX - 40 || d.x > right) continue;
        drawDeco(ctx, d, time, p);
      }
      for (let j = 0; j < c.hazards.length; j += 1) {
        const hz = c.hazards[j];
        if (hz.x + hz.w < camX - 40 || hz.x > right) continue;
        if (hz.type === 'thorn') drawThorn(ctx, hz, time);
        else drawMud(ctx, hz, time);
      }
      for (let j = 0; j < c.pickups.length; j += 1) {
        const pk = c.pickups[j];
        if (pk.taken || pk.x < world.frontX + 10) continue;
        if (pk.x < camX - 50 || pk.x > right) continue;
        if (pk.type === 'heart') drawHeart(ctx, pk.x, pk.y, time, pk.phase, glowCoral);
        else drawCrystal(ctx, pk.x, pk.y, time, pk.phase, glowLime);
      }
      if (c.goalX && c.goalX < right && c.goalX > camX - 200) {
        drawGoal(ctx, c.goalX, c.topY, time);
      }
    }
    ctx.restore();
  }

  platform(ctx, p, palette, time, camY, viewH) {
    let x = p.x;
    let y = p.y;
    if (p.kind === 'crumble' && p.crumbleT >= 0) {
      x += Math.sin(time * 52) * 1.8;
      y += Math.cos(time * 44) * 1.1;
    }
    const visibleH = Math.min(p.h, camY + viewH + 80 - y);
    if (visibleH <= 0) return;
    if (p.kind === 'float' || p.kind === 'crumble') {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.ellipse(x + p.w * 0.5, y + visibleH + 5, p.w * 0.55, 4, 0, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = palette.body;
    ctx.fillRect(x, y, p.w, visibleH);
    const darkFrom = Math.min(30, visibleH * 0.5);
    ctx.fillStyle = palette.bodyDark;
    ctx.fillRect(x, y + darkFrom, p.w, visibleH - darkFrom);
    // Depth bands: the rock fades into the dark the further down it goes.
    const bands = [46, 120, 240, 400];
    for (let k = 0; k < bands.length; k += 1) {
      if (visibleH > bands[k]) {
        ctx.fillStyle = `rgba(0, 0, 0, ${0.08 + k * 0.05})`;
        ctx.fillRect(x, y + bands[k], p.w, visibleH - bands[k]);
      }
    }

    // left and right edge shading
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y, 2, visibleH);
    ctx.fillRect(x + p.w - 2, y, 2, visibleH);

    // top crust with a soft wobble
    const crust = Math.min(11, visibleH);
    ctx.fillStyle = palette.crust;
    ctx.beginPath();
    ctx.moveTo(x, y + crust + 2);
    const step = 24;
    for (let sx = 0; sx <= p.w + step; sx += step) {
      const xx = Math.min(x + p.w, x + sx);
      const yy = y + Math.sin((p.x + sx) * 0.031 + p.seed * 0.001) * 1.7;
      ctx.lineTo(xx, yy);
    }
    ctx.lineTo(x + p.w, y + crust + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.crustDark;
    ctx.fillRect(x, y + crust, p.w, 2);

    // body texture
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let k = 0; k < 5; k += 1) {
      const rx = x + 8 + hash01(p.seed + k * 13) * Math.max(1, p.w - 16);
      const ry = y + 18 + hash01(p.seed + k * 29) * Math.max(1, Math.min(visibleH - 24, 120));
      if (ry < y + visibleH - 2) ctx.fillRect(rx, ry, 1.6 + hash01(p.seed + k) * 2, 1.4);
    }
    if (p.kind === 'crumble') {
      ctx.strokeStyle = 'rgba(18, 15, 12, 0.55)';
      ctx.lineWidth = 1.2;
      const c1 = p.x + p.w * 0.3;
      ctx.beginPath();
      ctx.moveTo(c1, y + 3);
      ctx.lineTo(c1 + 5, y + 9);
      ctx.lineTo(c1 - 2, y + 16);
      ctx.stroke();
      const c2 = p.x + p.w * 0.68;
      ctx.beginPath();
      ctx.moveTo(c2, y + 2);
      ctx.lineTo(c2 - 4, y + 10);
      ctx.stroke();
    }
    ctx.fillStyle = palette.crustDark;
    if (p.kind === 'pillar') {
      // strata bands on tall cliff faces
      ctx.globalAlpha = 0.28;
      for (let k = 1; k < 4; k += 1) {
        const yy = y + 40 + k * 58;
        if (yy < camY + viewH) ctx.fillRect(x + 3, yy, p.w - 6, 1.2);
      }
      ctx.globalAlpha = 1;
    }
  }
}
