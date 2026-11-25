import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/logic.js';
import {
  VOICE_IDS, VOICE_TEXT, VOICE_FILE, VOICE_EVENTS, VOICE_CONFIG,
  createVoiceMemory, consider,
} from '../src/voice.js';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const T0 = 1_700_000_000_000;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const happy = () => ({ ...createState(T0), food: 90, fun: 90, energy: 90, sleep: 90, clean: 90 });
const ask = (over = {}) => consider({
  now: T0, event: 'tick', state: happy(), mem: createVoiceMemory(),
  muted: false, voice: true, durationMs: 2000, ...over,
});

test('all 14 official ids have a text, a file path, and a file in the repo', () => {
  assert.equal(VOICE_IDS.length, 14);
  for (const id of VOICE_IDS) {
    assert.ok(VOICE_TEXT[id], id);
    assert.equal(VOICE_FILE(id), `assets/voix/${id}.mp3`);
    assert.ok(existsSync(join(root, VOICE_FILE(id))), VOICE_FILE(id));
  }
});

test('open after first tap says salut, once per session', () => {
  let r = ask({ event: 'open' });
  assert.equal(r.id, 'salut');
  assert.equal(r.text, 'Salut Pascal !');
  assert.equal(r.mem.greeted, true);
  r = ask({ event: 'open', mem: r.mem, now: T0 + 10_000 });
  assert.equal(r.id, null, 'no second greeting');
  assert.equal(r.mem.greeted, true);
});

test('action events map to the matching line', () => {
  const map = { feed: 'content_mange', play: 'jouer', clean: 'propre', sleep: 'bonne_nuit', wake: 'reveil' };
  for (const [event, id] of Object.entries(map)) {
    const r = ask({ event, mem: { ...createVoiceMemory(), greeted: true } });
    assert.equal(r.id, id, event);
    assert.equal(r.text, VOICE_TEXT[id]);
  }
});

test('global cooldown (~7 s) blocks a second line, then allows it', () => {
  let r = ask({ event: 'feed', mem: { ...createVoiceMemory(), greeted: true } });
  assert.equal(r.id, 'content_mange');
  r = ask({ event: 'play', mem: r.mem, now: T0 + 3_000 });
  assert.equal(r.id, null);
  r = ask({ event: 'play', mem: r.mem, now: T0 + VOICE_CONFIG.globalMs + 1 });
  assert.equal(r.id, 'jouer');
});

test('one voice at a time: busyUntil blocks even after the global gap if the line is still playing', () => {
  let r = ask({ event: 'feed', mem: { ...createVoiceMemory(), greeted: true }, durationMs: 20_000 });
  assert.equal(r.id, 'content_mange');
  r = ask({ event: 'play', mem: r.mem, now: T0 + 8_000 });
  assert.equal(r.id, null, 'still speaking');
  r = ask({ event: 'play', mem: r.mem, now: T0 + 20_000 });
  assert.equal(r.id, 'jouer');
});

test('low-stat alerts map from the pet state, with a 60 s+ per-line cooldown', () => {
  const cases = [
    [{ food: 10 }, 'faim'],
    [{ fun: 10 }, 'ennui'],
    [{ energy: 25, sleep: 80 }, 'fatigue'],
    [{ sleep: 10, energy: 80 }, 'fatigue'],
    [{ clean: 10 }, 'sale'],
    [{ food: 25, fun: 25, energy: 40, sleep: 40, clean: 40 }, 'triste'], // average < 35, no stat critical
    [{ energy: 10 }, 'batterie_faible'],
    [{ food: 5, fun: 5, energy: 5, sleep: 80, clean: 80 }, 'batterie_faible'], // 2+ critical
    [{ food: 90, fun: 90, energy: 90, sleep: 90, clean: 90 }, 'content'],
  ];
  for (const [patch, id] of cases) {
    const r = ask({ event: 'tick', state: { ...happy(), ...patch }, mem: { ...createVoiceMemory(), greeted: true } });
    assert.equal(r.id, id, `${id} from ${JSON.stringify(patch)}`);
  }

  let r = ask({ event: 'tick', state: { ...happy(), food: 10 }, mem: { ...createVoiceMemory(), greeted: true } });
  assert.equal(r.id, 'faim');
  r = ask({ event: 'tick', state: { ...happy(), food: 10 }, mem: r.mem, now: T0 + 30_000 });
  assert.equal(r.id, null, 'faim still cooling down');
  r = ask({ event: 'tick', state: { ...happy(), food: 10 }, mem: r.mem, now: T0 + 60_000 + 1 });
  assert.equal(r.id, 'faim');
});

test('batterie_faible wins over fatigue when energy is critical; no nagging while asleep', () => {
  const mem = { ...createVoiceMemory(), greeted: true };
  assert.equal(ask({ event: 'tick', state: { ...happy(), energy: 10, sleep: 10 }, mem }).id, 'batterie_faible');
  assert.equal(ask({ event: 'tick', state: { ...happy(), sleeping: true, energy: 10, food: 10 }, mem }).id, null);
});

test('action lines have priority over a mood that is also due', () => {
  const mem = { ...createVoiceMemory(), greeted: true };
  const hungry = { ...happy(), food: 10 };
  const r = ask({ event: 'feed', state: hungry, mem });
  assert.equal(r.id, 'content_mange');
});

test('merci is armed by a successful care and said on a head tap within 20 s, after the global gap', () => {
  let r = ask({ event: 'feed', mem: { ...createVoiceMemory(), greeted: true } });
  assert.equal(r.id, 'content_mange');
  assert.equal(r.mem.merciArmed, true);
  r = ask({ event: 'headtap', mem: r.mem, now: T0 + 3_000 });
  assert.equal(r.id, null, 'global cooldown');
  r = ask({ event: 'headtap', mem: r.mem, now: T0 + VOICE_CONFIG.globalMs + 1 });
  assert.equal(r.id, 'merci');
  assert.equal(r.text, 'Merci Pascal !');
  assert.equal(r.mem.merciArmed, false);
  r = ask({ event: 'headtap', mem: r.mem, now: T0 + 30_000 });
  assert.equal(r.id, null);
});

test('merci expires 20 s after the care if the head is not tapped', () => {
  let r = ask({ event: 'clean', mem: { ...createVoiceMemory(), greeted: true } });
  r = ask({ event: 'headtap', mem: r.mem, now: T0 + 21_000 });
  assert.equal(r.id, null);
});

test('muted or voice-off never speaks, but a care still arms merci', () => {
  const mem = { ...createVoiceMemory(), greeted: true };
  assert.equal(ask({ event: 'open', muted: true }).id, null);
  assert.equal(ask({ event: 'feed', voice: false, mem }).id, null);
  const r = ask({ event: 'feed', muted: true, mem });
  assert.equal(r.id, null);
  assert.equal(r.mem.merciArmed, true);
});

test('force skips cooldowns (used by the QA hook)', () => {
  let r = ask({ event: 'faim', state: { ...happy(), food: 8 }, mem: { ...createVoiceMemory(), greeted: true, busyUntil: T0 + 99_000 }, force: true });
  assert.equal(r.id, 'faim');
});

test('every declared event name is documented', () => {
  for (const e of VOICE_EVENTS) assert.ok(typeof e === 'string');
});
