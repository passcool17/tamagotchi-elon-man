# Tamagotchi Elon Man

Un petit jeu web où tu prends soin d'**Elon Man**, le robot de bureau du projet
[elon-man](https://github.com/passcool17/elon-man) (MIT). Version web seulement, **aucun matériel requis**.
Pensé d'abord pour téléphone (portrait, Samsung S20 FE), interface en français québécois.

**Jouer :** https://passcool17.github.io/tamagotchi-elon-man/

## Le jeu en bref

- Le robot rouge a un écran rond comme visage. Son visage change selon son état : content, faim, sommeil, triste, ennuyé, sale, endormi.
- Cinq jauges : **Nourriture, Plaisir, Énergie, Sommeil, Propreté**. Elles baissent avec le temps.
- Quatre actions : **Nourrir, Jouer, Dormir, Nettoyer**. Toucher la tête le fait se tourner vers toi.
- Sauvegarde automatique dans le navigateur (`localStorage`). Quand tu reviens après une absence, le temps écoulé est rattrapé
  (plafonné à 8 h, et plus doux que le temps réel : il ne meurt jamais).
- Le son (musique + bips + voix) démarre au premier toucher. Bouton muet en haut à droite ; bouton bulle pour couper seulement la voix.
- Musique de fond en boucle (96 s, Suno). 14 répliques parlées, une à la fois, la musique baisse pendant qu'il parle.
- Clavier sur ordinateur : touches 1 à 4.

Détails : voir [GAME.md](GAME.md).

## Lancer en local

```bash
npm test          # tests Node (logique, visage, sauvegarde), aucune dépendance
npm run serve     # puis ouvrir http://localhost:8080
```

Pas de build : ce sont des modules ES et Phaser 3.90 est fourni dans `vendor/`.

## Structure du code

```
index.html            page, polices locales, safe-area
src/logic.js          ÉTAT PUR : stats, déclin, actions, humeur, sauvegarde, rattrapage hors ligne (aucun DOM)
src/face.js           VISAGE PUR : humeur + temps -> framebuffer de pixels 240x240 (aucun DOM)
src/storage.js        localStorage (injectable, tolère un stockage bloqué)
src/audio.js          bips WebAudio, musique en boucle, lecture des voix
src/voice.js          LOGIQUE PURE : quelle réplique dire, délais, priorité (aucun DOM)
assets/music/         theme.ogg + theme.mp3 (boucle 96 s)
assets/voix/          14 répliques mp3
src/ui/robot.js       dessin du robot par le code + animation du tour de tête
src/ui/icons.js       icônes pixel 12x12
src/scenes/GameScene.js   colle tout dans Phaser (jauges, boutons, boucle)
tests/                node --test
```

`logic.js` et `face.js` ne dépendent ni de Phaser ni du navigateur. C'est voulu : une version future peut les
réutiliser telles quelles pour piloter le vrai robot.

## Interface visage -> vrai écran rond (ESP32-S3)

Le vrai Elon Man a un écran rond GC9A01, 240x240, RGB565 (voir `firmware/elonman_body/face.h` dans le dépôt elon-man).
`src/face.js` produit exactement ce format.

```js
import { createFramebuffer, renderFace, toRGB565 } from './src/face.js';
import { createState, catchUp, act, moodOf } from './src/logic.js';

const fb = createFramebuffer();                       // { width: 240, height: 240, pixels: Uint8Array(57600) }
let pet = createState(Date.now());

// à chaque image (~20 fps suffit) :
pet = catchUp(pet, Date.now());
renderFace({ mood: moodOf(pet), t: performance.now(), gaze: 0 }, fb);
const bytes = toRGB565(fb);                           // Uint8Array(115200), RGB565 big-endian, ligne par ligne
// -> envoyer `bytes` à l'écran (SPI) ou à la carte par USB.
```

| Élément | Valeur |
|---|---|
| Taille | 240 x 240, origine en haut à gauche, ligne par ligne |
| Format indexé | 1 octet par pixel = index dans `PALETTE_565` (9 couleurs) |
| Format écran | `toRGB565(fb)` : 2 octets par pixel, big-endian |
| Pixels hors du cercle | toujours l'index 0 (noir), invisibles sur l'écran rond |
| Grille | le visage est dessiné sur une grille 60x60, chaque cellule = 4x4 pixels (look pixel art) |
| Paramètres | `mood` (voir `FACE_MOODS`), `t` en ms (animations : clignement, mastication, bulles…), `gaze` de -1 à 1 (regard, suit le tour de tête) |
| Humeurs | `idle, happy, hungry, sleepy, sad, bored, dirty, sleeping` (états) + `eating, playing, cleaning` (actions) |
| Couleurs | celles du firmware : noir `0x0000`, blanc `0xFFFF`, cyan `0x07FF`, or `0xFE60`, rouge `0xF800`, gris foncé `0x4208` |

`moodOf(state)` donne l'humeur de fond ; le jeu y superpose `eating`, `playing` ou `cleaning` quelques secondes après une action.
Pour le tour de tête sur le vrai robot, `gaze` déplace les yeux et le jeu web anime la tête séparément : le pilote matériel
peut traduire la même valeur en angle de servo.

## Crédits et licences

- Jeu : MIT, © PC17.
- Forme du robot (corps conique rouge, base noire, deux chevrons or, tête rouge, écran rond avec lunette grise, fente caméra) :
  d'après [passcool17/elon-man](https://github.com/passcool17/elon-man), `hardware/cad/elonman.scad`, licence MIT.
  Les couleurs du visage viennent de `firmware/elonman_body/face.h` du même dépôt.
- Musique : Suno, *Tamagotchi Elon Man - Robot Pet Loop*, générée pour Pascal (25 nov. 2026).
- Voix : ElevenLabs, Philippine Dynamique Acting Voice, modèle `eleven_v4`, générées pour Pascal (lot du 25 nov. 2026, recette B). Textes dans SCRIPT.md du dossier audio.
- [Phaser](https://phaser.io) 3.90.0, MIT, fourni dans `vendor/`.

- Polices : Press Start 2P (SIL OFL 1.1, CodeMan38) et Rubik (SIL OFL 1.1), téléchargées depuis Google Fonts et servies localement.
- Tout le reste (dessin du robot, visages, icônes, sons) est fait par code pour ce projet.
