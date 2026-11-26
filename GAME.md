# GAME.md — Tamagotchi Elon Man 2.0

## Concept
Un animal virtuel façon Tamagotchi, mais c'est Elon Man, le petit robot de bureau.
**La v2.0 part du code de la v1 (commit 9a3b8cc)** : même logique de soins, sauvegarde, musique, voix et même scène Phaser.
Ce qui change : le robot est maintenant une réplique 2D du **vrai** robot imprimé (`hardware/print-v1`), avec ses **3 écrans OLED**
et une **tête qui bouge comme les vrais servos**, et on peut lui **parler** (cerveau démo, ou passerelle vers le PC de Pascal).
La v1 est figée à part : https://passcool17.github.io/tamagotchi-elon-man-v1/.

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
| Parler (panneau, bulles, champ texte, réglages du cerveau) | bouton 5 | `5` |
| Regarder le doigt (pan vers le côté touché) | toucher la tête ou le corps | — |
| Son oui/non (musique, bips, voix) | icône haut-droite (haut-parleur) | — |
| Voix oui/non | icône à gauche du haut-parleur (bulle) | — |

Boutons de 130x196 unités sur 720x1600, soit environ 74x112 px CSS sur un téléphone 412 px de large. Tout ce qui se touche fait ≥ 48 px CSS
(boutons du panneau Parler : 48 px de haut minimum). Un bouton de soin s'allume en or quand le besoin lié est sous 30.

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
- **Sauvegarde** : `localStorage` clé `tem.save.v2` (état + horodatage, version) et `tem.prefs.v2` (son, voix, cerveau). Au premier lancement de la 2.0, `tem.save.v1` / `tem.prefs.v1` sont repris (et laissés en place). Le prototype v1 figé utilise ses propres clés `temv1p.*` : les deux ne se marchent pas dessus. Sauvegarde après chaque action, toutes les 5 s, et quand la page se cache. Données corrompues ou version inconnue : nouveau robot. Horloge qui recule : ignorée.
- Le compteur « Jour N · X soins » se base sur la date de naissance et le nombre d'actions réussies.

