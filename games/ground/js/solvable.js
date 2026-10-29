// Independent geometric checker: every generated route must be crossable with
// run + jump + one wedge, judged against the physics limits from config.js.
import {
  PHYS, PLAYER, WEDGE, JUMP_HEIGHT, JUMP_DISTANCE,
  WEDGE_MAX_HEIGHT, LIMITS,
} from './config.js';

const G = PHYS.gravity;
const RUN = PHYS.runSpeed;
const VY = PHYS.jumpSpeed;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Height of a full-speed jump after travelling dx, before it drops below the takeoff.
function jumpHeightAt(dx) {
  const t = dx / RUN;
  return VY * t - 0.5 * G * t * t;
}

// Can the climber land on a surface `rise` above the takeoff, `dx` away?
export function jumpReaches(dx, rise) {
  if (rise < 0) {
    const drop = -rise;
    const t = (VY + Math.sqrt(VY * VY + 2 * G * drop)) / G;
    return dx <= RUN * t * 0.93;
  }
  // A near-vertical jump can drift onto a ledge a little to the side near the apex.
  if (dx <= 56) return rise <= JUMP_HEIGHT * 0.85;
  return jumpHeightAt(dx) >= rise + 8;
}

// Ballistic wedge envelope, sampled; dyUp is height above the throwing hand.
export function wedgeReaches(dx, dyUp) {
  if (dx <= 2) return dyUp <= WEDGE_MAX_HEIGHT * 0.95;
  const v = WEDGE.speed;
  const g = WEDGE.gravity;
  for (let deg = 8; deg <= 86; deg += 2) {
    const ang = (deg * Math.PI) / 180;
    const t = dx / (v * Math.cos(ang));
    const y = v * Math.sin(ang) * t - 0.5 * g * t * t;
    if (y >= dyUp + 4) return true;
  }
  return false;
}

export function jumpGapLimit(rise) {
  if (rise >= JUMP_HEIGHT * 0.85) return 16;
  let lo = 0;
  let hi = JUMP_DISTANCE * 1.6;
  for (let i = 0; i < 28; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (jumpReaches(mid, rise)) lo = mid; else hi = mid;
  }
  return lo;
}

function wedgeCross(a, b, gap) {
  if (gap <= 0 || gap > LIMITS.safeWedgeGap) return false;
  // A ledge can sit above the takeoff (jump up to it) or below it (drop onto it);
  // either way it must be on the target's left face.
  for (let up = 120; up >= -110; up -= 4) {
    const anchorY = a.y - up;
    if (anchorY < b.y + 6) continue;                       // above the target's top
    if (anchorY > b.y + Math.min(b.h, 420) - 6) continue;  // below its face
    const dxLedge = Math.max(0, gap - WEDGE.ledgeWidth + 6);
    if (!jumpReaches(dxLedge, up)) continue;
    const dyHand = (a.y - PLAYER.handHeight) - anchorY;
    if (!wedgeReaches(gap + 10, dyHand)) continue;
    if (!jumpReaches(WEDGE.ledgeWidth * 0.55, anchorY - b.y)) continue;
    return true;
  }
  return false;
}

function wedgeClimb(a, b) {
  const rise = a.y - b.y;
  if (rise <= 0) return true;
  if (rise <= JUMP_HEIGHT * 0.85) return jumpReaches(6, rise);
  let cur = a.y;
  let steps = 0;
  // Place ledges while the top is still too high for a jump from here.
  while (cur - b.y > JUMP_HEIGHT * 0.85 && steps < 6) {
    const step = Math.min(LIMITS.safeWedgeStep, cur - b.y);
    const anchorY = cur - step;
    if (anchorY < b.y + 6) return false;
    if (anchorY > b.y + Math.min(b.h, 420) - 6) return false;
    if (!wedgeReaches(22, (cur - PLAYER.handHeight) - anchorY)) return false;
    if (!jumpReaches(6, step)) return false;
    cur = anchorY;
    steps += 1;
  }
  if (steps === 0) return false;
  return jumpReaches(WEDGE.ledgeWidth * 0.55, cur - b.y);
}

// How a single route transition is crossed: walk, jump, drop, wedge or fail.
export function classifyTransition(a, b) {
  const gap = Math.max(0, b.x - (a.x + a.w));
  const rise = a.y - b.y;
  if (gap <= 8 && Math.abs(rise) <= 8) return 'walk';
  if (gap <= 8 && rise < 0) return 'drop';
  if (rise >= 0 && jumpReaches(gap, rise)) return 'jump';
  if (rise < 0 && jumpReaches(gap, rise)) return 'drop';
  if (gap > 8 && wedgeCross(a, b, gap)) return 'wedge';
  if (gap <= 8 && wedgeClimb(a, b)) return 'wedge-climb';
  return 'blocked';
}

