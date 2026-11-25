# GAME.md — Tamagotchi Elon Man

## Concept
Un animal virtuel façon Tamagotchi, mais c'est Elon Man, le petit robot de bureau (rouge, conique, base noire, écran rond comme visage).
Tout se joue sur un seul écran portrait : le robot au centre, cinq jauges en haut, quatre gros boutons en bas.
Le visage est le cœur du jeu : une petite image de pixels sur l'écran rond, qui montre ce que ressent le robot.
Pas de fin de partie : le robot ne meurt pas, il est juste triste si on le néglige.

## Choix du moteur
**Phaser 3.90.0** (dernière version stable de la branche 3 ; la doc Context7 a été consultée avant de coder : config `scale` FIT,
`textures.createCanvas`, `pixelArt`). Phaser 4 existe (4.2.1) mais le skill du projet vise Phaser 3 et ce jeu n'a pas besoin de ses nouveautés.
Phaser sert pour : mise à l'échelle FIT sur téléphone, entrées tactiles, tweens (tour de tête, rebonds, particules), rendu WebGL/Canvas.
Fichier local `vendor/phaser.min.js` : pas de CDN au moment du jeu.

## Contrôles
| Action | Tactile | Clavier |
|---|---|---|
| Nourrir | bouton 1 | `1` |
| Jouer | bouton 2 | `2` |
| Dormir / Réveiller | bouton 3 | `3` |
| Nettoyer | bouton 4 | `4` |
| Regarder le doigt | toucher la tête ou le corps | — |
| Son oui/non | icône haut-droite | — |

Les boutons font 156x214 unités sur 720x1600, soit environ 90x122 px CSS sur un téléphone 412 px de large (cible tactile > 64 px).
Un bouton s'allume en or quand le besoin lié est sous 30.

## État du jeu (`src/logic.js`)
Cinq jauges de 0 à 100 :
| Jauge | Baisse par minute (éveillé) | Remontée |
|---|---|---|
| Nourriture | 0,90 | Nourrir +30 |
| Plaisir | 0,75 | Jouer +28 |
| Énergie | 0,35 | Dormir (+1,2/min), Nourrir +5 ; Jouer −12 |
| Sommeil | 0,50 | Dormir (+2,2/min) ; Jouer −4 |
| Propreté | 0,45 | Nettoyer +45 ; Jouer −6, Nourrir −4 |

- **Dormir** : le robot dort jusqu'à ce que « Sommeil » soit plein (ou jusqu'à ce qu'on le réveille). Pendant ce temps les autres actions sont refusées (« Chut… il dort. »), et ses autres jauges baissent très lentement.
- **Refus** : Nourrir à 95+ (« Il n'a plus faim. »), Jouer sous 10 d'énergie, Nettoyer à 95+.
- **Humeur** (`moodOf`) : endormi > triste (2 jauges sous 20 ou moyenne sous 35) > besoin le plus bas sous 30 (faim, sommeil/énergie → sommeil, plaisir → ennui, propreté → sale) > content (toutes ≥ 55 et moyenne ≥ 70) > neutre.
- **Hors ligne** : à l'ouverture, le temps depuis la dernière sauvegarde est rattrapé. Absence de plus de 5 min : plafonnée à 8 h, déclin à 40 % de la vitesse réelle, et aucune jauge ne descend sous 12 pendant l'absence. Le sommeil en cours continue (le robot se réveille seul quand il est reposé).
- **Sauvegarde** : `localStorage` clé `tem.save.v1` (état + horodatage, version) et `tem.prefs.v1` (son). Sauvegarde après chaque action, toutes les 5 s, et quand la page se cache. Données corrompues ou version inconnue : nouveau robot. Horloge qui recule : ignorée.
- Le compteur « Jour N · X soins » se base sur la date de naissance et le nombre d'actions réussies.

## Le visage (`src/face.js`)
Framebuffer indexé 240x240 sur une grille de 60x60 « gros pixels ». Humeurs : content, neutre, faim, sommeil, triste, ennuyé, sale, endormi,
plus trois animations d'action (manger, jouer, se laver). Clignement automatique, gouttes, bulles, étoiles, « z » animés selon le temps.
Interface vers l'écran rond réel documentée dans [README.md](README.md).

## Le robot (`src/ui/robot.js`)
Dessiné par code (Phaser Graphics → textures) : tête ellipsoïde rouge, lunette grise ronde, fente caméra avec un petit voyant,
cou sombre, corps conique plus large aux épaules, deux chevrons or, base noire. La tête est plus grosse que dans le CAD pour que le visage
reste lisible sur téléphone. **Tour de tête** : une valeur `turn` (−1 à 1) déplace la tête, la lunette, le visage (écrasé en largeur) et la fente
caméra à des vitesses différentes, ce qui donne un effet de rotation. Il regarde de lui-même à gauche ou à droite de temps en temps.

## Look
Fond sombre bleu-nuit pour faire ressortir le rouge, accent or (comme les chevrons), barres cyan qui passent à l'or puis au rouge qui pulse quand le besoin est critique.
Titre en Press Start 2P, textes en Rubik. Icônes pixel (hamburger, étoile, lune, goutte).
Mise en page 720x1600 (ratio 9:20 comme le S20 FE), marges haut et bas pour les barres système, `env(safe-area-inset-*)` appliqué autour du canvas.

## Ressources
| Ressource | Source | Licence |
|---|---|---|
| Forme et couleurs du robot, couleurs du visage | [passcool17/elon-man](https://github.com/passcool17/elon-man) (`elonman.scad`, `face.h`) | MIT |
| Phaser 3.90.0 | https://phaser.io, npm `phaser` | MIT |
| Press Start 2P | Google Fonts, CodeMan38 | SIL OFL 1.1 |
| Rubik | Google Fonts | SIL OFL 1.1 |
| Sons | générés par code (WebAudio), aucun fichier | — |
| Icônes, visages, robot | faits par code pour ce jeu | MIT |

## Tests
`npm test` : 34 tests Node (logique : déclin, actions, limites 0–100, humeur, sauvegarde/chargement, rattrapage hors ligne ; visage : taille, hors-cercle, déterminisme, animation, RGB565 ; stockage).

## Limites connues
- Pas de vrai test sur un S20 FE physique : vérifié en Chrome sans écran (émulation 412x915).
- Pas de notification quand le robot a faim (une web app ne peut pas le faire fiablement sans serveur).
- Un seul robot, pas de nom ni de choix de couleur.
- Le sommeil ne se réveille pas tout seul quand la page est fermée avant la fin : il est rattrapé à la réouverture.

## Prochaines idées
- Brancher le vrai Elon Man : un petit pont USB/WebSerial qui envoie `toRGB565(fb)` à l'ESP32-S3, et `gaze` aux servos.
- Mini-jeux pour « Jouer » (mémoire de LED, attraper des boulons).
- Humeur selon l'heure (dort la nuit), météo sur l'écran.
- Accessoires pour le robot (chapeau, lunettes), à débloquer avec les soins.
- Notifications locales (PWA installée), mode « bureau » plein écran pour une vieille tablette.
- Message du robot via Grok Bot (l'écran affiche ce que le cerveau veut dire).
