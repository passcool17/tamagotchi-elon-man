// robot.js — v2.2 flat 2D Elon Man drawn TO SCALE from the FINAL print-v2 robot
// (hardware/print-v2/scripts/elonman_v2.py + renders/comparaison/dimensions.md, Pascal's pick 26 nov. 07:26):
//   base 150 × 110 × 36 (black PETG, side vents) · body 120 → 100 × 80 × 180, r = 10 (red PLA, 2 orange chevrons)
//   neck: black hub + Ø80 deck + column, 2 blue SG90 · head 130 × 104 × 112 ellipsoid cut 26 mm under its
//   centre (82 mm visible, red PLA) · elliptical gray PETG face plate 105.5 × 68.85 with a flat chin
//   · 3 OLED 128×64 behind the cutouts (faceplate.js) · overall height 338.6 mm.
// Head motion follows servo.js: pan slides the face round the head, nod moves it up/down, tilt rolls the
// head around the cardan pivot (10 mm above the head centre). Body and base never move.
import { EYE_W, EYE_H, PANEL_W, PANEL_H } from '../oled.js';
import { CUTOUTS, AA, PLATE, smileSpine } from '../faceplate.js';

// ---------- real dimensions (mm), z up from the desk ----------
export const DIMS = {
  base: { w: 150, d: 110, h: 36, r: 12 },
  body: { wTop: 120, wBottom: 100, d: 80, h: 180, r: 10 },
  head: { w: 130, d: 104, h: 112, cut: 26 },     // ellipsoid, flat bottom 26 mm under the centre
  headCentreZ: 282.6, pivotDZ: 10,                // cardan 10 mm above the head centre
  faceCentreDZ: 7.7, chin: 2,                     // face (SVG origin) 7.7 mm above the head centre
  plate: { w: PLATE.w, h: PLATE.h, rim: 2.5 },
  hub: { d: 40, h: 6 }, deck: { d: 80, h: 5, z: 228 }, column: { d: 16 },
  sg90: { w: 12.4, h: 22.8, x: 21 },
  chevrons: { w: 70, th: 9, drop: 22, at: [0.72, 0.56] },
};
export const heightMM = () => DIMS.headCentreZ + DIMS.head.h / 2;       // 338.6
export const headBottomZ = () => DIMS.headCentreZ - DIMS.head.cut;       // 256.6

const MM = 2.15;          // 1 mm → 2.15 game px: 338.6 mm fits between the HUD and the buttons
const FLOOR = 1150;       // desk line (game px)
const Y = (z) => FLOOR - z * MM;

function layout() {
  const D = DIMS, mm = MM;
  const bodyTop = Y(D.base.h + D.body.h);
  const pivotY = Y(D.headCentreZ + D.pivotDZ);
  return {
    mm, cx: 360, floor: FLOOR, pivotY,
    yc: D.pivotDZ * mm,                                  // head centre, local to the pivot (y down)
    rx: (D.head.w / 2) * mm, ry: (D.head.h / 2) * mm,
    headBottom: (D.pivotDZ + D.head.cut) * mm,
    headTop: Y(heightMM()),
    faceY: (D.pivotDZ - D.faceCentreDZ) * mm,
    bodyTop, bodyH: D.body.h * mm, bodyWTop: D.body.wTop * mm, bodyWBottom: D.body.wBottom * mm, bodyR: D.body.r * mm,
    baseY: Y(D.base.h / 2), baseW: D.base.w * mm, baseH: D.base.h * mm, baseR: D.base.r * mm,
    deckY: Y(D.deck.z + D.deck.h / 2),
    grid: 2,
  };
}
export const ROBOT = layout();

