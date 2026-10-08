# Cinq bandeaux vidéo — préproduction, 6 octobre 2026

Intégration des films livrés dans le projet task-3/motion-heroes, sans nouveau rendu : accueil, réseaux et cloud, solutions métier, développement et API, maintenance et support. MP4 H.264/yuv420p, 1280 × 720, 24 images/s, 10 secondes, sans audio, faststart. Sources et posters inchangés ; environ 500 Ko de vidéo au total.

Le composant HeroVideo affiche un poster au premier rendu. Sur ordinateur, il charge uniquement le film du bandeau visible puis le lit en boucle, muet et en ligne. Sur mobile, le poster reste affiché tant que le visiteur ne choisit pas la lecture. Le bouton permet pause/reprise ; la lecture s’arrête hors écran et lorsque le document devient masqué. Une préférence de réduction des animations désactive le lecteur ; une erreur de lecture conserve le poster. Les films sont décoratifs, les textes et boutons restent du HTML accessible.

Cadrage complet sur ordinateur avec texte à gauche ; cadrage du sujet situé à droite dans un panneau séparé sur mobile. Palette marine/turquoise ; les autres sections et les quatre autres pages sont conservées.

QA locale : cinq lectures sur ordinateur, cinq posters initiaux sans élément vidéo sur mobile, cinq lectures volontaires et cinq pauses, aucun débordement horizontal, pause hors écran vérifiée. Six tests passent, types vérifiés. Les captures et résultats JSON figurent dans documentation/qa. Le navigateur disponible ne propose pas d’émulation de prefers-reduced-motion ni de masquage d’onglet : ces deux gardes ont été inspectées dans le code, sans prétendre à une vérification visuelle de ces préférences.

Périmètre : 18 fichiers ciblés, aucun seed, migration, changement CMS, secret, SMTP, DNS, firewall ou configuration INA. Comparaison SHA-256 de 152 fichiers distants avant écriture pour détecter une modification concurrente.

Sauvegarde données/médias : /home/inaops/5sursync/backups/20261006T152258Z. Sauvegarde source : backups/source-before-video-20261006.tar.gz. Image de retour arrière : 5sursync:before-video-20261006. Retour arrière applicatif : retaguer cette image en 5sursync:local puis lancer docker compose up -d --no-deps app. Aucune restauration de base nécessaire pour ce changement purement visuel.

Image déployée : 5sursync:video-20261006, SHA-256 5943ad73bff842c68422f3c849c45d53a07f3b7cc6b8b9a60c68e6ce67ab6d09. Déploiement limité à https://preprod.5sursync.com, toujours noindex. SMTP reste désactivé. Le domaine principal reste hors périmètre.

Contrôles avant bascule : Nginx valide ; projets 7, réalisations 8, administrateurs 1, clients 0, demandes contact 0. Aucune soumission de formulaire. Les trois services INA présentent le même certificat SHA-256 1c05d8a2f746858fabe8a63a3675eced2abb9e97cb7e9defa788fb3f8a91d082. Coordonnées et favicon publiés vérifiés ; carte chargée sur ordinateur et mobile, résultats régionaux Google conservés sans inventer un point précis.

QA publique après bascule : les cinq films se décodent réellement à 1280 × 720 ; cinq posters mobiles initiaux, cinq lectures volontaires et cinq pauses confirmées. Dix assets comparés octet par octet aux fichiers validés ; cinq requêtes Range retournent 206 et les bons Content-Range. App et PostgreSQL healthy, /api/health 200, Nginx valide.

Contrôles finaux : 31 vérifications HTTPS passent après revalidation ISR, y compris neuf pieds de page avec WhatsApp, coordonnées/favicon, six gammes, sept projets et six références historiques ; administration/API CMS 401, support 307/401, formulaire invalide 400 sans créer de demande. Pause hors écran vérifiée aussi sur le site public. Base toujours privée ; compteurs inchangés.
