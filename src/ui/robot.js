// robot.js — draws Elon Man with code (no image files) and animates the head turn.
// Shapes follow hardware/cad/elonman.scad of passcool17/elon-man (MIT): red tapered body (wider at the
// shoulders), black base, two gold chest chevrons, red ellipsoid head, round gray face bezel, camera slot on top.
// Proportions are "chibi": the head is bigger than in the CAD so the face stays readable on a phone.

export const ROBOT = {
  cx: 360,
  headY: 585,
  neckY: 748,
  bodyTop: 760, bodyH: 320,
  bodyWTop: 310, bodyWBottom: 258,
  baseY: 1100,
  bezelDy: 14,
};

const RED = { dark: 0x6e0000, mid: 0xb80000, base: 0xd10a0a, light: 0xf01c14, hi: 0xff6a55 };
const GOLD = { base: 0xf2b01e, dark: 0x9a6a00, hi: 0xffe08a };

function gfx(scene) { return scene.make.graphics({ x: 0, y: 0, add: false }); }

export function buildRobotTextures(scene) {
  // ---- head: ellipsoid with fake gradient (stacked ellipses shifted toward the light) ----
  {
    const W = 420, H = 380, g = gfx(scene);
    const cx = W / 2, cy = H / 2 + 6;
    g.fillStyle(0x000000, 0.28); g.fillEllipse(cx + 6, cy + 12, 384, 330);
    g.fillStyle(RED.dark, 1); g.fillEllipse(cx, cy, 384, 330);
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(RED.mid), Phaser.Display.Color.ValueToColor(RED.light), steps, i);
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
      g.fillEllipse(cx - 14 * k - 4, cy - 14 * k - 6, 384 - 90 * k, 330 - 78 * k);
    }
    g.fillStyle(RED.hi, 0.35); g.fillEllipse(cx - 92, cy - 96, 90, 44);
    g.generateTexture('rb-head', W, H);
    g.destroy();
  }
  // ---- bezel: gray ring + dark glass ----
  {
    const S = 300, c = S / 2, g = gfx(scene);
    g.fillStyle(0x000000, 0.35); g.fillCircle(c + 3, c + 5, 142);
    g.fillStyle(0x5d6068, 1); g.fillCircle(c, c, 142);
    g.fillStyle(0x9ea2ab, 1); g.fillCircle(c - 2, c - 3, 138);
    g.fillStyle(0x7b7f88, 1); g.fillCircle(c, c, 130);
    g.fillStyle(0x15171c, 1); g.fillCircle(c, c, 124);
    g.fillStyle(0xffffff, 0.12); g.beginPath(); g.arc(c, c, 136, Math.PI * 1.05, Math.PI * 1.5); g.strokePath();
    g.lineStyle(5, 0xd8dbe2, 0.55); g.beginPath(); g.arc(c, c, 134, Math.PI * 1.08, Math.PI * 1.45); g.strokePath();
    g.generateTexture('rb-bezel', S, S);
    g.destroy();
  }
  // ---- camera slot (on the top of the head) ----
  {
    const g = gfx(scene);
    g.fillStyle(0x3a0000, 1); g.fillRoundedRect(0, 0, 112, 22, 8);
    g.fillStyle(0x120000, 1); g.fillRoundedRect(4, 4, 104, 14, 6);
    g.fillStyle(0x2a9dff, 1); g.fillCircle(56, 11, 4);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(55, 9.5, 1.4);
    g.generateTexture('rb-cam', 112, 22);
    g.destroy();
  }
  // ---- body: tapered, gold chevrons ----
  {
    const { bodyH: H, bodyWTop: wt, bodyWBottom: wb } = ROBOT;
    const W = wt + 40, ox = 20, g = gfx(scene);
    const trap = (inset = 0, yTop = 0, yBot = H) => {
      const wAt = (y) => wt + (wb - wt) * (y / H);
      return [
        { x: ox + (wt - wAt(yTop)) / 2 + inset, y: yTop }, { x: ox + (wt + wAt(yTop)) / 2 - inset, y: yTop },
        { x: ox + (wt + wAt(yBot)) / 2 - inset, y: yBot }, { x: ox + (wt - wAt(yBot)) / 2 + inset, y: yBot },
      ];
    };
    g.fillStyle(0x000000, 0.3); g.fillPoints(trap(-6).map((p) => ({ x: p.x + 8, y: p.y + 8 })), true);
    g.fillStyle(RED.base, 1); g.fillPoints(trap(), true);
    // left highlight / right shade (light from the left, like the render)
    // right dark band (follows the taper)
    g.fillStyle(0x000000, 0.34);
    g.fillPoints([
      { x: ox + wt * 0.72, y: 0 }, { x: ox + wt, y: 0 },
      { x: ox + wt - (wt - wb) / 2, y: H }, { x: ox + (wt - (wt - wb) / 2) - (wb * 0.28), y: H },
    ], true);
    g.fillStyle(0xffffff, 0.10);
    g.fillPoints([
      { x: ox, y: 0 }, { x: ox + wt * 0.16, y: 0 },
      { x: ox + (wt - wb) / 2 + wb * 0.16, y: H }, { x: ox + (wt - wb) / 2, y: H },
    ], true);
    // shoulder bevel
    g.fillStyle(RED.hi, 0.55); g.fillRect(ox + 8, 0, wt - 16, 7);
    g.fillStyle(RED.light, 1); g.fillRect(ox + 4, 7, wt - 8, 11);
    // chevrons (V pointing down), channel then gold inlay
    const chevron = (cy, w, th, drop, fill, dx = 0) => {
      const cx = W / 2 + dx;
      g.fillStyle(fill, 1);
      g.fillPoints([
        { x: cx - w / 2, y: cy }, { x: cx, y: cy + drop }, { x: cx + w / 2, y: cy },
        { x: cx + w / 2, y: cy + th }, { x: cx, y: cy + drop + th }, { x: cx - w / 2, y: cy + th },
      ], true);
    };
    for (const cy of [74, 148]) {
      chevron(cy - 4, 178, 34, 46, 0x4a0000);
      chevron(cy, 164, 24, 42, GOLD.dark);
      chevron(cy - 2, 164, 22, 40, GOLD.base);
    }
    g.generateTexture('rb-body', W, H);
    g.destroy();
  }
  // ---- neck ----
  {
    const g = gfx(scene);
    g.fillStyle(0x16181d, 1); g.fillRoundedRect(0, 0, 96, 60, 10);
    g.fillStyle(0x2c2f37, 1); g.fillRect(8, 0, 80, 10);
    g.fillStyle(0xffffff, 0.08); g.fillRect(10, 12, 14, 44);
    g.generateTexture('rb-neck', 96, 60);
    g.destroy();
  }
  // ---- base: black plate ----
  {
    const g = gfx(scene);
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(8, 14, 424, 70, 22);
    g.fillStyle(0x0b0b0e, 1); g.fillRoundedRect(0, 0, 424, 66, 22);
    g.fillStyle(0x23252c, 1); g.fillRoundedRect(0, 0, 424, 22, { tl: 22, tr: 22, bl: 4, br: 4 });
    g.fillStyle(0xffffff, 0.12); g.fillRect(22, 3, 380, 3);
    g.generateTexture('rb-base', 432, 86);
    g.destroy();
  }
}

