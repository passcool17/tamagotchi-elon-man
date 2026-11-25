// voice.js — pure trigger logic for the 14 Elon Man lines. No DOM, no WebAudio.
// consider() decides which line to say (or none). The scene plays the file and shows the caption.

import { moodOf, CONFIG, STATS } from './logic.js';

export const VOICE_IDS = [
  'salut', 'faim', 'content_mange', 'jouer', 'ennui', 'fatigue',
  'bonne_nuit', 'reveil', 'sale', 'propre', 'triste', 'batterie_faible',
  'merci', 'content',
];

// Official texts from /workspace/games/tamagotchi-elon-man-audio/voix/SCRIPT.md
export const VOICE_TEXT = {
  salut: 'Salut Pascal !',
  faim: "J'ai faim...",
  content_mange: 'Miam, ça fait du bien !',
  jouer: 'On joue ! Yahou !',
  ennui: "Je m'ennuie un peu...",
  fatigue: 'Je suis fatigué...',
  bonne_nuit: 'Bonne nuit, Pascal.',
  reveil: 'Bon matin, Pascal !',
  sale: 'Je suis tout sale.',
  propre: 'Tout propre, tout beau !',
  triste: 'Je suis tout triste...',
  batterie_faible: 'Ma batterie est faible.',
  merci: 'Merci Pascal !',
  content: 'Je suis content !',
};

export const VOICE_FILE = (id) => `assets/voix/${id}.mp3`;

// Events the scene can send. 'tick' = periodic mood check. 'headtap' = touch on the robot.
export const VOICE_EVENTS = ['open', 'feed', 'play', 'sleep', 'wake', 'clean', 'headtap', 'tick'];

const HOUR = 3_600_000;

export const VOICE_CONFIG = {
  globalMs: 7_000,
  merciWindowMs: 20_000,
  // Low-stat alerts are long so the robot does not nag. Action lines rely mostly on the global gap.
  lineMs: {
    salut: 12 * HOUR,
    faim: 60_000,
    ennui: 60_000,
    fatigue: 60_000,
    sale: 60_000,
    triste: 75_000,
    batterie_faible: 90_000,
    content: 90_000,
    merci: 120_000,
    content_mange: 8_000,
    jouer: 8_000,
    propre: 8_000,
    bonne_nuit: 8_000,
    reveil: 8_000,
  },
};

export function createVoiceMemory() {
  return {
    lastGlobalAt: -1e15,
    lastAt: {},
    greeted: false,
    merciArmed: false,
    helpedAt: -1e15,
    busyUntil: 0,
  };
}

const lineCd = (id) => VOICE_CONFIG.lineMs[id] ?? VOICE_CONFIG.globalMs;

const isLow = (s, k) => s[k] < CONFIG.low;
const isCritical = (s, k) => s[k] < CONFIG.critical;

function pick(event, state, mem, now) {
  switch (event) {
    case 'open': return mem.greeted ? null : 'salut';
    case 'feed': return 'content_mange';
    case 'play': return 'jouer';
    case 'clean': return 'propre';
    case 'sleep': return 'bonne_nuit';
    case 'wake': return 'reveil';
    case 'headtap':
      if (mem.merciArmed && now - mem.helpedAt <= VOICE_CONFIG.merciWindowMs) return 'merci';
      return null;
    case 'tick':
      if (state.sleeping) return null;
      if (isCritical(state, 'energy') || STATS.filter((k) => isCritical(state, k)).length >= 2) return 'batterie_faible';
      if (moodOf(state) === 'sad') return 'triste';
      if (isLow(state, 'food')) return 'faim';
      if (isLow(state, 'energy') || isLow(state, 'sleep')) return 'fatigue';
      if (isLow(state, 'fun')) return 'ennui';
      if (isLow(state, 'clean')) return 'sale';
      if (moodOf(state) === 'happy') return 'content';
      return null;
    default:
      return VOICE_TEXT[event] ? event : null;
  }
}

function allowed(id, mem, now, force) {
  if (force) return true;
  if (id === 'salut' && mem.greeted) return false;
  if (now < mem.busyUntil) return false;
  if (now - mem.lastGlobalAt < VOICE_CONFIG.globalMs) return false;
  if (now - (mem.lastAt[id] ?? -1e15) < lineCd(id)) return false;
  return true;
}

// Returns { id, text, mem }. id is null when nothing should be said. Always returns a new mem object.
export function consider({
  now, event = 'tick', state, mem, muted = false, voice = true, durationMs = 2000, force = false,
} = {}) {
  const next = {
    lastGlobalAt: mem?.lastGlobalAt ?? -1e15,
    lastAt: { ...(mem?.lastAt || {}) },
    greeted: !!mem?.greeted,
    merciArmed: !!mem?.merciArmed,
    helpedAt: mem?.helpedAt ?? -1e15,
    busyUntil: mem?.busyUntil ?? 0,
  };

  // Arm "merci" whenever a care action is attempted; the scene only sends these on success.
  if (event === 'feed' || event === 'play' || event === 'clean') {
    next.merciArmed = true;
    next.helpedAt = now;
  }

  if (muted || !voice) return { id: null, text: null, mem: next };

  const id = pick(event, state, next, now);
  if (!id || !VOICE_TEXT[id] || !allowed(id, next, now, force)) return { id: null, text: null, mem: next };

  next.lastGlobalAt = now;
  next.lastAt[id] = now;
  next.busyUntil = now + Math.max(0, durationMs);
  if (id === 'salut') next.greeted = true;
  if (id === 'merci') next.merciArmed = false;
  return { id, text: VOICE_TEXT[id], mem: next };
}
