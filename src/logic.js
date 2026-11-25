// logic.js — pure game state for Tamagotchi Elon Man.
// No DOM, no Phaser, no Date.now(): every function takes the time it needs.
// Runs unchanged in the browser, in Node tests, or on a host driving the real robot.

export const STATS = ['food', 'fun', 'energy', 'sleep', 'clean'];
export const MIN = 0;
export const MAX = 100;
export const SAVE_VERSION = 1;

const MIN_MS = 60_000;

export const CONFIG = {
  // Loss per minute while awake. Full -> empty in roughly 1h50 (food) to 4h40 (energy).
  decayPerMin: { food: 0.9, fun: 0.75, energy: 0.35, sleep: 0.5, clean: 0.45 },
  // While sleeping: sleep and energy refill, the rest decays slowly.
  sleepingPerMin: { food: -0.25, fun: -0.15, energy: +1.2, sleep: +2.2, clean: -0.1 },
  // Offline catch-up: capped, slower, and the pet is never left in a dead-end.
  offlineCapMs: 8 * 60 * MIN_MS,
  offlineRate: 0.4,
  offlineFloor: 12,
  wakeAt: 100, // sleeping stops by itself when "sleep" is full
  // Thresholds
  low: 30,
  critical: 20,
  happyMin: 55,
  happyAvg: 70,
  sadAvg: 35,
  actions: {
    feed:  { food: +30, energy: +5, clean: -4 },
    play:  { fun: +28, energy: -12, food: -6, clean: -6, sleep: -4 },
    clean: { clean: +45, fun: -2 },
  },
  // refusals
  feedFullAt: 95,
  playMinEnergy: 10,
  cleanFullAt: 95,
};

export const clamp = (v, lo = MIN, hi = MAX) => Math.min(hi, Math.max(lo, v));

export function createState(now) {
  return {
    v: SAVE_VERSION,
    food: 80, fun: 80, energy: 90, sleep: 90, clean: 90,
    sleeping: false,
    born: now,
    updatedAt: now,
    cares: 0, // number of successful actions, shown as a small counter
  };
}

const clampAll = (s) => {
  const o = { ...s };
  for (const k of STATS) o[k] = clamp(Number.isFinite(o[k]) ? o[k] : 50);
  return o;
};

// Advance the simulation by dtMs of awake/asleep time. Returns a new state.
// rate scales the decay (1 = live, <1 = offline). floor keeps a stat from dropping below it
// (only applied if the stat is currently above it).
export function tick(state, dtMs, { rate = 1, floor = MIN } = {}) {
  if (!(dtMs > 0)) return { ...state };
  let s = { ...state };
  let remaining = dtMs;
  // Step in chunks of at most 1 minute so auto-wake happens at the right moment.
  while (remaining > 0) {
    const step = Math.min(remaining, MIN_MS);
    const m = step / MIN_MS;
    for (const k of STATS) {
      let d = s.sleeping ? CONFIG.sleepingPerMin[k] * m : -CONFIG.decayPerMin[k] * m * rate;
      if (s.sleeping && d < 0) d *= rate; // sleeping gains are never slowed, only losses
      const lo = d < 0 ? Math.min(s[k], floor) : MIN;
      s[k] = clamp(Math.max(s[k] + d, lo));
    }
    if (s.sleeping && s.sleep >= CONFIG.wakeAt) s.sleeping = false;
    remaining -= step;
  }
  return s;
}

// Apply the time elapsed since state.updatedAt. Live play calls this every frame with small gaps;
// after a reload / tab revival the gap is large and gets the offline treatment.
export function catchUp(state, now, { liveGapMs = 5 * MIN_MS } = {}) {
  let elapsed = now - state.updatedAt;
  if (!Number.isFinite(elapsed) || elapsed <= 0) return { ...state, updatedAt: Math.max(state.updatedAt, Number.isFinite(now) ? now : state.updatedAt) };
  const offline = elapsed > liveGapMs;
  elapsed = Math.min(elapsed, CONFIG.offlineCapMs);
  const s = tick(state, elapsed, offline ? { rate: CONFIG.offlineRate, floor: CONFIG.offlineFloor } : {});
  return { ...s, updatedAt: now };
}

// ---- actions ----
export const ACTIONS = ['feed', 'play', 'sleep', 'clean'];

const MSG = {
  feedOk: 'Miam ! Ça fait du bien.',
  feedFull: "Il n'a plus faim.",
  playOk: 'On joue ! Yahou !',
  playTired: 'Trop fatigué pour jouer…',
  sleepOn: 'Zzz… bonne nuit.',
  sleepOff: 'Bon matin !',
  cleanOk: 'Tout propre, tout beau !',
  cleanDone: "Il est déjà reluisant.",
  asleep: 'Chut… il dort.',
};

