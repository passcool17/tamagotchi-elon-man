// GameScene.js — the one and only scene: HUD, robot, 4 action buttons.
// All rules live in logic.js, all face pixels in face.js. This file only wires them to Phaser.
import {
  STATS, act, catchUp, moodOf, MOOD_LINES, ageDays, CONFIG,
} from '../logic.js';
import { createFramebuffer, renderFace, toRGBA, FB_SIZE } from '../face.js';
import { loadPet, savePet, loadPrefs, savePrefs } from '../storage.js';
import { createAudio } from '../audio.js';
import { buildIcons, ICON_PX } from '../ui/icons.js';
import { buildRobotTextures, createRobot, ROBOT } from '../ui/robot.js';

const W = 720, H = 1600;
const FONT_UI = 'Rubik, system-ui, sans-serif';
const FONT_PX = '"Press Start 2P", monospace';
const COL = {
  bg: 0x10121a, panel: 0x1d2130, panelHi: 0x2a3046, line: 0x363d57, text: '#eef0f6', dim: '#8a91a8',
  gold: 0xf2b01e, cyan: 0x35d0ff, red: 0xff4d4d,
};

const STAT_UI = {
  food:   { label: 'Nourriture' },
  fun:    { label: 'Plaisir' },
  energy: { label: 'Énergie' },
  sleep:  { label: 'Sommeil' },
  clean:  { label: 'Propreté' },
};

const BUTTONS = [
  { id: 'feed',  label: 'Nourrir',  icon: 'food',  need: 'food',  key: '1' },
  { id: 'play',  label: 'Jouer',    icon: 'play',  need: 'fun',   key: '2' },
  { id: 'sleep', label: 'Dormir',   icon: 'sleep', need: 'sleep', key: '3' },
  { id: 'clean', label: 'Nettoyer', icon: 'clean', need: 'clean', key: '4' },
];

