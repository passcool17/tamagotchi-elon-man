// audio.js — small WebAudio blips. Nothing is created until the first user gesture (mobile autoplay rules).
export function createAudio({ muted = false } = {}) {
  let ctx = null;
  let isMuted = muted;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch { return; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, start, dur, { type = 'square', vol = 0.06, slideTo = null } = {}) {
    if (!ctx || isMuted || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
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

  return {
    unlock,
    play(name) { (sounds[name] || sounds.tap)(); },
    setMuted(v) { isMuted = !!v; },
    get muted() { return isMuted; },
  };
}
