// robot.js — flat 2D replica of the REAL Elon Man (passcool17/elon-man, hardware/print-v1, MIT).
// Front view, drawn with Phaser vector Graphics every frame (see GAME.md for why not SVG):
//   black base · red tapered body + 2 orange chevrons · black pan plate (MG996R) · central column + cardan
//   · 2 blue SG90 with horns and push rods · black X plate under the head · red dome head
//   · grey face plate · 3 black OLED frames (2 eyes + mouth, all landscape 128×64), each a live texture.
// Only the head and the neck mechanism move. The base and the body never move.
import { EYE_W, EYE_H, PANEL_W, PANEL_H } from '../oled.js';

export const ROBOT = {
  cx: 360,
  pivotY: 758,          // cardan (nod/tilt centre), top of the central column
  headBottom: -18,      // head local y of the flat bottom (relative to the pivot)
  rx: 258, ry: 352,     // dome half-width / height
  plate: { rx: 232, ry: 328, bottom: -32 },
  oled: 1.12,           // game px per OLED pixel (all 3 panels 128×64 landscape)
  eyeX: 86, eyeCY: -220, mouthCY: -102,
  discY: 846, bodyTop: 872, bodyH: 246, bodyWTop: 300, bodyWBottom: 262, baseY: 1140,
  servoX: 80, hornY: 790, hornLen: 34,
  grid: 3,              // texture pixels per OLED pixel (gives the visible pixel matrix)
};

export const COLORS = {
  red: 0xc0291f, redShade: 0x8f1b14, redLight: 0xe0483a, redRim: 0x9e2018,
  plate: 0x8b9097, plateLight: 0xa5aab1, plateShade: 0x6d7279,
  black: 0x111214, blackHi: 0x26282d, blackLo: 0x060708,
  servo: 0x2f64a3, servoLight: 0x4a83c6, horn: 0xe9edf2, rod: 0x9aa3ad,
  chevron: 0xe58a1f, chevronShade: 0xa85f0f,
};

function gfx(scene) { return scene.make.graphics({ x: 0, y: 0, add: false }); }

export function buildRobotTextures(scene) {
  // ---- body: flat tapered block, one shade band, two orange chevrons (V pointing down) ----
  {
    const { bodyH: H, bodyWTop: wt, bodyWBottom: wb } = ROBOT;
    const W = wt + 40, ox = 20, g = gfx(scene);
    const xl = (y) => ox + (wt - (wt + (wb - wt) * (y / H))) / 2;
    const xr = (y) => ox + wt - (wt - (wt + (wb - wt) * (y / H))) / 2;
    g.fillStyle(0x000000, 0.28); g.fillPoints([{ x: xl(0) + 10, y: 8 }, { x: xr(0) + 10, y: 8 }, { x: xr(H) + 10, y: H + 6 }, { x: xl(H) + 10, y: H + 6 }], true);
    g.fillStyle(COLORS.red, 1); g.fillPoints([{ x: xl(0), y: 0 }, { x: xr(0), y: 0 }, { x: xr(H), y: H }, { x: xl(H), y: H }], true);
    g.fillStyle(COLORS.redShade, 1); g.fillPoints([{ x: xr(0) - 34, y: 0 }, { x: xr(0), y: 0 }, { x: xr(H), y: H }, { x: xr(H) - 30, y: H }], true);
    g.fillStyle(COLORS.redLight, 1); g.fillPoints([{ x: xl(0), y: 0 }, { x: xl(0) + 14, y: 0 }, { x: xl(H) + 12, y: H }, { x: xl(H), y: H }], true);
    g.fillStyle(COLORS.redRim, 1); g.fillRect(xl(0), 0, wt, 8);
    g.fillStyle(0x000000, 0.35); g.fillEllipse(W / 2, 4, 120, 10); // hole for the neck hub
    const chevron = (cy, w, th, drop, fill) => {
      const cx = W / 2;
      g.fillStyle(fill, 1);
      g.fillPoints([{ x: cx - w / 2, y: cy }, { x: cx, y: cy + drop }, { x: cx + w / 2, y: cy },
        { x: cx + w / 2, y: cy + th }, { x: cx, y: cy + drop + th }, { x: cx - w / 2, y: cy + th }], true);
    };
    for (const cy of [62, 116]) { chevron(cy + 3, 150, 18, 36, COLORS.chevronShade); chevron(cy, 150, 16, 36, COLORS.chevron); }
    g.generateTexture('rb-body', W, H + 10);
    g.destroy();
  }
  // ---- base: black plate with the side vents of apercu-cote.png ----
  {
    const g = gfx(scene);
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(8, 14, 400, 66, 18);
    g.fillStyle(COLORS.black, 1); g.fillRoundedRect(0, 0, 400, 62, 18);
    g.fillStyle(COLORS.blackHi, 1); g.fillRoundedRect(0, 0, 400, 16, { tl: 18, tr: 18, bl: 2, br: 2 });
    for (let i = 0; i < 6; i++) { g.fillStyle(i < 2 ? 0x8a9099 : 0x2f64a3, 1); g.fillRoundedRect(150 + i * 18, 28, 7, 22, 3); }
    g.generateTexture('rb-base', 408, 82);
    g.destroy();
  }
}

