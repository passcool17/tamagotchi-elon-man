import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUTOUTS, AA, PLATE, cutoutBox, cutoutMask, insideCutout } from '../src/faceplate.js';
import { renderFace, OLED_MOODS, litCount } from '../src/oled.js';

const MARGIN = 1.5; // mm of OLED active area kept around every hole
const WALL = 1.5;   // mm of plastic needed between holes / to the plate edge

test('every cutout fits inside its 21.74 × 10.86 mm OLED active area with margin', () => {
  for (const [k, c] of Object.entries(CUTOUTS)) {
    const b = cutoutBox(c);
    assert.ok(b.x1 - b.x0 <= AA.w - 2 * MARGIN, `${k} width`);
    assert.ok(Math.max(Math.abs(b.z0), Math.abs(b.z1)) <= AA.h / 2 - MARGIN, `${k} height`);
  }
});

test('cutouts are printable: plastic wall between holes and inside the 105.5 × 68.85 plate', () => {
  const box = (k) => { const c = CUTOUTS[k], b = cutoutBox(c); return { x0: c.x + b.x0, x1: c.x + b.x1, z0: c.z + b.z0, z1: c.z + b.z1 }; };
  const L = box('eyeL'), Rr = box('eyeR'), M = box('mouth');
  assert.ok(Rr.x0 - L.x1 >= WALL, 'between the eyes');
  assert.ok(Math.min(L.z0, Rr.z0) - M.z1 >= WALL, 'eyes to mouth');
  for (const b of [L, Rr, M]) {
    for (const [x, z] of [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]]) {
      assert.ok((x / (PLATE.w / 2 - WALL)) ** 2 + (z / (PLATE.h / 2 - WALL)) ** 2 <= 1, 'inside the plate');
    }
  }
  assert.ok(CUTOUTS.mouth.th >= 3, 'mouth slot thick enough to print and to see pixels');
});

test('mouth mask is the smile slot: centre lit, corners up, far corners of the panel hidden', () => {
  const m = cutoutMask('mouth');
  assert.equal(m[32 * 128 + 64], 1);
  assert.equal(m[0], 0); assert.equal(m[63 * 128 + 127], 0);
  assert.ok(insideCutout(CUTOUTS.mouth, 7, 1.2) && !insideCutout(CUTOUTS.mouth, 7, -2), 'corners turn up');
  assert.ok(insideCutout(CUTOUTS.eyeL, 0, 0) && !insideCutout(CUTOUTS.eyeL, 10, 0));
});

test('plate mode: every mood lights only pixels visible through the mouth slot, all moods differ', () => {
  const m = cutoutMask('mouth');
  const seen = new Set();
  for (const mood of OLED_MOODS) {
    const p = renderFace({ mood, t: 1000, talk: 0.5, plate: true });
    assert.ok(litCount(p.mouth) > 20, mood);
    p.mouth.px.forEach((v, i) => { if (v) assert.equal(m[i], 1, `${mood} lit outside slot`); });
    seen.add(Buffer.from(p.mouth.px).toString('base64'));
  }
  assert.equal(seen.size, OLED_MOODS.length);
});

test('plate mode: talking slot opens with the level, idle fills the whole smile', () => {
  const lvl = (talk) => litCount(renderFace({ mood: 'talking', t: 1000, talk, plate: true }).mouth);
  assert.ok(lvl(1) > lvl(0.2));
  assert.equal(litCount(renderFace({ mood: 'idle', plate: true }).mouth), litCount({ px: cutoutMask('mouth') }));
});

test('eyes show through the elliptical holes (most lit eye pixels are visible)', () => {
  const m = cutoutMask('eyeL');
  const p = renderFace({ mood: 'idle', t: 2000, plate: true });
  let vis = 0; p.eyeL.px.forEach((v, i) => { if (v && m[i]) vis++; });
  assert.ok(vis / litCount(p.eyeL) > 0.85);
});

test('print-v2 option B: eyes 28.6 mm apart, windows 18.5 × 7.8, mouth ≈ 17.2 × 4.4', () => {
  assert.equal(CUTOUTS.eyeR.x - CUTOUTS.eyeL.x, 28.6);
  assert.equal(CUTOUTS.eyeL.w, 18.5); assert.equal(CUTOUTS.eyeL.h, 7.8);
  const b = cutoutBox(CUTOUTS.mouth);
  assert.ok(Math.abs(b.x1 - b.x0 - 17.2) < 0.05 && Math.abs(b.z1 - b.z0 - 4.4) < 0.05);
});
