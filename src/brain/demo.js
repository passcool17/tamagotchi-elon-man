// brain/demo.js — offline "brain": scripted replies in Québec French. Pure, no network, no key.
// reply(text, ctx) -> { reply, mood, gesture }  (mood: OLED face while talking, gesture: servo move)

export const CHIPS = [
  'Salut !', 'Ça va ?', 'Raconte une blague', 'T\'as faim ?', 'Tourne la tête', 'Bonne nuit',
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9' ?!]/g, ' ');

const JOKES = [
  'Pourquoi les robots sont jamais stressés? On a des nerfs d\'acier!',
  'Mon ordi m\'a battu aux échecs. Moi, je l\'ai battu à la boxe. Pas de bras, pas de chocolat!',
  'Un servo rentre dans un bar. Il tourne de 90 degrés pis il ressort.',
  'C\'est quoi la différence entre moi pis une toast? Moi, je chauffe juste quand j\'pense trop.',
];

// rules are tried in order; the first match wins
const RULES = [
  { re: /\b(salut|allo|bonjour|bonsoir|yo|hey|coucou)\b/, gesture: 'happy', mood: 'happy',
    replies: ['Salut toi! Ça me fait plaisir de te voir!', 'Allo! Content que tu sois là!', 'Hé, salut! On fait quoi aujourd\'hui?'] },
  { re: /(ca va|comment tu vas|ca roule|la forme|tu vas bien)/, gesture: 'yes', mood: null, replies: null, fn: 'feel' },
  { re: /(blague|joke|drole|fais moi rire)/, gesture: 'happy', mood: 'happy', replies: JOKES },
  { re: /(faim|manger|bouffe|miam|poutine)/, gesture: 'curious', mood: 'hungry', fn: 'hunger' },
  { re: /(tourne|regarde|tete|gauche|droite)/, gesture: 'look', mood: 'thinking',
    replies: ['Check ben ça: tout le tour de la tête!', 'Mon servo de cou, y\'est en forme!'] },
  { re: /(dodo|bonne nuit|dormir|fatigue|couche)/, gesture: 'yes', mood: 'sleepy', fn: 'night' },
  { re: /(jouer|jeu|joue|game)/, gesture: 'play', mood: 'playing',
    replies: ['Oh oui! Appuie sur Jouer, pis on a du fun!', 'Jouer? C\'est malade! Let\'s go!'] },
  { re: /(t'es qui|tu es qui|ton nom|qui es tu|c'est quoi ton nom)/, gesture: 'yes', mood: 'happy',
    replies: ['Moi c\'est Elon Man, le petit robot de bureau de Pascal!', 'Elon Man, pour te servir! Trois écrans, trois servos, pis un gros cœur.'] },
  { re: /(je t'aime|t'es beau|t'es cool|bravo|bon robot|t'es fin)/, gesture: 'happy', mood: 'happy',
    replies: ['Awww, tu me fais rougir les pixels!', 'Merci! T\'es pas pire toi non plus!'] },
  { re: /(sale|laver|douche|propre|bain)/, gesture: 'clean', mood: 'cleaning', fn: 'clean' },
  { re: /\b(non|pas)\b/, gesture: 'no', mood: 'bored', replies: ['Ah non? Bon, correct d\'abord.', 'Pas de trouble, on fera autre chose.'] },
  { re: /\b(oui|ouais|ok|d'accord|certain)\b/, gesture: 'yes', mood: 'happy', replies: ['Parfait!', 'Yes! On s\'entend bien, toi pis moi.'] },
  { re: /\?$/, gesture: 'curious', mood: 'thinking',
    replies: ['Bonne question! Mon cerveau démo sait pas tout, mais branche-moi sur le PC pis on en jase.', 'Hmm… laisse-moi y penser. En mode démo, j\'ai pas toutes les réponses!'] },
];

const FALLBACK = [
  'Hein? J\'ai pas tout compris, mais j\'t\'écoute!',
  'Ah oui? Raconte-moi-z\'en plus!',
  'Intéressant! En mode démo j\'ai juste quelques phrases, mais j\'fais de mon mieux.',
];

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

function feel(pet, rng) {
  if (!pet) return { reply: 'Ça va ben, merci!', mood: 'happy' };
  if (pet.sleeping) return { reply: 'Zzz… chu en train de dormir, là…', mood: 'sleeping' };
  const low = ['food', 'fun', 'energy', 'sleep', 'clean'].filter((k) => (pet[k] ?? 100) < 35);
  if (low.includes('food')) return { reply: 'Bof… j\'ai faim en titi! Tu me donnerais à manger?', mood: 'hungry' };
  if (low.includes('sleep') || low.includes('energy')) return { reply: 'Chu fatigué raide… un p\'tit dodo me ferait du bien.', mood: 'sleepy' };
  if (low.includes('clean')) return { reply: 'Chu tout sale… une p\'tite douche, peut-être?', mood: 'dirty' };
  if (low.includes('fun')) return { reply: 'Je m\'ennuie un peu… on joue?', mood: 'bored' };
  return { reply: pick(['Ça va super bien! Merci de prendre soin de moi.', 'Pas pire pantoute! Pis toi?', 'En pleine forme, mes servos sont huilés!'], rng), mood: 'happy' };
}

export function reply(text, ctx = {}) {
  const rng = ctx.rng || Math.random;
  const pet = ctx.pet || null;
  const t = norm(text).trim();
  if (!t) return { reply: 'Dis-moi quelque chose!', mood: 'thinking', gesture: 'curious' };
  if (pet?.sleeping && !/(reveille|debout|allo|salut)/.test(t)) {
    return { reply: 'Zzz… mmmh… laisse-moi dormir encore un peu…', mood: 'sleeping', gesture: null };
  }
  for (const r of RULES) {
    if (!r.re.test(t)) continue;
    if (r.fn === 'feel') { const f = feel(pet, rng); return { ...f, gesture: f.mood === 'happy' ? 'yes' : 'curious' }; }
    if (r.fn === 'hunger') {
      const hungry = (pet?.food ?? 50) < 50;
      return { reply: hungry ? 'Oui! J\'ai un p\'tit creux… appuie sur Nourrir!' : 'Non merci, j\'ai le ventre plein!', mood: hungry ? 'hungry' : 'happy', gesture: hungry ? 'yes' : 'no' };
    }
    if (r.fn === 'night') return { reply: 'Bonne nuit! Appuie sur Dormir pis je ferme mes écrans.', mood: 'sleepy', gesture: 'yes' };
    if (r.fn === 'clean') {
      const dirty = (pet?.clean ?? 100) < 50;
      return { reply: dirty ? 'Ouais, chu pas mal sale… appuie sur Nettoyer!' : 'Chu propre propre, regarde-moi briller!', mood: dirty ? 'dirty' : 'happy', gesture: dirty ? 'yes' : 'happy' };
    }
    return { reply: pick(r.replies, rng), mood: r.mood, gesture: r.gesture };
  }
  return { reply: pick(FALLBACK, rng), mood: 'thinking', gesture: 'curious' };
}