## Les 3 écrans OLED (`src/oled.js`)
Le vrai robot a 3 ELEGOO 0,96" SSD1306 (128x64, monochrome) : 2 yeux et une bouche (`firmware/elonman_body/config.h`, `FACE_OLED3`).
Sur les rendus `apercu-face.png`, les fenêtres des yeux sont hautes : les écrans des yeux sont montés sur le côté, donc dessinés en 64x128.
- Chaque écran est un framebuffer 1 bit. Les formes reprennent celles du firmware (yeux ronds avec pupille, yeux en « ^ » contents,
  trait fermé pour dormir, bouche « TALK » qui s'ouvre, 3 points qui pulsent pour réfléchir, « Z » pour dormir).
- Dans le jeu, chaque pixel OLED devient un bloc de 3x3 texels dont la dernière ligne / colonne est plus sombre : on voit la matrice de pixels,
  en blanc bleuté sur noir, comme un vrai SSD1306.
- Les yeux suivent la tête (le regard part un peu avant le pan) et clignent.
- `talking` : la bouche fait des barres qui bougent, quand une réponse du cerveau s'affiche **ou** qu'une des 14 voix joue.
- `toSSD1306()` sort le tampon exact d'Adafruit_SSD1306 (1024 octets) : prêt pour l'ESP32.

## Le robot (`src/ui/robot.js`) et la tête (`src/servo.js`)
**Rendu : Phaser Graphics (vecteurs), redessiné à chaque image.** Pas de SVG : un SVG serait une image figée (il faudrait le découper en
calques DOM ou le re-rasteriser à chaque angle) alors que la tête, la plaque, les cadres OLED et les tiges changent de forme à chaque image
(écrasement en cos(pan), décalage de la plaque, rotation du roulis, longueur et angle des tiges). Avec Graphics, tout est dans le même
canvas que le reste du jeu, net à toute échelle, sans fichier à charger. Corps et socle (immobiles) sont générés une fois en textures.

Pièces (d'après `print-v1/previews` et le README print-v1) : socle noir avec les fentes de côté, corps rouge conique et 2 chevrons orange,
moyeu + **plateau pan** noir (MG996R, ses trous défilent quand il tourne), **colonne et cardan**, **2 SG90 bleus** sur le plateau,
**palonniers blancs** et **tiges de poussée** jusqu'aux rotules de la **plaque en X** sous la tête, tête rouge en dôme, plaque grise en D,
3 cadres OLED noirs.

Mouvements (limites de `check_v1.py` : pan ±90°, hochement ±12°, roulis ±10°) :
- **Pan** : toute la tête et le joug (servos, tiges) tournent. Faux 3D : la plaque se décale vers le côté et s'écrase en cos(angle) ;
  à ±90° on voit le bord du visage. Le plateau pan montre ses trous qui défilent.
- **Hochement** : les 2 tiges montent ou descendent ensemble, la plaque monte/descend.
- **Roulis** : une tige monte, l'autre descend, la tête pivote autour du cardan.
- Mixage du firmware (`elonman_body.ino`) : `gauche = nod + tilt`, `droite = nod − tilt`, affiché en direct à droite (`SERVOS`).
- Palonniers dessinés avec un angle x2 pour que le mouvement se lise sur un téléphone (et que la tige garde à peu près sa longueur).
- Mouvement servo : profil trapèze (accélération, vitesse max 260°/s pan, 90°/s tiges, freinage pour s'arrêter pile, jamais de dépassement).

Réactions : Nourrir = la tête mâche (hochements), Jouer = pan ±70 + roulis, Nettoyer = roulis gauche-droite, Dormir = tête baissée à −12°,
Réveil = s'étire vers le haut puis regarde autour, refus = petit « non », toucher = pan vers le doigt, parler = geste + petits hochements,
regards au hasard (jusqu'à ±90° s'il s'ennuie). Au repos, la pose dépend de l'humeur (tête basse si triste ou fatigué).
Proportions « chibi » : la tête et les écrans sont plus gros que dans le CAD pour que les pixels se voient sur un téléphone.

## Cerveau (`src/brain/`)
- **Démo** (par défaut) : `demo.js`, règles par mots-clés en français québécois (salut, ça va, blague, faim, tourne la tête, dodo, jouer, qui es-tu,
  compliments, propreté, oui / non, questions). « Ça va ? » répond selon les jauges. Chaque réponse donne une humeur d'écran et un geste.
- **Passerelle PC** : `gateway.js` envoie `POST {url}/chat`, délai 5 s (AbortController), valide la réponse (texte ≤ 280, humeur / geste connus,
  angles bornés). Toute erreur (délai, réseau, CORS, HTTP ≠ 2xx, JSON invalide, URL non HTTPS) → réponse démo, marquée « PC injoignable → démo ».
- Aucune clé, aucun cookie envoyé. Contrat et réglages du PC : README, section « Passerelle PC ».

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
Palette reprise de *La mallette de l'Entité* : fond presque noir, accent cyan (`#62d6ff`), panneaux gris très sombres, coins peu arrondis,
Chakra Petch pour les titres du panneau, JetBrains Mono pour la télémétrie servos et le badge de mode. Or PC17 gardé pour le titre.
Halo cyan doux derrière la tête, grille de points au mur. Le panneau « Parler » glisse du bas (ressort Motion), les bulles arrivent en cascade.
Mise en page 720x1600 (ratio 9:20 comme le S20 FE).

## Ressources
| Ressource | Source | Licence |
|---|---|---|
| Forme, couleurs, mécanisme du cou, OLED, servos | [passcool17/elon-man](https://github.com/passcool17/elon-man) (`hardware/print-v1`, `firmware/elonman_body`) | MIT |
| Phaser 3.90.0 | https://phaser.io, npm `phaser` | MIT |
| Motion 14.14.0 (`vendor/motion.js`, animations du panneau) | https://motion.dev, npm `motion` (doc vérifiée via Context7) | MIT |
| Press Start 2P, Rubik | Google Fonts | SIL OFL 1.1 |
| Chakra Petch 700, JetBrains Mono 500 | copiées de La mallette de l'Entité (fichiers de polices seulement) | SIL OFL 1.1 |
| Sons (bips) | générés par code (WebAudio) | — |
| Musique de fond | Suno, *Tamagotchi Elon Man - Robot Pet Loop* (id `7ce97a9d-6d4d-451d-b284-38d234fe515e`), générée pour Pascal le 25 nov. 2026 | Générée pour Pascal |
| Voix (14 répliques) | ElevenLabs, Philippine Dynamique Acting Voice (`Yx2a8qp2EqI9c5i8MzBo`), `eleven_v4` | Générées pour Pascal |
| Robot dessiné, visages OLED, icônes | faits par code pour ce jeu | MIT |

## Tests
`npm test` : 68 tests Node : logique, stockage + migration v1 → v2, voix (14 répliques, délais, priorité), OLED (géométrie 128x64, toutes les humeurs,
clignement, export SSD1306 avec rotation), servos (bornes, vitesse, sans dépassement, mixage des tiges, tous les gestes), cerveau démo,
passerelle (fetch simulé : succès, délai, erreur réseau, HTTP 500, JSON invalide, URL refusée), service worker (ne supprime jamais les caches de la v1).

## Limites connues
- Pas de vrai test sur un S20 FE physique : vérifié en Chrome sans écran (émulation 412x915).
- Le pan est un faux 3D (plaque écrasée et décalée), pas une vraie rotation 3D.
- Les palonniers sont dessinés avec un angle doublé pour la lisibilité.
- Le cerveau démo ne connaît que quelques sujets. Les réponses ne sont pas dites à voix haute (seules les 14 voix enregistrées existent).
- La passerelle PC n'existe pas encore côté PC : il faut le petit pont `/chat` + CORS + tunnel HTTPS (README).
- Pas de notification quand le robot a faim. Un seul robot.

## Prochaines idées
- Écrire le pont `/chat` sur le PC (Python, à côté du démon `elonman`), et refléter les gestes sur le vrai robot via `/cmd look` et `/cmd face`.
- Envoyer `toSSD1306()` aux 3 écrans par WebSerial pour piloter le vrai visage depuis le téléphone.
- Mini-jeux pour « Jouer ». Humeur selon l'heure.

