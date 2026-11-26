import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderFace, createPanels, OLED_MOODS, PANEL_W, PANEL_H, EYE_W, EYE_H, toSSD1306, toRGBA, litCount, blinkOpen, createFB, set } from '../src/oled.js';

test('panels have the real SSD1306 geometry (128×64, eyes mounted on their side)', () => {
  const p = createPanels();
  assert.equal(p.mouth.w, PANEL_W); assert.equal(p.mouth.h, PANEL_H);
  assert.equal(p.eyeL.w * p.eyeL.h, PANEL_W * PANEL_H);
  assert.equal(EYE_W, 64); assert.equal(EYE_H, 128);
});

test('every mood draws something on all 3 screens and stays 1-bit', () => {
  for (const mood of OLED_MOODS) {
    const p = renderFace({ mood, t: 500, talk: 0.8 });
    for (const k of ['eyeL', 'eyeR', 'mouth']) {
      assert.ok(litCount(p[k]) > 20, `${mood} ${k}`);
      assert.ok(p[k].px.every((v) => v === 0 || v === 1));
    }
  }
});

test('moods look different from each other (mouth)', () => {
  const sig = (m) => Buffer.from(renderFace({ mood: m, t: 1000, talk: 0.5 }).mouth.px).toString('base64');
  const seen = new Set(OLED_MOODS.map(sig));
  assert.equal(seen.size, OLED_MOODS.length);
});

test('talking mouth opens with the level', () => {
  const lo = litCount(renderFace({ mood: 'talking', t: 0, talk: 0.1 }).mouth);
  const hi = litCount(renderFace({ mood: 'talking', t: 0, talk: 1 }).mouth);
  assert.ok(hi > lo * 1.5);
});

test('blink closes the eyes briefly', () => {
  const open = litCount(renderFace({ mood: 'idle', t: 2000 }).eyeL);
  const shut = litCount(renderFace({ mood: 'idle', t: 4200 - 977 + 60 }).eyeL);
  assert.ok(blinkOpen(4200 - 977 + 60) < 0.05);
  assert.ok(shut < open / 3);
});

test('looking left moves the pupil (eye pixels change)', () => {
  const a = renderFace({ mood: 'idle', t: 2000, look: { x: -1, y: 0 } }).eyeL.px.join('');
  const b = renderFace({ mood: 'idle', t: 2000, look: { x: 1, y: 0 } }).eyeL.px.join('');
  assert.notEqual(a, b);
});

test('SSD1306 export: 1024 bytes, page layout, eyes rotated back to landscape', () => {
  const m = createFB(PANEL_W, PANEL_H); set(m, 3, 9);
  const buf = toSSD1306(m);
  assert.equal(buf.length, 1024);
  assert.equal(buf[1 * 128 + 3], 1 << 1);
  const e = createFB(EYE_W, EYE_H); set(e, 0, EYE_H - 1); // bottom-left of the portrait eye
  const eb = toSSD1306(e);
  assert.equal(eb[0], 1, 'lands on panel (0,0) for a clockwise mount');
  const p = renderFace({ mood: 'happy', t: 0 });
  const bits = toSSD1306(p.eyeL).reduce((a, v) => a + v.toString(2).split('1').length - 1, 0);
  assert.equal(bits, litCount(p.eyeL), 'no pixel lost in rotation');
});

test('RGBA export with a visible pixel grid', () => {
  const fb = createFB(2, 1); set(fb, 0, 0);
  const out = toRGBA(fb, new Uint8ClampedArray(2 * 3 * 1 * 3 * 4), { grid: 3 });
  assert.equal(out[0], 210); // lit pixel colour
  assert.equal(out[(0 * 6 + 2) * 4], (16 + 210) >> 2); // gap column of a lit pixel is dimmer
});
