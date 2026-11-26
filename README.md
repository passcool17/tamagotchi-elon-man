# Tamagotchi Elon Man 2.0.1

Un petit jeu web où tu prends soin d'**Elon Man**, le robot de bureau du projet
[elon-man](https://github.com/passcool17/elon-man) (MIT). Version web seulement, **aucun matériel requis**.
Pensé d'abord pour téléphone (portrait, Samsung S20 FE), interface en français québécois.

**Jouer (v2.0.1) :** https://passcool17.github.io/tamagotchi-elon-man/
**Prototype v1 figé :** https://passcool17.github.io/tamagotchi-elon-man-v1/ (dépôt `passcool17/tamagotchi-elon-man-v1`)

## Quoi de neuf en 2.0

- **Réplique 2D du vrai robot** (d'après `hardware/print-v1`) : socle noir, corps rouge avec 2 chevrons orange, plateau pan noir,
  colonne + cardan, 2 servos SG90 bleus avec palonniers et **tiges de poussée visibles**, plaque en X, tête rouge en dôme,
  plaque grise et **3 écrans OLED** (2 yeux montés de côté + bouche).
- **Les 3 écrans** imitent des ELEGOO 0,96" SSD1306 : 128x64, 1 bit, matrice de pixels visible. Visages : content, neutre, faim,
  sommeil, triste, ennuyé, sale, endormi, manger, jouer, se laver, **parler**, réfléchir.
- **La tête bouge comme les servos** : pan MG996R ±90°, hochement ±12° (les 2 tiges ensemble), roulis ±10° (une tige monte, l'autre descend).
  Mouvement « servo » (accélération, vitesse max, freinage, sans dépassement). La base et le corps ne bougent jamais.
  Il réagit aux soins, au toucher, quand il parle, et quand une réplique vocale joue.
- **Bouton Parler** : bulles de réponses rapides + champ texte.
  - **Démo** (par défaut) : réponses scriptées en français québécois, hors ligne, aucune clé.
  - **Passerelle PC** (optionnel) : adresse HTTPS du PC Ubuntu de Pascal dans « Cerveau ». Si elle ne répond pas (5 s), retour automatique
    en démo. Le mode actif est affiché en haut (DÉMO / PC ✓ / PC ✗ → DÉMO) et sous chaque réponse.
- Sauvegarde reprise de la v1 automatiquement (`tem.save.v1` → `tem.save.v2`), musique, 14 voix et boutons muet / voix conservés.

Détails : voir [GAME.md](GAME.md).

## Lancer en local

```bash
npm test          # tests Node : logique, OLED, servos, cerveau démo, passerelle (fetch simulé), migration, service worker
npm run serve     # puis ouvrir http://localhost:8080
```

Pas de build : modules ES ; Phaser 3.90 et Motion 14 sont fournis dans `vendor/`.

## Structure du code

```
index.html               page, polices locales, styles du panneau « Parler »
src/logic.js             ÉTAT PUR : stats, déclin, actions, humeur, rattrapage hors ligne (inchangé depuis la v1)
src/oled.js              VISAGE PUR : 3 framebuffers 1 bit 128x64 (yeux + bouche, tous à l'horizontale) + export SSD1306
src/servo.js             TÊTE PURE : modèle servo pan/hochement/roulis, mixage des tiges, gestes
src/brain/demo.js        CERVEAU DÉMO PUR : réponses scriptées (québécois)
src/brain/gateway.js     passerelle PC : fetch + délai + validation + retour démo
src/storage.js           localStorage (clés v2 + migration v1)
src/audio.js, voice.js   musique en boucle, bips, 14 voix (inchangés)
src/ui/robot.js          dessin vectoriel du robot réel + mécanisme du cou
src/ui/chat.js           panneau « Parler » (DOM, animé avec Motion)
src/scenes/GameScene.js  colle tout dans Phaser
tests/                   node --test
```

## Écrans OLED -> vrai robot (ESP32-S3, 3 x SSD1306)

```js
import { renderFace, toSSD1306 } from './src/oled.js';
const p = renderFace({ mood: 'happy', t: performance.now(), look: { x: 0, y: 0 }, talk: 0 });
const left = toSSD1306(p.eyeL), right = toSSD1306(p.eyeR), mouth = toSSD1306(p.mouth); // 3 x Uint8Array(1024)
```

| Élément | Valeur |
|---|---|
| Écran | 128x64, 1 bit, format GDDRAM SSD1306 : 8 pages x 128 colonnes, bit 0 = ligne du haut (même tampon qu'Adafruit_SSD1306) |
| Yeux et bouche | 128x64 paysage, les 3 écrans sont montés à l'horizontale (comme le firmware, `setRotation(0)`). `toSSD1306` n'applique aucune rotation |
| Bouche | paysage 128x64 |
| Paramètres | `mood` (`OLED_MOODS`), `t` (ms), `look` {x,y} de -1 à 1, `talk` 0 à 1 (ouverture de la bouche) |
| Firmware | `firmware/elonman_body/config.h` : yeux 0x3C/0x3D sur I2C0, bouche 0x3C sur I2C1 |

## Passerelle PC (mode optionnel)

La page est servie en **HTTPS** par GitHub Pages ; elle ne peut appeler qu'une adresse **HTTPS** avec un certificat valide qui autorise CORS.
Le démon `elonman` actuel (`127.0.0.1:8765/cmd`) n'écoute qu'en local, n'a pas de CORS et n'a pas de route de discussion :
il faut un petit **pont HTTP** sur le PC, derrière un tunnel.

**Routes attendues** (JSON, `Content-Type: application/json`) :

| Requête | Réponse |
|---|---|
| `POST /chat` `{"text":"Salut","lang":"fr-CA","pet":{"mood":"happy","food":80,"fun":80,"energy":90,"sleep":90,"clean":90,"sleeping":false}}` | `200 {"reply":"Allo!","mood":"happy","gesture":"yes","look":{"pan":30,"nod":5,"tilt":0}}` (`mood`, `gesture`, `look` facultatifs) |
| `POST /cmd` `{"cmd":"ping"}` (bouton « Tester ») | `200 {"ok":true}` (même forme que le démon) |

- `mood` : `happy, idle, hungry, sleepy, sad, bored, dirty, sleeping, thinking, talking`.
- `gesture` : `yes, no, curious, look, happy, play, clean, eat`. `look` est borné à pan ±90, nod ±12, tilt ±10.
- La réponse est coupée à 280 caractères. Délai max 5 s, sinon mode démo.

**CORS** sur les 2 routes, y compris la pré-requête `OPTIONS` (réponse 204) :

```
Access-Control-Allow-Origin: https://passcool17.github.io
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 600
Vary: Origin
Access-Control-Allow-Private-Network: true     (seulement si l'adresse est privée / LAN, voir plus bas)
```

**HTTPS** : un tunnel qui fournit un vrai certificat, par exemple
`tailscale serve --bg --https=443 http://127.0.0.1:8787` (adresse `https://<pc>.<tailnet>.ts.net`, visible seulement par les appareils du tailnet :
le téléphone doit avoir Tailscale), ou `cloudflared tunnel` avec un nom de domaine (+ Cloudflare Access pour filtrer).
`tailscale funnel` rend l'adresse publique : à éviter sans authentification.

**Aucune clé dans la page.** Le jeu n'envoie jamais d'en-tête secret ni de cookie (`credentials: 'omit'`). Le contrôle d'accès vient du tunnel
(tailnet ou Cloudflare Access), et le pont garde ses clés (xAI, etc.) côté PC. Une adresse `http://` (sauf localhost) est refusée.

**Réseau local / Private Network Access** : Chrome bloque de plus en plus les appels d'un site public vers une IP privée (192.168.x, 10.x)
ou `localhost`. Une IP de LAN en `http://` est de toute façon bloquée (contenu mixte). Si le pont répond sur une adresse privée en HTTPS,
il doit répondre à la pré-requête avec `Access-Control-Allow-Private-Network: true`, et Chrome peut demander une permission.
Le plus simple : passer par le nom `*.ts.net` de Tailscale ou un domaine Cloudflare.

## Crédits et licences

- Jeu : MIT, © PC17.
- Robot (forme, couleurs, mécanisme du cou, 3 OLED, servos, mixage des tiges) : d'après [passcool17/elon-man](https://github.com/passcool17/elon-man)
  (`hardware/print-v1`, `firmware/elonman_body`, `core/elonman/daemon.py`), licence MIT.
- Style du panneau « Parler » (fond sombre, accent cyan, Chakra Petch / JetBrains Mono) inspiré de *La mallette de l'Entité* (projet PC17) ;
  aucune ligne de code reprise, seulement les idées de palette et les polices (OFL).
- Musique : Suno, *Tamagotchi Elon Man - Robot Pet Loop*, générée pour Pascal (25 nov. 2026).
- Voix : ElevenLabs, Philippine Dynamique Acting Voice, modèle `eleven_v4`, générées pour Pascal (25 nov. 2026).
- [Phaser](https://phaser.io) 3.90.0, MIT ; [Motion](https://motion.dev) 14.14.0, MIT (`vendor/`).
- Polices : Press Start 2P, Rubik, Chakra Petch, JetBrains Mono : SIL OFL 1.1, servies localement.