// Create the 3 OLED canvas textures. Returns { eyeL, eyeR, mouth } each { tex, ctx, img } (img = ImageData).
export function createOledTextures(scene) {
  const G = ROBOT.grid;
  const mk = (key, w, h) => {
    const tex = scene.textures.createCanvas(key, w * G, h * G);
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    const ctx = tex.getContext();
    return { tex, ctx, img: ctx.createImageData(w * G, h * G) };
  };
  return { eyeL: mk('oled-eyeL', EYE_W, EYE_H), eyeR: mk('oled-eyeR', EYE_W, EYE_H), mouth: mk('oled-mouth', PANEL_W, PANEL_H) };
}

const D2R = Math.PI / 180;

// The animated robot. Call robot.update(pose) with pose = { pan, nod, tilt } in degrees.
export function createRobot(scene) {
  const R = ROBOT, cx = R.cx;
  const robot = { pose: { pan: 0, nod: 0, tilt: 0 }, hop: 0 };

  scene.add.ellipse(cx, R.baseY + 34, 440, 40, 0x000000, 0.4).setDepth(1);
  scene.add.image(cx, R.baseY, 'rb-base').setDepth(2);
  scene.add.image(cx, R.bodyTop + (R.bodyH + 10) / 2, 'rb-body').setDepth(3);
  const neck = scene.add.graphics().setDepth(4);
  const head = scene.add.container(cx, R.pivotY).setDepth(5);
  const shell = scene.add.graphics();
  const G = R.grid;
  const eyeL = scene.add.image(0, 0, 'oled-eyeL');
  const eyeR = scene.add.image(0, 0, 'oled-eyeR');
  const mouth = scene.add.image(0, 0, 'oled-mouth');
  const glare = scene.add.graphics();
  head.add([shell, eyeL, eyeR, mouth, glare]);
  robot.parts = { neck, head, shell, eyeL, eyeR, mouth };

  // face-plate horizontal shift for a pan angle: the flat face slides toward the turn and narrows (cos),
  // but never leaves the dome silhouette.
  const plateShift = (s, c) => Math.sign(s) * Math.min(Math.abs(s) * R.rx * 0.62, Math.max(0, R.rx - 10 - R.plate.rx * c));

  robot.update = (pose = robot.pose) => {
    robot.pose = pose;
    const pan = pose.pan * D2R, c = Math.max(0.02, Math.cos(pan)), s = Math.sin(pan);
    const nod = pose.nod, tilt = pose.tilt;
    const hop = robot.hop;

    // ---------- head (container rotates for tilt around the cardan) ----------
    head.setPosition(cx, R.pivotY + hop).setAngle(tilt);
    const g = shell; g.clear();
    const hb = R.headBottom - nod * 0.5;
    // X plate under the head (black, 2 arms to the rod ball joints), turns with pan
    const armX = R.servoX * c + 14 * Math.abs(c);
    g.fillStyle(COLORS.black, 1); g.fillRoundedRect(-armX - 12, hb - 2, (armX + 12) * 2, 14, 7);
    g.fillStyle(COLORS.blackHi, 1); g.fillCircle(-R.servoX * c, hb + 5 - nod * 1.2 + nod * 0.5, 6); g.fillCircle(R.servoX * c, hb + 5 - nod * 1.2 + nod * 0.5, 6);
    // dome: half ellipse with flat bottom
    const dome = (rx, ry, y0, col, dx = 0) => {
      g.fillStyle(col, 1); g.beginPath(); g.moveTo(-rx + dx, y0);
      for (let i = 0; i <= 40; i++) { const a = Math.PI + (Math.PI * i) / 40; g.lineTo(dx + Math.cos(a) * rx, y0 + Math.sin(a) * ry); }
      g.closePath(); g.fillPath();
    };
    dome(R.rx + 4, R.ry + 4, hb + 2, 0x000000);           // outline
    dome(R.rx, R.ry, hb, COLORS.redShade);
    dome(R.rx - 16, R.ry - 10, hb, COLORS.red, -10 - s * 8); // lit side (light from the upper left)
    g.fillStyle(COLORS.redLight, 0.55); g.fillEllipse(-110 - s * 30, hb - R.ry * 0.72, 90, 46);
    // face plate (grey, flat D shape), squeezed by cos(pan), lowered/raised by nod
    const sx = plateShift(s, c);
    const py = R.plate.bottom - nod * 2.2, prx = R.plate.rx * c, pry = R.plate.ry * (1 - Math.abs(nod) * 0.006);
    const plateD = (rx, ry, y0, col, dx) => {
      g.fillStyle(col, 1); g.beginPath(); g.moveTo(dx - rx, y0);
      for (let i = 0; i <= 40; i++) { const a = Math.PI + (Math.PI * i) / 40; g.lineTo(dx + Math.cos(a) * rx, y0 + Math.sin(a) * ry); }
      g.closePath(); g.fillPath();
    };
    // plate thickness sliver on the side that turns away
    plateD(prx + 8, pry + 6, py + 4, COLORS.redRim, sx + s * 10);
    plateD(prx, pry, py, COLORS.plateShade, sx);
    plateD(prx - 6, pry - 6, py - 2, COLORS.plate, sx - 2 * c);
    g.fillStyle(COLORS.plateLight, 0.7); g.fillRect(sx - prx + 10, py - 8, prx * 2 - 20, 4);

    // OLED frames (black PETG "cadre-oled") + live screens
    const O = R.oled;
    const frame = (fx, fy, w, h) => {
      g.fillStyle(COLORS.blackLo, 1); g.fillRoundedRect(fx - (w / 2 + 7) * c, fy - h / 2 - 7, (w + 14) * c, h + 14, 5 * c + 1);
      g.fillStyle(COLORS.blackHi, 1); g.fillRect(fx - (w / 2 + 5) * c, fy - h / 2 - 7, (w + 10) * c, 3);
      g.fillStyle(0x020304, 1); g.fillRect(fx - (w / 2 + 3) * c, fy - h / 2 - 3, (w + 6) * c, h + 6);
    };
    const ey = py + (R.eyeCY - R.plate.bottom), my = py + (R.mouthCY - R.plate.bottom);
    const exL = sx - R.eyeX * c, exR = sx + R.eyeX * c;
    frame(exL, ey, EYE_W * O, EYE_H * O);
    frame(exR, ey, EYE_W * O, EYE_H * O);
    frame(sx, my, PANEL_W * O, PANEL_H * O);
    const k = O / G;
    eyeL.setPosition(exL, ey).setScale(k * c, k);
    eyeR.setPosition(exR, ey).setScale(k * c, k);
    mouth.setPosition(sx, my).setScale(k * c, k);
    glare.clear();
    glare.fillStyle(0xffffff, 0.05);
    glare.fillRect(exL - EYE_W * O * c * 0.5, ey - EYE_H * O * 0.5, EYE_W * O * c * 0.35, EYE_H * O);
    glare.fillRect(exR - EYE_W * O * c * 0.5, ey - EYE_H * O * 0.5, EYE_W * O * c * 0.35, EYE_H * O);

    // ---------- neck mechanism (world space; the yoke turns with pan, the base never moves) ----------
    const n = neck; n.clear();
    const py0 = R.pivotY + hop;
    // body hub + bearing
    n.fillStyle(COLORS.black, 1); n.fillRoundedRect(cx - 40, R.discY + 8, 80, R.bodyTop - R.discY - 4, 6);
    // pan plate (MG996R output) — holes slide with pan so the rotation reads
    n.fillStyle(COLORS.black, 1); n.fillRoundedRect(cx - 130, R.discY - 8, 260, 18, 9);
    n.fillStyle(COLORS.blackHi, 1); n.fillRect(cx - 122, R.discY - 8, 244, 4);
    for (let i = 0; i < 6; i++) {
      const a = pan + (i * Math.PI) / 3, x = Math.sin(a), z = Math.cos(a);
      if (z > 0) { n.fillStyle(0x3a3d44, 1); n.fillEllipse(cx + x * 112, R.discY + 2, 10 * z + 2, 6); }
    }
    // central column up to the cardan
    n.fillStyle(COLORS.black, 1); n.fillRect(cx - 18, py0 + 4, 36, R.discY - py0 - 8);
    n.fillStyle(COLORS.blackHi, 1); n.fillRect(cx - 14, py0 + 4, 7, R.discY - py0 - 8);
    n.fillStyle(COLORS.black, 1); n.fillRoundedRect(cx - 28, py0 - 4, 56, 22, 5); // cardan block
    // 2 SG90 (blue) on the pan plate, horns + push rods to the X plate
    const rodsDeg = { left: nod + tilt, right: nod - tilt };
    const tiltR = tilt * D2R;
    const toWorld = (lx, ly) => ({ x: cx + lx * Math.cos(tiltR) - ly * Math.sin(tiltR), y: py0 + lx * Math.sin(tiltR) + ly * Math.cos(tiltR) });
    for (const side of [-1, 1]) {
      const deg = side < 0 ? rodsDeg.left : rodsDeg.right;
      const x = cx + side * R.servoX * c;
      const sw = 22 + 18 * Math.abs(c);   // a servo seen more from the side when the yoke turns
      n.fillStyle(COLORS.servo, 1); n.fillRoundedRect(x - sw / 2, R.hornY, sw, R.discY - 8 - R.hornY, 4);
      n.fillStyle(COLORS.servoLight, 1); n.fillRect(x - sw / 2 + 3, R.hornY + 4, 5, R.discY - 16 - R.hornY);
      n.fillStyle(COLORS.servo, 1); n.fillRect(x - sw / 2 - 6 * Math.abs(c), R.hornY + 16, sw + 12 * Math.abs(c), 6); // mounting ears
      // horn: drawn angle = 2× servo angle (readable on a phone; GAME.md)
      const a = deg * 2 * D2R;
      const hx = x + side * Math.cos(a) * R.hornLen * Math.max(0.35, Math.abs(c)), hy = R.hornY - Math.sin(a) * R.hornLen;
      n.lineStyle(9, COLORS.horn, 1); n.lineBetween(x, R.hornY, hx, hy);
      n.fillStyle(COLORS.horn, 1); n.fillCircle(x, R.hornY, 8);
      // rod top: ball joint under the X plate (head space -> world)
      const top = toWorld(side * R.servoX * c, R.headBottom + 5 - nod * 1.2);
      n.lineStyle(5, COLORS.rod, 1); n.lineBetween(hx, hy, top.x, top.y);
      n.fillStyle(0x5d6670, 1); n.fillCircle(hx, hy, 5); n.fillCircle(top.x, top.y, 5);
    }
  };
  robot.update();
  return robot;
}
