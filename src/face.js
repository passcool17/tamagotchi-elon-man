// face.js — renders the Elon Man face into a small pixel framebuffer.
//
// Pure JS, no DOM, no Phaser. Input: a mood + a time in ms. Output: an indexed-colour
// framebuffer (240x240, one byte per pixel, palette index). That is exactly what a
// GC9A01 round screen (240x240) wants once converted with toRGB565().
//
// The face is drawn on a 60x60 "pixel" grid, each grid cell = 4x4 real pixels, so it looks
// like chunky pixel art but still fills a 240x240 panel pixel for pixel.
// The palette reuses the colours of firmware/elonman_body/face.h in the elon-man repo.

export const FB_SIZE = 240;
export const GRID = 60;
export const CELL = FB_SIZE / GRID; // 4

// Palette index -> RGB565 (same constants as the ESP32 firmware, plus a few extras).
export const PALETTE_565 = [
  0x0000, // 0 BG   black
  0xffff, // 1 EYE  white
  0x07ff, // 2 CYAN
  0xfe60, // 3 GOLD
  0xf800, // 4 RED
  0x4208, // 5 DIM  dark grey
  0x8410, // 6 GREY mid grey
  0xfbb6, // 7 PINK blush
  0x8a22, // 8 DIRT brown
];
export const C = { BG: 0, EYE: 1, CYAN: 2, GOLD: 3, RED: 4, DIM: 5, GREY: 6, PINK: 7, DIRT: 8 };

export const FACE_MOODS = [
  'idle', 'happy', 'hungry', 'sleepy', 'sad', 'bored', 'dirty', 'sleeping',
  'eating', 'playing', 'cleaning',
];

export const PALETTE_RGB = PALETTE_565.map((v) => [
  Math.round(((v >> 11) & 31) * 255 / 31),
  Math.round(((v >> 5) & 63) * 255 / 63),
  Math.round((v & 31) * 255 / 31),
]);

export function createFramebuffer() {
  return { width: FB_SIZE, height: FB_SIZE, pixels: new Uint8Array(FB_SIZE * FB_SIZE) };
}

// Is the grid cell inside the round screen?
const R = GRID / 2;
const inRound = (x, y) => (x + 0.5 - R) ** 2 + (y + 0.5 - R) ** 2 <= (R - 0.3) ** 2;

class Grid {
  constructor() { this.g = new Uint8Array(GRID * GRID); }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID || !inRound(x, y)) return;
    this.g[y * GRID + x] = c;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  // rounded rectangle centred on cx,cy
  rrect(cx, cy, w, h, r, c) {
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const dx = Math.max(r - 0.5 - i, i - (w - r - 0.5), 0);
        const dy = Math.max(r - 0.5 - j, j - (h - r - 0.5), 0);
        if (dx * dx + dy * dy <= r * r + 0.25) this.px(x0 + i, y0 + j, c);
      }
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.px(x, y, c);
  }
  ring(cx, cy, r, th, c) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= r && d > r - th) this.px(x, y, c);
      }
  }
  // arc from angle a0 to a1 (degrees, 0 = right, 90 = down), thickness th
  arc(cx, cy, r, a0, a1, th, c) {
    const steps = Math.ceil(r * 6);
    for (let i = 0; i <= steps; i++) {
      const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
      for (let k = 0; k < th; k++) this.px(cx + Math.cos(a) * (r - k), cy + Math.sin(a) * (r - k), c);
    }
  }
  line(x0, y0, x1, y1, th, c) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      for (let j = 0; j < th; j++) this.px(x, y + j, c);
    }
  }
  star(cx, cy, r, c) { // 4-point sparkle
    this.px(cx, cy, c);
    for (let i = 1; i <= r; i++) { this.px(cx - i, cy, c); this.px(cx + i, cy, c); this.px(cx, cy - i, c); this.px(cx, cy + i, c); }
  }
}

const EX = [19, 41]; // eye centres (grid x)
const EY = 24;

function blinkFactor(t) {
  const p = t % 3900;
  if (p < 90) return 0.2;
  if (p < 180) return 0.55;
  return 1;
}

function eyes(g, { w = 9, h = 13, r = 4, color = C.EYE, dx = 0, dy = 0, k = 1 }) {
  const hh = Math.max(2, Math.round(h * k));
  for (const x of EX) g.rrect(x + dx, EY + dy + (h - hh) / 2, w, hh, Math.min(r, Math.floor(hh / 2)), color);
}