const C = {
  red: '#d4322a', redLight: '#ef5a4a', redDark: '#8e1a14', redDeep: '#6a120e',
  orange: '#f08a3c', orangeDark: '#b75f22',
  black: '#1b1c20', blackHi: '#3a3c43', blackLo: '#0b0c0e',
  gray: '#9a9fa6', grayLight: '#c4c8cd', grayDark: '#6f747b',
  blue: '#3f6fc4', blueLight: '#6f9be6', blueDark: '#28498a',
  oled: '#04060a',
};

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function rrPath(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// Cutout path. (cx, cy) = face centre in canvas px, k = px per mm.
export function cutoutPath(ctx, key, cx, cy, k) {
  const c = CUTOUTS[key];
  ctx.beginPath();
  if (c.kind === 'ellipse') ctx.ellipse(cx + c.x * k, cy - c.z * k, (c.w * k) / 2, (c.h * k) / 2, 0, 0, Math.PI * 2);
  else smileSpine(c, 32).forEach(([x, z], i) => { const px = cx + (c.x + x) * k, py = cy - (c.z + z) * k; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
}
function punch(ctx, key, cx, cy, k, extra = 0) {
  const c = CUTOUTS[key];
  cutoutPath(ctx, key, cx, cy, k);
  if (c.kind === 'ellipse') { if (extra) { ctx.lineWidth = extra; ctx.stroke(); } else ctx.fill(); }
  else { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = c.th * k + extra; ctx.stroke(); }
}
// Elliptical plate with the flat chin. (cx, cy) = face centre, flatY = chin line, all in canvas px.
function platePath(ctx, cx, cy, rx, ry, flatY) {
  const a = Math.asin(Math.max(-1, Math.min(1, (flatY - cy) / ry)));
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, a, Math.PI - a, true);
  ctx.closePath();
}

export function buildRobotTextures(scene) {
  const R = ROBOT, D = DIMS, Q = 2;      // textures drawn at 2× for crisp edges on the S20
  const add = (key, c) => { if (scene.textures.exists(key)) scene.textures.remove(key); scene.textures.addCanvas(key, c); };

  // ---- body: tapered rounded prism, side-lit gradient, orange inlaid chevrons ----
  {
    const H = R.bodyH * Q, wt = R.bodyWTop * Q, wb = R.bodyWBottom * Q, rad = R.bodyR * Q;
    const W = wt + 40 * Q, ox = 20 * Q, mid = W / 2, cv = canvas(W, H + 10 * Q), ctx = cv.getContext('2d');
    const xl0 = ox, xr0 = ox + wt, xl1 = ox + (wt - wb) / 2, xr1 = xl1 + wb;
    const trap = () => {
      ctx.beginPath(); ctx.moveTo(xl0 + rad, 0);
      ctx.arcTo(xr0, 0, xr1, H, rad); ctx.arcTo(xr1, H, xl1, H, rad);
      ctx.arcTo(xl1, H, xl0, 0, rad); ctx.arcTo(xl0, 0, xr0, 0, rad); ctx.closePath();
    };
    const g = ctx.createLinearGradient(xl0, 0, xr0, 0);
    g.addColorStop(0, C.redLight); g.addColorStop(0.12, C.red); g.addColorStop(0.7, '#c42a22'); g.addColorStop(0.9, C.redDark); g.addColorStop(1, C.redDeep);
    ctx.fillStyle = g; trap(); ctx.fill();
    ctx.save(); trap(); ctx.clip();
    const v = ctx.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, 'rgba(255,255,255,0.14)'); v.addColorStop(0.08, 'rgba(255,255,255,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,220,210,0.18)'; ctx.fillRect(xl0, 0, W, 3 * Q);
    // neck hole Ø30 on the lid
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(mid, 2 * Q, 15 * MM * Q, 3 * Q, 0, 0, Math.PI * 2); ctx.fill();
    const chev = (cy, fill, dy = 0) => {
      const w = D.chevrons.w * MM * Q, th = D.chevrons.th * MM * Q, drop = D.chevrons.drop * MM * Q;
      ctx.fillStyle = fill; ctx.beginPath();
      ctx.moveTo(mid - w / 2, cy + dy); ctx.lineTo(mid, cy + drop + dy); ctx.lineTo(mid + w / 2, cy + dy);
      ctx.lineTo(mid + w / 2, cy + th + dy); ctx.lineTo(mid, cy + drop + th + dy); ctx.lineTo(mid - w / 2, cy + th + dy);
      ctx.closePath(); ctx.fill();
    };
    for (const at of D.chevrons.at) {
      const cy = H - at * H;
      chev(cy, 'rgba(80,10,6,0.45)', 1.5 * Q);   // 1.2 mm channel shadow
      chev(cy, C.orange);
    }
    ctx.restore();
    add('rb-body', cv);
  }
  // ---- base: black PETG, soft top bevel, vents at the side ----
  {
    const w = R.baseW * Q, h = R.baseH * Q, r = R.baseR * Q, cv = canvas(w, h), ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#34363c'); g.addColorStop(0.18, C.black); g.addColorStop(1, C.blackLo);
    ctx.fillStyle = g; rrPath(ctx, 0, 0, w, h, r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; rrPath(ctx, r * 0.5, 1 * Q, w - r, 2 * Q, Q); ctx.fill();
    ctx.fillStyle = '#060607';
    for (let i = 0; i < 6; i++) rrPath(ctx, w - r - 4 * Q - i * 4.2 * MM * Q, h * 0.42, 1.6 * MM * Q, h * 0.4, Q), ctx.fill();
    add('rb-base', cv);
  }
  // ---- head shell: red ellipsoid cut flat, soft top-left key light + rim shadow ----
  {
    const rx = R.rx * Q, ry = R.ry * Q, cutY = D.head.cut * MM * Q, pad = 6 * Q;
    const W = rx * 2 + pad * 2, H = ry + cutY + pad * 2, cx = W / 2, cy = pad + ry;
    const cv = canvas(W, H), ctx = cv.getContext('2d');
    const a = Math.asin(cutY / ry);
    const dome = () => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, a, Math.PI - a, true); ctx.closePath(); };
    const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.55, rx * 0.05, cx, cy, rx * 1.15);
    g.addColorStop(0, '#f2685a'); g.addColorStop(0.35, C.red); g.addColorStop(0.8, '#a8231c'); g.addColorStop(1, C.redDeep);
    ctx.fillStyle = g; dome(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx - rx, cy + cutY - 2 * Q, rx * 2, 2 * Q);
    R.headTex = { W: W / Q, H: H / Q, oy: (cy) / Q };
    add('rb-head', cv);
  }
  // ---- face plate: gray PETG ellipse with flat chin, red recess edge, punched cutouts ----
  {
    const k = MM * Q, prx = (PLATE.w / 2) * k, pry = (PLATE.h / 2) * k, rim = D.plate.rim * k, pad = 4 * Q;
    const W = prx * 2 + rim * 2 + pad * 2, H = pry * 2 + rim * 2 + pad * 2, cx = W / 2, cy = H / 2;
    const flat = (D.faceCentreDZ + D.head.cut - D.chin) * k;  // face centre → chin line
    const plate = canvas(W, H), ctx = plate.getContext('2d');
    platePath(ctx, cx, cy, prx + rim, pry + rim, cy + flat + rim * 0.4);
    ctx.fillStyle = '#7e1a14'; ctx.fill();                          // recess edge (head skin seen at an angle)
    platePath(ctx, cx, cy, prx, pry, cy + flat);
    const g = ctx.createLinearGradient(0, cy - pry, 0, cy + pry);
    g.addColorStop(0, C.grayLight); g.addColorStop(0.45, C.gray); g.addColorStop(1, C.grayDark);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.ellipse(cx - prx * 0.2, cy - pry * 0.62, prx * 0.6, pry * 0.22, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (const key of Object.keys(CUTOUTS)) punch(ctx, key, cx, cy, k, 1.2 * Q);
    ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.fillStyle = '#000';
    for (const key of Object.keys(CUTOUTS)) punch(ctx, key, cx, cy, k);
    ctx.globalCompositeOperation = 'source-over';
    R.plateCanvas = plate; R.plateW = W; R.plateH = H; R.plateQ = Q;
    const face = canvas(W, H); R.faceCanvas = face;
    add('rb-face', face);
  }
}

export function createOledTextures() {
  const G = ROBOT.grid;
  const mk = (w, h) => { const c = canvas(w * G, h * G), ctx = c.getContext('2d'); return { canvas: c, ctx, img: ctx.createImageData(w * G, h * G) }; };
  return { eyeL: mk(EYE_W, EYE_H), eyeR: mk(EYE_W, EYE_H), mouth: mk(PANEL_W, PANEL_H) };
}

const D2R = Math.PI / 180;

export function createRobot(scene, oled) {
  const R = ROBOT, D = DIMS, cx = R.cx, mm = R.mm;
  const robot = { pose: { pan: 0, nod: 0, tilt: 0 }, hop: 0 };

  // soft contact shadows on the desk
  scene.add.ellipse(cx, FLOOR + 4, R.baseW * 1.15, 26, 0x000000, 0.35).setDepth(1);
  scene.add.ellipse(cx, FLOOR + 2, R.baseW * 0.9, 12, 0x000000, 0.35).setDepth(1);
  scene.add.image(cx, R.baseY, 'rb-base').setDisplaySize(R.baseW, R.baseH).setDepth(2);
  scene.add.image(cx, R.bodyTop + R.bodyH / 2 + 5, 'rb-body').setDisplaySize(R.bodyWTop + 40, R.bodyH + 10).setDepth(3);
  const neck = scene.add.graphics().setDepth(4);
  const head = scene.add.container(cx, R.pivotY).setDepth(5);
  const under = scene.add.graphics();
  const shell = scene.add.image(0, 0, 'rb-head');
  const face = scene.add.image(0, 0, 'rb-face');
  head.add([under, shell, face]);
  shell.setDisplaySize(R.headTex.W, R.headTex.H).setOrigin(0.5, R.headTex.oy / R.headTex.H).setPosition(0, R.yc);
  robot.parts = { neck, head, shell, face };

  robot.refreshFace = () => {
    const Q = R.plateQ, k = mm * Q, W = R.plateW, H = R.plateH, ctx = R.faceCanvas.getContext('2d');
    const c0x = W / 2, c0y = H / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.oled;
    for (const key of ['eyeL', 'eyeR', 'mouth']) {
      const cut = CUTOUTS[key], src = oled?.[key]?.canvas, w = AA.w * k, h = AA.h * k;
      const x = c0x + cut.x * k - w / 2, y = c0y - cut.z * k - h / 2;
      ctx.fillRect(x, y, w, h);
      if (src) ctx.drawImage(src, x, y, w, h);
    }
    ctx.drawImage(R.plateCanvas, 0, 0);
    scene.textures.get('rb-face').refresh();
  };

  robot.update = (pose = robot.pose) => {
    robot.pose = pose;
    const pan = (pose.pan || 0) * D2R, nod = (pose.nod || 0) * D2R, tilt = pose.tilt || 0, hop = robot.hop || 0;
    const c = Math.cos(pan), s = Math.sin(pan), sn = Math.sin(nod), cn = Math.cos(nod);
    head.setPosition(cx, R.pivotY + hop).setAngle(tilt);

    // face: slides round the head with the pan (stays inside the silhouette), up/down with the nod
    const pw = R.plateW / R.plateQ, ph = R.plateH / R.plateQ;
    const fx = s * (R.rx - (pw / 2) * Math.abs(c)) * 0.92;
    const fy = R.faceY - sn * R.ry * 0.35;
    face.setVisible(c > 0.1).setPosition(fx, fy).setDisplaySize(pw * Math.max(0.05, c), ph * (0.96 + 0.04 * cn));

    // underside of the head: black PETG cardan plate peeking out under the flat chin
    under.clear();
    under.fillStyle(0x0b0c0e, 1); under.fillRoundedRect(-34 * mm * Math.max(0.4, Math.abs(c)), R.headBottom - 2, 68 * mm * Math.max(0.4, Math.abs(c)), 4 * mm, 4);

    // ---- neck (world space): hub, column, Ø80 deck and 2 blue SG90 that turn with the pan ----
    const n = neck; n.clear();
    const topY = R.pivotY + hop + R.headBottom - 2, tr = tilt * D2R;
    const colW = D.column.d * mm;
    n.fillStyle(0x0b0c0e, 1); n.fillRect(cx - colW / 2 + Math.sin(tr) * 6, topY, colW, R.bodyTop - topY + 2);
    n.fillStyle(0x3a3c43, 1); n.fillRect(cx - colW / 2 + 3, topY, 4, R.bodyTop - topY);
    // hub on the lid
    n.fillStyle(0x16171a, 1); n.fillRoundedRect(cx - (D.hub.d / 2) * mm, R.bodyTop - D.hub.h * mm, D.hub.d * mm, D.hub.h * mm + 2, 4);
    // servos (behind the deck front edge), x follows the pan
    const sw = D.sg90.w * mm, sh = D.sg90.h * mm, deckTop = R.deckY - (D.deck.h / 2) * mm;
    for (const side of [-1, 1]) {
      const x = cx + side * D.sg90.x * mm * c, depth = side * s; // the far servo sits behind the column
      const w = sw * (0.75 + 0.25 * Math.abs(c));
      if (depth > 0.2) continue;
      n.fillStyle(0x28498a, 1); n.fillRoundedRect(x - w / 2, deckTop - sh, w, sh, 3);
      n.fillStyle(0x3f6fc4, 1); n.fillRoundedRect(x - w / 2, deckTop - sh, w * 0.72, sh, 3);
      n.fillStyle(0x6f9be6, 0.8); n.fillRect(x - w / 2 + 2, deckTop - sh + 3, 2, sh - 6);
    }
    // deck disc Ø80 (black PETG) with a soft top highlight
    const dw = D.deck.d * mm, dh = D.deck.h * mm;
    n.fillStyle(0x0b0c0e, 1); n.fillRoundedRect(cx - dw / 2, deckTop, dw, dh, dh / 2);
    n.fillStyle(0x3a3c43, 1); n.fillRoundedRect(cx - dw / 2 + 6, deckTop, dw - 12, 2, 1);
    for (const side of [-1, 1]) {
      const x = cx + side * D.sg90.x * mm * c;
      if (side * s > 0.2) {
        n.fillStyle(0x28498a, 1); n.fillRoundedRect(x - sw * 0.4, deckTop - sh * 0.35, sw * 0.8, sh * 0.35, 3);
      }
    }
  };
  robot.update();
  return robot;
}
