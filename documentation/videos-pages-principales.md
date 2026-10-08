# Extension des vidéos aux pages principales — 6 octobre 2026

Ajout approuvé aux pages Services, Réalisations, À propos et Contact. Les cinq vidéos précédentes sont conservées. L’espace support connecté reste utilitaire, sans film ajouté.

Assets validés dans task-3/motion-heroes/main-pages : main-services, main-realisations, main-a-propos, main-contact. MP4 H264 High, 1280 × 720, 10 secondes, 24 images/s, yuv420p, sans audio, faststart ; 240 images décodées par film. Posters issus des films, aucun nouveau rendu dans la tâche d’intégration. Noms distincts et copie SHA-256 contrôlée.

Composant HeroVideo existant inchangé : poster au premier rendu, démarrage muet en boucle sur ordinateur uniquement lorsque visible ; lecture volontaire sur mobile, pause/reprise, arrêt hors écran et document masqué, poster seul en réduction des animations ou erreur. Textes et boutons restent du HTML. Le navigateur disponible ne permet pas d’émulation de réduction des animations ni de masquage d’onglet ; ces gardes sont inspectées dans le code sans annoncer un test visuel.

Cadrage desktop : les quatre pages conservent leurs hauteurs pilotées par le contenu, environ 537 px Services, 472 px À propos et 306 px Réalisations/Contact au viewport 1280 px. Les deux bandeaux courts utilisent contain/right center sur fond marine. Mobile : panneau séparé 4/3 ; À propos utilise un panneau carré et contain pour préserver les trois silhouettes entièrement. Léger dégradé derrière les titres. Les cinq anciennes vidéos ne sont pas affectées par ces règles ciblées.

Préservation : comparaison exacte des sections après le visuel avec l’archive VPS ; mêmes clés CMS, Showcase, projets/réalisations, formulaires, coordonnées, carte et sections. Aucune migration/seed, secret, SMTP, DNS, firewall, accès ou configuration INA modifié. Treize fichiers concernés : quatre pages, CSS et huit assets.

QA locale réelle par navigation depuis le menu sur ordinateur et menu mobile : les quatre films se décodent et progressent, lecture/pause confirmées, quatre posters mobiles sans lecteur avant clic, aucun débordement horizontal. Captures main-*-local-*.jpg et main-pages-browser-local.json dans documentation/qa. Six tests réussis et types vérifiés ; compilation, types et vingt pages pré-rendues de production réussis.

Concurrence : 193 fichiers distants comparés par SHA-256 avant écriture ; absence de construction concurrente. Après correction finale du cadrage À propos, seul notre build intermédiaire a été annulé puis la construction finale relancée. Application publiée précédente et services INA restés en fonctionnement.

Sauvegarde données/médias : backups/20261006T170934Z. Source : backups/source-before-main-videos-20261006.tar.gz. Image retour arrière : 5sursync:before-main-videos-20261006 (version précédente contenant les cinq films initiaux). Retaguer cette image en 5sursync:local puis docker compose up -d --no-deps app. Aucune restauration de DB nécessaire pour cette extension visuelle.

Image déployée : 5sursync:main-videos-20261006, SHA-256 fa8cefdab534f6a5d942de9def4388cea69100a9af0925abc1df0ed844836a01. Publication exclusivement sur https://preprod.5sursync.com, noindex maintenu.

## Vérification après publication

Les quatre pages principales sont testées par navigation réelle du menu, sur ordinateur et mobile : film visible, décodage 1280 × 720, progression du temps, boutons lecture/pause opérationnels. Quatre posters mobiles initiaux sans lecteur ; aucun débordement. Les cinq films initiaux fonctionnent toujours. Dix-huit assets comparés octet par octet, neuf réponses Range 206 correctes ; neuf pages pré-rendues avec poster seul et support sans vidéo. Après revalidation ISR, 31 contrôles HTTPS réussissent (coordonnées, WhatsApp, favicon, six gammes, sept projets, six références, protections). App et PostgreSQL healthy, Nginx valide ; aucun port PostgreSQL public. Compteurs CMS inchangés : 7 projets, 8 réalisations, 1 administrateur, 0 client, 0 demande de contact. Aucun formulaire soumis. Les trois relais INA conservent leur certificat SHA-256 1c05d8a2f746858fabe8a63a3675eced2abb9e97cb7e9defa788fb3f8a91d082. SMTP reste désactivé.