function zeds(g, t, color, x = 44, y = 14) {
  const ph = (t / 600) % 3;
  for (let i = 0; i < 3; i++) {
    const s = i === 2 ? 3 : i === 1 ? 4 : 5;
    const age = (ph + i) % 3;
    const zx = x + i * 3 - 2, zy = y - age * 3;
    if (zy < 4) continue;
    g.line(zx, zy, zx + s, zy, 1, color);
    g.line(zx + s, zy, zx, zy + s, 1, color);
    g.line(zx, zy + s, zx + s, zy + s, 1, color);
  }
}

const smile = (g, y, color, w = 9, th = 2) => g.arc(30, y - 10, 12, 90 - w * 4, 90 + w * 4, th, color);

const DRAW = {
  idle(g, t, dx, dy) {
    eyes(g, { dx, dy, k: blinkFactor(t) });
    g.arc(30, 33, 8, 50, 130, 1, C.GREY);
  },

  happy(g, t, dx, dy) {
    const bob = Math.round(Math.sin(t / 260) * 1);
    for (const x of EX) { g.arc(x + dx, 29 + bob + dy, 7, 200, 340, 3, C.GOLD); }
    g.rect(8, 33 + bob, 5, 3, C.PINK); g.rect(47, 33 + bob, 5, 3, C.PINK);
    g.arc(30, 31 + bob, 10, 40, 140, 3, C.GOLD);
  },

  hungry(g, t, dx, dy) {
    eyes(g, { w: 10, h: 14, dx, dy: dy + 2, k: blinkFactor(t) });
    // slanted worried brows
    g.line(13, 14, 24, 11, 1, C.GREY); g.line(36, 11, 47, 14, 1, C.GREY);
    // open mouth
    const open = 4 + Math.round((Math.sin(t / 220) + 1) * 2);
    g.rrect(30, 43, 15, open + 4, 4, C.RED);
    g.rrect(30, 43, 11, open, 2, C.BG);
    // drool
    const dd = ((t / 90) % 14);
    g.disc(37, 45 + dd, 1.4, C.CYAN);
  },

  sleepy(g, t, dx, dy) {
    const nod = Math.round(Math.sin(t / 700) * 1.5);
    const k = 0.42 + 0.12 * Math.sin(t / 900);
    eyes(g, { w: 10, h: 13, dx, dy: dy + 4 + nod, k, color: C.EYE });
    for (const x of EX) g.rect(x - 6 + dx, EY + dy - 0 + nod + 0, 12, 1, C.GREY); // lid line
    g.rrect(30, 40, 5, 3, 1, C.DIM);
    zeds(g, t, C.GOLD);
  },

  sad(g, t, dx, dy) {
    eyes(g, { w: 8, h: 12, dx, dy: dy + 3, k: blinkFactor(t) });
    g.line(12, 11, 24, 15, 1, C.GREY); g.line(36, 15, 48, 11, 1, C.GREY);
    g.arc(30, 47, 8, 215, 325, 2, C.EYE);
    const tt = (t / 110) % 22;
    g.disc(24 + dx, 34 + tt, 1.6, C.CYAN);
    g.disc(24 + dx, 33 + tt, 1.0, C.CYAN);
  },

  bored(g, t, dx, dy) {
    const look = Math.round(Math.sin(t / 1100) * 3);
    eyes(g, { w: 10, h: 10, dx: dx + look, dy: dy + 3, k: blinkFactor(t) * 0.9 });
    for (const x of EX) g.rect(x - 6 + dx + look, EY + dy - 1, 12, 3, C.DIM); // heavy lid
    g.rect(24, 40, 12, 2, C.GREY);
    const dots = Math.floor(t / 500) % 4;
    for (let i = 0; i < dots; i++) g.rect(42 + i * 4, 46, 2, 2, C.GREY);
  },

  dirty(g, t, dx, dy) {
    eyes(g, { w: 9, h: 7, dx, dy: dy + 3, k: blinkFactor(t) });
    for (const x of EX) g.rect(x - 6 + dx, EY + dy + 1, 12, 2, C.DIM);
    // grime spots
    g.disc(12, 36, 2, C.DIRT); g.disc(47, 33, 2.5, C.DIRT); g.disc(40, 44, 1.5, C.DIRT); g.disc(20, 46, 1.5, C.DIRT);
    // wobbly mouth
    for (let i = 0; i < 14; i++) g.px(23 + i, 40 + Math.round(Math.sin(i * 0.9)), C.GREY);
    // flies
    for (let i = 0; i < 2; i++) {
      const a = t / 260 + i * 3.1;
      g.px(30 + Math.cos(a) * (17 + i * 3), 12 + Math.sin(a * 1.3) * 5 + i * 2, C.EYE);
    }
  },

  sleeping(g, t, dx, dy) {
    const br = Math.round(Math.sin(t / 900));
    for (const x of EX) g.arc(x + dx, 22 + br + dy, 7, 20, 160, 2, C.DIM);
    g.rrect(30, 38 + br, 4, 3, 1, C.DIM);
    zeds(g, t, C.DIM, 40, 18);
  },

  eating(g, t, dx, dy) {
    for (const x of EX) g.arc(x + dx, 28 + dy, 7, 200, 340, 3, C.GOLD);
    const chew = Math.floor(t / 160) % 2;
    g.rrect(30, 41, 14, chew ? 9 : 4, 3, C.RED);
    if (chew) g.rrect(30, 41, 10, 5, 2, C.BG);
    g.rect(8, 33, 5, 3, C.PINK); g.rect(47, 33, 5, 3, C.PINK);
    for (let i = 0; i < 3; i++) g.px(22 + ((t / 90 + i * 7) % 16), 52 - ((t / 70 + i * 5) % 8), C.GOLD);
  },

  playing(g, t, dx, dy) {
    const a = t / 170;
    eyes(g, { w: 10, h: 14, dx: dx + Math.round(Math.cos(a) * 2), dy: dy + Math.round(Math.sin(a) * 2) });
    for (const x of EX) g.rect(x - 1 + dx + Math.round(Math.cos(a) * 2), EY - 3 + dy + Math.round(Math.sin(a) * 2), 3, 3, C.CYAN);
    g.rrect(30, 41, 18, 8, 4, C.GOLD);
    g.rect(21, 37, 18, 4, C.BG);
    const on = Math.floor(t / 180) % 3;
    g.star(8 + on * 2, 12 + on * 3, 2 + (on % 2), C.GOLD);
    g.star(52 - on * 2, 18 - on, 2, C.CYAN);
    g.star(50, 46 - on * 2, 1 + (on % 2), C.GOLD);
  },

  cleaning(g, t, dx, dy) {
    for (const x of EX) g.line(x - 5 + dx, 25 + dy, x + 5 + dx, 25 + dy, 2, C.EYE);
    g.arc(30, 31, 10, 40, 140, 2, C.GOLD);
    for (let i = 0; i < 7; i++) {
      const ph = (t / 14 + i * 37) % 100;
      const bx = 8 + ((i * 17) % 44), by = 56 - ph * 0.52;
      g.ring(bx, by, 3 + (i % 3), 1, C.CYAN);
      g.px(bx - 1, by - 1, C.EYE);
    }
  },
};

