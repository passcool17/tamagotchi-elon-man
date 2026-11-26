import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reply, CHIPS } from '../src/brain/demo.js';
import { normalizeUrl, askGateway, pingGateway, createBrain, parseChat } from '../src/brain/gateway.js';
import { createState } from '../src/logic.js';
import { GESTURES } from '../src/servo.js';
import { OLED_MOODS } from '../src/oled.js';

const rng0 = () => 0;
const pet = (o = {}) => ({ ...createState(0), ...o });

test('demo: every chip gets a French reply, a valid face and a valid gesture', () => {
  for (const c of CHIPS) {
    const r = reply(c, { rng: rng0, pet: pet() });
    assert.ok(r.reply.length > 3, c);
    assert.ok(r.mood === null || OLED_MOODS.includes(r.mood), `${c}: ${r.mood}`);
    assert.ok(r.gesture === null || r.gesture in GESTURES, `${c}: ${r.gesture}`);
  }
});

test('demo: "ça va" depends on the pet state', () => {
  assert.match(reply('Ça va ?', { rng: rng0, pet: pet({ food: 10 }) }).reply, /faim/);
  assert.match(reply('ca va', { rng: rng0, pet: pet({ sleep: 5 }) }).reply, /fatigu/);
  assert.equal(reply('Ça va ?', { rng: rng0, pet: pet() }).mood, 'happy');
});

test('demo: sleeping robot mumbles, greeting, head turn, fallback', () => {
  assert.equal(reply('blague', { pet: pet({ sleeping: true }) }).mood, 'sleeping');
  assert.equal(reply('Salut!', { rng: rng0 }).gesture, 'happy');
  assert.equal(reply('Tourne la tête', { rng: rng0 }).gesture, 'look');
  assert.equal(reply('zxqv', { rng: rng0 }).gesture, 'curious');
  assert.equal(reply('', {}).mood, 'thinking');
  assert.notEqual(reply('repas', { rng: rng0 }).gesture, 'no', '"pas" inside a word is not a no');
});

test('gateway: only https (or localhost http), no credentials, trailing slash trimmed', () => {
  assert.equal(normalizeUrl('https://elonman.tail1234.ts.net/'), 'https://elonman.tail1234.ts.net');
  assert.equal(normalizeUrl('http://192.168.1.20:8765'), null);
  assert.equal(normalizeUrl('http://localhost:8787/'), 'http://localhost:8787');
  assert.equal(normalizeUrl('https://user:pw@x.example'), null);
  assert.equal(normalizeUrl('pas une url'), null);
  assert.equal(normalizeUrl('https://x.example/api/?key=secret'), 'https://x.example/api');
});

test('gateway: parses and clamps the PC reply', () => {
  const r = parseChat({ reply: ' Allo! ', mood: 'happy', gesture: 'yes', look: { pan: 400, nod: -1, tilt: 'x' } });
  assert.deepEqual(r, { reply: 'Allo!', mood: 'happy', gesture: 'yes', look: { pan: 90, nod: -1, tilt: undefined } });
  assert.equal(parseChat({ mood: 'happy' }), null);
  assert.equal(parseChat({ reply: 'x', mood: 'evil' }).mood, undefined);
});

const okFetch = (body, seen = []) => async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200, json: async () => body }; };

test('gateway: POST /chat with JSON, no credentials, no key', async () => {
  const seen = [];
  const r = await askGateway('Salut', { url: 'https://pc.example/', pet: { mood: 'happy' }, fetchImpl: okFetch({ reply: 'Yo!' }, seen) });
  assert.equal(r.ok, true); assert.equal(r.reply, 'Yo!');
  assert.equal(seen[0].url, 'https://pc.example/chat');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.credentials, 'omit');
  assert.deepEqual(Object.keys(seen[0].init.headers), ['Content-Type']);
  assert.deepEqual(JSON.parse(seen[0].init.body), { text: 'Salut', lang: 'fr-CA', pet: { mood: 'happy' } });
  const p = await pingGateway('https://pc.example', { fetchImpl: okFetch({ ok: true }, seen) });
  assert.equal(p.ok, true); assert.equal(seen[1].url, 'https://pc.example/cmd');
});

test('gateway fallback: timeout, network error, HTTP 500, bad URL all fall back to demo', async () => {
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const fails = {
    timeout: hang,
    network: async () => { throw new TypeError('Failed to fetch'); },
    http500: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    badjson: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }),
  };
  for (const [name, f] of Object.entries(fails)) {
    const prefs = { brain: { mode: 'gateway', url: 'https://pc.example', timeoutMs: 60 } };
    const b = createBrain({ demoReply: (t) => ({ reply: `demo:${t}`, mood: 'happy', gesture: 'yes' }), fetchImpl: f, getPrefs: () => prefs });
    const r = await b.ask('Salut', { pet: {} });
    assert.equal(r.used, 'demo', name); assert.equal(r.fellBack, true, name); assert.equal(r.reply, 'demo:Salut');
    assert.equal(b.status().lastGateway, false);
  }
  const bad = createBrain({ demoReply: () => ({ reply: 'd' }), fetchImpl: okFetch({ reply: 'x' }), getPrefs: () => ({ brain: { mode: 'gateway', url: 'http://10.0.0.5' } }) });
  const r = await bad.ask('x');
  assert.equal(r.used, 'demo'); assert.equal(r.error, 'bad-url');
});

test('demo mode never calls fetch', async () => {
  let called = false;
  const b = createBrain({ demoReply: () => ({ reply: 'd' }), fetchImpl: async () => { called = true; }, getPrefs: () => ({ brain: { mode: 'demo', url: 'https://pc.example' } }) });
  assert.equal((await b.ask('x')).used, 'demo');
  assert.equal(called, false);
});

test('gateway mode uses the PC when it answers', async () => {
  const b = createBrain({ demoReply: () => ({ reply: 'd' }), fetchImpl: okFetch({ reply: 'Du PC', look: { pan: 30 } }), getPrefs: () => ({ brain: { mode: 'gateway', url: 'https://pc.example' } }) });
  const r = await b.ask('x');
  assert.equal(r.used, 'gateway'); assert.equal(r.reply, 'Du PC'); assert.equal(r.look.pan, 30);
  assert.equal(b.status().lastGateway, true);
});
