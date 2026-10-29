// Seeded chunked terrain for Landslide. Each chunk is one hand-shaped template with
// parameters kept inside the movement limits; the checker in solvable.js proves it.
import {
  BIOMES, GOAL_X, START_Y, WORLD_START_X, PLAYER, WEDGE, PHYS,
  LIMITS, biomeKeyAt,
} from './config.js';

const DEPTH = 780;
const HEIGHT_MIN = -300;
const HEIGHT_MAX = 260;

export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(a, b) {
  let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function chunkSeed(runSeed, index) {
  return hash2(runSeed, index);
}

function clampY(y) {
  return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, y));
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function newChunk(index, startX, topY, biome, seed) {
  return {
    index, seed, startX, endX: startX, topY, nextY: topY, biome,
    template: '', plateau: 0, goalX: 0, gapX: 0, wallX: 0,
    platforms: [], hazards: [], pickups: [], deco: [], route: [],
  };
}

function addPlatform(c, x, y, w, h, kind) {
  const p = {
    x, y, w, h, kind, dead: false,
    seed: hash2(c.seed, Math.floor(x + y * 7 + w)),
    crumbleT: -1,   // -1 idle, >= 0 running, 1 broken
  };
  c.platforms.push(p);
  return p;
}

function makeGround(c, x, y, w) {
  addPlatform(c, x, y, w, DEPTH, 'ground');
  c.route.push({ x, y, w, h: DEPTH, kind: 'ground' });
}

function makePillar(c, x, y, w) {
  addPlatform(c, x, y, w, DEPTH, 'pillar');
  c.route.push({ x, y, w, h: DEPTH, kind: 'pillar' });
}

function makeFloat(c, x, y, w, h, kind, onRoute) {
  addPlatform(c, x, y, w, h, kind);
  if (onRoute) c.route.push({ x, y, w, h, kind });
}

function crystal(c, x, y) {
  c.pickups.push({ type: 'crystal', x, y, phase: (x * 0.013 + y * 0.031) % 6.283 });
}

function crystalArc(c, cx, cy, count, spacing) {
  for (let i = 0; i < count; i += 1) {
    crystal(c, cx + i * spacing, cy - Math.sin((i / (count - 1 || 1)) * Math.PI) * 22);
  }
}

function thorn(c, x, y, w = 68) {
  c.hazards.push({ type: 'thorn', x: x - w / 2, y: y - 30, w, h: 30 });
}

function mud(c, x, y, w) {
  c.hazards.push({ type: 'mud', x: x - w / 2, y: y - 12, w, h: 18 });
}

function dress(c, rng, x, y, w) {
  const n = Math.max(2, Math.floor(w / 230));
  for (let i = 0; i < n; i += 1) {
    const r = rng();
    let type = 'rock';
    if (c.biome === 'meadow' || c.biome === 'valley') {
      type = r < 0.5 ? 'grass' : r < 0.72 ? 'flower' : r < 0.9 ? 'rock' : 'tuft';
    } else if (c.biome === 'hills') {
      type = r < 0.42 ? 'grass' : r < 0.68 ? 'rock' : r < 0.85 ? 'tuft' : 'flower';
    } else if (c.biome === 'canyon') {
      type = r < 0.46 ? 'rock' : r < 0.7 ? 'crack' : r < 0.88 ? 'tuft' : 'grass';
    } else if (c.biome === 'cave') {
      type = r < 0.45 ? 'mushroom' : r < 0.7 ? 'rock' : r < 0.9 ? 'crack' : 'crystalPebble';
    }
    c.deco.push({
      type,
      x: x + 24 + rng() * (w - 48),
      y,
      s: 0.7 + rng() * 0.9,
      seed: rng() * 1000,
    });
  }
}

// A glowing crack on a wall face: where a thrown wedge makes the step this template needs.
function anchor(c, x, y) {
  c.deco.push({ type: 'anchor', x, y, s: 1, seed: x % 1000 });
}

function caveDress(c, rng, x, y, w) {
  dress(c, rng, x, y, w);
  const n = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i += 1) {
    c.deco.push({
      type: 'stalactite',
      x: x + 60 + rng() * Math.max(1, w - 120),
      y: y + 30,
      s: 0.6 + rng() * 1.1,
      seed: rng() * 1000,
    });
  }
}

// ---------------------------------------------------------------- templates

