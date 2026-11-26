// robot.js — v2.1 flat 2D Elon Man, drawn from the ORIGINAL elon-man CAD (hardware/cad/elonman.scad):
//   body 120→100 × 80 × 180 mm, corner r=10, two gold chevrons (70 × 9, drop 22) at 0.72 / 0.56 height
//   near-spherical red head 110 × 95 × 90 with a 4 mm flat chin and a 34×14 camera slot on top
//   Ø62 face hole + gray bezel Ø74/Ø58 → v2.1: gray face plate with eye/mouth cutouts (faceplate.js),
//   three 128×64 OLEDs behind it; black base 150 × 110 × 28; U-yoke (disc Ø44) on a Ø26 neck column.
// Pascal's pick (26 nov. 2026, mockup 2). Shapes never change; cute comes from the faces and motion.
// Head motion follows the servo model (servo.js): pan turns the face around the sphere, nod slides it
// up/down, tilt rolls the whole head around the neck pivot. Body and base never move.
import { EYE_W, EYE_H, PANEL_W, PANEL_H } from '../oled.js';
import { CUTOUTS, AA, PLATE, smileSpine } from '../faceplate.js';

const MM = 2.4; // 1 mm of the CAD → 2.4 game px (fits between the HUD and the buttons)

function layout() {
  const mm = MM;
  const bodyWTop = 120 * mm, bodyWBottom = 100 * mm, bodyH = 180 * mm, bodyR = 10 * mm;
  const baseW = 150 * mm, baseH = 28 * mm, baseR = 12 * mm;
  const baseY = 1148;
  const bodyBottom = baseY - baseH / 2 + 4 * mm;  // body sits in the 4 mm lip of the base
  const bodyTop = bodyBottom - bodyH;
  const headW = 110 * mm, headH = 95 * mm, gap = 10 * mm, chin = 4 * mm;
  const pivotY = bodyTop - 2 * mm;                 // yoke disc on the body lid
  const yc = -(gap + headH / 2 - 2 * mm);          // head centre, local to the pivot (y down → negative)
  return {
    mm, cx: 360, pivotY, yc, rx: headW / 2, ry: headH / 2, headBottom: yc + headH / 2 - chin,
    headTop: pivotY + yc - headH / 2,
    camW: 34 * mm, camH: 14 * mm, neckCol: 26 * mm, neckHole: 30 * mm, yokeD: 44 * mm,
    plateD: PLATE.outer * mm,
    bodyTop, bodyH, bodyWTop, bodyWBottom, bodyR, baseY, baseW, baseH, baseR,
    discY: bodyTop - 2 * mm,
    grid: 2,
  };
}
export const ROBOT = layout();

export const COLORS = {
  red: 0xdc1c14, redShade: 0x9a120e, redLight: 0xf04a3a, redRim: 0xb01610,
  black: 0x111214, blackHi: 0x2a2c31, blackLo: 0x060708,
};
const OLED_BLACK = '#04060a';

function fillDome(g, cx, cy, rx, ry, yClip, col, alpha = 1) {
  const aClip = Math.asin(Math.max(-1, Math.min(1, (yClip - cy) / ry)));
  const a0 = Math.PI - aClip, a1 = Math.PI * 2 + aClip;
  g.fillStyle(col, alpha);
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = a0 + ((a1 - a0) * i) / 64;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillPath();
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  return c;
}