// The animated robot. `turn` in [-1, 1]: head orientation (-1 = looks to the screen's left).
export function createRobot(scene) {
  const { cx } = ROBOT;
  const robot = { turn: 0, bob: 0, nod: 0, hop: 0 };

  const shadow = scene.add.ellipse(cx, ROBOT.baseY + 40, 460, 44, 0x000000, 0.35).setDepth(1);
  const base = scene.add.image(cx, ROBOT.baseY, 'rb-base').setOrigin(0.5, 0.5).setDepth(2);
  const body = scene.add.image(cx, ROBOT.bodyTop + ROBOT.bodyH / 2 + 0, 'rb-body').setDepth(3);
  const neck = scene.add.image(cx, ROBOT.neckY, 'rb-neck').setDepth(4);
  const head = scene.add.image(cx, ROBOT.headY, 'rb-head').setDepth(5);
  const bezel = scene.add.image(cx, ROBOT.headY + ROBOT.bezelDy, 'rb-bezel').setDepth(6);
  const faceImg = scene.add.image(cx, ROBOT.headY + ROBOT.bezelDy, 'face').setDepth(7);
  const cam = scene.add.image(cx, ROBOT.headY - 150, 'rb-cam').setDepth(6);

  robot.parts = { shadow, base, body, neck, head, bezel, faceImg, cam };

  robot.update = () => {
    const t = robot.turn;
    const a = Math.abs(t);
    const y = ROBOT.headY + robot.bob + robot.hop + robot.nod * 0.3;
    head.setPosition(cx + t * 20, y).setScale(1 - 0.05 * a, 1).setAngle(t * 2.5 + robot.nod * 0.12);
    const fx = cx + t * 52, fy = y + ROBOT.bezelDy;
    bezel.setPosition(fx, fy).setScale(1 - 0.16 * a, 1).setAngle(t * 2.5);
    faceImg.setPosition(fx, fy).setScale(1 - 0.16 * a, 1).setAngle(t * 2.5);
    cam.setPosition(cx + t * 34, y - 150 + a * 3).setScale(1 - 0.12 * a, 1);
    neck.setScale(1, 1);
    shadow.setScale(1 - robot.hop / 600, 1);
  };
  robot.update();
  return robot;
}