function findPlatform(c, node) {
  for (let i = 0; i < c.platforms.length; i += 1) {
    const p = c.platforms[i];
    if (Math.abs(p.x - node.x) < 1.1 && Math.abs(p.y - node.y) < 1.1
      && Math.abs(p.w - node.w) < 1.1 && Math.abs(p.h - node.h) < 1.1) {
      return p;
    }
  }
  return null;
}

// Returns { ok, errors, stats } for one chunk (entry is the previous chunk's height).
export function checkChunk(c, entryTopY = c.topY) {
  const errors = [];
  const stats = { jumps: 0, drops: 0, wedge: 0, wedgeClimbs: 0, gapMax: 0, riseMax: 0 };
  if (!c.route.length) errors.push('no route');
  if (c.endX - c.startX < 900) errors.push('chunk too short');
  if (c.endX - c.startX > 5200) errors.push('chunk too long');
  if (c.topY < -320 || c.topY > 280 || c.nextY < -320 || c.nextY > 280) {
    errors.push(`height out of bounds: ${c.topY} -> ${c.nextY}`);
  }

  for (let i = 0; i < c.route.length; i += 1) {
    const node = c.route[i];
    if (node.x < c.startX - 1 || node.x + node.w > c.endX + 1) {
      errors.push(`route node ${i} outside chunk`);
    }
    if (!findPlatform(c, node)) errors.push(`route node ${i} has no platform`);
  }

  const entry = { x: c.startX - 300, y: entryTopY, w: 300, h: 780, kind: 'ground' };
  let prev = entry;
  const sequence = [entry, ...c.route];
  for (let i = 1; i < sequence.length; i += 1) {
    const a = sequence[i - 1];
    const b = sequence[i];
    const gap = Math.max(0, b.x - (a.x + a.w));
    const rise = a.y - b.y;
    stats.gapMax = Math.max(stats.gapMax, gap);
    stats.riseMax = Math.max(stats.riseMax, rise);
    const kind = classifyTransition(a, b);
    if (kind === 'blocked') {
      errors.push(`route ${i - 1}->${i} blocked (gap ${gap.toFixed(0)}, rise ${rise.toFixed(0)})`);
    } else if (kind === 'jump') stats.jumps += 1;
    else if (kind === 'drop') stats.drops += 1;
    else if (kind === 'wedge') stats.wedge += 1;
    else if (kind === 'wedge-climb') stats.wedgeClimbs += 1;
    prev = b;
  }
  if (prev.x + prev.w < c.endX - 2) errors.push('route does not reach the chunk end');

  for (let i = 0; i < c.pickups.length; i += 1) {
    const p = c.pickups[i];
    if (p.type !== 'heart') continue;
    let ok = false;
    for (let j = 0; j < c.route.length; j += 1) {
      const n = c.route[j];
      const inside = p.x >= n.x - 90 && p.x <= n.x + n.w + 90;
      const rise = n.y - p.y;
      if (inside && rise >= 30 && rise <= JUMP_HEIGHT * 0.85) ok = true;
    }
    if (!ok) errors.push('heart not reachable from the route');
    for (let j = 0; j < c.platforms.length; j += 1) {
      const pl = c.platforms[j];
      if (p.x > pl.x - 8 && p.x < pl.x + pl.w + 8 && p.y > pl.y - 8 && p.y < pl.y + pl.h + 8) {
        errors.push('heart inside a platform');
        break;
      }
    }
  }

  if (c.goalX) {
    let hasGoalGround = false;
    for (let i = 0; i < c.route.length; i += 1) {
      const n = c.route[i];
      if (c.goalX >= n.x && c.goalX <= n.x + n.w) hasGoalGround = true;
    }
    if (!hasGoalGround) errors.push('goal is not on a route platform');
  }

  return { ok: errors.length === 0, errors, stats };
}

export const MOVEMENT_LIMITS = {
  runSpeed: RUN,
  gravity: G,
  jumpHeight: JUMP_HEIGHT,
  jumpDistance: JUMP_DISTANCE,
  jumpRiseAt: jumpHeightAt,
  jumpGapLimit,
  wedgeStep: LIMITS.safeWedgeStep,
  wedgeGapMax: LIMITS.safeWedgeGap,
  wedgeHeight: WEDGE_MAX_HEIGHT,
};

export { clamp };
