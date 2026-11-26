// main.js — boots Phaser after fonts are ready. Phaser 3.90 is vendored in /vendor (no CDN at runtime).
import { GameScene } from './scenes/GameScene.js';
import { safeStorage } from './storage.js';

const W = 720, H = 1600;

async function fontsReady() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('30px "Press Start 2P"'),
        document.fonts.load('600 28px Rubik'),
        document.fonts.load('500 24px Rubik'),
        document.fonts.load('500 20px "JetBrains Mono"'),
        document.fonts.load('700 20px "Chakra Petch"'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fall back to system fonts */ }
}

await fontsReady();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#07090c',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 2 },
  render: { antialias: true, powerPreference: 'low-power' },
  fps: { target: 60 },
  scene: [GameScene],
  callbacks: { preBoot: (g) => g.registry.set('storage', safeStorage()) },
});
window.__game = game;
document.getElementById('boot')?.remove();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
