import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createState, tick, catchUp, act, moodOf, serialize, deserialize, clamp,
  CONFIG, STATS, ageDays,
} from '../src/logic.js';

const MIN = 60_000, HOUR = 60 * MIN;
const T0 = 1_700_000_000_000;

test('createState: all stats in range, awake', () => {
  const s = createState(T0);
  for (const k of STATS) assert.ok(s[k] >= 0 && s[k] <= 100);
  assert.equal(s.sleeping, false);
  assert.equal(s.updatedAt, T0);
});

test('decay: stats go down over time, at the configured rate', () => {
  const s = tick(createState(T0), 10 * MIN);
  assert.ok(Math.abs(s.food - (80 - 9)) < 1e-9);
  assert.ok(Math.abs(s.energy - (90 - 3.5)) < 1e-9);
  assert.ok(s.fun < 80 && s.clean < 90 && s.sleep < 90);
});

test('decay: does not mutate the input and ignores zero or negative time', () => {
  const s = createState(T0);
  const copy = { ...s };
  tick(s, 5 * MIN);
  assert.deepEqual(s, copy);
  assert.deepEqual(tick(s, 0), s);
  assert.deepEqual(tick(s, -5000), s);
});

test('clamp: stats never leave 0..100', () => {
  assert.equal(clamp(-5), 0);
  assert.equal(clamp(130), 100);
  const dead = tick(createState(T0), 1000 * HOUR);
  for (const k of STATS) assert.equal(dead[k], 0);
  let s = createState(T0);
  s.food = 10;
  for (let i = 0; i < 10; i++) { const r = act({ ...s, food: 50 }, 'feed', T0); s = r.state; assert.ok(s.food <= 100); }
});

test('feed: raises food, refuses when full', () => {
  let s = { ...createState(T0), food: 40 };
  const r = act(s, 'feed', T0);
  assert.equal(r.ok, true);
  assert.equal(r.event, 'eat');
  assert.equal(r.state.food, 70);
  const full = act({ ...s, food: 98 }, 'feed', T0);
  assert.equal(full.ok, false);
  assert.equal(full.state.food, 98);
  assert.match(full.msg, /faim/);
});

test('play: raises fun, costs energy and food, refuses when exhausted', () => {
  const s = { ...createState(T0), fun: 30, energy: 60, food: 60 };
  const r = act(s, 'play', T0);
  assert.equal(r.ok, true);
  assert.equal(r.state.fun, 58);
  assert.equal(r.state.energy, 48);
  assert.equal(r.state.food, 54);
  const tired = act({ ...s, energy: 5 }, 'play', T0);
  assert.equal(tired.ok, false);
  assert.equal(tired.state.fun, 30);
});

test('clean: raises hygiene, refuses when already clean', () => {
  const s = { ...createState(T0), clean: 20 };
  const r = act(s, 'clean', T0);
  assert.equal(r.ok, true);
  assert.equal(r.state.clean, 65);
  assert.equal(act({ ...s, clean: 99 }, 'clean', T0).ok, false);
});

test('sleep: toggles, refills sleep and energy, other actions are refused while asleep', () => {
  let r = act(createState(T0), 'sleep', T0);
  assert.equal(r.state.sleeping, true);
  assert.equal(r.event, 'sleep');
  for (const a of ['feed', 'play', 'clean']) assert.equal(act(r.state, a, T0).ok, false);
  const later = catchUp({ ...r.state, sleep: 20, energy: 20 }, T0 + 30 * MIN);
  assert.ok(later.sleep > 20 + 30, 'sleep stat should climb');
  assert.ok(later.energy > 20 + 20);
  const woke = act(r.state, 'sleep', T0);
  assert.equal(woke.state.sleeping, false);
  assert.equal(woke.event, 'wake');
});

test('sleep: wakes up by itself when rested', () => {
  const s = { ...createState(T0), sleeping: true, sleep: 10, energy: 10 };
  const after = catchUp(s, T0 + 2 * HOUR);
  assert.equal(after.sleeping, false);
  assert.equal(after.sleep <= 100, true);
});

test('unknown action is a no-op', () => {
  const s = createState(T0);
  const r = act(s, 'dance', T0);
  assert.equal(r.ok, false);
  assert.equal(r.state.food, s.food);
});

