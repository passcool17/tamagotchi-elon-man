// GameScene.js — the one and only scene: HUD, robot, 4 care buttons + Parler.
// Rules live in logic.js, OLED pixels in oled.js, head motion in servo.js, replies in brain/.
// This file only wires them to Phaser (v2.0 kept the v1 scene structure).
import {
  STATS, act, catchUp, moodOf, MOOD_LINES, ageDays, CONFIG,
} from '../logic.js';
import { createPanels, renderFace, toRGBA } from '../oled.js';
import { createMotion, restPose, talkGesture, rods } from '../servo.js';
import { reply as demoReply } from '../brain/demo.js';
import { createBrain, pingGateway } from '../brain/gateway.js';
import { createChat } from '../ui/chat.js';
import { loadPet, savePet, loadPrefs, savePrefs } from '../storage.js';
import { createAudio } from '../audio.js';
import { consider, createVoiceMemory, VOICE_IDS } from '../voice.js';
import { buildIcons, ICON_PX } from '../ui/icons.js';
import { buildRobotTextures, createOledTextures, createRobot, ROBOT } from '../ui/robot.js';

const W = 720, H = 1600;
const CAPTION_Y = 300; // speech bubble floats over the stat bars, above the head
const FONT_UI = 'Rubik, system-ui, sans-serif';
const FONT_PX = '"Press Start 2P", monospace';
const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';
// palette borrowed from La mallette de l'Entité (dark shell, cyan accents), gold kept for the PC17 brand
const COL = {
  bg: 0x07090c, panel: 0x14171c, panelHi: 0x1f242b, line: 0x2a3038, text: '#e8edf1', dim: '#7d858d',
  gold: 0xf2b01e, cyan: 0x62d6ff, red: 0xff3b30,
};
const OLED_ON = [214, 240, 255], OLED_OFF = [4, 6, 10];

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
  { id: 'talk',  label: 'Parler',   icon: 'talk',  need: null,    key: '5' },
];

const ACTIVITY = { eat: ['eating', 2300], play: ['playing', 2900], clean: ['cleaning', 2300] };