// Render a mood into a framebuffer.
//   params: { mood, t (ms, any monotonic clock), gaze (-1..1, left..right, optional) }
export function renderFace(params, fb = createFramebuffer()) {
  const { mood = 'idle', t = 0, gaze = 0 } = params;
  const draw = DRAW[mood] || DRAW.idle;
  const g = new Grid();
  draw(g, t, Math.round(gaze * 3), 0);
  // expand grid -> framebuffer (nearest, CELL x CELL)
  const px = fb.pixels;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const c = g.g[y * GRID + x];
      for (let j = 0; j < CELL; j++) {
        const row = (y * CELL + j) * FB_SIZE + x * CELL;
        for (let i = 0; i < CELL; i++) px[row + i] = c;
      }
    }
  }
  return fb;
}

// Is a framebuffer pixel inside the round display? (outside is not visible)
export function insideScreen(x, y) {
  return (x + 0.5 - FB_SIZE / 2) ** 2 + (y + 0.5 - FB_SIZE / 2) ** 2 <= (FB_SIZE / 2) ** 2;
}

// Convert to RGB565 (big-endian bytes, ready for an SPI display write) — the real-robot path.
export function toRGB565(fb, out = new Uint8Array(fb.width * fb.height * 2)) {
  for (let i = 0; i < fb.pixels.length; i++) {
    const v = PALETTE_565[fb.pixels[i]];
    out[i * 2] = v >> 8;
    out[i * 2 + 1] = v & 255;
  }
  return out;
}

// Convert to RGBA for a canvas ImageData. Pixels outside the round screen become transparent.
export function toRGBA(fb, out = new Uint8ClampedArray(fb.width * fb.height * 4)) {
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const i = y * fb.width + x;
      const [r, g, b] = PALETTE_RGB[fb.pixels[i]];
      out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b;
      out[i * 4 + 3] = insideScreen(x, y) ? 255 : 0;
    }
  }
  return out;
}
