import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPet, savePet, loadPrefs, savePrefs, SAVE_KEY } from '../src/storage.js';
import { createState, act } from '../src/logic.js';

const fake = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const T0 = 1_700_000_000_000;

test('first launch creates a fresh pet', () => {
  const s = loadPet(fake(), T0);
  assert.equal(s.food, 80);
  assert.equal(s.born, T0);
});

test('save then load restores the pet (reload keeps state)', () => {
  const st = fake();
  const played = act(createState(T0), 'play', T0).state;
  savePet(st, played);
  const back = loadPet(st, T0);
  assert.equal(back.fun, played.fun);
  assert.equal(back.cares, 1);
});

test('corrupt save falls back to a fresh pet', () => {
  const st = fake();
  st.setItem(SAVE_KEY, '{{{');
  assert.equal(loadPet(st, T0).food, 80);
});

test('a storage that throws never crashes saving', () => {
  const bad = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => savePet(bad, createState(T0)));
  assert.doesNotThrow(() => savePrefs(bad, { muted: true }));
});

test('prefs default to sound on and persist', () => {
  const st = fake();
  assert.equal(loadPrefs(st).muted, false);
  savePrefs(st, { muted: true });
  assert.equal(loadPrefs(st).muted, true);
});
