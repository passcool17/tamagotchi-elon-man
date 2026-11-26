// oled.js — pure renderer for the 3 monochrome OLEDs of the real robot (no Phaser, no DOM).
// Hardware: 3 × ELEGOO 0.96" SSD1306, all mounted landscape (Pascal, 25 nov. 2026).
// Each panel is 128×64, 1 bit, same as firmware/elonman_body (FACE_OLED3, setRotation(0)).
// A framebuffer is { w, h, px: Uint8Array(w*h) } with 0 = off, 1 = lit.

import { cutoutMask } from './faceplate.js';

export const PANEL_W = 128, PANEL_H = 64;
export const EYE_W = PANEL_W, EYE_H = PANEL_H;
export const OLED_MOODS = ['happy', 'idle', 'hungry', 'sleepy', 'sad', 'bored', 'dirty', 'sleeping',
  'eating', 'playing', 'cleaning', 'talking', 'thinking'];

export function createFB(w, h) { return { w, h, px: new Uint8Array(w * h) }; }
export function createPanels() {
  return { eyeL: createFB(EYE_W, EYE_H), eyeR: createFB(EYE_W, EYE_H), mouth: createFB(PANEL_W, PANEL_H) };
}

// ---------- 1-bit primitives (all clip to the panel) ----------
export function clear(fb, v = 0) { fb.px.fill(v); }
export function set(fb, x, y, v = 1) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= fb.w || y >= fb.h) return;
  fb.px[y * fb.w + x] = v;
}
export const get = (fb, x, y) => (x < 0 || y < 0 || x >= fb.w || y >= fb.h ? 0 : fb.px[y * fb.w + x]);
export function fillRect(fb, x, y, w, h, v = 1) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(fb.w, Math.round(x + w)), y1 = Math.min(fb.h, Math.round(y + h));
  for (let j = y0; j < y1; j++) fb.px.fill(v, j * fb.w + x0, j * fb.w + Math.max(x0, x1));
}
export function fillEllipse(fb, cx, cy, rx, ry, v = 1) {
  if (rx <= 0 || ry <= 0) return;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const dy = (y + 0.5 - cy) / ry;
    if (dy * dy > 1) continue;
    const hw = rx * Math.sqrt(1 - dy * dy);
    fillRect(fb, cx - hw, y, hw * 2, 1, v);
  }
}
export function fillRoundRect(fb, x, y, w, h, r, v = 1) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  fillRect(fb, x + r, y, w - 2 * r, h, v);
  fillRect(fb, x, y + r, w, h - 2 * r, v);
  fillEllipse(fb, x + r, y + r, r, r, v); fillEllipse(fb, x + w - r, y + r, r, r, v);
  fillEllipse(fb, x + r, y + h - r, r, r, v); fillEllipse(fb, x + w - r, y + h - r, r, r, v);
}
export function line(fb, x0, y0, x1, y1, th = 1, v = 1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
    if (th <= 1) set(fb, x, y, v); else fillEllipse(fb, x, y, th / 2, th / 2, v);
  }
}
// arc of an ellipse from a0 to a1 (radians, 0 = right, PI/2 = down)
export function arc(fb, cx, cy, rx, ry, a0, a1, th = 3, v = 1) {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / 1.5));
  let px = cx + Math.cos(a0) * rx, py = cy + Math.sin(a0) * ry;
  for (let i = 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    line(fb, px, py, x, y, th, v); px = x; py = y;
  }
}
// tiny 5×7 glyphs for the sleeping "Z"
const GLYPH = { Z: ['11111', '00010', '00100', '01000', '10000', '11111'] };
export function glyph(fb, ch, x, y, s = 2) {
  const g = GLYPH[ch]; if (!g) return;
  g.forEach((row, j) => [...row].forEach((c, i) => { if (c === '1') fillRect(fb, x + i * s, y + j * s, s, s); }));
}

