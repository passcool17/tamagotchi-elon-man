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

test('prefs default to voice on and persist a voice-off flag', () => {
  const st = fake();
  assert.equal(loadPrefs(st).voice, true);
  savePrefs(st, { muted: false, voice: false });
  assert.equal(loadPrefs(st).voice, false);
  assert.equal(loadPrefs(st).muted, false);
});

// ---- v2.0 migration ----
import { LEGACY_SAVE_KEY, LEGACY_PREFS_KEY, PREFS_KEY } from '../src/storage.js';
import { serialize } from '../src/logic.js';

test('v2 migrates the v1 pet (tem.save.v1 -> tem.save.v2) and keeps the old key', () => {
  const st = fake();
  const v1pet = act(act(createState(T0), 'feed', T0).state, 'play', T0).state;
  st.setItem(LEGACY_SAVE_KEY, serialize(v1pet));
  const info = {};
  const s = loadPet(st, T0, info);
  assert.equal(info.migrated, true);
  assert.equal(s.cares, 2);
  assert.equal(s.born, v1pet.born);
  assert.ok(st.getItem(SAVE_KEY), 'written to the v2 key');
  assert.ok(st.getItem(LEGACY_SAVE_KEY), 'v1 key kept');
  const again = {};
  loadPet(st, T0, again);
  assert.equal(again.migrated, false, 'second load reads v2');
});

test('v2 key wins over the v1 key', () => {
  const st = fake();
  st.setItem(LEGACY_SAVE_KEY, serialize(createState(T0)));
  savePet(st, act(createState(T0), 'play', T0).state);
  assert.equal(loadPet(st, T0).cares, 1);
});

test('v1 prefs migrate and get a demo brain by default', () => {
  const st = fake();
  st.setItem(LEGACY_PREFS_KEY, JSON.stringify({ muted: true, voice: false }));
  const p = loadPrefs(st);
  assert.equal(p.muted, true);
  assert.equal(p.voice, false);
  assert.deepEqual(p.brain, { mode: 'demo', url: '' });
  savePrefs(st, { ...p, brain: { mode: 'gateway', url: 'https://x.example' } });
  assert.equal(loadPrefs(st).brain.mode, 'gateway');
  st.setItem(PREFS_KEY, JSON.stringify({ brain: { mode: 'weird', url: 5 } }));
  assert.deepEqual(loadPrefs(st).brain, { mode: 'demo', url: '' });
});
