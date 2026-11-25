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
| Son oui/non (musique, bips, voix) | icône haut-droite (haut-parleur) | — |
| Voix oui/non | icône à gauche du haut-parleur (bulle) | — |

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


## Musique
Boucle instrumentale de 96,000 s (40 mesures à 100 BPM), découpée du fichier Suno `tamagotchi-loop-v1.mp3` (98,04 s).
Le morceau original fond à partir de ~96,4 s : on coupe à la barre 40, juste avant le fondu, et on applique un fondu croisé à puissance égale de 50 ms
au début du fichier (les 50 ms juste après le point de boucle se mélangent aux 50 ms du début). Au raccord, l'écart d'échantillon est de 0,001.
Fichiers : `assets/music/theme.ogg` (Vorbis, ~131 kb/s, 96,000 s exactes) et `theme.mp3` (128 kb/s, repli).
Lecture par WebAudio (`AudioBufferSourceNode.loop`, `loopStart = 0`, `loopEnd = 96`) : pas de trou dû au padding d'un encodeur MP3.
La musique démarre au premier toucher, volume 0,32. Le bouton muet coupe aussi les bips et la voix (préférences dans `tem.prefs.v1`).

## Voix (`src/voice.js`)
14 répliques (texte officiel de SCRIPT.md). Une seule à la fois. Délai global de 7 s, plus un délai par réplique
(alertes de jauge basse : 60 s ou plus). La voix baisse la musique à 35 % de son volume, puis la remonte en fondu.
Un bouton « bulle » coupe seulement la voix, aussi mémorisé. Pendant la réplique, le texte s'affiche dans une bulle dorée sous les jauges.

| id | Déclencheur |
|---|---|
| `salut` | Premier toucher de la session (« Salut Pascal ! ») |
| `content_mange` | Soin Nourrir réussi |
| `jouer` | Soin Jouer réussi |
| `propre` | Soin Nettoyer réussi |
| `bonne_nuit` | On l'envoie dormir |
| `reveil` | On le réveille |
| `merci` | Toucher la tête dans les 20 s après un soin Nourrir/Jouer/Nettoyer réussi (délai global passé) |
| `faim` | Nourriture sous 30 |
| `fatigue` | Énergie ou sommeil sous 30 |
| `ennui` | Plaisir sous 30 |
| `sale` | Propreté sous 30 |
| `triste` | Humeur triste (moyenne sous 35, sans jauge critique) |
| `batterie_faible` | Énergie sous 20, ou au moins deux jauges sous 20 |
| `content` | Humeur content, délai 90 s |

Les répliques d'action passent avant les alertes de jauge. Pas de voix pendant qu'il dort (sauf « Bonne nuit » et « Bon matin »).
La logique est testée sans le navigateur ; le jeu parle via WebAudio.

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
| Sons (bips) | générés par code (WebAudio), aucun fichier | — |
| Musique de fond | Suno, *Tamagotchi Elon Man - Robot Pet Loop* (`tamagotchi-loop-v1.mp3`, id `7ce97a9d-6d4d-451d-b284-38d234fe515e`), générée pour Pascal le 25 nov. 2026. Boucle de 96 s préparée pour ce jeu. | Générée pour Pascal |
| Voix (14 répliques) | ElevenLabs, voix Philippine Dynamique Acting Voice (`Yx2a8qp2EqI9c5i8MzBo`), modèle `eleven_v4`, recette B figée par Pascal le 25 nov. 2026. Textes : SCRIPT.md / MANIFEST.md du dépôt audio. Fichiers `assets/voix/<id>.mp3` (mono, 44,1 kHz, 96 kb/s). | Générées pour Pascal |
| Icônes, visages, robot | faits par code pour ce jeu | MIT |

## Tests
`npm test` : 48 tests Node (logique, visage, stockage, voix : correspondance des 14 répliques, délais global et par ligne, priorité, merci, muet / voix coupée).

## Limites connues
- Pas de vrai test sur un S20 FE physique : vérifié en Chrome sans écran (émulation 412x915).
- Pas de notification quand le robot a faim (une web app ne peut pas le faire fiablement sans serveur).
- Un seul robot, pas de nom ni de choix de couleur.
- Le sommeil ne se réveille pas tout seul quand la page est fermée avant la fin : il est rattrapé à la réouverture.
- La boucle musicale coupe le fondu final du fichier Suno (après 96,4 s) : on n'entend pas les ~2 s de conclusion.
- Vérification vocale de la musique : analyse spectrale seulement (pas d'écoute humaine ici). Pas de sifflantes typiques d'une voix, presque pas d'énergie au-dessus de 4 kHz, partiels en escalier d'instrument. Je ne peux pas garantir à 100 % l'absence de chœur très bas dans le mix.
- Les files voix sont déjà en 96 kb/s mono : copiées telles quelles, sans recompression.

## Prochaines idées
- Brancher le vrai Elon Man : un petit pont USB/WebSerial qui envoie `toRGB565(fb)` à l'ESP32-S3, et `gaze` aux servos.
- Mini-jeux pour « Jouer » (mémoire de LED, attraper des boulons).
- Humeur selon l'heure (dort la nuit), météo sur l'écran.
- Accessoires pour le robot (chapeau, lunettes), à débloquer avec les soins.
- Notifications locales (PWA installée), mode « bureau » plein écran pour une vieille tablette.
- Message du robot via Grok Bot (l'écran affiche ce que le cerveau veut dire).