// ---------- eyes (128×64 landscape, same as the mouth and the firmware) ----------
function eyeOpen(fb, { lx = 0, ly = 0, open = 1, wide = 1, sad = 0, side = 1 }) {
  const cx = EYE_W / 2, cy = EYE_H / 2;
  // firmware idle eye is ~40×28; slightly larger here so it reads on a phone, still clearly landscape
  const w = 80 * wide, h = Math.max(4, 44 * open);
  fillRoundRect(fb, cx - w / 2, cy - h / 2, w, h, Math.min(h / 2, 20));
  if (h > 14) {
    const prx = 12 * wide, pry = Math.min(11 * wide, h / 2 - 3);
    const px = cx + lx * 22, py = cy + ly * Math.min(10, h / 2 - pry - 2);
    fillEllipse(fb, px, py, prx, pry, 0);
    fillRect(fb, px - prx * 0.5, py - pry * 0.7, 5, 4, 1);
  }
  if (sad) {
    const top = cy - h / 2 - 1;
    for (let x = 0; x < EYE_W; x++) {
      const k = side > 0 ? x / EYE_W : 1 - x / EYE_W;
      fillRect(fb, x, top, 1, 4 + sad * 22 * (1 - k), 0);
    }
  }
}
function eyeHappy(fb, ly = 0) {
  // firmware FACE_HAPPY: a wide upward chevron (squint smile)
  arc(fb, EYE_W / 2, EYE_H / 2 + 14 + ly, 36, 22, Math.PI * 1.12, Math.PI * 1.88, 8);
}
function eyeClosed(fb, ly = 0) {
  // firmware FACE_SLEEP: a short horizontal bar
  fillRoundRect(fb, EYE_W / 2 - 36, EYE_H / 2 - 3 + ly, 72, 6, 3);
}
function eyeSquint(fb, side) {
  const cx = EYE_W / 2, cy = EYE_H / 2, d = side > 0 ? 1 : -1;
  line(fb, cx - 28 * d, cy - 14, cx + 22 * d, cy, 7);
  line(fb, cx + 22 * d, cy, cx - 28 * d, cy + 14, 7);
}
function eyeStar(fb, t) {
  const cx = EYE_W / 2, cy = EYE_H / 2, r = 22 + Math.sin(t / 120) * 3;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    line(fb, cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r, i % 2 ? 4 : 8);
  }
  fillEllipse(fb, cx, cy, 8, 8);
}


// blink: closed for ~120 ms every ~4 s, offset so it never looks mechanical
export function blinkOpen(t) {
  const p = (t + 977) % 4200;
  if (p < 60) return 1 - p / 60;
  if (p < 120) return (p - 60) / 60;
  return 1;
}

function drawEye(fb, mood, t, side, look) {
  clear(fb);
  const lx = Math.max(-1, Math.min(1, look.x)), ly = Math.max(-1, Math.min(1, look.y));
  const b = blinkOpen(t + (side > 0 ? 0 : 23));
  switch (mood) {
    case 'happy': eyeHappy(fb, ly * 6); break;
    case 'eating': eyeHappy(fb, 4); break;
    case 'sleeping': eyeClosed(fb, 10); break;
    case 'sleepy': eyeOpen(fb, { lx, ly: 0.4, open: 0.28 * b + 0.02 }); fillRect(fb, 0, 0, EYE_W, EYE_H / 2 - 4, 0); break;
    case 'sad': eyeOpen(fb, { lx, ly: 0.5, open: 0.75 * b, sad: 1, side }); if ((t / 900) % 2 < 1 && side > 0) fillEllipse(fb, 28, 50 + ((t / 30) % 10), 3, 4); break;
    case 'hungry': eyeOpen(fb, { lx: 0, ly: 0.9, open: b, wide: 1.05 }); break;
    case 'bored': eyeOpen(fb, { lx: 1, ly: 0.2, open: 0.42 * b }); fillRect(fb, 0, 0, EYE_W, EYE_H / 2 - 12, 0); break;
    case 'dirty': case 'cleaning': eyeSquint(fb, side); break;
    case 'playing': eyeStar(fb, t); break;
    case 'thinking': eyeOpen(fb, { lx: 0.6, ly: -1, open: b }); break;
    case 'talking': eyeOpen(fb, { lx, ly, open: b, wide: 1.05 }); break;
    default: eyeOpen(fb, { lx, ly, open: b });
  }
}

