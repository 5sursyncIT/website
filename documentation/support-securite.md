# Support, auth et fichiers

/support, /support/nouveau et /support/tickets/[id] redirigent anonyme ou session
expirée vers /support/connexion (plus d'erreur 500). Tableau tickets, nouveau ticket,
détail, statuts, fil de réponses et pièces jointes. /team/invitations réservé
admins via tunnel privé ; créer organisation dans CMS puis invitation client.
Compte désactivé avant activation, sans inscription publique. Invitation 24 h,
token 32 octets aléatoires, DB conserve SHA256 seulement. Lien porte le token dans
fragment (#), non envoyé dans logs HTTP ; le navigateur efface fragment en ouvrant
/support/activation. Mot de passe client 14 caractères minimum, saisi par client.
Consommation SQL atomique avant update mot de passe : si update échoue, compte
reste désactivé et équipe réinvite depuis /team/invitations : même email et même
organisation régénèrent le jeton du compte désactivé (ancien jeton invalidé) ;
compte actif ou autre organisation refusés 409. Aucun lien/token journalisé en console.
Endpoint invite ne prétend pas envoyer un email, équipe transmet par canal privé.

Cookies HttpOnly/Secure en production/SameSiteStrict,1h ; sessions Payload.
Compte actuel vérifié serveur via payload.auth. Origines APP_ORIGIN et ADMIN_ORIGIN
sur mutations API ; Payload csrf idem. Login max 5 essais / verrouillage 15 min et rate IP 10 / 15 min.
Limites persistées DB et fail-closed si DB absente. Nginx fixe X-Real-IP depuis
PROXY protocol : client HTTP ne contrôle pas sa clé rate-limit en production.

Clients : filtre serveur client sur tickets, replies, files. Hook impose client
et auteur côté serveur ; statut et update ticket équipe uniquement. Réponse ne peut
viser ticket tiers : fetch autorisé avant création. Notes internes collection
séparée admin-only. Administration/API Payload ne sont pas ouvertes publiquement.

Fichiers : PDF/PNG/JPEG, 5 MiB, un par requête, max 10/ticket (cap vérifié avant
insertion ; simultanéité peut dépasser ce cap, sans dépasser rate/limite par fichier).
Nom 150 caractères sans slash/caractère contrôle, extension/MIME/signature contrôlés.
Binaire nom UUID, permissions 600, volume privé ; métadonnée créée après write,
cleanup fichier si DB échoue. Téléchargement vérifie accès avant lecture privilégiée
storageKey, Content-Disposition attachment, octet-stream/nosniff/no-store.
Pas de route publique statique fichier ticket. Antivirus non intégré ; les PDF
ne doivent pas être considérés comme fiables, téléchargements non rendus inline.

Les réponses sont limitées à 100 par page détail, tableau 50 tickets ; pagination
complète reste à ajouter si le volume le demande. Récupération mot de passe via
email inactive tant que transport non configuré. Adapter email désactivé explicitement
pour empêcher fallback Payload qui affiche emails/tokens sur console.

Premier compte : restriction BOOTSTRAP_ADMIN_EMAIL secondaire seulement ; la
protection principale est boucle locale + tunnel SSH et refus Nginx de toute route
/admin et /api/cms depuis Internet. L'adresse publique ne donne aucun accès.
Les hooks ClientAccounts refusent aussi l'opération Payload first-register qui
utilise overrideAccess:true, même lorsqu'aucun compte client n'existe.
Logout supprime également session serveur avec logoutOperation, rejeu token401.

Premier admin : hook refuse aussi toute création arrivant avec X-Real-IP, en-tête
toujours posé par Nginx public, jamais par le tunnel SSH. X-Forwarded-For n'est pas
utilisable : le serveur Next l'ajoute lui-même à chaque requête.