function tplFlat(c, rng, x, y) {
  const w = 2200 + Math.floor(rng() * 720);
  makeGround(c, x, y, w);
  dress(c, rng, x, y, w);
  const arcs = 1 + Math.floor(rng() * 2);
  for (let i = 0; i < arcs; i += 1) {
    crystalArc(c, x + 520 + rng() * (w - 1100), y - 100, 3, 54);
  }
  if (c.biome === 'meadow' && rng() < 0.42) mud(c, x + w * 0.55, y, 170 + rng() * 130);
  if (c.biome !== 'valley' && rng() < (c.biome === 'meadow' ? 0.42 : 0.28)) {
    thorn(c, x + w * 0.76, y);
  }
  c.endX = x + w;
  c.nextY = y;
  c.template = 'flat';
}

function tplGaps(c, rng, x, y) {
  let cx = x;
  let cy = y;
  const segments = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < segments; i += 1) {
    const segW = 360 + Math.floor(rng() * 300);
    makeGround(c, cx, cy, segW);
    dress(c, rng, cx, cy, segW);
    cx += segW;
    if (i < segments - 1) {
      const gap = 135 + Math.floor(rng() * 65);
      const ny = clampY(cy + (rng() * 2 - 1) * 70);
      crystalArc(c, cx + gap / 2 - 54, Math.min(cy, ny) - 95, 3, 54);
      cx += gap;
      cy = ny;
    }
  }
  const tail = 340 + Math.floor(rng() * 180);
  makeGround(c, cx, cy, tail);
  dress(c, rng, cx, cy, tail);
  c.endX = cx + tail;
  c.nextY = cy;
  c.template = 'gaps';
}

function tplSteps(c, rng, x, y) {
  const down = y > 100 ? true : y < -100 ? false : rng() < 0.5;
  let cx = x;
  let cy = y;
  makeGround(c, cx, y, 260);
  cx += 260;
  for (let i = 0; i < 3; i += 1) {
    const stepW = 380 + Math.floor(rng() * 260);
    const rise = 70 + Math.floor(rng() * 46);
    cy = clampY(down ? cy + rise : cy - rise);
    makeGround(c, cx, cy, stepW);
    dress(c, rng, cx, cy, stepW);
    if (rng() < 0.62) crystalArc(c, cx + stepW / 2 - 54, cy - 82, 2, 54);
    cx += stepW;
  }
  const tail = 340 + Math.floor(rng() * 160);
  makeGround(c, cx, cy, tail);
  dress(c, rng, cx, cy, tail);
  c.endX = cx + tail;
  c.nextY = cy;
  c.template = 'steps';
}

function tplMud(c, rng, x, y) {
  const w = 2500 + Math.floor(rng() * 400);
  makeGround(c, x, y, w);
  dress(c, rng, x, y, w);
  mud(c, x + w * 0.36, y, 190 + rng() * 150);
  mud(c, x + w * 0.68, y, 160 + rng() * 120);
  crystalArc(c, x + w * 0.5 - 81, y - 120, 4, 54);
  if (rng() < 0.5) thorn(c, x + w * 0.86, y);
  c.endX = x + w;
  c.nextY = y;
  c.template = 'mud';
}

function tplThornRun(c, rng, x, y) {
  const w = 2600 + Math.floor(rng() * 380);
  makeGround(c, x, y, w);
  dress(c, rng, x, y, w);
  const spots = [0.3, 0.62, 0.84];
  const count = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < count; i += 1) {
    const t = spots[i];
    thorn(c, x + w * t, y);
    crystalArc(c, x + w * t - 54, y - 120, 3, 54);
  }
  c.endX = x + w;
  c.nextY = y;
  c.template = 'thorn';
}

function tplCrumble(c, rng, x, y) {
  let cx = x;
  let cy = y;
  makeGround(c, cx, y, 480);
  dress(c, rng, cx, y, 480);
  cx += 480;
  for (let i = 0; i < 3; i += 1) {
    cx += 95 + Math.floor(rng() * 40);
    const fw = 112 + Math.floor(rng() * 38);
    cy = clampY(cy + (rng() * 2 - 1) * 30);
    makeFloat(c, cx, cy, fw, 26, 'crumble', true);
    crystal(c, cx + fw / 2, cy - 84);
    cx += fw;
  }
  cx += 120;
  const landing = 560 + Math.floor(rng() * 180);
  makeGround(c, cx, cy, landing);
  dress(c, rng, cx, cy, landing);
  c.endX = cx + landing;
  c.nextY = cy;
  c.template = 'crumble';
}