// ---------- mouth (128×64 landscape) ----------
function drawMouth(fb, mood, t, talk) {
  clear(fb);
  const cx = PANEL_W / 2, cy = PANEL_H / 2;
  switch (mood) {
    case 'happy': arc(fb, cx, cy - 18, 44, 34, Math.PI * 0.12, Math.PI * 0.88, 9); break;
    case 'playing': fillEllipse(fb, cx, cy - 4, 36, 22); fillRect(fb, cx - 40, cy - 30, 80, 24, 0); fillEllipse(fb, cx, cy + 6, 14, 6, 0); break;
    case 'eating': { const o = Math.abs(Math.sin(t / 110)); fillRoundRect(fb, cx - 26, cy - 4 - 12 * o, 52, 8 + 24 * o, 8); fillRect(fb, cx - 18, cy - 2 - 10 * o, 36, 4 + 18 * o, 0); break; }
    case 'sad': arc(fb, cx, cy + 22, 30, 18, Math.PI * 1.15, Math.PI * 1.85, 6); break;
    case 'hungry': fillEllipse(fb, cx, cy, 16, 18); fillEllipse(fb, cx, cy, 9, 11, 0); fillRect(fb, cx + 10, cy + 14, 4, 6 + ((t / 90) % 12)); break;
    case 'sleepy': fillRoundRect(fb, cx - 12, cy - 6, 24, 12, 6); break;
    case 'bored': fillRect(fb, cx - 30, cy + 2, 44, 5); break;
    case 'dirty': for (let x = -36; x <= 36; x += 3) fillEllipse(fb, cx + x, cy + Math.sin((x + t / 40) / 6) * 6, 2.5, 2.5); break;
    case 'cleaning': fillEllipse(fb, cx, cy, 10, 10); fillEllipse(fb, cx, cy, 6, 6, 0);
      for (let i = 0; i < 3; i++) { const y = ((t / 18 + i * 21) % 64); fillEllipse(fb, cx + 30 + i * 12, 64 - y, 5, 5); fillEllipse(fb, cx + 30 + i * 12, 64 - y, 3, 3, 0); } break;
    case 'sleeping': { const k = Math.floor(t / 600) % 3; glyph(fb, 'Z', 30, 30, 3); if (k > 0) glyph(fb, 'Z', 58, 16, 4); if (k > 1) glyph(fb, 'Z', 88, 4, 5); break; }
    case 'thinking': { const p = Math.floor(t / 280) % 3; for (let i = 0; i < 3; i++) fillEllipse(fb, cx - 22 + i * 22, cy, p === i ? 6 : 3, p === i ? 6 : 3); break; }
    case 'talking': {
      // equaliser-like bars driven by `talk` (0..1) plus a wobble, like the firmware's TALK frames
      const lvl = Math.max(0.15, Math.min(1, talk));
      for (let i = 0; i < 9; i++) {
        const hgt = 6 + lvl * 40 * (0.45 + 0.55 * Math.abs(Math.sin(t / 70 + i * 1.7)));
        fillRoundRect(fb, cx - 45 + i * 10, cy - hgt / 2, 7, hgt, 3);
      }
      break;
    }
    default: fillRoundRect(fb, cx - 30, cy - 4, 60, 8, 4);
  }
}

