# Déploiement VPS

Docker 29.8.2/Compose 5.6 officiels installés après validation des effets réseau.
IPv4 forwarding passé0→1, chaînes Docker normales ajoutées ; UFW INA inchangé,
aucun port public supplémentaire. Nginx/SSH/WireGuard maintenus.
Trois SNI INA direction/mobile/auth vérifiés TLS après installation.

Compose projet 5sursync : PostgreSQL réseau interne sans ports, app 3105 publiée
uniquement127.0.0.1, volumes postgres_data/private_files/public_media, limitesRAM/CPU,
healthchecks. App nonrootUID 1001, secrets fichiersUID inaops 1001/mode 600. Les trois
secrets db_password/database_uri/payload_secret générés sur serveur uniquement,
dossier secrets 700. Ne jamais cat ces fichiers, afficher composeenv ni inspect env
contenant valeurs secrètes. Compose utilise chemins *_FILE, code lit explicitement.

Commandes à lancer dans /home/inaops/5sursync avec sudo Docker (pas groupe docker) :
`sudo docker compose build app`
`sudo docker compose up -d postgres`
`sudo docker compose run --rm --no-deps app npm run migrate`
`sudo docker compose run --rm --no-deps app npm run seed:content`
`sudo docker compose up -d app`
Vérifier santé et routes avant activation HTTP publique.

443 existant est stream TLS passthrough INA : direction/mobile/auth vers
10.201.90.2:8443, default reject127.0.0.1:1, proxy_protocol on globalement.
Ajout approuvé : map preprod.5sursync.com→syncit_preprod, upstream 127.0.0.1:9443.
TerminaisonTLS localeHTTP `listen 127.0.0.1:9443 ssl proxy_protocol`, donc reçoit
l'en-tête PROXY existant et respecte IP réelle. Voir deployment/preprod.nginx.conf.
Aucun autre listen 443 ; aucune modification routes INA/default/proxy global.
Avant reload : sauvegarderstream + config HTTP, nginx -t, puis reload sans restart.
Après : quatre SNI/TLS, routes/pages/API, admin/team/cms publics404.

TLS Let’s Encrypt DNS-01 manuel sans ouvrir80 ni token DNS persistant. Termes
https://letsencrypt.org/repository/ doivent être acceptés explicitement avant
création compte ACME. Utilisateur doit ajouter TXT demandé. Pas d'autorenouvellement
possible en mode manuel sans hookDNS ; documenter échéance et renouveler manuellement.

Premier admin confirmé ydiop@5sursync.com ; aucun compte créé par agent.
Accès privé : `ssh -F ~/.ssh/config -o StrictHostKeyChecking=yes -L3105:127.0.0.1:3105 ina-relay`
puis http://localhost:3105/admin pour saisir et valider lui-même son mot de passe.
ADMIN_ORIGIN=http://localhost:3105 dans Compose. Ne jamais publier first-register
ouadmin API. Après première création, vérifier compte et verrouillage bootstrap.
Clients réels : invitations depuis http://localhost:3105/team/invitations.

Variables : APP_ORIGIN, ADMIN_ORIGIN, DATABASE_URI_FILE, PAYLOAD_SECRET_FILE,
POSTGRES_PASSWORD_FILE, MEDIA_STORAGE_PATH, PRIVATE_UPLOAD_PATH, RELEASE_TAG.
Aucun SMTP configuré : contact persisté notification not-configured ; aucune émission.

## Résultat public vérifié le 6 octobre 2026

https://preprod.5sursync.com est actif ; certificat valable jusqu'au 4 janvier
2027, 22 contrôles HTTPS réels réussis. Configurations avant activation conservées
dans backups/nginx-20261006T113512Z. Relais INA inchangés. Voir ETAT.md pour les
preuves et limites actuelles. Le premier administrateur reste à créer par saisie
privée du propriétaire ; CMS inaccessible via proxy public.

Renouvellement DNS-01 manuel : recréer le hook temporaire root à partir de
deployment/acme-dns-hook.py avant une nouvelle demande planifiée. Le chemin
/run du hook Certbot a été nettoyé après succès ; le timer standard ne réalise
pas la mise à jour DNS. Ne pas laisser une demande en attente en tâche de fond
sans suivi. Aucun token DNS configuré. Tester Nginx et recharger après certificat.

Mise à jour 6 octobre 12:22 UTC, sur décision utilisateur : l'administration est
accessible sur https://preprod.5sursync.com/admin derrière Nginx Basic Auth
(deployment/preprod.nginx.conf, htpasswd créé par l'utilisateur via
`openssl passwd -6`), en plus du login Payload. Le paragraphe « admin/team/cms
publics 404 » ci-dessus est remplacé par « 401 sans identifiants Nginx ».
Le premier admin existe : bootstrap fermé (compte existant + refus X-Real-IP).

## Préproduction isolée (depuis le 8 octobre 2026)
La préproduction a sa propre base `syncit_preprod` (rôle `syncit_preprod`, non superutilisateur), son propre `payload_secret` et ses propres volumes ; elle ne peut plus se connecter à la base de production. Le contenu de production se modifie dans l'admin de production. **Chaque migration se lance deux fois** : préproduction (`sudo docker compose run -T --rm --no-deps app npx payload migrate`, avec l'image de préproduction) puis production (`sudo docker compose -f compose.yaml -f compose.production.yaml run -T --rm --no-deps app-production npx payload migrate`). Détail et preuves : `documentation/microsoft365.md`, section 7.
