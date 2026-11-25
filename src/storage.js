// storage.js — tiny localStorage wrapper. Takes any object with getItem/setItem so tests can inject a fake.
import { createState, deserialize, serialize } from './logic.js';

export const SAVE_KEY = 'tem.save.v1';
export const PREFS_KEY = 'tem.prefs.v1';

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

export function loadPet(storage, now) {
  const raw = storage.getItem(SAVE_KEY);
  return raw ? deserialize(raw, now) : createState(now);
}

export function savePet(storage, state) {
  try { storage.setItem(SAVE_KEY, serialize(state)); } catch { /* quota: ignore, next save retries */ }
}

export function loadPrefs(storage) {
  try { return { muted: false, voice: true, ...(JSON.parse(storage.getItem(PREFS_KEY)) || {}) }; } catch { return { muted: false, voice: true }; }
}

export function savePrefs(storage, prefs) {
  try { storage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}
