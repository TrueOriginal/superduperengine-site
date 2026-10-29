// Shared tuning for Landslide: physics limits, wedge, biomes, scoring. Pure, no DOM.

export const FIXED_DT = 1 / 120;
export const VIEW_HEIGHT = 540;          // world units visible vertically
export const DPR_CAP = 2;
export const WORLD_START_X = -420;
export const START_X = 260;
export const START_Y = 0;

export const PHYS = {
  gravity: 2600,
  runSpeed: 360,
  groundAccel: 3400,
  groundDecel: 3800,
  airAccel: 2100,
  airDecel: 900,
  jumpSpeed: 880,
  jumpCut: 0.45,
  coyote: 0.09,
  buffer: 0.13,
  maxFall: 1080,
  wallSlide: 90,
  wallJumpX: 340,
  wallJumpY: 800,
  mudSpeed: 160,
  mudFactor: 0.45,
};

export const PLAYER = { w: 30, h: 44, handHeight: 28 };

// Ballistic limits, derived from physics so the generator and the checker stay in sync.
export const JUMP_HEIGHT = (PHYS.jumpSpeed * PHYS.jumpSpeed) / (2 * PHYS.gravity);   // ~149
export const JUMP_DISTANCE = (2 * PHYS.jumpSpeed / PHYS.gravity) * PHYS.runSpeed;     // ~244

export const WEDGE = {
  speed: 1080,
  gravity: 1900,
  radius: 11,
  ledgeWidth: 76,
  ledgeHeight: 14,
  returnSpeed: 1450,
  recallDelay: 0.12,      // ledge stays solid briefly after recall, so a jump-off reads fairly
  cooldown: 0.08,
  maxFlight: 4,
};

export const WEDGE_MAX_RANGE = (WEDGE.speed * WEDGE.speed) / WEDGE.gravity;           // ~614 at 45 deg
export const WEDGE_MAX_HEIGHT = (WEDGE.speed * WEDGE.speed) / (2 * WEDGE.gravity);     // ~307 straight up
export const WEDGE_STEP_MAX = 125;  // highest a wedge ledge may sit above the feet to jump onto

export const LIMITS = {
  jumpHeight: JUMP_HEIGHT,
  jumpDistance: JUMP_DISTANCE,
  wedgeRange: WEDGE_MAX_RANGE,
  wedgeHeight: WEDGE_MAX_HEIGHT,
  // Conservative values used by the chunk checker.
  safeJumpRise: JUMP_HEIGHT * 0.85,
  safeJumpGap: JUMP_DISTANCE * 0.88,
  safeWedgeGap: 300,
  safeWedgeStep: WEDGE_STEP_MAX,
};

export const BIOMES = [
  { key: 'meadow', length: 20000 },
  { key: 'hills', length: 17000 },
  { key: 'canyon', length: 18000 },
  { key: 'cave', length: 18000 },
  { key: 'valley', length: 8000 },
];

export const BIOME_STARTS = [];
{
  let at = 0;
  for (const biome of BIOMES) {
    BIOME_STARTS.push(at);
    at += biome.length;
  }
}
export const TOTAL_LENGTH = BIOME_STARTS[BIOME_STARTS.length - 1] + BIOMES[BIOMES.length - 1].length;
export const GOAL_X = TOTAL_LENGTH; // 81 000 px, the valley arch

export const COLLAPSE = {
  // The front must roughly match a competent pace (the run averages ~300 px/s
  // including jumps and wedge climbs) or the chase is decorative. It stays
  // slower than flat running (360), so running builds a buffer that the slow
  // parts spend.
  startGap: 700,
  baseSpeed: 235,
  endSpeed: 335,
  catchX: 18,
  debrisRate: 26,
};

export const SCORE = {
  crystal: 25,
  heartFull: 40,
  hitLeft: 100,
  finish: 500,
};

export const STORAGE = {
  best: 'sde.game.ground.best',
  muted: 'sde.game.ground.muted',
};

export function biomeIndexAt(x) {
  if (x <= 0) return 0;
  for (let i = BIOMES.length - 1; i >= 0; i -= 1) {
    if (x >= BIOME_STARTS[i]) return i;
  }
  return 0;
}

export function biomeKeyAt(x) {
  return BIOMES[biomeIndexAt(x)].key;
}

// Where the debug query flag drops the player: the floor of each biome.
export function biomeStartX(index) {
  const clamped = Math.max(0, Math.min(BIOMES.length - 1, index));
  return BIOME_STARTS[clamped];
}