function tplCliff(c, rng, x, y) {
  let cx = x;
  makeGround(c, cx, y, 560);
  dress(c, rng, cx, y, 560);
  cx += 560;

  const rise = 180 + Math.floor(rng() * 70);
  const top = clampY(y - rise);
  const wallW = 230 + Math.floor(rng() * 90);
  makePillar(c, cx, top, wallW);
  anchor(c, cx + 3, y - 105);
  c.wallX = cx;
  cx += wallW;

  const plateau = 380 + Math.floor(rng() * 240);
  makeGround(c, cx, top, plateau);
  dress(c, rng, cx, top, plateau);
  crystalArc(c, cx + plateau / 2 - 81, top - 92, 4, 54);
  crystal(c, cx + plateau * 0.85, top - 150);
  cx += plateau;

  let cy = top;
  for (let i = 0; i < 2; i += 1) {
    cy = clampY(cy + (y - cy) * 0.56);
    const sw = 250 + Math.floor(rng() * 160);
    makeGround(c, cx, cy, sw);
    dress(c, rng, cx, cy, sw);
    cx += sw;
  }
  const tail = 330 + Math.floor(rng() * 160);
  makeGround(c, cx, cy, tail);
  dress(c, rng, cx, cy, tail);
  c.endX = cx + tail;
  c.nextY = cy;
  c.template = 'cliff';
}

function tplChasm(c, rng, x, y) {
  let cx = x;
  makeGround(c, cx, y, 540);
  dress(c, rng, cx, y, 540);
  cx += 540;
  const gap = 252 + Math.floor(rng() * 25);
  const ny = clampY(y + (rng() * 2 - 1) * 40);
  crystalArc(c, cx + gap / 2 - 54, Math.min(y, ny) - 112, 3, 54);
  cx += gap;
  anchor(c, cx + 3, ny + 40);
  c.gapX = cx - gap;
  const landing = 640 + Math.floor(rng() * 200);
  makeGround(c, cx, ny, landing);
  dress(c, rng, cx, ny, landing);
  c.endX = cx + landing;
  c.nextY = ny;
  c.template = 'chasm';
}

function tplPillar(c, rng, x, y) {
  let cx = x;
  makeGround(c, cx, y, 480);
  dress(c, rng, cx, y, 480);
  cx += 480;

  const gap1 = 250 + Math.floor(rng() * 21);
  cx += gap1;
  const pw = 220 + Math.floor(rng() * 90);
  const ptop = clampY(y - (40 + Math.floor(rng() * 21)));
  makePillar(c, cx, ptop, pw);
  anchor(c, cx + 3, ptop + 40);
  c.gapX = cx - gap1;
  crystalArc(c, cx + pw / 2 - 54, ptop - 96, 3, 54);
  cx += pw;

  cx += 250 + Math.floor(rng() * 21);
  const ny = clampY(ptop + (rng() * 2 - 1) * 40);
  anchor(c, cx + 3, ny + 40);
  const landing = 560 + Math.floor(rng() * 200);
  makeGround(c, cx, ny, landing);
  dress(c, rng, cx, ny, landing);
  c.endX = cx + landing;
  c.nextY = ny;
  c.template = 'pillar';
}

function tplCave(c, rng, x, y) {
  let cx = x;
  let cy = y;
  makeGround(c, cx, cy, 420);
  caveDress(c, rng, cx, cy, 420);
  cx += 420;

  cx += 135 + Math.floor(rng() * 30);
  const fw1 = 170 + Math.floor(rng() * 50);
  cy = clampY(cy - 55);
  makeFloat(c, cx, cy, fw1, 30, 'float', true);
  crystal(c, cx + fw1 / 2, cy - 84);
  cx += fw1;

  cx += 130 + Math.floor(rng() * 35);
  const mid = 400 + Math.floor(rng() * 120);
  cy = clampY(cy - 35);
  makeGround(c, cx, cy, mid);
  caveDress(c, rng, cx, cy, mid);
  if (rng() < 0.5) thorn(c, cx + mid * 0.72, cy, 58);
  cx += mid;

  cx += 160 + Math.floor(rng() * 40);
  const ground2 = 430 + Math.floor(rng() * 160);
  const cy2 = clampY(cy - 30);
  makeGround(c, cx, cy2, ground2);
  caveDress(c, rng, cx, cy2, ground2);
  crystalArc(c, cx + 120, cy2 - 96, 3, 54);
  cx += ground2;

  const drop = 120 + Math.floor(rng() * 80);
  const cy3 = clampY(cy2 + drop);
  const tail = 360 + Math.floor(rng() * 160);
  makeGround(c, cx, cy3, tail);
  caveDress(c, rng, cx, cy3, tail);
  c.endX = cx + tail;
  c.nextY = cy3;
  c.template = 'cave';
}

