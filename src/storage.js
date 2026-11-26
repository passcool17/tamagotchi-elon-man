// storage.js — tiny localStorage wrapper. Takes any object with getItem/setItem so tests can inject a fake.
// v2.0 moved to *.v2 keys. On first run it migrates the v1 pet and prefs (tem.save.v1 / tem.prefs.v1);
// the old keys are left in place so nothing is lost if someone opens an old cached build.
import { createState, deserialize, serialize } from './logic.js';

export const SAVE_KEY = 'tem.save.v2';
export const PREFS_KEY = 'tem.prefs.v2';
export const LEGACY_SAVE_KEY = 'tem.save.v1';
export const LEGACY_PREFS_KEY = 'tem.prefs.v1';

export const DEFAULT_PREFS = { muted: false, voice: true, brain: { mode: 'demo', url: '' } };

export function safeStorage() {
  try {
    const s = window.localStorage;
    s.setItem('tem.probe', '1'); s.removeItem('tem.probe');
    return s;
  } catch {
    const mem = new Map(); // private mode / blocked storage: keep going in memory
    return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
}

// Returns the pet. `info.migrated` is true when it came from the v1 key.
export function loadPet(storage, now, info = {}) {
  let raw = storage.getItem(SAVE_KEY);
  info.migrated = false;
  if (!raw) {
    raw = storage.getItem(LEGACY_SAVE_KEY);
    if (raw) {
      info.migrated = true;
      const s = deserialize(raw, now);
      try { storage.setItem(SAVE_KEY, serialize(s)); } catch { /* ignore */ }
      return s;
    }
  }
  return raw ? deserialize(raw, now) : createState(now);
}

export function savePet(storage, state) {
  try { storage.setItem(SAVE_KEY, serialize(state)); } catch { /* quota: ignore, next save retries */ }
}

function parse(raw) { try { const o = JSON.parse(raw); return o && typeof o === 'object' ? o : null; } catch { return null; } }

export function loadPrefs(storage) {
  const cur = parse(storage.getItem(PREFS_KEY));
  const old = cur ? null : parse(storage.getItem(LEGACY_PREFS_KEY));
  const src = cur || old || {};
  const brain = { ...DEFAULT_PREFS.brain, ...(src.brain && typeof src.brain === 'object' ? src.brain : {}) };
  if (brain.mode !== 'gateway') brain.mode = 'demo';
  if (typeof brain.url !== 'string') brain.url = '';
  return { muted: !!src.muted, voice: src.voice !== false, brain };
}

export function savePrefs(storage, prefs) {
  try { storage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