test('offline catch-up: slower than live, capped at 8h, floors at offlineFloor', () => {
  const s = createState(T0);
  const live = tick(s, 2 * HOUR);
  const off = catchUp(s, T0 + 2 * HOUR);
  assert.ok(off.food > live.food, 'offline decays slower');
  assert.equal(off.updatedAt, T0 + 2 * HOUR);
  const week = catchUp(s, T0 + 7 * 24 * HOUR);
  const cap = catchUp(s, T0 + CONFIG.offlineCapMs);
  assert.deepEqual({ ...week, updatedAt: 0 }, { ...cap, updatedAt: 0 }, 'a week away equals the 8h cap');
  for (const k of STATS) assert.ok(week[k] >= CONFIG.offlineFloor, `${k} stays above the floor`);
});

test('offline catch-up: short gaps use the live rate', () => {
  const s = createState(T0);
  const a = catchUp(s, T0 + 2 * MIN);
  const b = tick(s, 2 * MIN);
  assert.ok(Math.abs(a.food - b.food) < 1e-9);
});

test('offline catch-up: clock going backwards changes nothing', () => {
  const s = createState(T0);
  const r = catchUp(s, T0 - HOUR);
  assert.equal(r.food, s.food);
  assert.equal(r.updatedAt, T0);
});

test('offline catch-up while asleep: pet recovers, wakes by itself, then decays gently', () => {
  const s = { ...createState(T0), sleeping: true, sleep: 20, energy: 20, food: 80 };
  const short = catchUp(s, T0 + 30 * MIN);
  assert.equal(short.sleeping, true);
  assert.ok(short.sleep > 80 - 1 && short.energy > 50);
  const long = catchUp(s, T0 + 6 * HOUR);
  assert.equal(long.sleeping, false);
  assert.ok(long.food < 80 && long.food >= CONFIG.offlineFloor);
});

test('mood: happy, idle, hungry, sleepy, bored, dirty, sad, sleeping', () => {
  const base = { ...createState(T0), food: 90, fun: 90, energy: 90, sleep: 90, clean: 90 };
  assert.equal(moodOf(base), 'happy');
  assert.equal(moodOf({ ...base, fun: 45 }), 'idle');
  assert.equal(moodOf({ ...base, food: 10 }), 'hungry');
  assert.equal(moodOf({ ...base, sleep: 10 }), 'sleepy');
  assert.equal(moodOf({ ...base, energy: 25 }), 'sleepy');
  assert.equal(moodOf({ ...base, fun: 15 }), 'bored');
  assert.equal(moodOf({ ...base, clean: 15 }), 'dirty');
  assert.equal(moodOf({ ...base, food: 5, fun: 5 }), 'sad');
  assert.equal(moodOf({ ...base, food: 10, fun: 10, energy: 10, sleep: 10, clean: 10 }), 'sad');
  assert.equal(moodOf({ ...base, sleeping: true, food: 1 }), 'sleeping');
});

test('save / load round-trip keeps the state', () => {
  let s = act(createState(T0), 'play', T0).state;
  s = { ...s, updatedAt: T0 };
  const back = deserialize(serialize(s), T0);
  assert.deepEqual(back, s);
});

test('load: applies catch-up from the saved timestamp', () => {
  const s = createState(T0);
  const back = deserialize(serialize(s), T0 + HOUR);
  assert.ok(back.food < s.food);
  assert.equal(back.updatedAt, T0 + HOUR);
});

test('load: garbage, wrong version, or bad numbers fall back safely', () => {
  assert.equal(deserialize('not json', T0).food, 80);
  assert.equal(deserialize('null', T0).food, 80);
  assert.equal(deserialize(JSON.stringify({ v: 99, food: 1 }), T0).food, 80);
  const s = deserialize(JSON.stringify({ v: 1, food: 500, fun: -20, energy: 'x', sleep: null, clean: 50, born: T0 + 9e9, updatedAt: T0 + 9e9 }), T0);
  assert.equal(s.food, 100);
  assert.equal(s.fun, 0);
  assert.equal(s.energy, 90);
  assert.equal(s.born, T0, 'a birth date in the future is reset');
  assert.equal(s.updatedAt, T0, 'a save from the future is not trusted');
});

test('ageDays counts from day 1', () => {
  const s = createState(T0);
  assert.equal(ageDays(s, T0), 1);
  assert.equal(ageDays(s, T0 + 2 * 24 * HOUR + 1), 3);
});