function tplValley(c, rng, x, y) {
  const w = 2500 + Math.floor(rng() * 500);
  makeGround(c, x, y, w);
  dress(c, rng, x, y, w);
  crystalArc(c, x + w * 0.35, y - 100, 3, 60);
  crystalArc(c, x + w * 0.7, y - 120, 3, 60);
  c.endX = x + w;
  c.nextY = y;
  c.template = 'valley';
}

function tplFinale(c, rng, x, y) {
  const w = GOAL_X + 760 - x;
  makeGround(c, x, y, w);
  c.goalX = GOAL_X;
  c.plateau = GOAL_X;
  for (let i = 0; i < 9; i += 1) {
    crystal(c, GOAL_X - 1560 + i * 170, y - 96 - (i % 3) * 28);
  }
  dress(c, rng, x, y, w);
  c.endX = x + w;
  c.nextY = y;
  c.template = 'finale';
}

// ---------------------------------------------------------------- selection

const TEMPLATES = {
  flat: tplFlat,
  gaps: tplGaps,
  steps: tplSteps,
  mud: tplMud,
  thorn: tplThornRun,
  crumble: tplCrumble,
  cliff: tplCliff,
  chasm: tplChasm,
  pillar: tplPillar,
  cave: tplCave,
  valley: tplValley,
  finale: tplFinale,
};

// Weights per biome; cliff is skipped when the terrain is already high.
const MENU = {
  meadow: [['flat', 4], ['gaps', 3], ['mud', 2], ['thorn', 2], ['crumble', 2], ['steps', 1]],
  hills: [['flat', 1], ['gaps', 2], ['steps', 3], ['crumble', 2], ['cliff', 2], ['thorn', 1]],
  canyon: [['gaps', 1], ['steps', 1], ['cliff', 2], ['chasm', 3], ['pillar', 3], ['crumble', 1]],
  cave: [['flat', 1], ['gaps', 2], ['cave', 3], ['cliff', 2], ['crumble', 2], ['thorn', 1]],
  valley: [['valley', 1], ['flat', 1]],
};

function pickTemplate(biome, rng, topY) {
  const menu = MENU[biome] || MENU.meadow;
  let total = 0;
  for (let i = 0; i < menu.length; i += 1) {
    const [key] = menu[i];
    if (key === 'cliff' && topY < -120) continue;
    total += menu[i][1];
  }
  let roll = rng() * total;
  for (let i = 0; i < menu.length; i += 1) {
    const [key, weight] = menu[i];
    if (key === 'cliff' && topY < -120) continue;
    roll -= weight;
    if (roll <= 0) return key;
  }
  return menu[0][0];
}

export function generateChunk(runSeed, index, startX, topY, biomeOverride, forceTemplate) {
  const seed = chunkSeed(runSeed, index);
  const rng = makeRng(seed);
  const finale = !biomeOverride && startX >= GOAL_X - 3400;
  const biome = finale ? 'valley' : (biomeOverride || biomeKeyAt(startX));
  const c = newChunk(index, startX, topY, biome, seed);
  const key = finale ? 'finale' : (forceTemplate || pickTemplate(biome, rng, topY));
  TEMPLATES[key](c, rng, startX, topY);
  c.template = key;

  if (!finale && rng() < 0.085 && c.route.length) {
    const node = c.route[Math.floor(rng() * c.route.length)];
    if (node.w >= 180) {
      c.pickups.push({
        type: 'heart',
        x: node.x + node.w * 0.5,
        y: node.y - 92,
        phase: rng() * 6.283,
      });
    }
  }
  c.endX = Math.round(c.endX);
  c.nextY = Math.round(c.nextY);
  return c;
}

// Generates the whole run up to the valley; used by tests and the length check.
export function generateRun(runSeed, untilX = GOAL_X + 760) {
  const chunks = [];
  let x = WORLD_START_X;
  let y = START_Y;
  let index = 0;
  while (x < untilX && chunks.length < 64) {
    const c = generateChunk(runSeed, index, x, y);
    chunks.push(c);
    x = c.endX;
    y = c.nextY;
    index += 1;
    if (c.goalX) break;
  }
  return chunks;
}

export const HEIGHT_BOUNDS = { min: HEIGHT_MIN, max: HEIGHT_MAX };
export const BIOME_KEYS = BIOMES.map((b) => b.key);

// Re-exported for the checker so tuning stays in one place.
export { LIMITS, PHYS, PLAYER, WEDGE };