// Cutout path on a 2D canvas context. (cx, cy) = face centre in canvas px, k = px per mm.
export function cutoutPath(ctx, key, cx, cy, k) {
  const c = CUTOUTS[key];
  ctx.beginPath();
  if (c.kind === 'ellipse') {
    ctx.ellipse(cx + c.x * k, cy - c.z * k, (c.w * k) / 2, (c.h * k) / 2, 0, 0, Math.PI * 2);
  } else {
    const pts = smileSpine(c, 32);
    pts.forEach(([x, z], i) => {
      const px = cx + (c.x + x) * k, py = cy - (c.z + z) * k;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
  }
}
function punch(ctx, key, cx, cy, k, extra = 0) {
  const c = CUTOUTS[key];
  cutoutPath(ctx, key, cx, cy, k);
  if (c.kind === 'ellipse') {
    if (extra) { ctx.lineWidth = extra; ctx.stroke(); } else ctx.fill();
  } else {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = c.th * k + extra;
    ctx.stroke();
  }
}

export function buildRobotTextures(scene) {
  const R = ROBOT;
  // ---- body: rounded tapered prism ----
  {
    const H = R.bodyH, wt = R.bodyWTop, wb = R.bodyWBottom, rad = R.bodyR;
    const W = Math.ceil(wt + 40), ox = 20, mid = W / 2;
    const tex = scene.textures.createCanvas('rb-body', W, Math.ceil(H + 8));
    const ctx = tex.getContext();
    const xl0 = ox, xr0 = ox + wt, xl1 = ox + (wt - wb) / 2, xr1 = xl1 + wb;
    const trap = () => {
      ctx.beginPath();
      ctx.moveTo(xl0 + rad, 0);
      ctx.arcTo(xr0, 0, xr1, H, rad);
      ctx.arcTo(xr1, H, xl1, H, rad);
      ctx.arcTo(xl1, H, xl0, 0, rad);
      ctx.arcTo(xl0, 0, xr0, 0, rad);
      ctx.closePath();
    };
    ctx.save(); ctx.translate(7, 5); ctx.fillStyle = 'rgba(0,0,0,0.28)'; trap(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#dc1c14'; trap(); ctx.fill();
    ctx.save(); trap(); ctx.clip();
    ctx.fillStyle = '#9a120e';
    ctx.beginPath(); ctx.moveTo(xr0 - 22, 0); ctx.lineTo(xr0 + 8, 0); ctx.lineTo(xr1 + 8, H); ctx.lineTo(xr1 - 18, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f04a3a';
    ctx.beginPath(); ctx.moveTo(xl0 - 8, 0); ctx.lineTo(xl0 + 10, 0); ctx.lineTo(xl1 + 8, H); ctx.lineTo(xl1 - 8, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c81812'; ctx.fillRect(xl0 + 8, 0, wt - 16, 6);
    ctx.fillStyle = 'rgba(240,74,58,0.5)'; ctx.fillRect(xl0 + 12, 1, wt * 0.34, 3);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(mid, 5, R.neckHole / 2 + 1, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.ellipse(mid, 4, R.neckHole / 2 - 1, 5, 0, 0, Math.PI * 2); ctx.fill();
    const chevron = (cy, w, th, drop, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(mid - w / 2, cy); ctx.lineTo(mid, cy + drop); ctx.lineTo(mid + w / 2, cy);
      ctx.lineTo(mid + w / 2, cy + th); ctx.lineTo(mid, cy + drop + th); ctx.lineTo(mid - w / 2, cy + th);
      ctx.closePath(); ctx.fill();
    };
    for (const fromBot of [0.72, 0.56]) {
      const cy = H - fromBot * H;
      chevron(cy + 3, 70 * R.mm, 9 * R.mm, 22 * R.mm, '#a06e0e');
      chevron(cy, 70 * R.mm, 9 * R.mm - 1, 22 * R.mm, '#e0a01a');
    }
    tex.refresh();
  }
  // ---- base: black rounded plate (the original has no vents) ----
  {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(10, 10, R.baseW, R.baseH, R.baseR);
    g.fillStyle(COLORS.black, 1); g.fillRoundedRect(0, 0, R.baseW, R.baseH, R.baseR);
    g.fillStyle(COLORS.blackHi, 1); g.fillRoundedRect(0, 0, R.baseW, 9, { tl: R.baseR, tr: R.baseR, bl: 2, br: 2 });
    g.generateTexture('rb-base', Math.ceil(R.baseW + 8), Math.ceil(R.baseH + 12));
    g.destroy();
  }
  // ---- face plate: gray disc with the punched cutouts (transparent holes), drawn at 2× for crisp edges ----
  {
    const Q = 2, k = R.mm * Q, D = R.plateD * Q, pad = 6 * Q, S = Math.ceil(D + pad * 2);
    const plate = canvas(S, S), ctx = plate.getContext('2d');
    const cx = S / 2, cy = S / 2;
    ctx.fillStyle = '#5a5f66'; ctx.beginPath(); ctx.arc(cx, cy, D / 2 + 2 * Q, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8f96'; ctx.beginPath(); ctx.arc(cx, cy, D / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(cx - D * 0.12, cy - D * 0.24, D * 0.28, D * 0.11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1.5 * Q;
    ctx.beginPath(); ctx.arc(cx, cy, (PLATE.inner / 2) * k + 3 * Q, 0, Math.PI * 2); ctx.stroke(); // bezel step
    // dark lip around each hole, then punch the hole itself
    ctx.strokeStyle = '#2a2c30'; ctx.fillStyle = '#2a2c30';
    for (const key of Object.keys(CUTOUTS)) punch(ctx, key, cx, cy, k, 1.6 * Q);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
    for (const key of Object.keys(CUTOUTS)) punch(ctx, key, cx, cy, k);
    ctx.globalCompositeOperation = 'source-over';
    R.plateCanvas = plate; R.plateS = S; R.plateQ = Q;
    const face = canvas(S, S);
    R.faceCanvas = face;
    scene.textures.addCanvas('rb-face', face);
  }
}

// One offscreen canvas per OLED (128×64 × grid). The scene writes the 1-bit buffers into them;
// the robot composites them behind the face plate.
export function createOledTextures() {
  const G = ROBOT.grid;
  const mk = (w, h) => {
    const c = canvas(w * G, h * G), ctx = c.getContext('2d');
    return { canvas: c, ctx, img: ctx.createImageData(w * G, h * G) };
  };
  return { eyeL: mk(EYE_W, EYE_H), eyeR: mk(EYE_W, EYE_H), mouth: mk(PANEL_W, PANEL_H) };
}

const D2R = Math.PI / 180;

export function createRobot(scene, oled) {
  const R = ROBOT, cx = R.cx;
  const robot = { pose: { pan: 0, nod: 0, tilt: 0 }, hop: 0 };

  scene.add.ellipse(cx, R.baseY + R.baseH / 2 + 7, R.baseW + 20, 24, 0x000000, 0.38).setDepth(1);
  scene.add.image(cx, R.baseY, 'rb-base').setDepth(2);
  scene.add.image(cx, R.bodyTop + R.bodyH / 2, 'rb-body').setDepth(3);
  const neck = scene.add.graphics().setDepth(4);
  const head = scene.add.container(cx, R.pivotY).setDepth(5);
  const shell = scene.add.graphics();
  const face = scene.add.image(0, 0, 'rb-face');
  const top = scene.add.graphics();
  head.add([shell, face, top]);
  robot.parts = { neck, head, shell, face, top };

  // Composite: OLED pixels at their real place behind each hole, then the plate on top.
  robot.refreshFace = () => {
    const S = R.plateS, Q = R.plateQ, k = R.mm * Q, ctx = R.faceCanvas.getContext('2d');
    const c0 = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = OLED_BLACK;
    ctx.beginPath(); ctx.arc(c0, c0, (PLATE.inner / 2) * k, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = true;
    for (const key of ['eyeL', 'eyeR', 'mouth']) {
      const cut = CUTOUTS[key], src = oled?.[key]?.canvas;
      if (!src) continue;
      const w = AA.w * k, h = AA.h * k;
      ctx.drawImage(src, c0 + cut.x * k - w / 2, c0 - cut.z * k - h / 2, w, h);
    }
    ctx.drawImage(R.plateCanvas, 0, 0);
    scene.textures.get('rb-face').refresh();
  };

  robot.update = (pose = robot.pose) => {
    robot.pose = pose;
    const pan = (pose.pan || 0) * D2R, nod = (pose.nod || 0) * D2R, tilt = pose.tilt || 0, hop = robot.hop || 0;
    const c = Math.cos(pan), s = Math.sin(pan), cn = Math.cos(nod), sn = Math.sin(nod);
    const yc = R.yc, hb = R.headBottom;
    head.setPosition(cx, R.pivotY + hop).setAngle(tilt);

    const g = shell; g.clear();
    g.fillStyle(0x000000, 0.28); g.fillEllipse(3, hb + 5, R.rx * 0.55, 8);
    fillDome(g, 0, yc, R.rx, R.ry, hb, COLORS.redShade);
    // the light side slides with the turn so the sphere reads as rotating
    fillDome(g, -7 - s * 10, yc - 3 + sn * 6, R.rx * 0.9, R.ry * 0.92, hb - 1, COLORS.red);
    g.fillStyle(COLORS.redLight, 0.42);
    g.fillEllipse(-R.rx * 0.28 - s * 14, yc - R.ry * 0.48, R.rx * 0.36, R.ry * 0.16);

    // face on the front of the sphere: pan moves it around, nod moves it up/down (sphere radius ≈ rx)
    const fx = s * R.rx * 0.58;
    const fy = yc - sn * R.ry * 0.62;
    const vis = c > 0.12;
    const S = R.plateS / R.plateQ;
    face.setVisible(vis).setPosition(fx, fy).setDisplaySize(S * Math.max(0.05, c), S * cn);

    // camera slot on top, slightly forward: follows the turn and the nod
    const t = top; t.clear();
    const camC = Math.cos(pan * 0.9);
    if (camC > 0.1) {
      // seen from the front the top slot is foreshortened to a thin dark lens strip near the crown
      const camW = R.camW * camC, camX = s * R.rx * 0.45, camY = yc - R.ry + 2.6 * R.mm - sn * 8, camH = R.camH * 0.42;
      t.fillStyle(COLORS.redRim, 1); t.fillRoundedRect(camX - camW / 2 - 2, camY - 2, camW + 4, camH + 4, 3);
      t.fillStyle(COLORS.blackLo, 1); t.fillRoundedRect(camX - camW / 2, camY, camW, camH, 2);
    }
    // back of the head when turned past the side: a plain red sphere (the face went round)

    // ---------- neck (world space): U-yoke turns with the pan servo, column follows the head roll ----------
    const n = neck; n.clear();
    const py0 = R.pivotY + hop, tr = tilt * D2R;
    const colTopX = cx + Math.sin(tr) * 26, colTopY = py0 - 22;
    n.lineStyle(R.neckCol, COLORS.black, 1); n.lineBetween(cx, R.bodyTop + 4, colTopX, colTopY);
    n.lineStyle(5, COLORS.blackHi, 1); n.lineBetween(cx - R.neckCol / 2 + 5, R.bodyTop + 2, colTopX - R.neckCol / 2 + 5 + 0, colTopY);
    n.fillStyle(COLORS.black, 1); n.fillEllipse(cx, R.discY, R.yokeD, 14);
    n.fillStyle(COLORS.blackHi, 1); n.fillEllipse(cx, R.discY - 2, R.yokeD - 6, 8);
    // horn screws rotate with the pan
    for (let i = 0; i < 4; i++) {
      const a = pan + (i * Math.PI) / 2, x = Math.sin(a), z = Math.cos(a);
      if (z > -0.2) { n.fillStyle(0x4a4d55, 1); n.fillCircle(cx + x * 16, R.discY - 1, 2.5); }
    }
    const armX = (30 / 2 + 5 / 2) * R.mm * Math.max(0.15, Math.abs(c)), armW = 5 * R.mm;
    n.fillStyle(COLORS.black, 1);
    n.fillRoundedRect(cx - armX - armW / 2, R.discY - 16, armW, 22, 2);
    n.fillRoundedRect(cx + armX - armW / 2, R.discY - 16, armW, 22, 2);
  };
  robot.update();
  return robot;
}