// Returns { state, ok, msg, event }. event is what the UI animates: eat | play | sleep | wake | clean | null
export function act(state, action, now) {
  const s0 = catchUp(state, now);
  const fail = (msg) => ({ state: s0, ok: false, msg, event: null });
  const apply = (deltas, extra = {}) => {
    const s = { ...s0, ...extra };
    for (const [k, d] of Object.entries(deltas)) s[k] = clamp(s[k] + d);
    s.cares = s0.cares + 1;
    return clampAll(s);
  };

  switch (action) {
    case 'feed':
      if (s0.sleeping) return fail(MSG.asleep);
      if (s0.food >= CONFIG.feedFullAt) return fail(MSG.feedFull);
      return { state: apply(CONFIG.actions.feed), ok: true, msg: MSG.feedOk, event: 'eat' };
    case 'play':
      if (s0.sleeping) return fail(MSG.asleep);
      if (s0.energy < CONFIG.playMinEnergy) return fail(MSG.playTired);
      return { state: apply(CONFIG.actions.play), ok: true, msg: MSG.playOk, event: 'play' };
    case 'clean':
      if (s0.sleeping) return fail(MSG.asleep);
      if (s0.clean >= CONFIG.cleanFullAt) return fail(MSG.cleanDone);
      return { state: apply(CONFIG.actions.clean), ok: true, msg: MSG.cleanOk, event: 'clean' };
    case 'sleep':
      if (s0.sleeping) return { state: { ...s0, sleeping: false }, ok: true, msg: MSG.sleepOff, event: 'wake' };
      return { state: { ...s0, sleeping: true, cares: s0.cares + 1 }, ok: true, msg: MSG.sleepOn, event: 'sleep' };
    default:
      return fail('Action inconnue.');
  }
}

// ---- mood ----
export const MOODS = ['happy', 'idle', 'hungry', 'sleepy', 'sad', 'bored', 'dirty', 'sleeping'];

export const average = (s) => STATS.reduce((a, k) => a + s[k], 0) / STATS.length;

// Which need shouts the loudest? Returns the lowest stat if under `low`, else null.
export function worstNeed(s) {
  let worst = null;
  for (const k of STATS) if (s[k] < CONFIG.low && (worst === null || s[k] < s[worst])) worst = k;
  return worst;
}

export function moodOf(s) {
  if (s.sleeping) return 'sleeping';
  const critical = STATS.filter((k) => s[k] < CONFIG.critical).length;
  if (critical >= 2 || average(s) < CONFIG.sadAvg) return 'sad';
  const need = worstNeed(s);
  if (need === 'food') return 'hungry';
  if (need === 'sleep' || need === 'energy') return 'sleepy';
  if (need === 'fun') return 'bored';
  if (need === 'clean') return 'dirty';
  if (Math.min(...STATS.map((k) => s[k])) >= CONFIG.happyMin && average(s) >= CONFIG.happyAvg) return 'happy';
  return 'idle';
}

export const MOOD_LINES = {
  happy: 'Il est de bonne humeur !',
  idle: 'Tout va bien.',
  hungry: "J'ai la dalle…",
  sleepy: "Je suis crevé…",
  sad: 'Il est triste…',
  bored: "Je m'ennuie…",
  dirty: 'Beurk, je suis sale.',
  sleeping: 'Zzz…',
};

// ---- save / load ----
export function serialize(state) {
  return JSON.stringify(state);
}

// Parse a saved string, validate, clamp, and apply offline catch-up. Bad data -> fresh pet.
export function deserialize(json, now) {
  let o;
  try { o = JSON.parse(json); } catch { return createState(now); }
  if (!o || typeof o !== 'object' || o.v !== SAVE_VERSION) return createState(now);
  const fresh = createState(now);
  const s = {
    ...fresh,
    ...Object.fromEntries(STATS.map((k) => [k, Number.isFinite(o[k]) ? clamp(o[k]) : fresh[k]])),
    sleeping: o.sleeping === true,
    born: Number.isFinite(o.born) && o.born <= now ? o.born : now,
    updatedAt: Number.isFinite(o.updatedAt) && o.updatedAt <= now ? o.updatedAt : now,
    cares: Number.isFinite(o.cares) && o.cares >= 0 ? Math.floor(o.cares) : 0,
  };
  return catchUp(s, now);
}

export const ageDays = (s, now) => Math.floor(Math.max(0, now - s.born) / 86_400_000) + 1;
