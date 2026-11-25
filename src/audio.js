// audio.js — WebAudio blips, looped bed music, and voice lines.
// Nothing becomes audible until the first user gesture (mobile autoplay rules).
// Music is decoded into an AudioBuffer and looped by WebAudio (loopStart/loopEnd),
// so MP3 encoder padding cannot insert a gap: we loop a known 96.000 s region.

import { VOICE_IDS, VOICE_FILE } from './voice.js';

export const MUSIC_VOL = 0.32;
export const MUSIC_DUCK = 0.35; // fraction of MUSIC_VOL while a line plays
export const MUSIC_LOOP_SEC = 96.0; // 40 bars at 100 BPM, baked 50 ms crossfade at t=0
export const MUSIC_URLS = { ogg: 'assets/music/theme.ogg', mp3: 'assets/music/theme.mp3' };

function canPlay(type) {
  try { return document.createElement('audio').canPlayType(type) !== ''; } catch { return false; }
}

export function createAudio({ muted = false, voice = true } = {}) {
  let ctx = null;
  let isMuted = muted;
  let voiceOn = voice;
  let master = null;
  let musicGain = null;
  let voiceGain = null;
  let sfxGain = null;
  let musicBuf = null;
  let musicSrc = null;
  let musicStarted = false;
  let musicStartedAt = 0; // ctx.currentTime when the looping source started
  let voiceBuf = new Map();
  let voiceSrc = null;
  let ducked = false;
  let loadP = null;

  function makeCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    musicGain = ctx.createGain();
    voiceGain = ctx.createGain();
    sfxGain = ctx.createGain();
    musicGain.gain.value = 0;
    voiceGain.gain.value = 1;
    sfxGain.gain.value = 1;
    musicGain.connect(master);
    voiceGain.connect(master);
    sfxGain.connect(master);
    master.connect(ctx.destination);
    applyMute();
    return ctx;
  }

  function applyMute() {
    if (!master || !ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(isMuted ? 0 : 1, ctx.currentTime);
  }

  function musicTarget() {
    if (isMuted) return 0;
    return MUSIC_VOL * (ducked ? MUSIC_DUCK : 1);
  }

  function applyMusicVol(seconds = 0.08) {
    if (!musicGain || !ctx) return;
    const t = ctx.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(musicTarget(), t + seconds);
  }

  async function decode(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio ${res.status} ${url}`);
    const arr = await res.arrayBuffer();
    return await ctx.decodeAudioData(arr.slice(0));
  }

  async function loadAll() {
    if (loadP) return loadP;
    if (!makeCtx()) return;
    loadP = (async () => {
      const url = canPlay('audio/ogg; codecs=vorbis') ? MUSIC_URLS.ogg : MUSIC_URLS.mp3;
      try { musicBuf = await decode(url); } catch (e) {
        if (url !== MUSIC_URLS.mp3) {
          try { musicBuf = await decode(MUSIC_URLS.mp3); } catch { /* music optional */ }
        }
      }
      await Promise.all(VOICE_IDS.map(async (id) => {
        try { voiceBuf.set(id, await decode(VOICE_FILE(id))); } catch { /* missing line: skip */ }
      }));
    })();
    return loadP;
  }


  function startSource(offset) {
    if (!ctx || !musicBuf || !musicGain) return;
    if (musicSrc) {
      try { musicSrc.stop(); } catch { /* */ }
      try { musicSrc.disconnect(); } catch { /* */ }
    }
    const end = Math.min(MUSIC_LOOP_SEC, musicBuf.duration);
    const src = ctx.createBufferSource();
    src.buffer = musicBuf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = end > 0.01 ? end : musicBuf.duration;
    src.connect(musicGain);
    const off = ((offset % src.loopEnd) + src.loopEnd) % src.loopEnd;
    src.start(0, off);
    musicSrc = src;
    musicStarted = true;
    musicStartedAt = ctx.currentTime - off;
  }

  function startMusic() {
    if (musicStarted || !ctx || !musicBuf) return;
    startSource(0);
    applyMusicVol(0.4);
  }


  function unlock() {
    makeCtx();
    if (!ctx) return Promise.resolve();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const p = loadAll();
    p.then(() => { if (ctx && ctx.state !== 'suspended') startMusic(); }).catch(() => {});
    return p;
  }

  // Kick loading early (AudioContext stays suspended until the first tap).
  try { makeCtx(); loadAll(); } catch { /* ignore */ }

  function tone(freq, start, dur, { type = 'square', vol = 0.06, slideTo = null } = {}) {
    if (!ctx || isMuted || ctx.state !== 'running' || !sfxGain) return;
    const t0 = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(sfxGain);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  const seq = (notes, step, opts) => notes.forEach((f, i) => tone(f, i * step, step * 1.4, opts));

  const sounds = {
    tap: () => tone(660, 0, 0.06, { vol: 0.04 }),
    eat: () => { seq([392, 523, 392, 523], 0.09); },
    play: () => seq([523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.09 }),
    sleep: () => seq([523, 440, 349, 262], 0.16, { type: 'sine', vol: 0.1 }),
    wake: () => seq([262, 330, 392, 523], 0.1, { type: 'triangle', vol: 0.09 }),
    clean: () => { for (let i = 0; i < 5; i++) tone(500 + Math.random() * 700, i * 0.07, 0.06, { type: 'sine', vol: 0.07, slideTo: 1400 }); },
    no: () => seq([220, 165], 0.1, { vol: 0.06 }),
    look: () => tone(880, 0, 0.05, { type: 'sine', vol: 0.03, slideTo: 1200 }),
  };

  function stopVoice() {
    if (voiceSrc) {
      try { voiceSrc.stop(); } catch { /* already ended */ }
      try { voiceSrc.disconnect(); } catch { /* */ }
      voiceSrc = null;
    }
    if (ducked) { ducked = false; applyMusicVol(0.2); }
  }

  // Play a voice line. Returns the duration in seconds, or 0 if it did not start.
  function speak(id) {
    if (isMuted || !voiceOn || !ctx || ctx.state !== 'running') return 0;
    const buf = voiceBuf.get(id);
    if (!buf) return 0;
    stopVoice();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(voiceGain);
    src.onended = () => {
      if (voiceSrc === src) {
        voiceSrc = null;
        ducked = false;
        applyMusicVol(0.28);
      }
    };
    src.start(0);
    voiceSrc = src;
    ducked = true;
    applyMusicVol(0.08);
    return buf.duration;
  }

  return {
    unlock,
    play(name) { (sounds[name] || sounds.tap)(); },
    speak,
    stopVoice,
    setMuted(v) {
      isMuted = !!v;
      applyMute();
      if (isMuted) stopVoice();
      else applyMusicVol(0.2);
    },
    setVoice(v) {
      voiceOn = !!v;
      if (!voiceOn) stopVoice();
    },
    get muted() { return isMuted; },
    get voiceOn() { return voiceOn; },
    get ready() { return !!musicBuf; },
    voiceReady(id) { return voiceBuf.has(id); },
    // For automated checks: position inside the 96 s loop, and whether music/voice are running.
    skipTo(sec) { if (musicBuf && ctx) startSource(sec); },
    musicTime() {
      if (!ctx || !musicStarted) return 0;
      const end = musicSrc?.loopEnd || MUSIC_LOOP_SEC;
      return (ctx.currentTime - musicStartedAt) % end;
    },
    musicPlaying() { return musicStarted && !!ctx && ctx.state === 'running' && !isMuted && musicTarget() > 0; },
    voicePlaying() { return !!voiceSrc; },
    ducking() { return ducked; },
    ctxState() { return ctx ? ctx.state : 'none'; },
  };
}
