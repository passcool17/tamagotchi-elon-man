// servo.js — pure head-motion model of the real Elon Man neck (no Phaser, no DOM).
// Hardware (passcool17/elon-man, hardware/print-v1 + firmware/elonman_body):
//   pan  = MG996R under the pan plate, ±90° (check_v1.py: "Pan ±90° libre")
//   nod  = both SG90 push rods move together, ±12°
//   tilt = roll, the two rods move in opposite directions, ±10°
// Firmware mixing (elonman_body.ino): left = nod + tilt, right = nod - tilt.

export const LIMITS = { pan: [-90, 90], nod: [-12, 12], tilt: [-10, 10] };
export const AXES = ['pan', 'nod', 'tilt'];
// Max speed (deg/s) and acceleration (deg/s²). MG996R ≈ 0.17 s/60° unloaded; we stay a bit slower
// so the move reads on a phone. SG90 through the rod linkage: slower and softer.
export const SPEED = { pan: 260, nod: 90, tilt: 90 };
export const ACCEL = { pan: 1400, nod: 700, tilt: 700 };
const EPS = 0.25;

export const clampAxis = (axis, v) => {
  const [lo, hi] = LIMITS[axis];
  const n = Number.isFinite(v) ? v : 0;
  return Math.min(hi, Math.max(lo, n));
};

export function createHead(pose = {}) {
  const h = { pos: {}, vel: {}, target: {} };
  for (const a of AXES) { h.pos[a] = clampAxis(a, pose[a] ?? 0); h.vel[a] = 0; h.target[a] = h.pos[a]; }
  return h;
}

export function setTarget(head, pose) {
  for (const a of AXES) if (pose[a] !== undefined) head.target[a] = clampAxis(a, pose[a]);
  return head;
}

// One physics step. Trapezoid profile: accelerate up to SPEED, brake in time to stop on target.
// That is what makes it look like a servo instead of a tween: no overshoot, eased start and stop.
export function stepHead(head, dtMs) {
  const dt = Math.min(0.1, Math.max(0, dtMs / 1000));
  for (const a of AXES) {
    const d = head.target[a] - head.pos[a];
    if (Math.abs(d) < EPS && Math.abs(head.vel[a]) < 5) { head.pos[a] = head.target[a]; head.vel[a] = 0; continue; }
    const vStop = Math.sqrt(2 * ACCEL[a] * Math.abs(d)); // fastest speed we can still brake from
    const want = Math.sign(d) * Math.min(SPEED[a], vStop);
    const dv = want - head.vel[a];
    const maxDv = ACCEL[a] * dt;
    head.vel[a] += Math.max(-maxDv, Math.min(maxDv, dv));
    let next = head.pos[a] + head.vel[a] * dt;
    if ((head.target[a] - next) * d < 0) { next = head.target[a]; head.vel[a] = 0; } // never overshoot
    head.pos[a] = clampAxis(a, next);
  }
  return head;
}

export const atTarget = (head) => AXES.every((a) => Math.abs(head.target[a] - head.pos[a]) < EPS);

// Push-rod servo angles (degrees from centre), same mixing as the firmware.
export function rods({ nod, tilt }) {
  return { left: nod + tilt, right: nod - tilt };
}

// ---- gestures: keyframe lists. Each key: target pose (missing axes keep their value) + hold ms once reached.
const K = (pan, nod, tilt, hold = 0) => ({ pan, nod, tilt, hold });
export const GESTURES = {
  eat:     [K(0, -10, 0, 60), K(0, 3, 0, 40), K(0, -10, 0, 60), K(0, 3, 0, 40), K(0, -10, 0, 60), K(0, 2, 0, 120), K(0, 0, 0)],
  play:    [K(-70, 6, 8, 60), K(70, 6, -8, 60), K(-70, 6, 8, 60), K(70, 6, -8, 60), K(0, 4, 0, 200), K(0, 0, 0)],
  clean:   [K(0, 4, 10, 20), K(0, 4, -10, 20), K(0, 4, 10, 20), K(0, 4, -10, 20), K(0, 0, 0)],
  sleep:   [K(0, -12, 6, 0)],
  wake:    [K(0, 12, -6, 350), K(-35, 6, 0, 200), K(35, 6, 0, 200), K(0, 0, 0)],
  yes:     [K(undefined, 9, undefined, 30), K(undefined, -6, undefined, 30), K(undefined, 9, undefined, 30), K(undefined, 0, undefined)],
  no:      [K(-35, undefined, undefined, 30), K(35, undefined, undefined, 30), K(-25, undefined, undefined, 30), K(0, undefined, undefined)],
  curious: [K(25, 6, 10, 700), K(0, 0, 0)],
  happy:   [K(0, 10, 8, 80), K(0, 10, -8, 80), K(0, 0, 0)],
  refuse:  [K(-30, -4, 0, 0), K(30, -4, 0, 0), K(0, 0, 0)],
  look:    [K(-90, 2, 0, 600), K(90, 2, 0, 600), K(0, 0, 0)],
};

// Small "speech" bobs: one nod pulse every ~2 words, seeded so tests are deterministic.
export function talkGesture(text, rng = Math.random) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const n = Math.max(2, Math.min(10, Math.round(words / 2)));
  const out = [];
  for (let i = 0; i < n; i++) out.push({ nod: 3 + rng() * 5, tilt: (rng() - 0.5) * 8, hold: 40 }, { nod: -1 - rng() * 2, hold: 30 });
  out.push({ nod: 0, tilt: 0 });
  return out;
}

// Rest pose when nothing is playing: depends on mood (the head droops when sleepy or sad).
export function restPose(mood, t = 0) {
  switch (mood) {
    case 'sleeping': return { pan: 0, nod: -12, tilt: 6 };
    case 'sleepy': return { pan: 0, nod: -7 + Math.sin(t / 1400) * 3, tilt: 3 };
    case 'sad': return { pan: 0, nod: -9, tilt: -4 };
    case 'hungry': return { pan: 0, nod: -4, tilt: 0 };
    case 'bored': return { pan: 0, nod: -2, tilt: 5 };
    case 'dirty': return { pan: 0, nod: 0, tilt: -3 };
    case 'happy': return { pan: 0, nod: 3, tilt: 0 };
    default: return { pan: 0, nod: 0, tilt: 0 };
  }
}

// Sequencer: plays one gesture at a time on a head. Pure: drive it with step(dtMs).
export function createMotion(head = createHead()) {
  const m = { head, queue: [], holdLeft: 0, current: null, name: null };
  m.play = (keys, name = 'custom') => {
    m.queue = keys.map((k) => ({ ...k })); m.current = null; m.holdLeft = 0; m.name = name;
    return m;
  };
  m.gesture = (name) => (GESTURES[name] ? m.play(GESTURES[name], name) : m);
  m.busy = () => m.current !== null || m.queue.length > 0;
  m.step = (dtMs, rest) => {
    if (!m.current && m.queue.length) { m.current = m.queue.shift(); setTarget(head, m.current); m.holdLeft = m.current.hold || 0; }
    if (!m.current && rest) setTarget(head, rest);
    stepHead(head, dtMs);
    if (m.current && atTarget(head)) {
      m.holdLeft -= dtMs;
      if (m.holdLeft <= 0) { m.current = null; if (!m.queue.length) m.name = null; }
    }
    return head.pos;
  };
  return m;
}
