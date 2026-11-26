// faceplate.js — face plate geometry (pure, no Phaser, no DOM).
// v2.2: final print-v2 robot (elonman_v2.py, variant B chosen by Pascal 26 nov. 07:26): elliptical gray PETG plate
// 105.5 × 68.85 mm with a flat chin, eyes at ±14.3 mm (28.6 mm apart), mouth = the SVG smile 17.2 × 4.4 mm.
// The original elon-man head (hardware/cad/elonman.scad) has a Ø62 mm round face hole with a gray
// bezel Ø74 / Ø58. v2.1 (Pascal's pick, mockup 2) puts a gray plate in that hole with printable
// eye + mouth cutouts; three ELEGOO 0.96" SSD1306 (128×64, landscape) sit behind it.
// Same numbers as cutouts-face-plate.svg. Units: mm, origin = face centre, +X right, +Z up.

export const AA = { w: 21.74, h: 10.86 };           // OLED active area (128 × 64 px)
export const PX_PER_MM = { x: 128 / AA.w, y: 64 / AA.h };
export const PLATE = { w: 105.5, h: 68.85, outer: 74, hole: 62, inner: 58 };

export const CUTOUTS = {
  eyeL: { kind: 'ellipse', x: -14.3, z: 8.5, w: 18.5, h: 7.8 },
  eyeR: { kind: 'ellipse', x: 14.3, z: 8.5, w: 18.5, h: 7.8 },
  // thick round-capped smile: quadratic spine P0 → C → P2 (relative to the mouth centre), stroke `th`
  mouth: { kind: 'smile', x: 0, z: -11, p0: [-7, 1.2], c: [0, -1.2], p2: [7, 1.2], th: 3.2 },
};

const lerp = (a, b, t) => a + (b - a) * t;
export function smileSpine(cut, n = 48) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(lerp(cut.p0[0], cut.c[0], t), lerp(cut.c[0], cut.p2[0], t), t);
    const z = lerp(lerp(cut.p0[1], cut.c[1], t), lerp(cut.c[1], cut.p2[1], t), t);
    pts.push([x, z]);
  }
  return pts;
}

// Is a point (mm, relative to the cutout's own centre) inside the cutout?
export function insideCutout(cut, x, z) {
  if (cut.kind === 'ellipse') return (x / (cut.w / 2)) ** 2 + (z / (cut.h / 2)) ** 2 <= 1;
  const r = cut.th / 2;
  const pts = smileSpine(cut, 96);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    if ((x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2 <= r * r) return true;
  }
  return false;
}

// Bounding box in mm (relative to the cutout centre).
export function cutoutBox(cut) {
  if (cut.kind === 'ellipse') return { x0: -cut.w / 2, x1: cut.w / 2, z0: -cut.h / 2, z1: cut.h / 2 };
  const pts = smileSpine(cut), r = cut.th / 2;
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  return { x0: Math.min(...xs) - r, x1: Math.max(...xs) + r, z0: Math.min(...zs) - r, z1: Math.max(...zs) + r };
}

// 1-bit mask (128×64) of the pixels visible through a cutout: the OLED is centred behind its hole.
const maskCache = new Map();
export function cutoutMask(key) {
  if (maskCache.has(key)) return maskCache.get(key);
  const cut = CUTOUTS[key], m = new Uint8Array(128 * 64);
  for (let py = 0; py < 64; py++) {
    for (let px = 0; px < 128; px++) {
      const x = (px + 0.5 - 64) / PX_PER_MM.x, z = (32 - py - 0.5) / PX_PER_MM.y;
      if (insideCutout(cut, x, z)) m[py * 128 + px] = 1;
    }
  }
  maskCache.set(key, m);
  return m;
}
