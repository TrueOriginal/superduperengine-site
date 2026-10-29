// Procedural vector sprites: the climber, the wedge, pickups, hazards and the
// valley arch. Everything is drawn from paths; no image files.

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

// ------------------------------------------------------------------ climber

export function drawPlayer(ctx, p, time) {
  const blink = p.invuln > 0 && Math.floor(time * 18) % 2 === 0;
  const cx = p.x + p.w * 0.5;
  const feet = p.y + p.h;
  const sy = 1 + p.stretch * 0.14 - p.squash * 0.2;
  const sx = 1 - p.stretch * 0.08 + p.squash * 0.16;
  const run = p.onGround && Math.abs(p.vx) > 30;
  const swing = run ? Math.sin(p.anim * 6.2) : 0;
  const air = !p.onGround;

  ctx.save();
  ctx.globalAlpha = blink ? 0.35 : 1;
  ctx.translate(cx, feet);
  ctx.scale(p.facing * sx, sy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // long shadow on the ground
  if (p.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 13, 3.2, 0, 0, 6.283);
    ctx.fill();
  }

  // legs
  ctx.strokeStyle = '#20252d';
  ctx.lineWidth = 5.4;
  const legLift = air ? (p.wallSliding ? 4 : 6) : 0;
  ctx.beginPath();
  ctx.moveTo(-4, -18);
  if (air) {
    ctx.lineTo(-8 - legLift, -9);
    ctx.lineTo(-5, -2);
  } else {
    ctx.lineTo(-4 + swing * 6, -9);
    ctx.lineTo(-4 + swing * 9, -1);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, -18);
  if (air) {
    ctx.lineTo(8, -10);
    ctx.lineTo(6, -2);
  } else {
    ctx.lineTo(4 - swing * 6, -9);
    ctx.lineTo(4 - swing * 9, -1);
  }
  ctx.stroke();

  // backpack behind
  ctx.fillStyle = '#6b4a33';
  rr(ctx, -13, -34, 8, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#8a6242';
  rr(ctx, -12, -31, 5, 7, 1.5);
  ctx.fill();

  // torso: lime jacket
  ctx.fillStyle = '#c8ff4d';
  rr(ctx, -9, -36, 18, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#a6d63a';
  rr(ctx, -9, -22, 18, 6, 3);
  ctx.fill();
  // jacket zip
  ctx.strokeStyle = 'rgba(20,26,10,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(2, -34);
  ctx.lineTo(2, -21);
  ctx.stroke();

  // arms
  ctx.strokeStyle = '#c8ff4d';
  ctx.lineWidth = 4.6;
  ctx.beginPath();
  if (p.wallSliding) {
    ctx.moveTo(-7, -32);
    ctx.lineTo(-14, -30);
    ctx.lineTo(-15, -24);
  } else if (air) {
    ctx.moveTo(-7, -32);
    ctx.lineTo(-12, -37);
  } else {
    ctx.moveTo(-7, -32);
    ctx.lineTo(-10 + swing * 5, -24);
  }
  ctx.stroke();
  ctx.beginPath();
  if (air) {
    ctx.moveTo(7, -32);
    ctx.lineTo(12, -38);
  } else {
    ctx.moveTo(7, -32);
    ctx.lineTo(10 - swing * 5, -24);
  }
  ctx.stroke();
  // hands
  ctx.fillStyle = '#e8b98d';
  ctx.beginPath();
  ctx.arc(air ? 12 : 10 - swing * 5, air ? -38 : -24, 2.4, 0, 6.283);
  ctx.fill();

  // scarf
  ctx.fillStyle = '#ff7a45';
  ctx.beginPath();
  ctx.moveTo(-3, -38);
  ctx.lineTo(-13 - Math.sin(time * 7) * 2, -36 - (air ? 4 : 0));
  ctx.lineTo(-12, -32);
  ctx.lineTo(-3, -34);
  ctx.closePath();
  ctx.fill();
  rr(ctx, -5, -39, 11, 4, 2);
  ctx.fill();

  // head
  ctx.fillStyle = '#e9bd92';
  ctx.beginPath();
  ctx.arc(2, -42, 7.4, 0, 6.283);
  ctx.fill();
  // beanie
  ctx.fillStyle = '#ff7a45';
  ctx.beginPath();
  ctx.arc(2, -44, 7.6, Math.PI * 0.98, Math.PI * 2.02);
  ctx.fill();
  ctx.fillStyle = '#ff9468';
  rr(ctx, -6, -46, 16, 3.4, 1.6);
  ctx.fill();
  // eye
  ctx.fillStyle = '#262b2f';
  ctx.beginPath();
  ctx.arc(5.4, -41.4, 1.15, 0, 6.283);
  ctx.fill();

  ctx.restore();
}

// ------------------------------------------------------------------ wedge

export function drawLedge(ctx, ledge, time) {
  if (!ledge.active) return;
  const x = ledge.x;
  const y = ledge.y;
  const w = ledge.w;
  const h = ledge.h;
  ctx.save();
  // soft glow so the ledge reads as the player's tool
  ctx.globalAlpha = 0.16 + Math.sin(time * 4) * 0.04;
  ctx.fillStyle = '#c8ff4d';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + 6, w * 0.75, 16, 0, 0, 6.283);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#5c584f';
  rr(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = '#7d776a';
  rr(ctx, x + 1, y + 1, w - 2, 4, 2);
  ctx.fill();
  ctx.fillStyle = '#ff7a45';
  rr(ctx, x + 2, y, w - 4, 2.6, 1.3);
  ctx.fill();
  // little teeth under the shelf
  ctx.fillStyle = '#45423b';
  for (let i = 0; i < 4; i += 1) {
    const tx = x + 8 + i * (w - 16) / 3;
    ctx.beginPath();
    ctx.moveTo(tx - 3, y + h);
    ctx.lineTo(tx + 3, y + h);
    ctx.lineTo(tx, y + h + 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawWedge(ctx, wedge, time) {
  ctx.save();
  if (wedge.state === 'held') {
    ctx.translate(wedge.x, wedge.y);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#b9b3a4';
    ctx.beginPath();
    ctx.moveTo(-1, -5);
    ctx.lineTo(6, 0);
    ctx.lineTo(-1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath();
    ctx.moveTo(-1, -5);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-4, -2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3b3a35';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, -5);
    ctx.lineTo(6, 0);
    ctx.stroke();
  } else if (wedge.state === 'stuck' || wedge.state === 'unsticking') {
    const shake = wedge.state === 'unsticking' ? Math.sin(time * 80) * 2 : 0;
    ctx.translate(wedge.x + shake, wedge.y);
    ctx.rotate(wedge.angle + Math.PI);
    ctx.fillStyle = '#c4bdab';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(-7, -8);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 210, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -3);
    ctx.lineTo(9, 0);
    ctx.stroke();
  } else {
    // flying or returning: spinning piton with a coral ribbon
    ctx.translate(wedge.x, wedge.y);
    ctx.rotate(wedge.spin);
    ctx.fillStyle = '#d6cfbb';
    ctx.beginPath();
    ctx.moveTo(-7, -3);
    ctx.lineTo(7, 0);
    ctx.lineTo(-7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#454138';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(-14, -5, -13, 3);
    ctx.lineTo(-7, 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ pickups

export function drawCrystal(ctx, x, y, time, phase, glow) {
  const bob = Math.sin(time * 2.4 + phase) * 4;
  const pulse = 0.75 + Math.sin(time * 3 + phase) * 0.25;
  const cy = y + bob;
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.5 * pulse;
    ctx.drawImage(glow, x - 26, cy - 26, 52, 52);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, cy);
  ctx.scale(0.85 + pulse * 0.2, 0.85 + pulse * 0.2);
  ctx.fillStyle = '#8fd42f';
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(7, 0);
  ctx.lineTo(0, 12);
  ctx.lineTo(-7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d9ff7a';
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(-7, 0);
  ctx.lineTo(0, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(2.5, -2);
  ctx.lineTo(0, 1);
  ctx.lineTo(-2.5, -2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawHeart(ctx, x, y, time, phase, glow) {
  const bob = Math.sin(time * 2 + phase) * 4;
  const pulse = 0.8 + Math.sin(time * 3.4 + phase) * 0.2;
  const cy = y + bob;
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.55 * pulse;
    ctx.drawImage(glow, x - 30, cy - 30, 60, 60);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(x, cy);
  ctx.scale(1.25, 1.25);
  ctx.fillStyle = '#b9b1a0';
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.bezierCurveTo(-11, -1, -9, -10, -2, -9);
  ctx.bezierCurveTo(0, -9, 0, -7, 0, -7);
  ctx.bezierCurveTo(0, -7, 0, -9, 2, -9);
  ctx.bezierCurveTo(9, -10, 11, -1, 0, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ff7a45';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 200, 170, 0.5)';
  ctx.beginPath();
  ctx.ellipse(-3.5, -4, 2.4, 1.6, -0.5, 0, 6.283);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------ hazards

export function drawThorn(ctx, h, time) {
  const x = h.x;
  const y = h.y + h.h;
  const w = h.w;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + 1, w * 0.55, 3, 0, 0, 6.283);
  ctx.fill();
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const tx = x + 6 + (i / (n - 1)) * (w - 12);
    const sway = Math.sin(time * 1.8 + i) * 1.2;
    ctx.fillStyle = i % 2 === 0 ? '#5c6b3a' : '#6d7c44';
    ctx.beginPath();
    ctx.moveTo(tx - 7, y);
    ctx.lineTo(tx + sway, y - 26 - (i % 3) * 4);
    ctx.lineTo(tx + 7, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a45';
    ctx.beginPath();
    ctx.moveTo(tx + sway, y - 26 - (i % 3) * 4);
    ctx.lineTo(tx + sway - 2.4, y - 18 - (i % 3) * 4);
    ctx.lineTo(tx + sway + 2.4, y - 18 - (i % 3) * 4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#435128';
  rr(ctx, x + 4, y - 7, w - 8, 9, 4);
  ctx.fill();
  ctx.restore();
}

export function drawMud(ctx, h, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(38, 30, 20, 0.72)';
  ctx.beginPath();
  const x = h.x;
  const y = h.y + h.h;
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + h.w * 0.25, y - 7 - Math.sin(time * 2) * 1.5, x + h.w * 0.5, y - 4);
  ctx.quadraticCurveTo(x + h.w * 0.75, y - 1, x + h.w, y);
  ctx.lineTo(x + h.w, y + 6);
  ctx.lineTo(x, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(160, 140, 100, 0.28)';
  for (let i = 0; i < 3; i += 1) {
    const bx = x + 12 + ((i * 37 + time * 9) % Math.max(10, h.w - 24));
    ctx.beginPath();
    ctx.arc(bx, y + 1, 1.4 + (i % 2), 0, 6.283);
    ctx.fill();
  }
  ctx.restore();
}

export function drawRock(ctx, r) {
  ctx.save();
  ctx.translate(r.x, r.y);
  ctx.rotate(r.rot);
  const s = r.size;
  ctx.fillStyle = '#6f6b62';
  ctx.beginPath();
  ctx.moveTo(-s, -s * 0.3);
  ctx.lineTo(-s * 0.4, -s);
  ctx.lineTo(s * 0.7, -s * 0.8);
  ctx.lineTo(s, s * 0.2);
  ctx.lineTo(s * 0.2, s);
  ctx.lineTo(-s * 0.7, s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s);
  ctx.lineTo(s * 0.7, -s * 0.8);
  ctx.lineTo(0, -s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3f3c36';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -s * 0.5);
  ctx.lineTo(s * 0.15, 0);
  ctx.lineTo(-s * 0.2, s * 0.4);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ scenery

export function drawDeco(ctx, d, time, palette) {
  const x = d.x;
  const y = d.y;
  const s = d.s;
  ctx.save();
  if (d.type === 'anchor') {
    // Where a wedge holds: a glowing split in the rock that pulses, so it reads from afar.
    const pulse = 0.55 + 0.45 * Math.sin(time * 3 + d.seed);
    const halo = ctx.createRadialGradient(x, y, 2, x, y, 28);
    halo.addColorStop(0, `rgba(255, 190, 90, ${0.6 * pulse})`);
    halo.addColorStop(1, 'rgba(255, 170, 60, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 220, 160, ${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 14);
    ctx.lineTo(x - 3, y - 4);
    ctx.lineTo(x + 3, y + 3);
    ctx.lineTo(x - 1, y + 13);
    ctx.stroke();
  } else if (d.type === 'grass') {
    ctx.strokeStyle = palette.grass;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x + i * 3, y + 1);
      ctx.quadraticCurveTo(x + i * 5 + Math.sin(time * 1.6 + d.seed) * 2, y - 8 * s, x + i * 7, y - 13 * s);
      ctx.stroke();
    }
  } else if (d.type === 'tuft') {
    ctx.fillStyle = palette.grass;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 6 * s, 2.4 * s, 0, 0, 6.283);
    ctx.fill();
  } else if (d.type === 'flower') {
    ctx.strokeStyle = palette.grass;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 9 * s);
    ctx.stroke();
    ctx.fillStyle = palette.flower;
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * 6.283 + d.seed;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 3 * s, y - 9 * s + Math.sin(a) * 3 * s, 2.1 * s, 0, 6.283);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath();
    ctx.arc(x, y - 9 * s, 1.5 * s, 0, 6.283);
    ctx.fill();
  } else if (d.type === 'rock') {
    ctx.fillStyle = palette.rock;
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y + 1);
    ctx.lineTo(x - 4 * s, y - 6 * s);
    ctx.lineTo(x + 3 * s, y - 7 * s);
    ctx.lineTo(x + 8 * s, y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y - 6 * s);
    ctx.lineTo(x + 3 * s, y - 7 * s);
    ctx.lineTo(x, y - 3 * s);
    ctx.closePath();
    ctx.fill();
  } else if (d.type === 'crack') {
    ctx.strokeStyle = 'rgba(20, 18, 16, 0.35)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y + 7);
    ctx.lineTo(x + 4 * s, y + 14);
    ctx.lineTo(x + 1 * s, y + 20);
    ctx.stroke();
  } else if (d.type === 'mushroom') {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#3f4a33';
    ctx.fillRect(x - 1, y - 7 * s, 2, 7 * s);
    ctx.fillStyle = '#b9ff7a';
    ctx.beginPath();
    ctx.ellipse(x, y - 8 * s, 5 * s, 3.4 * s, 0, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 0.25 + Math.sin(time * 2 + d.seed) * 0.1;
    ctx.fillStyle = '#c8ff4d';
    ctx.beginPath();
    ctx.arc(x, y - 8 * s, 10 * s, 0, 6.283);
    ctx.fill();
  } else if (d.type === 'crystalPebble') {
    ctx.fillStyle = '#9fe24a';
    ctx.beginPath();
    ctx.moveTo(x, y - 8 * s);
    ctx.lineTo(x + 4 * s, y);
    ctx.lineTo(x - 4 * s, y);
    ctx.closePath();
    ctx.fill();
  } else if (d.type === 'stalactite') {
    ctx.fillStyle = palette.rockDark;
    ctx.beginPath();
    ctx.moveTo(x - 4 * s, y);
    ctx.lineTo(x, y + 18 * s);
    ctx.lineTo(x + 5 * s, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawGoal(ctx, goalX, groundY, time) {
  const x = goalX;
  const y = groundY;
  ctx.save();
  // light from beyond
  ctx.globalAlpha = 0.11 + Math.sin(time * 1.4) * 0.03;
  ctx.fillStyle = '#c8ff4d';
  ctx.beginPath();
  ctx.moveTo(x - 70, y);
  ctx.lineTo(x - 20, y - 250);
  ctx.lineTo(x + 20, y - 250);
  ctx.lineTo(x + 70, y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#4b4439';
  rr(ctx, x - 62, y - 210, 22, 212, 5);
  ctx.fill();
  rr(ctx, x + 40, y - 210, 22, 212, 5);
  ctx.fill();
  ctx.fillStyle = '#665d4d';
  rr(ctx, x - 66, y - 224, 132, 20, 5);
  ctx.fill();
  ctx.fillStyle = '#c8ff4d';
  rr(ctx, x - 58, y - 219, 116, 4, 2);
  ctx.fill();
  ctx.globalAlpha = 0.55 + Math.sin(time * 3) * 0.15;
  rr(ctx, x - 58, y - 219, 116, 4, 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // vines
  ctx.strokeStyle = '#55703f';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i += 1) {
    const vx = x - 48 + i * 32;
    ctx.beginPath();
    ctx.moveTo(vx, y - 204);
    ctx.quadraticCurveTo(vx + 5, y - 180 + Math.sin(time + i) * 2, vx - 2, y - 150);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200, 255, 77, 0.9)';
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.arc(x - 50 + i * 20, y - 226 + Math.sin(time * 2 + i) * 2, 1.6, 0, 6.283);
    ctx.fill();
  }
  ctx.restore();
}
