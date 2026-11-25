// icons.js — 12x12 pixel icons, drawn from text bitmaps into Phaser textures (nearest-neighbour).
const PAL = {
  t: 0xe8a23a, s: 0xfff0c0, l: 0x58d36b, m: 0x7a3a1a, c: 0xffd23a, b: 0xd98a2b, // burger
  y: 0xffd23a, Y: 0xfff3a6, // star / moon
  w: 0x35d0ff, W: 0xd8f6ff, // drop
  g: 0xe9ebf2, x: 0xff4d4d, // speaker, cross
};

const BITMAPS = {
  food: [
    '...tttttt...',
    '.tttttttttt.',
    '.ttsttsttst.',
    '..tttttttt..',
    'llllllllllll',
    '.mmmmmmmmmm.',
    'cccccccccccc',
    '.mmmmmmmmmm.',
    'bbbbbbbbbbbb',
    '.bbbbbbbbbb.',
    '..bbbbbbbb..',
    '............',
  ],
  play: [
    '.....yy.....',
    '.....yy.....',
    '....yyyy....',
    'yyyyyyyyyyyy',
    '.yyyyYyyyyy.',
    '..yyyyyyyy..',
    '...yyyyyy...',
    '..yyyyyyyy..',
    '..yyy..yyy..',
    '.yyy....yyy.',
    '.yy......yy.',
    '............',
  ],
  sleep: [
    '....yyyyy...',
    '..yyyyyy....',
    '.yyyyYy.....',
    '.yyyyy......',
    'yyyyyy......',
    'yyyyyy......',
    'yyyyyy......',
    '.yyyyy......',
    '.yyyyyy..yy.',
    '..yyyyyyyyy.',
    '....yyyyyy..',
    '............',
  ],
  clean: [
    '.....ww.....',
    '.....ww.....',
    '....wwww....',
    '....wwww....',
    '...wwwwww...',
    '..wwWwwwww..',
    '.wwWwwwwwww.',
    '.wWwwwwwwww.',
    '.wwwwwwwwww.',
    '..wwwwwwww..',
    '...wwwwww...',
    '............',
  ],
  sound: [
    '............',
    '.....g......',
    '....gg..g...',
    'gggggg...g..',
    'gggggg.g.g..',
    'gggggg.g.g..',
    'gggggg.g.g..',
    'gggggg...g..',
    '....gg..g...',
    '.....g......',
    '............',
    '............',
  ],
  muted: [
    '............',
    '.....g......',
    '....gg.x..x.',
    'gggggg..xx..',
    'gggggg..xx..',
    'gggggg.x..x.',
    'gggggg......',
    'gggggg......',
    '....gg......',
    '.....g......',
    '............',
    '............',
  ],
};

export const ICON_PX = 6;

export function buildIcons(scene) {
  for (const [name, rows] of Object.entries(BITMAPS)) {
    const key = `icon-${name}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === '.') return;
      g.fillStyle(PAL[ch], 1);
      g.fillRect(i * ICON_PX, j * ICON_PX, ICON_PX, ICON_PX);
    }));
    g.generateTexture(key, 12 * ICON_PX, 12 * ICON_PX);
    g.destroy();
    scene.textures.get(key).setFilter(1); // Phaser.Textures.FilterMode.NEAREST
  }
}
