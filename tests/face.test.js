import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFramebuffer, renderFace, toRGB565, toRGBA, insideScreen,
  FB_SIZE, FACE_MOODS, PALETTE_565, C,
} from '../src/face.js';
import { MOODS } from '../src/logic.js';

const hash = (fb) => { let h = 2166136261; for (const v of fb.pixels) h = Math.imul(h ^ v, 16777619) >>> 0; return h; };

test('framebuffer is 240x240, one palette index per pixel', () => {
  const fb = renderFace({ mood: 'idle', t: 0 });
  assert.equal(fb.width, 240);
  assert.equal(fb.height, 240);
  assert.equal(fb.pixels.length, 240 * 240);
  for (const v of fb.pixels) assert.ok(v < PALETTE_565.length);
});

test('nothing is drawn outside the round screen', () => {
  for (const mood of FACE_MOODS) {
    const fb = renderFace({ mood, t: 777, gaze: 1 });
    for (let y = 0; y < FB_SIZE; y++) for (let x = 0; x < FB_SIZE; x++)
      if (!insideScreen(x, y) && fb.pixels[y * FB_SIZE + x] !== C.BG) assert.fail(`${mood}: pixel outside circle at ${x},${y}`);
  }
});

test('rendering is deterministic for a mood and a time', () => {
  for (const mood of FACE_MOODS) assert.equal(hash(renderFace({ mood, t: 1234 })), hash(renderFace({ mood, t: 1234 })));
});

test('every mood draws something and looks different from the others', () => {
  const seen = new Map();
  for (const mood of FACE_MOODS) {
    const fb = renderFace({ mood, t: 1000 });
    assert.ok(fb.pixels.some((v) => v !== C.BG), `${mood} is not blank`);
    const h = hash(fb);
    assert.ok(!seen.has(h), `${mood} equals ${seen.get(h)}`);
    seen.set(h, mood);
  }
});

test('every mood produced by the game logic has a face', () => {
  for (const m of MOODS) assert.ok(FACE_MOODS.includes(m), `${m} has no face`);
});

test('animated moods change over time, and the gaze moves the eyes', () => {
  for (const mood of ['eating', 'playing', 'cleaning', 'sleeping', 'hungry', 'sad'])
    assert.notEqual(hash(renderFace({ mood, t: 0 })), hash(renderFace({ mood, t: 450 })), `${mood} should animate`);
  assert.notEqual(hash(renderFace({ mood: 'idle', t: 1000, gaze: -1 })), hash(renderFace({ mood: 'idle', t: 1000, gaze: 1 })));
});

test('idle blinks', () => {
  assert.notEqual(hash(renderFace({ mood: 'idle', t: 10 })), hash(renderFace({ mood: 'idle', t: 1000 })));
});

test('the framebuffer can be reused (no state leaks between frames)', () => {
  const fb = createFramebuffer();
  renderFace({ mood: 'cleaning', t: 300 }, fb);
  renderFace({ mood: 'idle', t: 1000 }, fb);
  assert.equal(hash(fb), hash(renderFace({ mood: 'idle', t: 1000 })));
});

test('RGB565 output: 2 bytes per pixel, firmware colours', () => {
  const fb = renderFace({ mood: 'happy', t: 0 });
  const out = toRGB565(fb);
  assert.equal(out.length, 240 * 240 * 2);
  assert.equal((out[0] << 8) | out[1], 0x0000); // corner = background
  const gold = fb.pixels.findIndex((v) => v === C.GOLD);
  assert.ok(gold >= 0);
  assert.equal((out[gold * 2] << 8) | out[gold * 2 + 1], 0xfe60); // C_GOLD in firmware/face.h
});

test('RGBA output is transparent outside the round screen', () => {
  const rgba = toRGBA(renderFace({ mood: 'idle', t: 1000 }));
  assert.equal(rgba[3], 0); // corner
  const centre = (120 * 240 + 120) * 4;
  assert.equal(rgba[centre + 3], 255);
});