const ACTIVITY = { eat: ['eating', 2300], play: ['playing', 2900], clean: ['cleaning', 2300] };

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.storage = this.registry.get('storage');
    this.prefs = loadPrefs(this.storage);
    this.audio = createAudio({ muted: this.prefs.muted });
    this.state = loadPet(this.storage, Date.now());
    this.activity = null;     // { mood, until }
    this.shown = {};          // smoothed stat values for the bars
    STATS.forEach((k) => { this.shown[k] = this.state[k]; });
    this.msg = { text: '', until: 0 };
    this.fb = createFramebuffer();
    this.lastFace = -1;
    this.nextGlance = this.time.now + 2500;
    this.lastSave = 0;
    this.lastSim = 0;

    buildIcons(this);
    buildRobotTextures(this);
    this.faceTex = this.textures.createCanvas('face', FB_SIZE, FB_SIZE);
    this.faceTex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.faceData = this.faceTex.getContext().createImageData(FB_SIZE, FB_SIZE);

    this.buildBackground();
    this.robot = createRobot(this);
    this.buildHud();
    this.buildButtons();
    this.buildMessage();
    this.buildFooter();
    this.sleepVeil = this.add.rectangle(W / 2, H / 2, W, H, 0x02030a, 1).setDepth(20).setAlpha(0);
    this.veilTarget = 0;
    this.bringHudAboveVeil();

    // Tap the head: it turns to look at the finger. Costs nothing.
    this.input.on('pointerdown', (p) => {
      this.audio.unlock();
      if (p.y > ROBOT.headY - 190 && p.y < ROBOT.baseY + 40 && p.x > 120 && p.x < 600) {
        this.glance(p.x < W / 2 ? -1 : 1, 900);
        this.audio.play('look');
      }
    });
    this.input.keyboard?.on('keydown', (e) => {
      this.audio.unlock();
      const b = BUTTONS.find((x) => x.key === e.key);
      if (b) this.doAction(b.id);
    });

    document.addEventListener('visibilitychange', this.onVisibility = () => {
      if (document.hidden) this.persist();
      else this.simulate(true);
    });
    window.addEventListener('pagehide', this.onHide = () => this.persist());
    this.events.once('shutdown', () => {
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.onHide);
    });

    // Tiny read-only hook so automated checks can read the state.
    window.__tem = {
      state: () => ({ ...this.state }),
      mood: () => this.currentMood(),
      faceMood: () => this.faceMood,
      turn: () => this.robot.turn,
    };

    this.simulate(true);
    this.setIdleMessage();
    this.refreshButtons(true);
    this.cameras.main.fadeIn(350, 16, 18, 26);
  }

  // ---------- scene dressing ----------
  buildBackground() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COL.bg, 1); g.fillRect(0, 0, W, H);
    // soft spotlight behind the robot
    for (let i = 0; i < 16; i++) {
      g.fillStyle(0x5a2430, 0.03);
      g.fillCircle(W / 2, 760, 420 - i * 22);
    }
    // desk surface
    g.fillStyle(0x181b27, 1); g.fillRect(0, 1096, W, 190);
    g.fillStyle(0x23273a, 1); g.fillRect(0, 1096, W, 4);
    // faint pixel grid on the wall
    g.fillStyle(0xffffff, 0.025);
    for (let x = 0; x < W; x += 48) g.fillRect(x, 420, 2, 676);
    for (let y = 420; y < 1096; y += 48) g.fillRect(0, y, W, 2);
  }

  buildHud() {
    const d = 10;
    this.hud = [];
    const title = this.add.text(40, 58, 'ELON MAN', { fontFamily: FONT_PX, fontSize: '30px', color: '#f2b01e' }).setDepth(d);
    const sub = this.add.text(42, 106, '', { fontFamily: FONT_UI, fontSize: '24px', fontStyle: '500', color: COL.dim }).setDepth(d);
    this.subText = sub;
    // mute button
    this.muteBtn = this.add.image(W - 84, 82, this.prefs.muted ? 'icon-muted' : 'icon-sound').setDepth(d).setScale(0.8);
    const hit = this.add.rectangle(W - 84, 82, 112, 112, 0xffffff, 0).setDepth(d).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      this.audio.unlock();
      this.prefs.muted = !this.prefs.muted;
      this.audio.setMuted(this.prefs.muted);
      savePrefs(this.storage, this.prefs);
      this.muteBtn.setTexture(this.prefs.muted ? 'icon-muted' : 'icon-sound');
      if (!this.prefs.muted) this.audio.play('tap');
    });
    this.hud.push(title, sub, this.muteBtn, hit);

    // stat bars
    this.bars = {};
    const x0 = 40, bx = 260, bw = 330, y0 = 170, dy = 52;
    this.barGfx = this.add.graphics().setDepth(d);
    STATS.forEach((k, i) => {
      const y = y0 + i * dy;
      const label = this.add.text(x0, y - 2, STAT_UI[k].label, { fontFamily: FONT_UI, fontSize: '28px', fontStyle: '600', color: COL.text }).setDepth(d);
      const val = this.add.text(W - 40, y - 1, '', { fontFamily: FONT_UI, fontSize: '26px', fontStyle: '500', color: COL.dim }).setOrigin(1, 0).setDepth(d);
      this.bars[k] = { y: y + 6, label, val, bx, bw };
      this.hud.push(label, val);
    });
    this.hud.push(this.barGfx);
  }

  drawBars(time) {
    const g = this.barGfx;
    g.clear();
    for (const k of STATS) {
      const b = this.bars[k];
      const v = this.shown[k];
      g.fillStyle(0x0a0c12, 1); g.fillRoundedRect(b.bx - 2, b.y - 2, b.bw + 4, 28, 10);
      g.fillStyle(COL.panel, 1); g.fillRoundedRect(b.bx, b.y, b.bw, 24, 8);
      let col = COL.cyan;
      if (v < CONFIG.critical) col = COL.red; else if (v < CONFIG.low + 10) col = COL.gold;
      const pulse = v < CONFIG.critical ? 0.7 + 0.3 * Math.sin(time / 160) : 1;
      const w = Math.max(v > 0 ? 10 : 0, (b.bw * v) / 100);
      g.fillStyle(col, pulse); g.fillRoundedRect(b.bx, b.y, w, 24, 8);
      g.fillStyle(0xffffff, 0.22); g.fillRoundedRect(b.bx + 3, b.y + 3, Math.max(0, w - 6), 6, 3);
      b.val.setText(`${Math.round(v)}`);
    }
  }

  buildMessage() {
    this.msgText = this.add.text(W / 2, 1176, '', {
      fontFamily: FONT_UI, fontSize: '34px', fontStyle: '600', color: COL.text, align: 'center',
    }).setOrigin(0.5).setDepth(10);
  }

  buildFooter() {
    this.add.text(W / 2, 1514, 'PC17', { fontFamily: FONT_PX, fontSize: '18px', color: '#f2b01e' }).setOrigin(0.5).setDepth(10).setAlpha(0.9);
    this.add.text(W / 2, 1550, 'Robot : projet elon-man (MIT)', { fontFamily: FONT_UI, fontSize: '20px', color: COL.dim }).setOrigin(0.5).setDepth(10);
  }

  // ---------- buttons ----------
  buildButtons() {
    const bw = 156, bh = 214, gap = 12, x0 = (W - (4 * bw + 3 * gap)) / 2, y = 1254;
    this.buttons = BUTTONS.map((def, i) => {
      const cx = x0 + i * (bw + gap) + bw / 2, cy = y + bh / 2;
      const c = this.add.container(cx, cy).setDepth(10);
      const g = this.add.graphics();
      const icon = this.add.image(0, -26, `icon-${def.icon}`).setScale(1);
      const label = this.add.text(0, 58, def.label, { fontFamily: FONT_UI, fontSize: '30px', fontStyle: '600', color: COL.text }).setOrigin(0.5);
      c.add([g, icon, label]);
      const btn = { def, c, g, icon, label, bw, bh, pressed: false, enabled: true, hint: false, cx, cy };
      const zone = this.add.rectangle(cx, cy, bw, bh, 0xffffff, 0).setDepth(11).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => { btn.pressed = true; this.audio.unlock(); this.drawButton(btn); });
      zone.on('pointerout', () => { if (btn.pressed) { btn.pressed = false; this.drawButton(btn); } });
      zone.on('pointerup', () => {
        const was = btn.pressed;
        btn.pressed = false; this.drawButton(btn);
        if (was) this.doAction(def.id);
      });
      this.drawButton(btn);
      return btn;
    });
  }

  drawButton(btn, time = 0) {
    const { g, bw, bh } = btn;
    g.clear();
    const pressed = btn.pressed;
    const alpha = btn.enabled ? 1 : 0.4;
    g.fillStyle(0x000000, 0.4); g.fillRoundedRect(-bw / 2, -bh / 2 + 8, bw, bh, 26);
    g.fillStyle(pressed ? COL.panelHi : COL.panel, 1); g.fillRoundedRect(-bw / 2, -bh / 2 + (pressed ? 6 : 0), bw, bh, 26);
    g.lineStyle(3, COL.line, 1); g.strokeRoundedRect(-bw / 2, -bh / 2 + (pressed ? 6 : 0), bw, bh, 26);
    if (btn.hint && btn.enabled) {
      const a = 0.55 + 0.45 * Math.sin(time / 220);
      g.lineStyle(5, COL.gold, a); g.strokeRoundedRect(-bw / 2 - 2, -bh / 2 - 2 + (pressed ? 6 : 0), bw + 4, bh + 4, 28);
    }
    btn.icon.setY((pressed ? 6 : 0) - 26); btn.label.setY((pressed ? 6 : 0) + 58);
    btn.c.setAlpha(alpha);
  }

  refreshButtons(force = false) {
    const sleeping = this.state.sleeping;
    for (const b of this.buttons) {
      const enabled = b.def.id === 'sleep' ? true : !sleeping;
      const hint = !sleeping && this.state[b.def.need] < CONFIG.low;
      const sleepHint = b.def.id === 'sleep' && !sleeping && (this.state.sleep < CONFIG.low || this.state.energy < CONFIG.low);
      const label = b.def.id === 'sleep' ? (sleeping ? 'Réveiller' : 'Dormir') : b.def.label;
      if (force || b.enabled !== enabled || b.hint !== (hint || sleepHint) || b.label.text !== label) {
        b.enabled = enabled; b.hint = hint || sleepHint; b.label.setText(label);
        if (b.def.id === 'sleep') b.icon.setTexture(sleeping ? 'icon-play' : 'icon-sleep');
        this.drawButton(b);
      }
    }
  }

  // ---------- game flow ----------
  currentMood() { return moodOf(this.state); }

  doAction(id) {
    const now = Date.now();
    const r = act(this.state, id, now);
    this.state = r.state;
    if (!r.ok) {
      this.audio.play('no');
      this.say(r.msg, 1800);
      this.shake();
      return;
    }
    this.persist();
    this.say(r.msg, 2300);
    switch (r.event) {
      case 'eat': this.audio.play('eat'); this.startActivity('eat'); this.burst('crumb'); this.glance(0, 0); break;
      case 'play': this.audio.play('play'); this.startActivity('play'); this.burst('star'); this.playDance(); break;
      case 'clean': this.audio.play('clean'); this.startActivity('clean'); this.burst('bubble'); this.scrub(); break;
      case 'sleep': this.audio.play('sleep'); this.activity = null; this.glance(0, 0); break;
      case 'wake': this.audio.play('wake'); this.activity = null; this.wakeStretch(); break;
      default: break;
    }
    this.refreshButtons();
  }

  startActivity(ev) {
    const [mood, ms] = ACTIVITY[ev];
    this.activity = { mood, until: this.time.now + ms };
  }

  say(text, ms) { this.msg = { text, until: this.time.now + ms }; this.msgText.setText(text); this.msgText.setAlpha(1); }

  setIdleMessage() {
    const line = MOOD_LINES[this.currentMood()];
    if (this.msgText.text !== line) this.msgText.setText(line);
  }

  // Advance the simulation to now. After a long absence this is the offline catch-up (see logic.js).
  simulate(announce = false) {
    const before = this.state;
    const now = Date.now();
    this.state = catchUp(this.state, now);
    this.lastSim = this.time.now;
    if (announce && now - before.updatedAt > 5 * 60_000) {
      const mins = Math.round(Math.min(now - before.updatedAt, CONFIG.offlineCapMs) / 60_000);
      const h = Math.floor(mins / 60), m = mins % 60;
      this.say(`Tu étais parti ${h ? h + ' h ' : ''}${m} min…`, 3200);
    }
    if (before.sleeping && !this.state.sleeping) this.wakeStretch();
  }

  persist() { savePet(this.storage, this.state); this.lastSave = this.time.now; }

  // ---------- head + body animation ----------
  glance(dir, hold = 700) {
    this.tweens.killTweensOf(this.robot);
    this.tweens.add({
      targets: this.robot, turn: dir, duration: 380, ease: 'Sine.easeInOut',
      yoyo: dir !== 0, hold, onComplete: () => { this.robot.turn = 0; },
    });
  }

  playDance() {
    this.tweens.killTweensOf(this.robot);
    this.robot.turn = 0;
    this.tweens.add({ targets: this.robot, turn: { from: -1, to: 1 }, duration: 330, ease: 'Sine.easeInOut', yoyo: true, repeat: 3, onComplete: () => { this.robot.turn = 0; } });
    this.tweens.add({ targets: this.robot, hop: { from: 0, to: -34 }, duration: 160, ease: 'Quad.easeOut', yoyo: true, repeat: 7, onComplete: () => { this.robot.hop = 0; } });
  }

  scrub() {
    this.tweens.killTweensOf(this.robot);
    this.tweens.add({ targets: this.robot, turn: { from: -0.6, to: 0.6 }, duration: 260, yoyo: true, repeat: 4, onComplete: () => { this.robot.turn = 0; } });
  }

  wakeStretch() {
    this.tweens.add({ targets: this.robot, hop: { from: 0, to: -22 }, duration: 200, yoyo: true, repeat: 1, onComplete: () => { this.robot.hop = 0; } });
    this.glance(-1, 300);
  }

  shake() {
    this.tweens.add({ targets: this.robot, turn: { from: -0.5, to: 0.5 }, duration: 90, yoyo: true, repeat: 2, onComplete: () => { this.robot.turn = 0; } });
  }

  burst(kind) {
    const cx = ROBOT.cx, cy = ROBOT.headY + 30;
    const n = kind === 'bubble' ? 10 : 8;
    for (let i = 0; i < n; i++) {
      let o;
      const x = cx + Phaser.Math.Between(-170, 170), y = cy + Phaser.Math.Between(40, 260);
      if (kind === 'bubble') o = this.add.circle(x, y, Phaser.Math.Between(8, 20), 0x35d0ff, 0).setStrokeStyle(4, 0x9fe8ff, 0.9);
      else if (kind === 'star') o = this.add.star(x, y, 4, 5, 15, 0xffd23a);
      else o = this.add.rectangle(x, y, 10, 10, i % 2 ? 0xf2b01e : 0xe8a23a);
      o.setDepth(12);
      this.tweens.add({
        targets: o, y: y - Phaser.Math.Between(120, 260), x: x + Phaser.Math.Between(-40, 40),
        alpha: 0, angle: kind === 'star' ? 180 : 0, duration: Phaser.Math.Between(900, 1500), delay: i * 70,
        ease: 'Sine.easeOut', onComplete: () => o.destroy(),
      });
    }
  }

  // ---------- frame loop ----------
  update(time) {
    // simulation + autosave
    if (time - this.lastSim > 1000) this.simulate();
    if (time - this.lastSave > 5000) this.persist();

    // idle head turns
    const mood = this.currentMood();
    if (!this.state.sleeping && !this.activity && time > this.nextGlance) {
      const r = Math.random();
      this.glance(r < 0.5 ? -1 : 1, 500 + Math.random() * 900);
      this.nextGlance = time + 3200 + Math.random() * 4500;
      if (mood === 'bored') this.nextGlance -= 1500;
    }
    if (this.activity && time > this.activity.until) this.activity = null;

    // breathing / sleeping posture
    this.robot.bob = Math.sin(time / (this.state.sleeping ? 900 : 700)) * (this.state.sleeping ? 2 : 3.5);
    this.robot.nod = this.state.sleeping ? 18 : mood === 'sleepy' ? 8 + Math.sin(time / 800) * 6 : mood === 'sad' ? 8 : 0;
    this.robot.update();

    // face (~20 fps)
    this.faceMood = this.activity ? this.activity.mood : mood;
    if (time - this.lastFace > 50) {
      this.lastFace = time;
      renderFace({ mood: this.faceMood, t: time, gaze: this.robot.turn }, this.fb);
      toRGBA(this.fb, this.faceData.data);
      this.faceTex.getContext().putImageData(this.faceData, 0, 0);
      this.faceTex.refresh();
    }

    // HUD
    for (const k of STATS) this.shown[k] += (this.state[k] - this.shown[k]) * 0.12;
    this.drawBars(time);
    const age = ageDays(this.state, Date.now());
    const sub = `Jour ${age} · ${this.state.cares} soin${this.state.cares > 1 ? 's' : ''}`;
    if (this.subText.text !== sub) this.subText.setText(sub);
    this.refreshButtons();
    for (const b of this.buttons) if (b.hint && b.enabled) this.drawButton(b, time);

    // message line
    if (time > this.msg.until) { this.setIdleMessage(); }

    // sleeping veil
    this.veilTarget = this.state.sleeping ? 0.5 : 0;
    this.sleepVeil.setAlpha(this.sleepVeil.alpha + (this.veilTarget - this.sleepVeil.alpha) * 0.08);
  }

  bringHudAboveVeil() {
    // keep buttons, header and the message readable while the room is dark
    [this.msgText, this.subText, this.muteBtn].forEach((o) => o.setDepth(30));
    this.buttons.forEach((b) => b.c.setDepth(30));
    this.barGfx.setDepth(30);
    Object.values(this.bars).forEach((b) => { b.label.setDepth(30); b.val.setDepth(30); });
    // the footer and title sit at depth 10, under the veil: they dim, which is fine.
  }
}