export class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    this.storage = this.registry.get('storage');
    this.prefs = loadPrefs(this.storage);
    this.audio = createAudio({ muted: this.prefs.muted, voice: this.prefs.voice !== false });
    this.voiceMem = createVoiceMemory();
    this.captionUntil = 0;
    const info = {};
    this.state = loadPet(this.storage, Date.now(), info);
    this.migrated = info.migrated;
    this.activity = null;     // { mood, until }
    this.shown = {};          // smoothed stat values for the bars
    STATS.forEach((k) => { this.shown[k] = this.state[k]; });
    this.msg = { text: '', until: 0 };
    this.panels = createPanels();
    this.motion = createMotion();
    this.talkUntil = 0;
    this.lastFace = -1;
    this.nextGlance = this.time.now + 4500;
    this.lastSave = 0;
    this.lastSim = 0;

    buildIcons(this);
    buildRobotTextures(this);
    this.oled = createOledTextures();
    this.brain = createBrain({ demoReply, getPrefs: () => this.prefs });
    this.chat = createChat({
      getPrefs: () => this.prefs,
      setPrefs: (brain) => { this.prefs.brain = { ...this.prefs.brain, ...brain }; savePrefs(this.storage, this.prefs); this.refreshMode(); },
      onAsk: (text) => this.ask(text),
      onTest: async (url) => { const r = await pingGateway(url); this.gatewayOk = r.ok; this.refreshMode(); return r; },
      onOpenChange: (o) => { this.chatOpen = o; if (o) this.onUnlock(); },
    });
    this.gatewayOk = null;

    this.buildBackground();
    this.robot = createRobot(this, this.oled);
    this.buildTelemetry();
    this.buildHud();
    this.buildButtons();
    this.buildMessage();
    this.buildFooter();
    this.sleepVeil = this.add.rectangle(W / 2, H / 2, W, H, 0x02030a, 1).setDepth(20).setAlpha(0);
    this.veilTarget = 0;
    this.bringHudAboveVeil();

    // Tap the robot: the pan servo turns the head toward the finger. Costs nothing.
    this.input.on('pointerdown', (p) => {
      this.onUnlock();
      if (p.y > ROBOT.headTop && p.y < ROBOT.baseY + 40 && p.x > 90 && p.x < 630) {
        this.glance(p.x < W / 2 ? -1 : 1, 900);
        this.audio.play('look');
        this.tryVoice('headtap');
      }
    });
    this.input.keyboard?.on('keydown', (e) => {
      this.onUnlock();
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
      turn: () => this.motion.head.pos.pan / 90,
      pose: () => ({ ...this.motion.head.pos }),
      rods: () => rods(this.motion.head.pos),
      gesture: (name) => { this.motion.gesture(name); return this.motion.busy(); },
      ask: (text) => this.ask(text),
      brain: () => ({ ...this.brain.status(), gatewayOk: this.gatewayOk, url: this.prefs.brain.url }),
      setBrain: (b) => { this.prefs.brain = { ...this.prefs.brain, ...b }; savePrefs(this.storage, this.prefs); this.refreshMode(); },
      openChat: () => this.chat.open(),
      closeChat: () => this.chat.close(),
      lastReply: () => this.lastReply,
      speak: (id, opts) => this.tryVoice(id, opts || { force: true }),
      voiceIds: () => VOICE_IDS.slice(),
      voiceMem: () => ({ ...this.voiceMem, lastAt: { ...this.voiceMem.lastAt } }),
      musicTime: () => this.audio.musicTime(),
      skipTo: (s) => this.audio.skipTo(s),
      musicPlaying: () => this.audio.musicPlaying(),
      voicePlaying: () => this.audio.voicePlaying(),
      ducking: () => this.audio.ducking(),
      muted: () => this.prefs.muted,
      voiceOn: () => this.prefs.voice !== false,
      ctxState: () => this.audio.ctxState(),
    };

    this.simulate(true);
    this.setIdleMessage();
    this.refreshButtons(true);
    this.refreshMode();
    if (this.migrated) this.say('Sauvegarde v1 récupérée!', 2600);
  }

  // ---------- brain ----------
  refreshMode() {
    const b = this.brain.status();
    let label = 'DÉMO', kind = 'demo';
    if (b.mode === 'gateway') {
      const ok = b.lastGateway ?? this.gatewayOk;
      if (ok === false) { label = 'PC ✗ → DÉMO'; kind = 'fallback'; } else { label = ok ? 'PC ✓' : 'PC'; kind = 'gateway'; }
    }
    this.modeText?.setText(label).setColor(kind === 'gateway' ? '#36f08a' : kind === 'fallback' ? '#ffb020' : '#62d6ff');
    this.chat?.setMode(label, kind);
  }

  async ask(text) {
    const pet = { ...this.state, mood: this.currentMood() };
    if (this.brain.status().mode === 'gateway') this.motion.play([{ nod: 6, tilt: 6, hold: 200 }], 'think');
    this.thinking = true;
    const r = await this.brain.ask(text, { pet });
    this.thinking = false;
    this.lastReply = r;
    this.refreshMode();
    const ms = Math.min(7000, Math.max(1800, r.reply.length * 55));
    this.talkUntil = this.time.now + ms;
    this.talkMood = r.mood || null;
    // gesture first, then speech bobs; a PC reply may carry an explicit look pose
    const keys = [];
    if (r.look) keys.push({ ...r.look, hold: 500 });
    if (r.gesture && !r.look) this.motion.gesture(r.gesture);
    if (r.gesture && !r.look) keys.push(...this.motion.queue.splice(0));
    keys.push(...talkGesture(r.reply));
    this.motion.play(keys, 'talk');
    this.showCaption(r.reply, ms + 300);
    this.audio.play('look');
    return r;
  }

  // ---------- scene dressing ----------
  buildBackground() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(COL.bg, 1); g.fillRect(0, 0, W, H);
    // cyan halo behind the head (Entité-style), very soft
    for (let i = 0; i < 18; i++) { g.fillStyle(0x1a5a78, 0.025); g.fillCircle(W / 2, 600, 400 - i * 20); }
    // faint dot grid on the wall
    g.fillStyle(0x62d6ff, 0.06);
    for (let y = 408; y < 1112; y += 32) for (let x = 16; x < W; x += 32) g.fillRect(x, y, 2, 2);
    // desk
    const deskY = Math.round(ROBOT.floor - 14); // the base stands on the desk
    g.fillStyle(0x0e1116, 1); g.fillRect(0, deskY, W, 1240 - deskY);
    g.fillStyle(0x1d232b, 1); g.fillRect(0, deskY, W, 3);
  }

  buildTelemetry() {
    this.telemetry = this.add.text(W - 22, 752, '', {
      fontFamily: FONT_MONO, fontSize: '19px', color: '#62d6ff', align: 'right', lineSpacing: 6,
    }).setOrigin(1, 0).setDepth(10).setAlpha(0.85);
    this.add.text(22, 752, 'SERVOS', { fontFamily: FONT_MONO, fontSize: '17px', color: '#3d6f85' }).setDepth(10);
  }

  drawTelemetry(p) {
    const f = (v) => `${v >= 0 ? '+' : '−'}${String(Math.round(Math.abs(v))).padStart(2, '0')}°`;
    const r = rods(p);
    const t = `PAN ${f(p.pan)}\nNOD ${f(p.nod)}\nROLL ${f(p.tilt)}\nG ${f(r.left)} D ${f(r.right)}`;
    if (t !== this.telemetry.text) this.telemetry.setText(t);
  }

  buildHud() {
    const d = 10;
    this.hud = [];
    const title = this.add.text(40, 58, 'ELON MAN', { fontFamily: FONT_PX, fontSize: '30px', color: '#f2b01e' }).setDepth(d);
    const sub = this.add.text(42, 106, '', { fontFamily: FONT_UI, fontSize: '24px', fontStyle: '500', color: COL.dim }).setDepth(d);
    this.subText = sub;
    this.modeText = this.add.text(300, 66, 'DÉMO', { fontFamily: FONT_MONO, fontSize: '22px', color: '#62d6ff' }).setDepth(d);
    // mute (music+sfx+voice) and voice-only toggles
    this.muteBtn = this.add.image(W - 78, 82, this.prefs.muted ? 'icon-muted' : 'icon-sound').setDepth(d).setScale(0.8);
    const hit = this.add.rectangle(W - 78, 82, 104, 104, 0xffffff, 0).setDepth(d).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => {
      this.onUnlock();
      this.prefs.muted = !this.prefs.muted;
      this.audio.setMuted(this.prefs.muted);
      savePrefs(this.storage, this.prefs);
      this.muteBtn.setTexture(this.prefs.muted ? 'icon-muted' : 'icon-sound');
      if (!this.prefs.muted) this.audio.play('tap');
    });
    const voiceOn = this.prefs.voice !== false;
    this.voiceBtn = this.add.image(W - 186, 82, voiceOn ? 'icon-voice' : 'icon-voicemute').setDepth(d).setScale(0.8);
    const vhit = this.add.rectangle(W - 186, 82, 104, 104, 0xffffff, 0).setDepth(d).setInteractive({ useHandCursor: true });
    vhit.on('pointerup', () => {
      this.onUnlock();
      this.prefs.voice = this.prefs.voice === false;
      this.audio.setVoice(this.prefs.voice !== false);
      savePrefs(this.storage, this.prefs);
      this.voiceBtn.setTexture(this.prefs.voice !== false ? 'icon-voice' : 'icon-voicemute');
      if (this.prefs.voice !== false && !this.prefs.muted) {
        this.audio.play('tap');
        this.tryVoice('open');
      }
    });
    this.hud.push(title, sub, this.modeText, this.muteBtn, hit, this.voiceBtn, vhit);

    // stat bars
    this.bars = {};
    const x0 = 40, bx = 250, bw = 350, y0 = 152, dy = 44;
    this.barGfx = this.add.graphics().setDepth(d);
    STATS.forEach((k, i) => {
      const y = y0 + i * dy;
      const label = this.add.text(x0, y - 2, STAT_UI[k].label, { fontFamily: FONT_UI, fontSize: '26px', fontStyle: '600', color: COL.text }).setDepth(d);
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
      g.fillStyle(0x020304, 1); g.fillRoundedRect(b.bx - 2, b.y - 2, b.bw + 4, 26, 6);
      g.fillStyle(COL.panel, 1); g.fillRoundedRect(b.bx, b.y, b.bw, 22, 5);
      let col = COL.cyan;
      if (v < CONFIG.critical) col = COL.red; else if (v < CONFIG.low + 10) col = COL.gold;
      const pulse = v < CONFIG.critical ? 0.7 + 0.3 * Math.sin(time / 160) : 1;
      const w = Math.max(v > 0 ? 10 : 0, (b.bw * v) / 100);
      g.fillStyle(col, pulse); g.fillRoundedRect(b.bx, b.y, w, 22, 5);
      g.fillStyle(0xffffff, 0.22); g.fillRect(b.bx + 3, b.y + 3, Math.max(0, w - 6), 4);
      b.val.setText(`${Math.round(v)}`);
    }
  }

  buildMessage() {
    this.msgText = this.add.text(W / 2, 1204, '', {
      fontFamily: FONT_UI, fontSize: '32px', fontStyle: '600', color: COL.text, align: 'center',
    }).setOrigin(0.5).setDepth(10);
    this.captionBg = this.add.graphics().setDepth(31).setAlpha(0);
    this.captionText = this.add.text(W / 2, CAPTION_Y, '', {
      fontFamily: FONT_UI, fontSize: '30px', fontStyle: '600', color: '#1a140c', align: 'center',
      wordWrap: { width: 560 },
    }).setOrigin(0.5).setDepth(32).setAlpha(0);
  }

  showCaption(text, ms) {
    if (!text) return;
    this.captionText.setText(text);
    const padX = 28, padY = 16;
    const w = Math.min(600, Math.max(200, this.captionText.width + padX * 2));
    const h = this.captionText.height + padY * 2;
    const x = (W - w) / 2, y = CAPTION_Y - h / 2;
    const g = this.captionBg;
    g.clear();
    g.fillStyle(0xffe08a, 1);
    g.fillRoundedRect(x, y, w, h, 22);
    g.lineStyle(3, 0x9a6a00, 0.55);
    g.strokeRoundedRect(x, y, w, h, 22);
    // little tail toward the head
    g.fillStyle(0xffe08a, 1);
    g.fillTriangle(W / 2 - 16, y + h, W / 2 + 16, y + h, W / 2, y + h + 18);
    this.captionBg.setAlpha(1);
    this.captionText.setAlpha(1);
    this.captionUntil = this.time.now + ms;
  }

  hideCaption() {
    this.captionBg.setAlpha(0);
    this.captionText.setAlpha(0);
    this.captionText.setText('');
  }

  onUnlock() {
    const p = this.audio.unlock();
    // Salut after the first gesture, once the buffers are in.
    const greet = () => { if (!this.voiceMem.greeted) this.tryVoice('open'); };
    if (p && typeof p.then === 'function') p.then(greet).catch(() => {});
    else greet();
  }

  tryVoice(event, { force = false } = {}) {
    const now = Date.now();
    const guessed = 2000;
    const r = consider({
      now, event, state: this.state, mem: this.voiceMem,
      muted: this.prefs.muted, voice: this.prefs.voice !== false,
      durationMs: guessed, force,
    });
    this.voiceMem = r.mem;
    if (!r.id) return null;
    const durSec = this.audio.speak(r.id);
    const durMs = Math.max(800, Math.round((durSec || 1.8) * 1000));
    // Keep busyUntil honest now that we know the real duration.
    this.voiceMem = { ...this.voiceMem, busyUntil: now + durMs };
    this.showCaption(r.text, durMs + 400);
    return r.id;
  }

  buildFooter() {
    this.add.text(W / 2, 1500, 'PC17 · v2.2', { fontFamily: FONT_PX, fontSize: '18px', color: '#f2b01e' }).setOrigin(0.5).setDepth(10).setAlpha(0.9);
    this.add.text(W / 2, 1538, 'Robot : projet elon-man (MIT)', { fontFamily: FONT_UI, fontSize: '20px', color: COL.dim }).setOrigin(0.5).setDepth(10);
  }

  // ---------- buttons ----------
  buildButtons() {
    const n = BUTTONS.length, gap = 10, bw = Math.floor((W - 30 - (n - 1) * gap) / n), bh = 196, x0 = (W - (n * bw + (n - 1) * gap)) / 2, y = 1254;
    this.buttons = BUTTONS.map((def, i) => {
      const cx = x0 + i * (bw + gap) + bw / 2, cy = y + bh / 2;
      const c = this.add.container(cx, cy).setDepth(10);
      const g = this.add.graphics();
      const icon = this.add.image(0, -24, `icon-${def.icon}`).setScale(0.9);
      const label = this.add.text(0, 54, def.label, { fontFamily: FONT_UI, fontSize: '25px', fontStyle: '600', color: COL.text }).setOrigin(0.5);
      c.add([g, icon, label]);
      const btn = { def, c, g, icon, label, bw, bh, pressed: false, enabled: true, hint: false, cx, cy };
      const zone = this.add.rectangle(cx, cy, bw, bh, 0xffffff, 0).setDepth(11).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => { btn.pressed = true; this.onUnlock(); this.drawButton(btn); });
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
    g.fillStyle(0x000000, 0.4); g.fillRoundedRect(-bw / 2, -bh / 2 + 8, bw, bh, 14);
    g.fillStyle(pressed ? COL.panelHi : COL.panel, 1); g.fillRoundedRect(-bw / 2, -bh / 2 + (pressed ? 6 : 0), bw, bh, 14);
    g.lineStyle(3, btn.def.id === 'talk' ? 0x2a6f8f : COL.line, 1); g.strokeRoundedRect(-bw / 2, -bh / 2 + (pressed ? 6 : 0), bw, bh, 14);
    if (btn.hint && btn.enabled) {
      const a = 0.55 + 0.45 * Math.sin(time / 220);
      g.lineStyle(5, COL.gold, a); g.strokeRoundedRect(-bw / 2 - 2, -bh / 2 - 2 + (pressed ? 6 : 0), bw + 4, bh + 4, 16);
    }
    btn.icon.setY((pressed ? 6 : 0) - 24); btn.label.setY((pressed ? 6 : 0) + 54);
    btn.c.setAlpha(alpha);
  }

  refreshButtons(force = false) {
    const sleeping = this.state.sleeping;
    for (const b of this.buttons) {
      const enabled = b.def.id === 'sleep' || b.def.id === 'talk' ? true : !sleeping;
      const hint = !sleeping && !!b.def.need && this.state[b.def.need] < CONFIG.low;
      const sleepHint = b.def.id === 'sleep' && !sleeping && (this.state.sleep < CONFIG.low || this.state.energy < CONFIG.low);
      const label = b.def.id === 'sleep' ? (sleeping ? 'Réveiller' : 'Dormir') : b.def.label;
      if (force || b.enabled !== enabled || b.hint !== (hint || sleepHint) || b.label.text !== label) {
        b.enabled = enabled; b.hint = hint || sleepHint; b.label.setText(label);
        if (b.def.id === 'sleep') b.icon.setTexture(sleeping ? 'icon-sun' : 'icon-sleep');
        this.drawButton(b);
      }
    }
  }

  // ---------- game flow ----------
  currentMood() { return moodOf(this.state); }

  doAction(id) {
    if (id === 'talk') { this.chat.open(); return; }
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
      case 'eat': this.audio.play('eat'); this.startActivity('eat'); this.burst('crumb'); this.motion.gesture('eat'); break;
      case 'play': this.audio.play('play'); this.startActivity('play'); this.burst('star'); this.playDance(); break;
      case 'clean': this.audio.play('clean'); this.startActivity('clean'); this.burst('bubble'); this.motion.gesture('clean'); break;
      case 'sleep': this.audio.play('sleep'); this.activity = null; this.motion.gesture('sleep'); break;
      case 'wake': this.audio.play('wake'); this.activity = null; this.wakeStretch(); break;
      default: break;
    }
    const voiceEvent = { eat: 'feed', play: 'play', clean: 'clean', sleep: 'sleep', wake: 'wake' }[r.event];
    if (voiceEvent) this.tryVoice(voiceEvent);
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

  // ---------- head motion (servo model in servo.js) ----------
  // Look toward a side with the pan servo (±90° at full), then come back.
  glance(dir, hold = 700) {
    if (dir === 0) { this.motion.play([{ pan: 0, nod: 0, tilt: 0 }], 'center'); return; }
    this.motion.play([{ pan: dir * 70, nod: 4, tilt: -dir * 4, hold }, { pan: 0, nod: 0, tilt: 0 }], 'glance');
  }

  playDance() {
    this.motion.gesture('play');
    this.tweens.add({ targets: this.robot, hop: { from: 0, to: -16 }, duration: 160, ease: 'Quad.easeOut', yoyo: true, repeat: 5, onComplete: () => { this.robot.hop = 0; } });
  }

  wakeStretch() { this.motion.gesture('wake'); }

  shake() { this.motion.gesture('refuse'); }

  burst(kind) {
    const cx = ROBOT.cx, cy = ROBOT.headTop - 40;
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

    // idle glances (only when no gesture is playing)
    const mood = this.currentMood();
    if (!this.state.sleeping && !this.activity && !this.motion.busy() && time > this.nextGlance && time > this.talkUntil) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const far = mood === 'bored' || Math.random() < 0.25;
      const pan = dir * (far ? 85 + Math.random() * 5 : 25 + Math.random() * 30);
      this.motion.play([{ pan, nod: (Math.random() - 0.4) * 10, tilt: (Math.random() - 0.5) * 12, hold: 500 + Math.random() * 900 }, { pan: 0, nod: 0, tilt: 0 }], 'idle');
      this.nextGlance = time + 3200 + Math.random() * 4500;
      if (mood === 'bored') this.nextGlance -= 1500;
    }
    if (this.activity && time > this.activity.until) this.activity = null;

    // servos: step the model, then draw the head/neck from the pose
    const dt = Math.min(100, time - (this.lastStep || time));
    this.lastStep = time;
    const rest = restPose(this.state.sleeping ? 'sleeping' : mood, time);
    const pose = this.motion.step(dt, rest);
    this.robot.update(pose);
    this.drawTelemetry(pose);

    // face (~20 fps): talking while a reply is shown or a voice line plays
    const talking = time < this.talkUntil || this.audio.voicePlaying?.();
    this.faceMood = this.thinking ? 'thinking' : this.activity ? this.activity.mood
      : talking ? (this.talkMood === 'sleeping' ? 'sleeping' : 'talking') : this.state.sleeping ? 'sleeping' : mood;
    if (time - this.lastFace > 50) {
      this.lastFace = time;
      const talk = talking ? 0.35 + 0.65 * Math.abs(Math.sin(time / 95) * Math.sin(time / 233)) : 0;
      renderFace({ mood: this.faceMood, t: time, look: { x: pose.pan / 70, y: -pose.nod / 12 }, talk, plate: true }, this.panels);
      for (const k of ['eyeL', 'eyeR', 'mouth']) {
        const o = this.oled[k];
        toRGBA(this.panels[k], o.img.data, { grid: ROBOT.grid, on: OLED_ON, off: OLED_OFF });
        o.ctx.putImageData(o.img, 0, 0);
      }
      this.robot.refreshFace();
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
    if (this.captionUntil && time > this.captionUntil) { this.hideCaption(); this.captionUntil = 0; }
    // mood lines, at most once a second, and only after the greeting (or if salut is off)
    if (this.voiceMem.greeted && time - (this.lastVoiceTick || 0) > 1000) {
      this.lastVoiceTick = time;
      this.tryVoice('tick');
    }

    // sleeping veil
    this.veilTarget = this.state.sleeping ? 0.5 : 0;
    this.sleepVeil.setAlpha(this.sleepVeil.alpha + (this.veilTarget - this.sleepVeil.alpha) * 0.08);
  }

  bringHudAboveVeil() {
    // keep buttons, header and the message readable while the room is dark
    [this.msgText, this.subText, this.muteBtn, this.voiceBtn].forEach((o) => o.setDepth(30));
    this.buttons.forEach((b) => b.c.setDepth(30));
    this.barGfx.setDepth(30);
    Object.values(this.bars).forEach((b) => { b.label.setDepth(30); b.val.setDepth(30); });
    // the footer and title sit at depth 10, under the veil: they dim, which is fine.
  }
}