// ---------- v2.1 mouth behind the smile cutout ----------
// The face plate only shows a thick smile-shaped slot of the mouth OLED, so the mouth expressions are
// drawn as light patterns INSIDE that slot (how much of it is lit, where, moving how). Nothing outside
// the slot is lit, so the firmware can push the exact same buffer to the real panel.
const SLOT_HALF = 52; // half-length of the slot in panel pixels (8.6 mm × 5.89 px/mm ≈ 51)
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
function drawMouthSlot(fb, mood, t, talk) {
  clear(fb);
  const mask = cutoutMask('mouth');
  const blob = (u0, r) => (u) => Math.abs(u - u0) <= r;
  let lit;
  switch (mood) {
    case 'happy': { const s = ((t % 3200) / 700) - 1.3; lit = (u, v) => Math.abs(u - s) > 0.05 || v % 2 === 0; break; }   // full smile + a shimmer that sweeps across now and then
    case 'playing': { const s = Math.sin(t / 180); lit = (u, v) => Math.abs(u - s) > 0.18 || (v & 1); break; }
    case 'talking': { const lvl = Math.max(0.15, Math.min(1, talk)); lit = (u) => Math.abs(u) <= lvl && (Math.floor((u + 1) * 9 + t / 90) % 3 !== 0); break; }
    case 'eating': { const o = 0.35 + 0.65 * Math.abs(Math.sin(t / 110)); lit = (u) => Math.abs(u) <= o; break; }
    case 'hungry': { const o = Math.floor(t / 120); lit = (u) => (Math.floor((u + 1) * 8) + o) % 2 === 0; break; }
    case 'sad': lit = (u) => Math.abs(u) <= 0.32; break;
    case 'sleepy': lit = (u) => Math.abs(u) <= 0.18; break;
    case 'bored': lit = (u, v) => Math.abs(u) <= 0.7 && (v + Math.round(u * SLOT_HALF)) % 2 === 0; break;
    case 'dirty': { const k = Math.floor(t / 160); lit = (u, v) => hash(Math.round(u * SLOT_HALF), v + k) > 0.55; break; }
    case 'cleaning': { const p = ((t / 900) % 1) * 2 - 1; lit = (u) => blob(p, 0.1)(u) || blob(p - 0.7, 0.07)(u) || blob(p + 0.7, 0.07)(u) || blob(p - 1.4, 0.07)(u); break; }
    case 'sleeping': { const r = 0.08 + 0.05 * Math.sin(t / 600); lit = blob(0, r); break; }
    case 'thinking': { const k = Math.floor(t / 280) % 3; lit = (u) => [-0.5, 0, 0.5].some((c, i) => Math.abs(u - c) <= (i === k ? 0.12 : 0.06)); break; }
    default: lit = () => true; // idle: the whole smile glows
  }
  for (let y = 0; y < PANEL_H; y++) {
    for (let x = 0; x < PANEL_W; x++) {
      const i = y * PANEL_W + x;
      if (mask[i] && lit((x - PANEL_W / 2) / SLOT_HALF, y)) fb.px[i] = 1;
    }
  }
}

// Render the whole face. look: {x,y} in [-1,1] (eyes lead the head turn). talk: 0..1 mouth level.
// plate: true = v2.1 face plate (mouth drawn inside the smile cutout). Eyes are the same either way:
// the elliptical eye holes are larger than the eye drawings.
export function renderFace({ mood = 'idle', t = 0, look = { x: 0, y: 0 }, talk = 0, plate = false } = {}, panels = createPanels()) {
  const m = OLED_MOODS.includes(mood) ? mood : 'idle';
  drawEye(panels.eyeL, m, t, 1, look);
  drawEye(panels.eyeR, m, t, -1, look);
  if (plate) drawMouthSlot(panels.mouth, m, t, talk); else drawMouth(panels.mouth, m, t, talk);
  return panels;
}

// ---------- exports ----------
// RGBA for a canvas. on/off colours as [r,g,b]. With `grid` = n, each OLED pixel becomes an n×n block
// whose last row/column is a dim gap: the visible pixel matrix of a real OLED.
export function toRGBA(fb, out, { on = [210, 238, 255], off = [6, 9, 14], grid = 1, gap = [16, 20, 28] } = {}) {
  const W = fb.w * grid;
  for (let y = 0; y < fb.h * grid; y++) {
    for (let x = 0; x < W; x++) {
      const lit = fb.px[((y / grid) | 0) * fb.w + ((x / grid) | 0)];
      const edge = grid > 2 && (x % grid === grid - 1 || y % grid === grid - 1);
      const c = edge ? (lit ? gap.map((g, i) => (g + on[i]) >> 2) : gap) : lit ? on : off;
      const o = (y * W + x) * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  return out;
}

// SSD1306 GDDRAM layout (what Adafruit_SSD1306's buffer holds): 8 pages × 128 columns, bit 0 = top row.
// All 3 panels are already 128×64 landscape, so no rotation (firmware setRotation(0)).
export function toSSD1306(fb) {
  const out = new Uint8Array((PANEL_W * PANEL_H) / 8);
  for (let y = 0; y < PANEL_H; y++) {
    for (let x = 0; x < PANEL_W; x++) {
      if (get(fb, x, y)) out[(y >> 3) * PANEL_W + x] |= 1 << (y & 7);
    }
  }
  return out;
}

export const litCount = (fb) => fb.px.reduce((a, v) => a + v, 0);
