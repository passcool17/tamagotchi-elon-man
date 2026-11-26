import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHead, setTarget, stepHead, atTarget, rods, clampAxis, createMotion, GESTURES, talkGesture, restPose, SPEED, LIMITS } from '../src/servo.js';

const run = (h, ms, dt = 16) => { for (let t = 0; t < ms; t += dt) stepHead(h, dt); return h; };

test('targets are clamped to the real hardware range', () => {
  const h = setTarget(createHead(), { pan: 200, nod: -50, tilt: 30 });
  assert.deepEqual(h.target, { pan: 90, nod: -12, tilt: 10 });
  assert.equal(clampAxis('pan', NaN), 0);
  assert.deepEqual(LIMITS, { pan: [-90, 90], nod: [-12, 12], tilt: [-10, 10] });
});

test('servo motion reaches the target without overshoot and respects max speed', () => {
  const h = setTarget(createHead(), { pan: 90 });
  let prev = 0, maxStep = 0;
  for (let i = 0; i < 200; i++) {
    stepHead(h, 16);
    assert.ok(h.pos.pan <= 90 + 1e-9, 'no overshoot');
    maxStep = Math.max(maxStep, h.pos.pan - prev); prev = h.pos.pan;
  }
  assert.ok(atTarget(h));
  assert.ok(maxStep <= SPEED.pan * 0.016 + 1e-6, `speed limited (${maxStep})`);
});

test('eased: the first step is slower than mid-move', () => {
  const h = setTarget(createHead(), { pan: 90 });
  stepHead(h, 16); const first = h.pos.pan;
  run(h, 150); const a = h.pos.pan; stepHead(h, 16);
  assert.ok(h.pos.pan - a > first * 2);
});

test('rod mixing matches the firmware: nod = both rods, tilt = opposite', () => {
  assert.deepEqual(rods({ nod: 10, tilt: 0 }), { left: 10, right: 10 });
  assert.deepEqual(rods({ nod: 0, tilt: 8 }), { left: 8, right: -8 });
  assert.deepEqual(rods({ nod: -5, tilt: 3 }), { left: -2, right: -8 });
});

test('every gesture plays to the end and stays in range', () => {
  for (const name of Object.keys(GESTURES)) {
    const m = createMotion().gesture(name);
    let t = 0;
    while (m.busy() && t < 15000) { m.step(16); t += 16;
      const p = m.head.pos;
      assert.ok(Math.abs(p.pan) <= 90 && Math.abs(p.nod) <= 12 && Math.abs(p.tilt) <= 10, name);
    }
    assert.ok(!m.busy(), `${name} finished`);
  }
});

test('look gesture really turns the head to both ±90° stops', () => {
  const m = createMotion().gesture('look');
  let min = 0, max = 0;
  while (m.busy()) { m.step(16); min = Math.min(min, m.head.pos.pan); max = Math.max(max, m.head.pos.pan); }
  assert.equal(min, -90); assert.equal(max, 90);
});

test('talk gesture is deterministic with a seeded rng and scales with length', () => {
  const seq = (s) => { let x = s; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };
  assert.deepEqual(talkGesture('un deux trois', seq(7)), talkGesture('un deux trois', seq(7)));
  assert.ok(talkGesture('a b c d e f g h i j k l m n o p', seq(1)).length > talkGesture('a', seq(1)).length);
});

test('rest pose: sleeping head droops to the nod stop', () => {
  assert.equal(restPose('sleeping').nod, -12);
  const m = createMotion();
  for (let i = 0; i < 200; i++) m.step(16, restPose('sleeping'));
  assert.equal(m.head.pos.nod, -12);
});
