// brain/gateway.js — optional "PC" brain: talks to a small HTTPS bridge on Pascal's Ubuntu PC.
// The page never holds a key. Access control belongs to the tunnel (Tailscale / Cloudflare Access).
//
// Contract (see README "Passerelle PC"):
//   POST {base}/chat  {"text": "...", "lang": "fr-CA", "pet": {mood, food, fun, energy, sleep, clean, sleeping}}
//     -> 200 {"reply": "...", "mood"?: "happy|sad|…", "gesture"?: "yes|no|curious|look|happy",
//             "look"?: {"pan": -90..90, "nod": -12..12, "tilt": -10..10}}
//   POST {base}/cmd   {"cmd": "ping"}  -> 200 {"ok": true}   (same shape as the elon-man core daemon)
// Anything else (timeout, network error, CORS, non-2xx, bad JSON) => caller falls back to the demo brain.

export const DEFAULT_TIMEOUT_MS = 5000;

// Accept https:// anywhere, and http:// only for localhost (a page served over https can't call plain http).
export function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  if (u.username || u.password) return null; // no credentials in URLs, ever
  u.search = ''; u.hash = '';
  return u.toString().replace(/\/+$/, '');
}

async function postJSON(url, body, { fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const f = fetchImpl || globalThis.fetch;
  if (typeof f !== 'function') throw new Error('no-fetch');
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => { ctrl?.abort(); rej(new Error('timeout')); }, timeoutMs); });
  try {
    const res = await Promise.race([
      f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl?.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      }),
      timeout,
    ]);
    if (!res || !res.ok) throw new Error(`http-${res ? res.status : 0}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

const MOODS = ['happy', 'idle', 'hungry', 'sleepy', 'sad', 'bored', 'dirty', 'sleeping', 'thinking', 'talking'];
const GESTURES = ['yes', 'no', 'curious', 'look', 'happy', 'play', 'clean', 'eat'];
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);

// Validate what the PC sends back; never trust it blindly (it ends up on screen and on the servos).
export function parseChat(o) {
  if (!o || typeof o !== 'object') return null;
  const text = typeof o.reply === 'string' ? o.reply : typeof o.text === 'string' ? o.text : null;
  if (!text || !text.trim()) return null;
  const out = { reply: text.trim().slice(0, 280) };
  if (MOODS.includes(o.mood)) out.mood = o.mood;
  if (GESTURES.includes(o.gesture)) out.gesture = o.gesture;
  if (o.look && typeof o.look === 'object') {
    out.look = { pan: num(o.look.pan, -90, 90), nod: num(o.look.nod, -12, 12), tilt: num(o.look.tilt, -10, 10) };
  }
  return out;
}

export async function askGateway(text, { url, pet, fetchImpl, timeoutMs } = {}) {
  const base = normalizeUrl(url);
  if (!base) return { ok: false, error: 'bad-url' };
  try {
    const o = await postJSON(`${base}/chat`, { text: String(text).slice(0, 500), lang: 'fr-CA', pet }, { fetchImpl, timeoutMs });
    const parsed = parseChat(o);
    return parsed ? { ok: true, ...parsed } : { ok: false, error: 'bad-reply' };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  }
}

export async function pingGateway(url, { fetchImpl, timeoutMs = 4000 } = {}) {
  const base = normalizeUrl(url);
  if (!base) return { ok: false, error: 'bad-url' };
  try {
    const o = await postJSON(`${base}/cmd`, { cmd: 'ping' }, { fetchImpl, timeoutMs });
    return { ok: !!(o && o.ok !== false), info: o };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  }
}

// The brain the scene uses. mode 'demo' never touches the network. mode 'gateway' tries the PC,
// then falls back to the demo reply. `used` tells the UI which brain actually answered.
export function createBrain({ demoReply, fetchImpl, getPrefs }) {
  let lastGateway = null; // null = untested, true = last call worked, false = last call failed
  return {
    status: () => ({ mode: getPrefs().brain?.mode === 'gateway' ? 'gateway' : 'demo', lastGateway }),
    async ask(text, ctx = {}) {
      const prefs = getPrefs().brain || {};
      if (prefs.mode === 'gateway') {
        const r = await askGateway(text, { url: prefs.url, pet: ctx.pet, fetchImpl, timeoutMs: prefs.timeoutMs });
        lastGateway = r.ok;
        if (r.ok) return { ...r, used: 'gateway' };
        const d = demoReply(text, ctx);
        return { ...d, used: 'demo', fellBack: true, error: r.error };
      }
      return { ...demoReply(text, ctx), used: 'demo' };
    },
  };
}
