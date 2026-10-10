# État de reprise — 6 octobre 2026

## Terminé et vérifié

- SSH strict sur Ubuntu/VPS confirmé, source ZIP contrôlée et extraite sans écrasement.
- Code Next/React/TypeScript/Payload : neuf pages pré-rendues, contenu texte éditable,
  navigation responsive, contact durable, Support client avec login, tickets,
  statuts, réponses, fichiers privés et invitations à usage unique.
- Admins séparés des clients, isolation serveur, notes internes séparées.
- Bootstrap client explicitement fermé même collection vide ; bootstrap admin
  adresse confirmée et interface privée uniquement. Déconnexion révoque session.
- Cinq tests unitaires,19 assertions Payload/PostgreSQL,21 HTTP/API directes et
  neuf contrôles du proxy public local, incluant email exact du premier admin404.
- Audit npm zéro vulnérabilité ; build local complet passé après corrections.
- Test CMS production : neuf pages et tous textes lus depuis PostgreSQL.
- Migration3 renomme pages_texts en pages_copy : évite collision table interne
  Payload, conserve données ; vérifiée localement. Aucun patch de dépendance.
- pg_dump fixtures restauré dans DB locale séparée ; rendu accueil desktop/mobile
  et navigation mobile Support inspectés dans navigateur.
- Docker 29.8.2/Compose 5.6 installés sur VPS, règles UFW INA inchangées,
  IPv4 forwarding autorisé activé ; trois SNI INA TLS toujours répondants.
- Secrets DB/CMS générés sur VPS sans affichage/lecture/transfert, mode 600.
- PostgreSQL production privé sain ; migrations initiales appliquées ; aucun
  admin ou compte client réel créé.

## Mise en service privée vérifiée

Build Docker corrigé passé sur VPS ; migration 3 appliquée, neuf pages seedées.
App et PostgreSQL healthy, santé API ok. Les neuf pages et /support/connexion
répondent 200. App publiée uniquement sur 127.0.0.1:3105, aucun port hôte DB.
Aucun admin ni client réel créé. Tickets/fichiers/invitations anonymes refusés
401, contact invalide 400, sans écriture. Neuf protections du proxy public
rejouées dans le banc local passent, dont bootstrap email exact refusé 404.
Ce banc ne constitue pas une validation HTTPS publique.

Sauvegarde /home/inaops/5sursync/backups/20261006T110416Z : fichiers mode 600.
Dump restauré avec succès dans une DB temporaire indépendante sur VPS : neuf
pages, zéro admin et zéro client ; DB temporaire ensuite supprimée. Archive
private/media lisible, sans fichiers utilisateur actuellement.

Nginx valide, nginx/ssh/docker actifs, trois relais INA TLS répondants avec
certificat existant, règles UFW inchangées. Aucun nouveau port public ni route
SNI préproduction activée à cette étape privée. Vérification finale reprise avec succès après
interruption du transport Ubuntu.

Image finale :
`sha256:4e3bfb0748d140a5e6577cb2bee3def2862f96be056abbaef1dea5493e491a78`.

## HTTPS public activé et vérifié

URL : https://preprod.5sursync.com. Conditions ACME acceptées explicitement.
Demande DNS-01 existante poursuivie après contrôle TXT sur ns1/ns2.dns-parking.com
(serveurs réellement délégués selon trace .com), Cloudflare et Google.
Certificat obtenu, expiration 4 janvier 2027 à 10:36:09 UTC.

Route SNI ajoutée uniquement pour preprod, proxy TLS privé 127.0.0.1:9443.
Sauvegarde Nginx : backups/nginx-20261006T113512Z. nginx -t puis reload réussis.
Les trois relais INA conservent la même empreinte SHA256 de certificat.
Aucun port 80 ouvert, aucune clé privée lue ou transférée.

22 contrôles HTTPS réels depuis Ubuntu avec vérification TLS active : neuf pages,
connexion Support et santé 200/noindex ; huit routes admin/CMS/team 404, incluant
bootstrap avec email exact et chemins encodés/double slash ; contact invalide 400,
tickets et fichiers anonymes 401. App/DB toujours healthy, aucun port DB publié.
Un cache DNS local du VPS a temporairement échoué ; HTTPS validé depuis Ubuntu
avec DNS normal et depuis VPS avec résolution explicite sans ignorer le certificat.

Sauvegarde supplémentaire : backups/20261006T113623Z. Zéro admin, zéro client,
zéro demande contact créée par les vérifications finales. Aucun compte réel créé.
Service ACME temporaire terminé success ; fichiers /run du challenge nettoyés.

Renouvellement : MANUEL DNS-01. Le timer standard Certbot ne peut pas publier le
TXT. Son hook temporaire /run n'existe plus : ne pas annoncer renouvellement
automatique opérationnel. Avant expiration, préparer de nouveau le hook temporaire
root et une demande DNS-01 manuelle, attendre le nouveau TXT puis validation.
Aucun token DNS persistant. Après renouvellement, nginx -t puis reload nécessaire.

## Review Claude et corrections déployées (12:04 UTC)

Review complète du code. Corrigé, testé (voir installation-tests.md) et déployé :
- /support/nouveau et /support/tickets/[id] renvoyaient 500 en public sans session
  (ou session expirée) : redirection 307 vers /support/connexion.
- Premier admin : refus supplémentaire si X-Real-IP présent (route publique).
- Réinvitation d'un compte désactivé possible ; compte actif 409 ; erreurs de
  validation Payload 400 au lieu d'un faux 503.
- tests/integration.ts et http-security.ts refusent toute base non `*_test`.

Sauvegarde avant bascule : backups/20261006T120407Z ; sources avant correction :
backups/source-avant-review-*. Retour arrière : image `5sursync:pre-review-4e3bfb07`
retaguée `5sursync:local` puis `docker compose up -d app` (aucune migration).
Image déployée : `sha256:171807eac829…`.
Contrôles HTTPS réels après bascule : neuf pages, connexion et santé 200 ; quatre
pages Support anonymes 307 ; sept chemins admin/CMS/team 404 ; contact invalide 400 ;
tickets anonymes 401 ; empreintes certificats INA inchangées ; zéro admin/client.

Premier admin créé par l'utilisateur lui-même (mot de passe saisi par lui, jamais
vu par l'agent) via transfert de port VS Code Remote-SSH vers 127.0.0.1:3105 :
ydiop@5sursync.com, 2026-10-06 12:13:54 UTC. Vérifié ensuite : un seul admin,
first-register refusé 403 (email approuvé comme autre email), compte inchangé.
Fermer le transfert de port VS Code après usage ; ne jamais le rendre public.

## Administration publique protégée (12:22 UTC, choix utilisateur)

/admin, /api/cms, /team, /api/team ouverts sur https://preprod.5sursync.com derrière
Nginx Basic Auth (utilisateur `ydiop`, fichier /etc/nginx/5sursync-admin.htpasswd
root:www-data 640, empreinte SHA-512 créée par l'utilisateur lui-même, jamais vue
par l'agent) puis login Payload. limit_req 5 r/s burst 60 par IP ; en-tête
Authorization retiré avant l'app. Sauvegarde ancienne conf :
backups/nginx-admin-20261006T122233Z ; nginx -t puis reload OK.
Vérifié en HTTPS : huit chemins admin/CMS/team (dont encodés, double slash,
first-register) 401 sans identifiants et avec faux identifiants ; site public 200 ;
/support anonyme 307 ; empreintes certificats INA inchangées.
Retour arrière : recopier la sauvegarde dans sites-available, nginx -t, reload.
Limite : admin et client partagent le cookie payload-token sur ce domaine ; ne pas
tester un compte client dans le même navigateur que la session admin.
Le tunnel localhost:3105 reste utilisable.

## Téléphone et pied de page (12:50 UTC)

Numéro 77 097 29 08 ajouté (lien tel:+221770972908) : bloc « Appelez-nous » de
la page Contact (clés CMS phone-label/phone, éditables) et nouveau pied de page
(components/Footer.tsx : marque + bouton, Services, 5/Sync IT, Contact, barre
copyright). Email contact@5sursync.com toujours non affiché (non confirmé) ; pas
de réseaux sociaux ni mentions légales (inexistants). Le domaine principal
5sursync.com (91.204.209.201, autre hébergeur) n'est pas géré ici : son ancien
numéro doit être changé chez cet hébergeur.
seed-content ajoute désormais les clés absentes aux pages existantes sans écraser
les textes édités (testé : 2 clés ajoutées, texte modifié conservé, relance sans
effet). Sauvegarde backups/20261006T125005Z ; retour arrière image
`5sursync:pre-footer`. Vérifié HTTPS : dix pages 200 avec pied de page et lien
tel, admin 401 sans identifiants Nginx. Rendu visuel non contrôlé par l'agent
(pas de navigateur sur le VPS) : à valider par l'utilisateur, ordinateur et mobile.

## Réseaux sociaux gérés dans le CMS (13:05 UTC)

Global Payload « Réseaux sociaux » (slug social-links, migration 4
20261006_125511_social_links, additive : 2 tables) : jusqu'à 8 liens, réseau parmi
Facebook, Instagram, LinkedIn, X, YouTube, TikTok, WhatsApp ; adresse https://
uniquement (javascript:, http:, identifiants refusés), modification admin seule.
Affichés en icônes dans la colonne Contact du pied de page, nouvel onglet,
rel noopener noreferrer ; rien n'est affiché si la liste est vide. Enregistrement
admin -> pied de page rafraîchi immédiatement sur toutes les pages (testé).
Liste vide en production : aucun compte inventé, à remplir par l'utilisateur.
Tests (environnement jetable) : typecheck, 5 unitaires, 4 migrations, 20 Payload,
26 HTTP, 7 tests/social-links.ts, essai REST admin 200 / javascript: 400 /
anonyme 403. Sauvegarde backups/20261006T130437Z ; retour arrière image
`5sursync:pre-social` (la table additionnelle peut rester en place).
Icônes au trait dessinées pour le site, pas les logos officiels des marques.

## Nos réalisations et projets publiés (13:25 UTC)

Signal utilisateur reçu après fin Claude. Dernière source Claude synchronisée,
89 fichiers comparés avant intégration, 16 fichiers ciblés ; empreintes source et
image contrôlées à nouveau avant bascule. Ses correctifs bootstrap/Support,
réseaux sociaux administrables, pied de page et téléphone conservés.

Accueil et Réalisations : sept cartes HTML avec logos, pays, mission et statuts
exacts fournis. Hage Wi-Fi et Harmattan site vitrine conservés séparément. Six
logos vérifiés (INA Guinée, Mairie Dakar, RTG, ANAPI, Harmattan, CNTS transfusion).
CPFA texte sans logo inventé ; GUCE / ANAPI illustré par logo ANAPI seulement.
Guide CMS et sources : documentation/projets-reference.md.

Contenu partagé dans pages.copy de realisations : 29 clés ajoutées, zéro au
second seed (idempotence), valeurs existantes conservées. Aucun changement de
schéma, aucune migration ni modification des comptes. 29 nouvelles valeurs
exactes vérifiées en PostgreSQL. Admin existant 1, clients 0.

Build/types local et Docker VPS passés, cinq tests unitaires passent. 29 contrôles
HTTPS réels avec certificat vérifié : sept cartes exactes sur deux pages, neuf
pages/connexion/santé, six logos, protections Basic Auth admin/CMS/équipe/bootstrap
401 (dont chemins encodés et email exact), Support API anonyme 401, contact
invalide 400. Trois pages Support anonymes gardent redirection 307 connexion.
Rendu navigateur du site public inspecté desktop et mobile 390 px ; sept cartes,
six logos chargés, aucun débordement. Tablette 768 px contrôlée localement.
Navigation vers Réalisations vérifiée. Captures : documentation/qa/projets-*.jpg.

App/DB healthy ; PostgreSQL sans port hôte, app 127.0.0.1:3105. Nginx valide,
aucun changement Nginx/firewall pour cette release. Trois empreintes TLS INA
identiques. Nouvelle image :
sha256:a51a7dbb29c5366990f00e89b35fbdbaab6666f574244ef7ad6debd712da8226.
Sauvegarde avant : backups/20261006T131020Z ; source actuelle Claude conservée
dans backups/source-before-projects-final-20261006.tar.gz ; retour arrière image
5sursync:before-projects-final-20261006 (retag local, compose up app seule).
Aucun SMTP ou nouveau bootstrap effectué, domaine principal inchangé.

## Gestion admin de /realisations (13:52 UTC)

Collections Payload « Réalisations — projets » et « Réalisations — études de cas »
(migration 5 20261006_134346_showcase, additive) remplacent les clés de Pages ;
détail dans projets-reference.md. Contenu transféré en production : 7 projets
(statuts identiques), 2 études, 42 anciennes clés retirées, 14 restantes.
Route publique /media/<fichier> pour les images envoyées dans le CMS.
Tests (environnement jetable) : mise à niveau simulée depuis l'image Codex avec
2 valeurs éditées reprises ; seed idempotent ; typecheck ; 5 unitaires ; 20
Payload ; 26 HTTP ; 7 réseaux ; 10 tests/showcase-http.ts (upload logo, création,
accueil/réalisations, masquage accueil, dépublication, ancre invalide 400,
suppression, écritures anonymes 403, /media inconnu ou traversée 404).
HTTPS réel : onze routes 200, 7 cartes accueil et réalisations, 6 logos, 2 études,
/media inconnu 404, traversée 400, admin et écriture CMS 401, empreintes INA inchangées.
INCIDENT : premier `compose run ... payload migrate` sans effet (sortie filtrée,
cause non identifiée) ; app redémarrée ~1 min sans tables : pages servies en
contenu par défaut (identique), seed en échec sans écriture. Migration relancée
avec sortie complète : appliquée, seed OK. Toujours vérifier « Migrated: » avant
de démarrer l'app.
Sauvegarde backups/20261006T135210Z ; sources backups/source-avant-gestion-realisations-* ;
retour arrière image `5sursync:pre-gestion-realisations` (tables neuves inertes,
mais les 42 clés retirées devraient être restaurées depuis la sauvegarde DB).

## Limites restantes

- preparation/release.tar.gz (10:49) antérieur à migration 3 et aux corrections :
  ne pas l'utiliser comme release de retour arrière ; contient deployment/__pycache__.
- Suppression ticket/fichier dans le CMS laisse réponses et binaires orphelins.
- Aucune alerte équipe sur nouveau ticket (pas de mail) : consulter le CMS.
- 5 échecs de connexion verrouillent un compte client 15 min (déni ciblé possible).
- App sur réseau egress Docker (sortie Internet) sans besoin actuel.

- Aucun transport mail : contact stocké, notification not-configured ; récupération
  mot de passe et livraison invitation par mail non activées, aucun faux succès.
- Aucun client réel invité ; confirmations/actions volontaires depuis admin requises.
- Antivirus, pagination complète, intégration des médias CMS aux neuf gabarits et
  sauvegarde hors site/fréquence ne sont pas configurés.
- Certificat manuel : renouvellement DNS-01 à refaire, pas de token DNS persistant.
- Domaine principal inchangé ; préproduction noindex.

## Contact, reprise historique, WhatsApp et favicon (release finale du 6 octobre)

Publiés sur https://preprod.5sursync.com. Contact et pied de page : trois téléphones confirmés, mailto contact@5sursync.com, adresse complète à Almadie 2. Carte responsive par recherche de cette adresse, liens recherche/itinéraire ; pas de GPS inventé, Google ne confirme pas la résidence précise et la note le signale. Six gammes produits sur Solutions métier et accueil ; expertises enrichies ; six références historiques administrables et Hage contextualisé. Sept missions et statuts, médias et gestion Showcase de Claude conservés. WhatsApp dans le global existant : une entrée https://wa.me/221770972908, aucun message envoyé. Favicon : monogramme 5 supérieur extrait de la référence validée, PNG transparent ; logo horizontal inchangé, métadonnées Next versionnées et compatibilité /favicon.ico par redirection.

Source comparée avant chaque patch puis avant bascule (137 fichiers), aucune concurrence détectée. Premier build déjà fini quand la demande favicon est arrivée ; deuxième build uniquement après ajout favicon. Types/build Next et deux builds Docker passés ; 5 tests unitaires ; 14 assertions dans base de test dédiée (préservation, idempotence, WhatsApp). Source/UI des neuf pages testée desktop et mobile 390 px, sans débordement ni image cassée. Contrôle visuel public final interrompu par outil navigateur Transport closed ; HTML public final contrôlé en HTTPS.

31 contrôles HTTPS réussis : neuf pages/connexion/santé, coordonnées/carte/catalogue/missions/références/WhatsApp, favicon PNG MIME/signature/metadonnées et favicon.ico308, admin/CMS/team/bootstrap401 (encodés/double slash inclus), support307 et APIs401, contact invalide400, média inconnu404. Cache de pré-rendu renouvelé avant conclusion : WhatsApp réellement présent une fois sur chacune des neuf pages. Aucun formulaire valide ni compte créé ; contacts0, clients0, admins1, projets7, études8, liens sociaux1.

App et PostgreSQL healthy, Nginx valide ; seuls app5sursync et contenus concernés actualisés. Les trois relais INA ont conservé leur certificat avec TLS vérifié. Aucun changement DNS principal, firewall, ports, clés, permissions ou secret pendant cette reprise. Image actuelle : sha256:d9210d03308ca5b9e78c97b6e1aecdd02e8699cc048389ac2f1bd19fd29d9ba7, tag content-final-20261006 et local.

Sauvegarde fraîche avant données : backups/20261006T142658Z ; source avant : backups/source-before-contact-final-20261006.tar.gz ; retour arrière app : image 5sursync:before-contact-final-20261006, retag local puis compose up -d --no-deps app. Aucun changement de schéma. Une restauration complète DB remplacerait aussi des changements récents et nécessite validation spécifique ; voir migration-contenu.md.

SMTP : nouvelle demande reçue ensuite, domaine dicté ambigu. Préparation désactivée dans preparation/smtp : draft adaptateur officiel, variables vides, exemple Compose et handoff propriétaire. Dépendance non installée, draft non importé/compilé, aucune boîte/connexion/secret/email créé. Le transport publié demeure disabledEmail. Notifications Contact/ticket/réponse/invitation manquantes dans le code : SMTP seul ne les active pas. Confirmer host/from/user/port/TLS et saisie privée du mot de passe par propriétaire avant activation.

Outil send_message_to_thread vers parent a échoué Transport closed à chaque tentative pendant cette fin de travail ; SSH/exec récupéré après interruptions et vérifications terminées. Le rapport final reste le canal fiable de retour.


## Bandeaux vidéo — 2026-10-06
Cinq films task-3 intégrés sans nouveau rendu et déployés uniquement sur preprod.5sursync.com. Image 5sursync:video-20261006, SHA-256 5943ad73bff842c68422f3c849c45d53a07f3b7cc6b8b9a60c68e6ce67ab6d09. Build/types, six tests, cinq lectures desktop et cinq lectures/pause mobile, dix assets HTTPS exacts, cinq Range 206 et 31 contrôles HTTPS passent. App/DB healthy ; INA et données CMS préservés ; SMTP désactivé. Backup backups/20261006T152258Z et source-before-video-20261006.tar.gz ; rollback 5sursync:before-video-20261006. Voir documentation/videos-hero.md et documentation/qa/videos-*.json. Reduced-motion et onglet masqué : gardes inspectées ; émulation navigateur indisponible.


## Vidéos des pages principales — 2026-10-06
Extension approuvée publiée sur /services, /realisations, /a-propos, /contact ; les cinq films initiaux sont conservés et l’espace support reste sans vidéo. Image 5sursync:main-videos-20261006 SHA-256 fa8cefdab534f6a5d942de9def4388cea69100a9af0925abc1df0ed844836a01. Build/types/20 pages pré-rendues, six tests, quatre parcours menu desktop et mobile avec progression/lecture/pause, 18 assets/9 Range206 et 31 contrôles HTTPS réussis. App/DB healthy ; CMS, INA et SMTP inchangés. Backup backups/20261006T170934Z, source-before-main-videos-20261006.tar.gz ; rollback before-main-videos-20261006. Rapport documentation/videos-pages-principales.md, preuves main-pages-*.json et main-*-public-*.jpg.


## Back-office lisible — 2026-10-06 — DÉPLOYÉ (production et préproduction)
Présentation de l'admin Payload refaite, sans changement de schéma ni migration : interface en français, thème clair aux couleurs du site, logo 5/Sync IT (connexion) et monogramme (barre), navigation en quatre groupes (Demandes, Support client, Site web, Administration), libellés et colonnes de liste en français, onglet API masqué. Tableau de bord : demandes des 7 derniers jours, tickets à traiter, alertes email en échec, 5 dernières demandes et 5 tickets actifs. Demande de contact en lecture seule, sujet affiché en clair (champ virtuel topicLabel, aucune colonne), boutons « Écrire à… » (mailto) et « Appeler ». Textes de page repliés et étiquetés par clé + extrait ; clé non modifiable. Avatar local au lieu de Gravatar (plus d'envoi d'empreinte de l'email admin à un tiers). Lien « Mot de passe oublié » masqué : l'authentification n'a aucun transport mail.
Dépendances déclarées (déjà présentes, même version) : @payloadcms/translations et @payloadcms/ui 3.90.2.
Tests : typecheck OK ; 8 tests unitaires OK (9 ignorés, base requise) ; banc jetable tests/admin-ux-run.sh (réseau interne, PostgreSQL *_test, comptes fixtures) : 6 migrations, seed, 23/23 contrôles navigateur sur l'image production, captures documentation/qa/admin-ux/.
Images construites : 5sursync:admin-ux-20261006 (production, sha256:88e20c47af8e…) et 5sursync:admin-ux-preprod-20261006 (sha256:f88652b138ed…). Retour arrière préparé : 5sursync:before-admin-ux-20261006 (= contact-smtp-20261006) et 5sursync:before-admin-ux-preprod-20261006 (= local). Sauvegarde backups/20261006T234019Z ; source avant : backups/source-before-admin-ux-20261006T231054Z.tar.gz.
Mise en ligne sur accord explicite du propriétaire (« oui mets en ligne »), sans la vérification préalable de la file SMTP en base production (lecture refusée par le contrôle de permissions). compose.production.yaml pointe sur 5sursync:admin-ux-20261006 ; préproduction : admin-ux-preprod-20261006 retaguée 5sursync:local ; seules app-production puis app recréées (--no-deps), PostgreSQL non touché, aucune migration, Nginx/DNS/firewall inchangés.
Après bascule : deux instances healthy, zéro ligne d'erreur dans leurs journaux. 33 contrôles HTTPS publics TLS vérifié : sur 5sursync.com et preprod, neuf pages + connexion Support + santé 200, /admin, /admin/login, /api/cms/admins, /team/invitations 401 (Basic Auth Nginx), /support 307 ; contact invalide 400. Formulaire Contact : mêmes cinq sujets. Rendu admin réel (derrière Basic Auth) à valider par le propriétaire dans son navigateur.
Retour arrière : production — remettre image 5sursync:before-admin-ux-20261006 dans compose.production.yaml puis `docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production` ; préproduction — retaguer 5sursync:before-admin-ux-preprod-20261006 en local puis `docker compose up -d --no-deps app`. Aucune donnée à restaurer.
Limites : bouton Sauvegarder toujours visible sur une demande (sans effet, champs en lecture seule) ; pas encore de statut « traitée » des demandes (nécessiterait une migration) ; réponses/notes non intégrées dans la fiche ticket.

## Fil des échanges dans la fiche ticket — 2026-10-07 — DÉPLOYÉ avec la fiche client (voir ci-dessous)
Champ d'interface (ui, aucune colonne, types inchangés) en bas de chaque ticket : réponses et notes internes dans l'ordre chronologique (notes en orange « invisible pour le client »), formulaire « Réponse au client » / « Note interne ». Lecture et écriture par l'API CMS existante (/api/cms/ticket-replies et ticket-notes) : droits, client forcé et auteur forcé inchangés. Mention explicite qu'aucun email n'est envoyé. Description du ticket mise à jour.
Tests : typecheck OK, 8 unitaires OK, banc tests/admin-ux-run.sh 25/25 (dont réponse puis note publiées depuis la fiche, réponse stockée avec client forcé et auteur admin), zéro erreur applicative. Capture documentation/qa/admin-ux/admin-ticket-thread.png.
Images : 5sursync:ticket-thread-20261007 (production, sha256:a7b658b648b2…) et ticket-thread-preprod-20261007 (sha256:c50ee9f0f834…). Retour arrière : images admin-ux-20261006 / admin-ux-preprod-20261006 actuellement en ligne.
Statut « nouvelle / en cours / traitée » des demandes de contact : migration additive refusée par le contrôle de permissions (changement de schéma sur la base partagée avec la production) ; aucun fichier de migration créé. Nécessite l'accord explicite du propriétaire.

## Fiche client complète — 2026-10-07 — DÉPLOYÉ (production et préproduction)
Fiche « Clients » : champ d'interface (ui, aucune colonne) listant les utilisateurs de l'entreprise avec état (accès actif / invitation en attente avec échéance / invitation expirée / désactivé), invitation d'un utilisateur depuis la fiche (route existante /api/team/invitations : admin seul, contrôle d'origine, compte désactivé jusqu'à activation, aucun email), lien à copier, « Nouveau lien » pour un compte non activé, et tickets de l'entreprise avec statut. « Comptes clients » renommé « Utilisateurs clients ». /team/invitations reste disponible.
Correctif en cours de test : le bloc d'invitation ne doit pas être un <form> (imbriqué dans le formulaire Payload, l'envoi remontait à la fiche) ; Entrée interceptée pour ne pas déclencher la sauvegarde.
Tests : typecheck OK, 8 unitaires OK, banc tests/admin-ux-run.sh 29/29 (dont invitation depuis la fiche, état en attente, nouveau lien différent, ticket listé), zéro erreur applicative. Capture documentation/qa/admin-ux/admin-client.png.
Images (incluent aussi le fil des tickets) : 5sursync:admin-clients-20261007 (production, sha256:372c9c7e8124…) et admin-clients-preprod-20261007 (sha256:abcbc849b48e…). Elles remplacent ticket-thread-*-20261007 (jamais déployées). Retour arrière : admin-ux-20261006 / admin-ux-preprod-20261006, actuellement en ligne.
Mise en ligne 01:13 UTC sur accord explicite du propriétaire. Sauvegarde backups/20261007T011232Z. Concurrence détectée : une autre session avait déployé 5sursync:contact-map-20261007 en production à 00:33 (carte Contact, rapport documentation/qa/contact-map/deployment-report.json, section non reportée dans ETAT). Vérifié avant bascule : admin-clients-20261007 contient les mêmes contact-details.ts et ContactMap.tsx (SHA-256 identiques), donc rien n'est écrasé. compose.production.yaml : contact-map-20261007 -> admin-clients-20261007 ; préproduction : admin-clients-preprod-20261007 retaguée local. Seules app-production puis app recréées, aucune migration, Nginx/DNS/firewall inchangés.
Après bascule : deux instances healthy, zéro erreur dans les journaux ; HTTPS TLS vérifié sur les deux domaines : 11 pages/connexion/santé 200, six chemins admin/CMS/team 401, /support 307, contact invalide 400, carte présente sur /contact.
Retour arrière production : image 5sursync:contact-map-20261007 dans compose.production.yaml puis `docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production` ; préproduction : retaguer 5sursync:admin-ux-preprod-20261006 en local puis `docker compose up -d --no-deps app`. Aucune donnée à restaurer.


Interventions Afrique — DÉPLOYÉ 2026-10-07 09:57 UTC
https://5sursync.com/#interventions-afrique
Image : 5sursync:africa-map-20261007 (sha256:c5dc758ea8fcab3a8bc62742b038fb7f9c68841521af831b6d56fa0e9641291e).
Six pays confirmés et distingués : Sénégal, Côte d’Ivoire, Guinée, Guinée-Bissau, République démocratique du Congo, République du Congo (Congo-Brazzaville).
SVG natif 32 Ko, géométrie Natural Earth 110m domaine public, projection Mercator ; source et SHA dans geometry-provenance.json. Aucun service cartographique ni dépendance ajoutée au site.
Après les réalisations, marine/turquoise, liste accessible synchronisée, survol/focus/clavier/clic/toucher, apparition finie et reduced-motion. 92 contrôles Chrome publics réussis ; captures public-desktop.png et public-mobile.png inspectées. 10 tests réussis, 9 PG ignorés ; build/types/22 routes passent. Aucun contact valide ni mail de QA.
Onze clés ajoutées idempotemment aux textes CMS de l’accueil, aucune valeur existante écrasée (empreinte avant/après : cedfc92534d9f59130404d24b899ccd3). Missions facultatives : africa-mission-SEN/CIV/GIN/GNB/COD/COG. Dans Administration > Site web > Pages > Accueil, ouvrir Mission — pays (facultatif), saisir le texte puis sauvegarder. Les missions vides n’affichent rien ; les blancs sont normalisés pour compatibilité de validation avec l’ancien CMS préproduction. Aucune migration.
Production seule recréée. Préproduction et PostgreSQL healthy, worker SMTP production actif sans erreur, montage SMTP read-only, auth Payload sans mail inchangée. Carte Contact exacte conservée ; neuf vidéos/source/administration récente conservées par comparaison de 166 fichiers avant patch, puis vérification avant déploiement. Nginx/DNS/secrets/INA inchangés.
Sauvegarde : backups/20261007T093449Z-africa-map (source et pg_dump vérifié, données gardées sur VPS). Retour arrière : image 5sursync:before-africa-20261007 dans compose.production.yaml puis docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production. Les nouvelles clés CMS peuvent rester inertes ; ne pas restaurer toute la DB et écraser les changements intervenus depuis.
Build borné 2 Go/1 CPU. Dockerfile principal inchangé ; helper preparation/africa-map/runtime.Dockerfile réutilise les dépendances de l’image sauvegardée, manifest package identique, et reconstruit les compilés/source. Concurrence Claude contrôlée par hashes, aucun changement concurrent détecté.
Limites : mobile Chrome émulé 390px, pas appareil physique ; géométrie généralisée 110m (petites îles absentes possibles). Missions futures non encore fournies ; parcours CMS authentifié non testé dans un compte réel.


## Audit complet site / SEO / conversion — 2026-10-07
Audit en lecture seule (5 sous-agents + contre-vérification HTTPS), aucun changement de code, d'image, de Nginx ni de données. Rapport : documentation/audit-2026-10-07.md. Constats confirmés en direct : meta description identique sur toutes les pages, aucun Open Graph/JSON-LD, pas de HSTS/CSP, PNG 1,5–1,7 Mo sur /reseaux-cloud et /realisations avec cache max-age=0 sur /assets, mentions légales et confidentialité 404, http:// sans réponse depuis le VPS. Non mesurés : Core Web Vitals (pas de Lighthouse), npm audit (npm absent de l'hôte), fiche Google Business Profile.

## Corrections issues de l'audit — 2026-10-07 — DÉPLOYÉ EN PRODUCTION par le propriétaire
Bascule refusée à l'agent par le contrôle de permissions, puis effectuée par le propriétaire lui-même : compose.production.yaml -> 5sursync:audit-fixes-20261007. Le propriétaire a aussi modifié le titre CMS de l'accueil (« … | 5/Sync IT | Dakar »).
Vérifié en HTTPS public après bascule : app-production healthy, zéro ligne d'erreur dans ses journaux ; 10 pages 200 ; nouvelle description, og:image, JSON-LD et favicon v=20261007 présents ; HSTS et Permissions-Policy servis ; WebP 123 Ko, image OG et favicon 20 Ko en 200 ; cache 7 jours sur /assets ; /support 307, API tickets 401, /admin 401 ; préprod 200 (non modifiée).
Modifications source (aucune migration, aucune donnée CMS modifiée, Nginx/DNS inchangés) :
- src/lib/page-meta.ts (nouveau) : meta description propre à chacune des neuf pages (surchargeable par une clé CMS « meta-description » si elle est ajoutée), Open Graph/Twitter avec image de partage public/assets/og-5sursync.jpg (1200×630, logo), titre dédoublonné (« À propos de 5/Sync IT »). Utilisé par les neuf page.tsx.
- src/components/OrganizationJsonLd.tsx (nouveau) + layout : JSON-LD ProfessionalService + WebSite, construit uniquement depuis les coordonnées CMS, les réseaux sociaux CMS et les six pays confirmés.
- next.config.mjs : Strict-Transport-Security max-age=31536000 (sans includeSubDomains), Permissions-Policy, Cache-Control 7 jours sur /assets/*.
- globals.css : contrastes AA (--muted #4a6482, survol #007a77, bordures champs et bouton Menu #6f86a0).
- Images : 03_Reseaux-cloud et 07_Realisations en WebP mêmes dimensions (1,50/1,66 Mo -> 123/109 Ko) avec lazy-loading ; logos mairie-dakar 293->14 Ko, harmattan 51->17 Ko, ina-guinee 55->9 Ko, logo-horizontal 40->10 Ko (520 px), favicon 629->20 Ko (192 px, ?v=20261007). PNG d'origine conservés dans public/assets.
Image : 5sursync:audit-fixes-20261007 (sha256:17cfaa27f39c…), construite avec preparation/africa-map/runtime.Dockerfile basé sur africa-map-20261007, build Next + TypeScript OK. Tests : 10 réussis, 9 ignorés (PG). Conteneur de test temporaire (127.0.0.1:3199, SMTP désactivé, supprimé ensuite) : 10 pages 200, descriptions distinctes, OG + JSON-LD sur 9 pages, en-têtes HSTS/Permissions-Policy, assets 200 avec cache 7 jours, /support 307, API tickets 401, 404, sitemap/robots 200, contact invalide 400.
Rollback préparé : tag 5sursync:before-audit-fixes-20261007 (= africa-map-20261007). Sources avant : backups/source-before-audit-fixes-20261007T114953Z.tar.gz.
Pour déployer (propriétaire) : image 5sursync:audit-fixes-20261007 dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`.
Non traité (décision ou information du propriétaire requise) : mentions légales/confidentialité (NINEA/RCCM), sauvegardes hors site, alerte certificat, captcha, server_tokens/brotli Nginx, page 404 de marque, titres CMS (ex. accueil sans « Dakar »).

## Mentions légales et politique de confidentialité — 2026-10-07 — DÉPLOYÉ par le propriétaire (production sur 5sursync:legal-20261007, constaté le 7/10 à 23:20 UTC)
Informations fournies par le propriétaire : 5/Sync IT, SUARL au capital de 1 000 000 FCFA, RCCM SN.DKR.2016.A.3514, NINEA 005812351 1R1, directeur de la publication Youssoupha Diop (gérant), contacts conservés 3 ans, pas de récépissé CDP connu (non affiché ; déclaration à régulariser). Hébergeur identifié par whois de l'IP : Contabo GmbH, Munich.
Ajouts : src/lib/legal.ts, pages /mentions-legales et /politique-de-confidentialite (statiques, coordonnées lues du CMS), liens dans la barre basse du pied de page et sous le formulaire de contact, deux URL ajoutées au sitemap (11), styles .legal-page/.footer-legal. La politique décrit uniquement ce que fait le code : champs du formulaire, notification vers la messagerie, comptes Support sur invitation, compteurs anti-abus IP hachée de 15 min, cookie de session 1 h, aucune mesure d'audience, carte Google Maps intégrée sur /contact.
Correction de localité : la fiche Google Business gérée par le propriétaire indique Immeuble EHOD, Almadie 2, Keur Massar ; les coordonnées de la carte (−17,28) le confirment. JSON-LD addressLocality Keur Massar / addressRegion Dakar, description Contact et siège légal corrigés. Recommandation « Almadies » de l'audit retirée (erreur).
Image 5sursync:legal-20261007 (sha256:d5a76a0145fb…), base audit-fixes-20261007 ; un premier build tué par manque de mémoire (code 137, plafond 2 Go), le second a réussi. Tests 10 réussis / 9 ignorés. Conteneur temporaire (SMTP désactivé, supprimé) : 12 pages 200, contenu légal exact, liens pied de page et formulaire, sitemap 11 URL, JSON-LD Keur Massar.
Déploiement : image 5sursync:legal-20261007 dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`. Retour arrière : 5sursync:audit-fixes-20261007.
Incohérence à trancher par le propriétaire : la fiche Google affiche le téléphone 76 589 71 61, absent du site (77 097 29 08, 33 805 79 09, 76 881 30 39).

## Logo de connexion /admin avec flux de données — 2026-10-08 — CONSTRUIT ET TESTÉ, À DÉPLOYER PAR LE PROPRIÉTAIRE
Remplace la version vidéo du 7/10, déployée par le propriétaire (production constatée sur 5sursync:admin-logo-20261007, sha256:909ac96baaa2…, le 8/10) : le propriétaire a refusé le halo ovale et demandé le logo seul, avec une animation sur son périmètre évoquant des données qui circulent. Les fichiers vidéo encodés et AnimatedLogo.tsx ont été supprimés ; source/logo_animé_*.mp4 conservés intacts.
Code : Brand.tsx#Logo = logo PNG transparent public/assets/logo-horizontal-transparent.png (977×204, 34 Ko, généré depuis le JPEG 1012 px d'origine : blanc rendu transparent, couleurs dé-mélangées) + SVG décoratif (aria-hidden) : fil fin à coins arrondis et trois « paquets » (deux turquoise lumineux en sens opposés, un marine discret) animés en CSS pur via stroke-dashoffset (rect pathLength=100). Aucune dépendance JS. prefers-reduced-motion : paquets masqués, fil fixe. custom.css uniquement.
Build : la mémoire libre de l'hôte est tombée à ~2 Go (dockerd 1,4 Go, VS Code, autres sessions) ; deux builds tués (137) pendant la vérification TypeScript intégrée de Next. Build réussi avec preparation/admin-logo-runtime.Dockerfile (copie de travail : typescript.ignoreBuildErrors injecté dans l'étape de build seulement, heap 1536 Mo ; le dépôt n'est pas modifié), puis `tsc --noEmit` lancé séparément dans l'image (2 Go, sans réseau) : exit 0. Tests : 13 réussis, 9 ignorés (PG).
Image 5sursync:admin-logo-20261008 (sha256:4fad4a822d33…), base legal-20261007. Conteneur temporaire (SMTP désactivé, supprimé) + Chromium local : animation active desktop 1366 px et mobile 390 px, paquets masqués en reduced-motion, pages publiques 200, PNG 200, zéro erreur. Captures documentation/qa/admin-logo/.
Déploiement : remplacer 5sursync:admin-logo-20261007 par 5sursync:admin-logo-20261008 dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`. Retour arrière : admin-logo-20261007 (vidéo) ou legal-20261007 (logo d'origine). Les fichiers vidéo restent servis par l'image actuelle jusqu'à la bascule.


## CRM clients /crm — 2026-10-08 — CONSTRUIT ET TESTÉ, NON DÉPLOYÉ, NON MIGRÉ
Demande du propriétaire : « développe un CRM complet de gestion clients dans /crm ». Détails, règles et procédure : documentation/crm.md.
Fonctions : tableau de bord (clients, prospects, pipeline ouvert et pondéré, gains du mois, tâches en retard), entreprises (champs commerciaux ajoutés à la collection clients existante), contacts, opportunités en pipeline à 4 étapes plus gagnée/perdue, activités et tâches, conversion des demandes du formulaire Contact en prospects, exports CSV. Accès réservé aux admins Payload ; collections CRM visibles aussi dans /admin (groupe CRM, retiré le 2026-10-09, voir plus bas) ; lien « Ouvrir le CRM » ajouté au tableau de bord admin ; /crm ajouté au robots.txt.
Schéma : migration additive src/migrations/20261008_090825_crm (3 tables crm_*, colonnes sur clients, index). NON appliquée sur la base partagée prod/préprod : elle demande l’accord explicite du propriétaire et une sauvegarde préalable. Les images en ligne restent compatibles avec le schéma migré. La ligne parasite générée par Payload (pages_copy.value DROP NOT NULL) a été retirée ; types pages_copy.value conservés (string).
Tests (base jetable syncit_test, réseau interne, fixtures uniquement) : typecheck 0 erreur ; 13 tests unitaires réussis, 9 ignorés ; build Next avec 11 routes /crm ; tests/crm-run.sh + crm-e2e.py 50/50 ; tests/admin-ux-run.sh 28/29, identique sur l’image en production (échec ancien du test du logo de connexion). Preuves : documentation/qa/crm/. tests/integration.ts : stage "client" ajouté aux deux fixtures (type désormais requis).
Images : 5sursync:crm-preprod-20261008 (sha256:a3fbcd9d1f3b…) et 5sursync:crm-20261008 (production, sha256:d30913e32302…). Rien n’a été basculé : production toujours sur admin-logo-20261007, préproduction sur local. Nginx, DNS, firewall, secrets, INA et SMTP inchangés. Aucun compte réel ni donnée client créés.
Sécurité : /crm n’est pas encore derrière la Basic Auth Nginx (seulement la session admin Payload : anonyme redirigé vers /admin/login, compte client 404). Recommandé avant mise en ligne : ajouter crm à la location protégée des deux vhosts (crm.md, étape 4).
Incident de session : après une coupure, deux sessions Claude ont écrit en parallèle dans les mêmes fichiers CRM pendant quelques minutes (vers 09:06–09:09 UTC). Elles ont été coordonnées, puis le propriétaire a choisi de poursuivre avec une seule ; l’autre processus s’est arrêté. L’état final a été entièrement revérifié (typecheck, build, bancs).
Limites : aucun email ni rappel automatique, pas de devis ni facturation, pas de glisser-déposer dans le pipeline, pas de modification d’une activité, champs saisis perdus si le serveur refuse un formulaire.

### Mise en ligne CRM — 2026-10-08 10:06 UTC — BLOQUÉE À LA MIGRATION, à terminer par le propriétaire
Accord du propriétaire reçu (« mets en ligne »). Constaté avant d’agir : la production tournait déjà sur 5sursync:admin-logo-20261008 (sha256:4fad4a822d33…, release logo d’une autre session, démarrée vers 10:03). Son src/ est identique à l’arbre de travail, donc elle contient déjà le code CRM. Il en va de même pour crm-20261008 et crm-preprod-20261008 : les trois images ont le même code (logo et CRM), aucune n’écrase l’autre.
Conséquence : la production exécute le code CRM SANS la migration 20261008_090825_crm (payload_migrations s’arrête à contact_notifications, aucune table crm_*). Pages publiques, /contact, /support/connexion et /api/health répondent 200, sans erreur dans les journaux à 10:04. En revanche, toute requête Payload sur clients (admin Clients, connexion d’un compte Support qui charge son entreprise, /crm) doit échouer tant que la colonne clients.stage n’existe pas. Non testé avec un compte réel.
Fait : sauvegarde backups/20261008T100538Z (database.dump lisible, 29 tables de données ; files.tar.gz ; compose.yaml) ; tag de retour arrière 5sursync:before-crm-preprod-20261008 (= local).
Refusé à l’agent par le contrôle de permissions : la migration sur la base partagée. Par conséquent non faits : bascule préproduction, bascule production et ajout de /crm à la Basic Auth Nginx. Commandes à lancer par le propriétaire : section « Mise en service » de documentation/crm.md, et rapport de session.

## CRM v2 — devis/factures, rappels email, glisser-déposer, modification d’activité, recherche — 2026-10-08 — CONSTRUIT ET TESTÉ, NON DÉPLOYÉ, NON MIGRÉ
Constaté avant : le propriétaire a appliqué la migration 20261008_090825_crm (payload_migrations) ; préproduction sur crm-preprod-20261008 ; production sur admin-logo-20261008 (même code CRM v1), donc fonctionnelle.
Ajouts : collection crm-documents (devis DEV-AAAA-NNNN / factures FAC-AAAA-NNNN, numérotés à l’émission, TVA 18 % par défaut, facture émise figée, devis accepté → opportunité gagnée, conversion devis → facture, aperçu A4 imprimable/PDF avec RCCM et NINEA) ; rappels email des tâches (30 min avant, récapitulatif quotidien à 7 h, registre app_crm_reminders / app_crm_digests sur le modèle des notifications de contact, aucun renvoi, état SMTP réel affiché) ; glisser-déposer du pipeline (zones Gagnée/Perdue) ; page /crm/activites/[id] ; recherche sans accents et tolérante aux fautes (search_text + pg_trgm, seuil 0,45 mesuré) et recherche globale /crm/recherche. Détails : documentation/crm.md.
Migration v2 20261008_102236_crm_v2 (additive, crée l’extension pg_trgm ; syncit est superutilisateur). Testée sur base jetable : up depuis v1, down, puis up avec données existantes (search_text rempli, faute « minstere » trouvée). Défaut corrigé : les down générés par Payload échouaient (DROP CONSTRAINT après DROP TABLE CASCADE) → IF EXISTS dans les deux migrations CRM (fichiers down seulement).
Bug trouvé par les tests et corrigé : la clé de rappel perdait les millisecondes de l’échéance (String(Date)), ce qui aurait bloqué le worker en boucle sur une violation de clé.
Rappels : désactivés tant que CRM_REMINDERS_ENABLED=true n’est pas ajouté à app-production (en plus de SMTP_ENABLED et APP_ORIGIN production). La préproduction partage la base mais ne réserve jamais de rappel. Aucun email envoyé pendant les tests (SMTP simulé, base jetable).
Tests : typecheck 0 ; unitaires 16 réussis, 9 ignorés ; tests/crm-reminders.ts 8/8 sur PostgreSQL jetable (rappel unique, nouvelle échéance, tâches trop anciennes ou sans rappel ignorées, récapitulatif unique, envoi interrompu → uncertain sans renvoi) ; build Next ; tests/crm-run.sh + crm-e2e.py 71/71 (glisser-déposer, Perdue, modification d’activité, recherche sans accent et avec faute, devis → envoyé → accepté → facture → émise → payée, totaux, numéros, verrouillage, aperçu et impression, export) ; tests/admin-ux-run.sh 28/29, identique à la référence (échec ancien du test du logo). Preuves : documentation/qa/crm-v2/.
Images : 5sursync:crm-v2-preprod-20261008 et 5sursync:crm-v2-20261008 (production). Rien n’a été basculé ni migré ; Nginx, DNS, firewall, secrets et INA inchangés. Commandes de mise en service : crm.md, section « Mise en service v2 ».
Manuel de formation (Claude Docs) mis à jour : nouvelle section 8 Devis et factures, rappels, modification, glisser-déposer, recherche, exercices sans numérotation réelle, limites.

## CRM v3 — avoirs, acomptes, paiements partiels, TVA par ligne, envoi des documents par email, glisser-déposer tactile/clavier, recherche étendue — 2026-10-08 — CONSTRUIT ET TESTÉ, NON DÉPLOYÉ, NON MIGRÉ
Constaté avant : migration v2 appliquée par le propriétaire ; préproduction toujours sur crm-preprod-20261008 (v1), production sur admin-logo-20261008 (v1). Les deux restent compatibles avec v2 et v3.
Ajouts (détails dans crm.md, section v3) :
- avoirs AV-AAAA-NNNN plafonnés au montant encore créditable ;
- facture d’acompte (pourcentage, une ligne par taux) et facture de solde déduisant les acomptes émis ;
- paiements partiels avec reste dû et passage automatique à « Soldée » ; trop-perçu refusé ; annulation impossible après paiement ou avoir ;
- TVA par ligne détaillée par taux ;
- PDF généré côté serveur (pdf-lib 1.17.1, téléchargement) et envoi du document numéroté par email depuis no-reply@5sursync.com (Reply-To et copie cachée à l’expéditeur, registre app_crm_document_mails avec l’état SMTP réel, aucun renvoi) ;
- poignée de glisser-déposer au doigt, au stylet et à la souris, et déplacement au clavier avec annonces pour lecteur d’écran ;
- recherche dans les notes et les activités.
Interrupteur unique des emails du CRM : CRM_EMAIL_ENABLED=true (remplace CRM_REMINDERS_ENABLED, jamais déployé). Sans lui, aucun email ne part ; la préproduction n’envoie jamais.
Dépendances : pdf-lib 1.17.1 ajouté ; nodemailer 9.1.1 → 10.0.16 (avis de sécurité, dont 2 « high » de déni de service sur l’analyse des adresses ; seul changement incompatible : Node ≥ 20). npm audit --omit=dev : 0 vulnérabilité (1 « high » avant). Le module sert aussi aux notifications de contact en production : à vérifier après bascule.
Migration v3 20261008_112152_crm_v3 (additive) : testée up avec des données v2 (facture payée conservée à reste dû 0 grâce à une ligne de paiement ajoutée), down, puis up. Le down supprime les avoirs : sauvegarde avant tout retour arrière.
Défauts trouvés par les tests et corrigés : action refusée sur un document qui renvoyait à la liste au lieu du document ; facture imprimée sans la ligne « Avoirs déduits » (total, payé et reste incohérents pour le lecteur) ; colonnes TVA et Total qui se chevauchaient dans le PDF.
Tests : typecheck 0 ; unitaires 20 réussis, 9 ignorés (dont TVA par taux, acomptes, solde, PDF multipage valide, registre des emails, nodemailer 10 contre un serveur SMTP local jetable avec PDF joint et copie cachée non transmise dans les en-têtes) ; tests/crm-reminders.ts 8/8 ; crm-e2e.py 91/91 (devis à deux taux → acompte 30 % → payé → solde avec déduction → paiement partiel → trop-perçu refusé → annulation refusée → avoir au-dessus du plafond refusé → avoir partiel → soldée ; PDF ; glisser natif, clavier et poignée ; recherche dans les notes et les activités) ; admin-ux 28/29 (échec ancien du logo). PDF rendu en image par pdftoppm (conteneur Debian jetable) et inspecté. Preuves : documentation/qa/crm-v3/.
Images : 5sursync:crm-v3-preprod-20261008 (sha256:2be732e7ca2c…) et 5sursync:crm-v3-20261008 (production, sha256:287d390940ed…). Rien n’a été basculé ni migré ; Nginx, DNS, firewall, secrets et INA inchangés ; aucun email envoyé.
Manuel de formation mis à jour (section 8 réécrite, glisser-déposer, recherche, FAQ, limites).

### Vérification après mise en service v3 par le propriétaire — 2026-10-08 (agent, lecture seule)
Fait par le propriétaire : migration 20261008_112152_crm_v3 appliquée (payload_migrations : crm, crm_v2, crm_v3) ; préproduction recréée sur 5sursync:local = crm-v3-preprod-20261008 (sha256:2be732e7ca2c…), healthy, zéro erreur dans le journal ; Nginx : `crm` ajouté à la location Basic Auth des deux vhosts (fichiers du 8/10 10:07), relais SNI stream inchangé depuis le 6/10.
HTTPS préproduction (certificat vérifié, résolution forcée vers 185.187.169.152 car le cache DNS local du VPS échoue à nouveau) : /, /contact, /realisations, /support/connexion, /api/health 200 ; /crm, /crm/documents, /crm/export/clients, /admin, /api/cms/crm-documents 401 (Basic Auth) ; contact invalide 400. Dans le conteneur : /crm anonyme 307 vers /admin/login. Production : / et /api/health 200, /crm 401.
Relais INA : direction, mobile et auth.ina.gn répondent en TLS via 185.187.169.152:443, même certificat (CN direction.ina.gn, SHA-256 1C:05:D8:A2…:D0:82, expiration 16/12/2026).
NON FAIT : la production tourne toujours sur 5sursync:admin-logo-20261008 (code CRM v1, compatible avec le schéma v3), sans CRM_EMAIL_ENABLED. Les fonctions v2/v3 (devis et factures, rappels, envoi par email, glisser-déposer tactile, recherche étendue) ne sont donc disponibles qu’en préproduction, où aucun email ne part par conception. Données de documents : 0.

## Logo Douane Sénégalaise invisible — 2026-10-08 — CORRIGÉ DANS LE CODE, À DÉPLOYER
Constat : le projet « Douane Sénégalaise » (id 8) pointe sur le média id 1 `Douanes_sénégalaises.jpg`, présent dans le volume public_media, mais /media/Douanes_s%C3%A9n%C3%A9galaises.jpg répond 404 en production et en préproduction. Le site affiche donc le texte alternatif. Cause : src/app/(site)/media/[filename]/route.ts n’acceptait que [\w.-], sans lettres accentuées.
Correctif : isMediaFilename (src/lib/showcase.ts) accepte les lettres de toutes les langues, chiffres, espace, _ . - ; refuse barre oblique, antislash, `..`, nom commençant par un point, plus de 200 caractères ; nom normalisé en NFC. Toujours limité aux fichiers déclarés dans la collection media avec un type PNG/JPEG/WebP. Aucune donnée ni migration touchée.
Tests : unitaires 21 réussis (dont noms acceptés et refusés) ; crm-e2e 95/95 sur base jetable (envoi CMS de « Douanes_sénégalaises.jpg » 201, /media en NFC et NFD 200 image/jpeg, traversée refusée). Preuves documentation/qa/crm-v3b/.
Images (CRM v3 + correctif) : 5sursync:crm-v3b-preprod-20261008 et 5sursync:crm-v3b-20261008, à utiliser à la place de crm-v3-*. Non déployées.
Contournement immédiat sans déploiement : renvoyer le logo dans la médiathèque sous un nom sans accent (ex. douane-senegal.jpg) et le choisir sur le projet.

## Import des prospects contactés le 8 octobre — 2026-10-08 14:25 UTC — FAIT EN PRODUCTION (base partagée)
Source : imports/crm_prospects_2026-10-08.json (déposé par le propriétaire, SHA-256 04da10ee…78b37e9), 27 organisations contactées par email depuis ydiop@5sursync.com le 8/10 entre 09:05 et 09:59 UTC ; 3 brouillons non envoyés exclus (Clinique de la Madeleine, SENEGINDIA, SODIPHARM). Accord explicite du propriétaire (option A, puis confirmation après simulation) ; règle d'autorisation ajoutée par lui dans ~/.claude/settings.json (docker exec sur postgres et app-production).
Méthode : SQL direct dans 5sursync-postgres-1 (l'accès à l'environnement du conteneur applicatif a été refusé par le contrôle de permissions), généré par imports/build_crm_import_sql.py, qui reproduit Payload : search_text = normalizeSearch de src/lib/crm.ts, activité email terminée (done_at = created_at = heure de la copie Outlook), remind = false, auteur et responsable = admin ydiop. Idempotent : entreprise reconnue par nom, email ou site (seuls les champs vides seraient complétés) ; activité reconnue par l'identifiant Outlook.
Résultat : 27 entreprises « Prospect », origine « Prospection directe » (aucun doublon : la base ne contenait que 5sursync IT) ; 27 activités email ; 0 contact, 0 opportunité, 0 tâche, 0 rappel programmé, aucun email envoyé. Remise : 5 échecs avec code SMTP (SEDIMA 550 5.4.1, GMD 550 5.7.133, LAFIMEX 550 5.1.1, CONFEXLO'S 554 5.7.1 boîte pleine, CAURIE 550 5.1.1), 2 accusés automatiques (SCL, Supdeco ; pas un intérêt commercial), 20 inconnues (absence de rejet ≠ remise). Notes de fiche : priorité, fonction visée, constats publics et sources, piste « hypothèse à qualifier », remarques de recherche datées d'avant l'envoi. EYDON : ville « Dakar (réseau régional) », 8 implantations dans les notes (limite 80 caractères).
Vérifié : simulation complète en transaction annulée (base inchangée ensuite) ; après import 28 entreprises (1 client, 27 prospects), 27 activités terminées sur 27 entreprises, search_text rempli partout, recherche sans accent OK ; relance en simulation : tout reconnu « existant / activité déjà présente », totaux inchangés. HTTPS : / 200, /crm 401 (Basic Auth). Rendu dans /crm non vu par l'agent : à contrôler par le propriétaire. Les identifiants d'entreprise commencent à 29 (séquence consommée par la simulation, sans conséquence).
Sauvegarde avant import : backups/20261008T142447Z-avant-import-crm/db.dump (pg_dump -Fc, mode 600). Retour arrière ciblé : supprimer les activités puis les entreprises créées (ids 29 à 55, stage prospect, source prospection) ou restaurer ce dump.

## Import CSV des entreprises dans /crm — 2026-10-08 — DÉPLOYÉ par le propriétaire (production et préproduction, 16:08 UTC)
Demande du propriétaire : importer depuis un fichier CSV. Page /crm/clients/importer (bouton « Importer (CSV) ») : vérification ligne par ligne sans écriture, puis import en une transaction (tout ou rien), doublons ignorés ou complétés (champs vides seulement), modèle /crm/export/modele-clients. Détail : documentation/crm.md, section « Import CSV d'entreprises ». Schéma inchangé : aucune migration. Refactorisation : clientSchema et ses aides déplacés de actions.ts vers src/lib/crm-schema.ts (même comportement ; message email désormais « Email invalide. » en français).
Tests (conteneurs jetables, sans réseau ni données réelles) : typecheck 0 ; unitaires 29 réussis, 9 ignorés (dont 8 nouveaux : CSV, encodages UTF-8/Windows-1252, colonnes, validation, doublons, complétion, aller-retour export→import, limites) ; crm-e2e 111/111 sur l'image finale (dont 16 contrôles d'import : page et modèle refusés en anonyme, aperçu 2/0/1/2 sans écriture, import et message, valeurs stockées, responsable, recherche, réimport Windows-1252 en complétion sans doublon, troisième passage sans rien à faire, mobile 390 px sans débordement). Journal applicatif : les 2 mêmes refus anonymes attendus que lors des campagnes précédentes. Preuves : documentation/qa/crm-import/.
Images (code CRM v3 + correctif logo Douane v3b + import CSV) : 5sursync:crm-import-preprod-20261008 (sha256:f6e3ec8a9f2d…) et 5sursync:crm-import-20261008 (production, SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1, sha256:67c015f1eb6a…).
NON FAIT : bascule préproduction refusée à l'agent par le contrôle de permissions (« Production Deploy », base partagée) ; production non tentée. La production tourne toujours sur 5sursync:admin-logo-20261008 (CRM v1, sans import CSV). Basculer la production sur crm-import-20261008 y apporte aussi les fonctions CRM v2/v3 (devis, factures, avoirs, recherche étendue) et nodemailer 10 ; schéma v3 déjà migré ; CRM_EMAIL_ENABLED absent, donc rappels et envoi de documents restent désactivés ; vérifier ensuite une notification de contact.

### Vérification après bascule par le propriétaire — 2026-10-08 16:10 UTC (agent, lecture seule)
Production : 5sursync-app-production-1 sur 5sursync:crm-import-20261008 (67c015f1eb6a), compose.production.yaml à jour ; préproduction : 5sursync:local = crm-import-preprod-20261008 (f6e3ec8a9f2d), étiquette de retour arrière pre-crm-import-preprod préparée par le propriétaire selon la procédure. Deux instances healthy, zéro ligne error/warn dans leurs journaux depuis la bascule.
HTTPS (certificat vérifié, résolution forcée 185.187.169.152) sur 5sursync.com et preprod : /, /contact, /realisations, /support/connexion, /api/health 200 ; /crm, /crm/clients/importer, /crm/export/modele-clients, /admin 401 (Basic Auth) ; /support 307 ; contact invalide 400. Dans le conteneur production, les trois chemins CRM anonymes répondent 307 vers /admin/login. Relais INA direction, mobile, auth : même empreinte 1C:05:D8:A2…. Données : 27 prospects + 1 client, 27 activités, 9 migrations (aucune ajoutée).
La production dispose désormais aussi des fonctions CRM v2/v3 (devis, factures, avoirs, recherche étendue) et de nodemailer 10 ; CRM_EMAIL_ENABLED absent (rappels et envoi de documents désactivés). Non vérifié par l'agent : rendu de la page d'import dans le navigateur du propriétaire et notification email d'un vrai message Contact (aucun envoi fait par l'agent).
Retour arrière : production -> admin-logo-20261008 dans compose.production.yaml puis up -d --no-deps app-production ; préproduction -> retag pre-crm-import-preprod en local puis up -d --no-deps app.

## Bouton « Ouvrir WhatsApp » dans /crm — 2026-10-08 — CONSTRUIT ET TESTÉ, NON DÉPLOYÉ
Demande du propriétaire : contact manuel d’un prospect ou client par WhatsApp depuis les fiches entreprise et contact. Lien `https://wa.me/<chiffres>` en nouvel onglet ; aucun envoi automatique, message prérempli, API, IA ni synchronisation ; le clic n’enregistre rien. Détail : crm.md, section « Bouton Ouvrir WhatsApp ».
Aucun champ ajouté, aucune migration, aucune donnée lue ou modifiée en base réelle : réutilise `phone` et `notes` (numéro « indiqué WhatsApp » = mention WhatsApp/WA dans son segment). Indicatif +221 ajouté seulement si pays = Sénégal et format sénégalais ; sinon jamais deviné.
Fichiers : nouveaux `src/lib/whatsapp.ts`, `src/components/crm/whatsapp.tsx`, `tests/whatsapp.test.ts` ; modifiés `src/app/(crm)/crm/clients/[id]/page.tsx` (bouton, `id="coordonnees"` sur le volet de modification), `src/app/(crm)/crm/contacts/[id]/page.tsx` (bouton, `id="modifier"`), `src/app/(crm)/crm.css` (styles `.crm-wa`), `tests/crm-e2e.py` (scénario WhatsApp, jeton admin renouvelé avant les créations).
Tests (conteneurs jetables, sans réseau ni données réelles) : typecheck 0 ; unitaires 36 réussis, 9 ignorés (PostgreSQL), 0 échec ; crm-e2e 133/133 (111 anciens + 22 WhatsApp : lien direct, nouvel onglet sans quitter la page ni perdre un formulaire en cours, choix au clavier sans présélection, confirmation exigée pour un numéro non indiqué, indicatif manquant non deviné, liens de correction, fiche contact, exports et nombre d’activités identiques avant/après, seules requêtes wa.me interceptées, 390 px sans débordement). Défaut d’affichage trouvé par capture et corrigé (nom et numéro collés). Journal applicatif : les 2 refus anonymes attendus. Preuves : documentation/qa/crm-whatsapp/.
Images : 5sursync:whatsapp-preprod-20261008 (sha256:f07840f61d73…) et 5sursync:whatsapp-20261008 (production, SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1, sha256:7b19869f1f96…). Même code que crm-import + WhatsApp.
NON FAIT : aucune bascule. Production toujours sur crm-import-20261008, préproduction sur 5sursync:local (crm-import-preprod). Schéma inchangé, donc bascule sans migration :
- préproduction : `sudo docker tag 5sursync:local 5sursync:pre-whatsapp-preprod && sudo docker tag 5sursync:whatsapp-preprod-20261008 5sursync:local && sudo docker compose up -d --no-deps app` ;
- production : image `5sursync:whatsapp-20261008` dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`.
Retour arrière : retag pre-whatsapp-preprod en local / remettre crm-import-20261008. Manuel de formation (Claude Docs) non mis à jour pour cette fonction. Nginx, DNS, secrets, base et INA inchangés.

### Déploiement WhatsApp — 2026-10-08 (demande du propriétaire)
PRÉPRODUCTION DÉPLOYÉE par l'agent : `5sursync:local` = whatsapp-preprod-20261008 (sha256:f07840f61d73…), étiquette de retour arrière `5sursync:pre-whatsapp-preprod` (ancienne crm-import-preprod). Conteneur healthy, 0 ligne error/warn dans le journal. HTTPS (résolution forcée 185.187.169.152) : /, /contact, /realisations, /support/connexion, /api/health 200 ; /crm, /crm/clients, /admin 401 (Basic Auth) ; /support 307 ; dans le conteneur, /crm/clients/1 anonyme 307 vers /admin/login. Rendu du bouton dans le navigateur du propriétaire non vu par l'agent.
PRODUCTION NON DÉPLOYÉE : bascule refusée à l'agent par le contrôle de permissions (« Production Deploy »), commande refusée dans son ensemble, donc compose.production.yaml et app-production non touchés (toujours crm-import-20261008). Commande à lancer par le propriétaire :
`sed -i 's|image: 5sursync:crm-import-20261008|image: 5sursync:whatsapp-20261008|' compose.production.yaml && sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`
Retour arrière préproduction : `sudo docker tag 5sursync:pre-whatsapp-preprod 5sursync:local && sudo docker compose up -d --no-deps app`.
PRODUCTION DÉPLOYÉE ensuite par l'agent, après autorisation du propriétaire : compose.production.yaml → 5sursync:whatsapp-20261008 (sha256:7b19869f1f96…), copie de l'ancien fichier dans backups/compose.production.yaml.pre-whatsapp-20261008. Conteneur healthy, 0 ligne error/warn. HTTPS 5sursync.com : /, /contact, /realisations, /support/connexion, /api/health 200 ; /crm, /crm/clients, /admin 401 ; /support 307 ; dans le conteneur /crm/clients/1 anonyme 307 vers /admin/login. Relais INA direction, mobile, auth : même empreinte 1C:05:D8:A2…. Base, Nginx, DNS et secrets inchangés. Non vérifié par l'agent : rendu du bouton dans le navigateur du propriétaire (Basic Auth + session admin).
Retour arrière production : remettre `5sursync:crm-import-20261008` dans compose.production.yaml (ou restaurer la copie) puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`.

## Numéro WhatsApp du site — 2026-10-08 17:00 UTC — demande du propriétaire
Le propriétaire indique que le numéro WhatsApp est +221 76 881 30 39 (déjà affiché comme « mobile » dans les coordonnées). Lien WhatsApp du site (global CMS social-links, table social_links_links) : https://wa.me/221770972908 → https://wa.me/221768813039, par SQL dans une transaction, en vérifiant l'ancienne valeur (1 ligne). Sauvegarde avant : backups/20261008-avant-whatsapp-site/social_links.dump (pg_dump -Fc des tables social_links et social_links_links, mode 600). Aucun code modifié ; cache Next du lien : 5 minutes, sans hook de revalidation car la modification n'est pas passée par l'admin. Retour arrière : remettre l'ancienne URL dans /admin (Réseaux sociaux) ou restaurer le dump.
Fiche « 5sursync IT » du CRM (demandée aussi) : NON FAITE. Elle n'existe plus en base (214 entreprises, toutes « Prospect », aucune id < 29) ; l'agent ne l'a pas recréée sans accord. « Autre fiche du CRM » : en attente du nom de la fiche.
Vérifié 17:02 UTC en HTTPS : /, /contact, /realisations de 5sursync.com et preprod affichent uniquement wa.me/221768813039 (ancien lien absent).
Précision du propriétaire : la fiche « 5sursync IT » était un test, sa disparition est voulue ; ne pas la recréer. Aucune autre fiche CRM à modifier pour ce numéro sauf demande nommée.

## CRM ↔ boîte partagée Microsoft 365 contact@ — 2026-10-08 — PLAN PRÉSENTÉ, RIEN CRÉÉ
Inspection faite (lecture seule) : messagerie existante (SMTP no-reply mail.5sursync.com, registres app_*), secrets en fichiers Docker, admins sans rôles, activités sans lien email. Constat public : locataire Microsoft 365 géré 17ea5f54-f67a-4949-b5b9-92a78a9d4fe7, MX principal Exchange Online, MX secondaire mail.5sursync.com. Plan, droits exacts et étapes d'administration : documentation/microsoft365.md. Aucune application Entra, aucun certificat, aucun droit Exchange, aucun code : en attente de validation du propriétaire.
Ajustements après avis de Charlie (relayé par le propriétaire) intégrés au plan : deux applications, reprise 90 jours, isolation de la préproduction par schéma `crm_mail` et identifiant PostgreSQL `syncit_preprod` sans droit dessus (constat : prod et préprod partagent aujourd'hui l'identifiant superutilisateur `syncit`), aucun test d'envoi « censé échouer », liste de destinataires de recette imposée par le code, signature selon la charte (slogan du pied de page à confirmer), alerte d'expiration des certificats à J-30/14/7/1. Toujours rien de créé.
Corrections de Charlie intégrées (microsoft365.md §7 et §9) : slogan validé « Des solutions informatiques pour faire avancer votre entreprise. », logo à droite ; constat que prod et préprod partagent aussi payload_secret et les volumes private_files/public_media, et que PUBLIC a CONNECT sur la base → interdire seulement un schéma est insuffisant (option A écartée) ; option B recommandée : base, identifiant non superutilisateur, secret et volumes de préproduction séparés, contenu public seul, aucune donnée client ; retour arrière = désactivation de la fonction, restrictions conservées ; crm_mail sans corps ni extrait. Rien de créé.
Validation du propriétaire (8/10) : option B, assistante en brouillon, étapes Microsoft par Charlie (sinon le propriétaire), droits validés.
FAIT 17:29–17:33 UTC : sauvegarde backups/20261008T172946Z ; isolation de la préproduction (rôle et base syncit_preprod non superutilisateur, REVOKE CONNECT FROM PUBLIC sur syncit et postgres, payload_secret et volumes propres, contenu public seul copié, 0 admin, 0 donnée client) ; preuves : connexion à syncit refusée depuis la préproduction, recette HTTPS OK, production inchangée. Deux certificats Entra générés (clés dans secrets/, certificats publics dans deployment/m365/, expiration 08/10/2027). Détail : microsoft365.md §4 et §7. ACTION PROPRIÉTAIRE : recréer son compte admin de préproduction par le tunnel.

## Messagerie contact@ dans le CRM — 2026-10-08 — CONSTRUIT ET TESTÉ ; PRÉPRODUCTION DÉPLOYÉE (inactive par conception) ; PRODUCTION NON DÉPLOYÉE ; MICROSOFT NON CONFIGURÉ
Code : src/lib/mail/*, pages /crm/messagerie (liste, À attribuer, brouillons, envois, état et diagnostic, message, version HTML isolée par CSP sandbox, pièces jointes en téléchargement), carte « Emails contact@ » des fiches, champ admins.mailAccess (aucun/lecture/brouillons/envoi), migration 20261008_173554_crm_mail (colonne admins.mail_access, droit envoi à ydiop@5sursync.com, schéma crm_mail fermé à PUBLIC ; aucun corps ni extrait stocké). Règle ajoutée : un administrateur ne modifie que son propre compte sauf droit « envoi ». Signature validée (slogan, logo à droite, WhatsApp 76 881 30 39) ajoutée une seule fois. Détail : microsoft365.md §11–15.
Tests (faux Graph local, aucun appel Microsoft, aucun email réel) : typecheck 0 ; unitaires 45 réussis / 9 ignorés ; intégration 56/56 ; navigateur 39/39 ; non-régression CRM 133/133 et admin 28/29 (échec ancien du logo). Défauts trouvés et corrigés pendant les tests : état partagé entre requêtes dans les actions, EXECUTE PUBLIC non révocable par schéma (protection par absence d'USAGE, documentée et testée), libellé « production uniquement » trompeur en production. Preuves : documentation/qa/crm-mail/.
Images : 5sursync:mail-preprod-20261008 (sha256:3ef04489a341…) et 5sursync:mail-20261008 (production, sha256:0584581a4f22…).
Préproduction : migrée (syncit_preprod, 10 migrations) et basculée à 18:35 UTC (retour : 5sursync:pre-mail-preprod) ; HTTPS /, /contact, /realisations, /api/health 200 ; /crm, /crm/messagerie, /admin 401 ; anonyme 307 vers la connexion ; aucune variable MAIL_ ni certificat ; 0 erreur.
NON FAIT : production (base syncit toujours à 9 migrations, image whatsapp-20261008) ; étapes Entra/Exchange (Charlie, sinon le propriétaire) ; activation (deployment/compose.production.mail.yaml.example) ; recette réelle et unique envoi vers une adresse de test à confirmer par le propriétaire.
Corrections demandées par Charlie (relayées par le propriétaire), 8/10 19:20 UTC :
- droit « Gère les comptes administrateurs » (manageAdmins, migration 20261008_185702_admin_rights) séparé du droit d'envoi : sans lui, aucun compte ne crée, modifie ni supprime un autre compte, même avec l'envoi ; droits jamais modifiables sur son propre compte, même par appel direct à l'API (testé pour assistante, expéditeur et propriétaire) ; donné au seul ydiop@5sursync.com (seul compte en production) et au premier compte d'amorçage d'une base neuve ;
- rattachement automatique seulement pour une adresse exacte correspondant à un seul contact ; adresse générale d'entreprise, doublon ou ambiguïté → attribution manuelle, conservée par les synchronisations ;
- messagerie maintenue inactive jusqu'à la configuration Microsoft et la recette réelle (le faux Microsoft ne prouve pas les autorisations réelles).
Tests : unitaires 45 / 9 ignorés ; intégration 58/58 ; navigateur 48/48 ; CRM 133/133 ; admin 28/29 (échec ancien du logo). Images : mail-preprod-20261008 (sha256:bbe825c7cdea…), mail-20261008 (production, sha256:b9f38df06190…). Préproduction migrée (11 migrations) et basculée, saine, 0 erreur. Production inchangée (9 migrations, whatsapp-20261008).

## Capture d'écran Harmattan Sénégal dans /realisations — 2026-10-08 — DÉPLOYÉE (production et préproduction, ~22:45 UTC)
Demande du propriétaire : remplacer l'illustration générique (maquette « web ») de l'étude de cas Harmattan Sénégal par une capture du site réel, fournie par lui. Fichier : public/assets/realisations/harmattan-senegal.png (1867×870, PNG, ~1 Mo, non recompressé : aucun outil d'image disponible dans la session). Code : src/lib/showcase.ts, table builtinCaseImages indexée par ancre (« harmattan ») ; utilisée en repli après l'image téléversée dans le CMS (qui reste prioritaire) et dans le contenu de secours. Affichage via le cadre .case-photo existant (537/294, object-fit cover : ~7 % rognés à gauche et à droite, logo et menu complets). La légende « Illustration du domaine d'intervention » disparaît pour cette étude, puisqu'il s'agit d'une vraie capture. Aucune migration, aucune donnée CMS modifiée, aucun Nginx/DNS.
Construction (demande du propriétaire « reconstruis l'image pour mettre en ligne ») : l'arbre courant contient la messagerie (migrations 20261008_173554_crm_mail et 20261008_185702_admin_rights non appliquées sur la base production). L'image production a donc été construite à partir du code extrait de 5sursync:whatsapp-20261008 (src, scripts, public, package.json, tsconfig ; package.json identique) + showcase.ts modifié + capture, avec Dockerfile/package-lock/next.config courants : 5sursync:harmattan-capture-20261008 (SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1, 94df165b82ce). Préproduction depuis l'arbre courant : 5sursync:harmattan-capture-preprod-20261008 (c872557f8218). Les deux builds : compilation et vérification TypeScript Next réussies. Tests unitaires/e2e non relancés (changement limité à une image et une table de repli).
Préproduction : 5sursync:local retaguée (retour : 5sursync:pre-harmattan-preprod = mail-preprod), app recréée --no-deps, healthy. Production : compose.production.yaml whatsapp-20261008 → harmattan-capture-20261008 (copie : backups/compose.production.yaml.pre-harmattan-capture-20261008), app-production recréée --no-deps, healthy, 0 ligne error/warn. HTTPS (résolution forcée 185.187.169.152, certificat vérifié) sur 5sursync.com : /, /realisations, /contact, /support/connexion, /api/health, /assets/realisations/harmattan-senegal.png 200 ; /crm, /admin 401 ; /realisations contient la capture. Préproduction : mêmes pages 200 et capture présente. Base (aucune migration), Nginx, DNS, secrets et INA non touchés.
Limites : rendu visuel non contrôlé dans un navigateur par l'agent (présence dans le HTML et service du fichier seulement) ; PNG ~1 Mo non recompressé.
Retour arrière : production → remettre 5sursync:whatsapp-20261008 dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production` ; préproduction → `sudo docker tag 5sursync:pre-harmattan-preprod 5sursync:local && sudo docker compose up -d --no-deps app`.

## Portrait et biographie du fondateur dans /a-propos — 2026-10-09 — DÉPLOYÉ (production et préproduction)
Demande du propriétaire : portrait de Papa Youssoupha DIOP, titre « Fondateur et gérant de 5/Sync IT », biographie révisée par Charlie (texte fourni par le propriétaire, intégré mot pour mot). Exclu tant que non confirmé : diplôme, année 2016, enseignement à l'UCAD (vérifié : aucune mention).
Code : section « Le fondateur » dans src/content/a-propos.tsx (après « Un partenaire pour vos enjeux informatiques »), styles .founder-* en fin de src/app/(site)/globals.css. Textes modifiables par le CMS (clés founder-*), sinon valeurs du code.
Image : source WebP 1532×1907 (225 Ko) ; 6 px du bord supérieur retirés (bande sombre de la photo d'origine), aucun autre recadrage ; public/assets/equipe/papa-youssoupha-diop-480.webp (16 Ko), -800.webp (38 Ko), -800.jpg (63 Ko, secours) ; métadonnées retirées ; <picture> avec srcset/sizes, lazy-loading, dimensions fixées (pas de décalage), ratio 4:5 conservé (jamais coupé).
Vérifié sur instance jetable (base *_test, contenu de démonstration) : 1440, 820, 390 et 360 px : rapport largeur/hauteur affiché = image, aucun débordement horizontal, aucune erreur navigateur, fichiers 200 avec cache 7 jours ; captures contrôlées (visage entier, texte lisible).
Production : construite depuis le code extrait de 5sursync:harmattan-capture-20261008 (production actuelle, sans messagerie) + ces seuls changements, pour ne pas embarquer la messagerie non validée.
Images : 5sursync:about-founder-20261009 (production, depuis harmattan-capture-20261008 + portrait ; 9 migrations, aucun code de messagerie) et 5sursync:about-founder-preprod-20261009 (arbre courant). Vérifiées sur instance jetable : rendu aux 4 largeurs, pages publiques 200, capture Harmattan conservée ; seules lignes d'erreur du journal de test = « SITE_ORIGIN must be an approved HTTPS origin », identiques avec l'image précédente (variable absente du banc, présente en production).
Préproduction : 5sursync:local retaguée (retour : 5sursync:pre-about-founder-preprod), healthy, /a-propos 200 avec portrait et biographie, 0 erreur.
Production : compose.production.yaml harmattan-capture-20261008 → about-founder-20261009 (copie : backups/compose.production.yaml.pre-about-founder-20261009), app-production recréée --no-deps, healthy, 0 ligne error/warn. HTTPS 5sursync.com : /, /a-propos, /realisations, /contact, /services, /support/connexion, /api/health et les 3 fichiers du portrait 200 ; /crm, /admin 401 ; /a-propos contient titre, biographie et portrait, aucune mention UCAD ni 2016 ; /realisations garde la capture Harmattan. Base de production inchangée (9 migrations). Relais INA : même empreinte 1C:05:D8:A2…. Contrôle visuel du site public réel (Chromium, 1440 et 390 px) : image chargée, proportions conservées, visage entier, aucun débordement, aucune erreur.
Retour arrière : remettre 5sursync:harmattan-capture-20261008 dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production` ; préproduction : `sudo docker tag 5sursync:pre-about-founder-preprod 5sursync:local && sudo docker compose up -d --no-deps app`.
Remarque : la messagerie contact@ reste hors production (migrations crm_mail et admin_rights non appliquées à la base de production, en attente du feu vert du propriétaire).

## Version anglaise du site public — 2026-10-09 — DÉPLOYÉE EN PRODUCTION par le propriétaire
Demande du propriétaire : traduire le site en anglais pour les partenaires anglophones. Détail : documentation/anglais.md.
Code : 11 pages sous /en (slugs anglais), layout racine lang="en", bascule FR/EN dans l'en-tête, pied de page, formulaire, carte, carte Afrique, vidéos, pages légales, métadonnées hreflang et sitemap bilingues. Dictionnaire français→anglais (src/content/en.json, 400 entrées) appliqué aux textes CMS et aux projets/études de cas ; textes publiés comparés au préalable avec la production (identiques aux valeurs par défaut) ; projets ajoutés en ligne (Douane Sénégalaise, Youmann Consultin Group) inclus. Aucune migration, aucune donnée CMS, API, Nginx, DNS ou secret modifié.
Tests : typecheck 0 ; unitaires 48 réussis / 9 ignorés (dont 3 nouveaux) ; banc jetable (SITE_ORIGIN préproduction, base *_test) 129/129 : 11 pages EN 200 à 1440 et 390 px, lang en, aucun texte courant français, liens internes restés en anglais, canonical/hreflang, aucun débordement, menu mobile, bascule FR↔EN, 404 anglaise, formulaire EN enregistré avec message anglais, 0 erreur navigateur, journal applicatif vide. Non-régression : texte visible des 11 pages FR identique à about-founder-preprod-20261009, seul ajout le lien « EN ».
Image : 5sursync:i18n-preprod-20261009 (arbre courant, donc avec la messagerie). Pas d'image production : comme pour les livraisons précédentes, elle doit être construite depuis le code de about-founder-20261009 + ces changements, pour ne pas embarquer la messagerie non validée.
Limites : textes du CMS modifiés après coup restent en français côté anglais jusqu'à ajout au dictionnaire ; traduction faite par l'agent, relecture par un anglophone recommandée (noms propres de clients laissés tels quels, « Youmann Consultin Group » conservé tel que saisi dans le CMS) ; Support/CRM/admin en français ; Google Maps en anglais via hl=en.
Publication demandée par le propriétaire (« publie »), 2026-10-09 : NON EFFECTUÉE. La bascule de la préproduction a été refusée par le contrôle des permissions de l'agent (« Production Deploy ») ; aucune étiquette ni conteneur modifié par l'agent. Image production 5sursync:i18n-20261009 lancée en construction depuis le code extrait de about-founder-20261009 (22 fichiers modifiés vérifiés identiques à cette base) + les fichiers anglais, SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1 ; son résultat n'a pas été vérifié et elle n'a pas été testée sur banc. Commandes à lancer par le propriétaire : voir documentation/anglais.md, section « Mise en ligne ».
Incident 2026-10-09 : après bascule par le propriétaire, /admin/login de production affiche « This page couldn't load » ; pages publiques et /en 200. compose.production.yaml contient `image: i18n-20261009` (sans préfixe 5sursync:), section build: context . présente : Compose a très probablement construit une image depuis l'arbre courant (messagerie incluse, migrations crm_mail/admin_rights absentes en production). Cause confirmée par le journal fourni par le propriétaire : « column admins.mail_access does not exist » (colonne créée par la migration 20261008_173554_crm_mail, non appliquée en production). Image correcte 5sursync:i18n-20261009 (sha256:dab1d7cd5915…) testée sur banc jetable : pages EN/FR, formulaire, /admin/login 200 ; seuls écarts = hreflang pointant vers https://5sursync.com (attendu pour l'image production). Correctif à appliquer par le propriétaire : documentation/anglais.md, « Mise en ligne ».
Correctif appliqué par le propriétaire : compose.production.yaml = `image: 5sursync:i18n-20261009`. Constaté ensuite par l'agent (HTTPS, résolution forcée 185.187.169.152) : /, /en, /en/about, /api/health 200 ; /admin/login 401 (Basic Auth Nginx, attendu). Rendu de l'administration derrière Basic Auth non vérifiable par l'agent : à confirmer par le propriétaire. Image construite par erreur `i18n-20261009` (sans préfixe) à supprimer si ce n'est déjà fait. Préproduction : état non vérifié par l'agent.

## Groupe CRM retiré de /admin, remplacé par un lien vers /crm — 2026-10-09 — DÉPLOYÉ (production et préproduction, ~10:05 UTC)
Demande du propriétaire : le groupe « CRM » du back-office (Opportunités, Devis et factures, Contacts, Activités et tâches) fait doublon avec /crm ; garder seulement un lien.
Code : `admin.hidden: true` sur crm-contacts, crm-deals, crm-activities, crm-documents (src/collections/crm.ts) ; nouveau composant src/components/admin/CrmNavLink.tsx (encart « CRM clients → » en tête de la navigation, `beforeNavLinks` dans payload.config.ts, enregistré dans importMap.js), styles `.sync-nav-crm` dans src/app/(payload)/custom.css. Les collections restent le stockage du CRM : API REST/locale, accès, hooks et numérotation inchangés. « Clients » reste dans Support client (collection partagée avec le Support). Le lien « Ouvrir le CRM » du tableau de bord est conservé. Aucune migration, aucune donnée modifiée.
Effet : /admin/collections/crm-* répond 404 (vues admin de ces collections supprimées) ; tout passe par /crm.
Tests (banc jetable, base *_test, fixtures) : crm-e2e 136/136 (contrôle « groupe CRM dans /admin » remplacé par 4 contrôles : lien /crm dans la navigation, libellés CRM absents de la navigation, /admin/collections/crm-deals 404, API crm-deals 200 pour l'admin) ; admin-ux 28/29 (échec ancien du logo de connexion). Journal applicatif : uniquement les refus anonymes attendus. Captures 1440 et 390 px contrôlées. Preuves : documentation/qa/admin-crm-link/.
Images : 5sursync:admin-crm-link-preprod-20261009 (arbre courant, avec messagerie et version anglaise ; sha256:0e7f10e0d8fa…) et 5sursync:admin-crm-link-20261009 (production : code extrait de i18n-20261009, image production en cours, + les 5 fichiers seulement ; SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1 ; 9 migrations, aucun code de messagerie ; sha256:ef03b632a023…). Les 4 fichiers modifiés de i18n-20261009 ne différaient de l’arbre courant que par ce changement. Image production testée sur banc : crm-e2e 136/136, admin-ux 28/29 (même échec ancien du logo).
Feu vert du propriétaire (« /admin/login fonctionne, tu peux mettre en ligne »). Constaté avant : production sur 5sursync:i18n-20261009 (dab1d7cd5915, image correcte, healthy).
Préproduction : 5sursync:local retaguée (retour : 5sursync:pre-admin-crm-link-preprod = i18n-preprod-20261009), app recréée --no-deps --no-build, healthy, 0 ligne error/warn ; HTTPS /, /en, /contact, /api/health 200, /crm et /admin 401 ; /admin/login 200 dans le conteneur.
Production : compose.production.yaml i18n-20261009 → `5sursync:admin-crm-link-20261009` (copie : backups/compose.production.yaml.pre-admin-crm-link-20261009), app-production recréée --no-deps --no-build, healthy, 0 ligne error/warn. HTTPS 5sursync.com (résolution forcée 185.187.169.152) : /, /en, /a-propos, /realisations, /contact, /support/connexion, /api/health 200 ; /crm, /admin 401 (Basic Auth). Dans le conteneur : /admin/login 200, /crm anonyme 307 vers /admin/login. Base de production inchangée (9 migrations). Relais INA direction, mobile, auth : même empreinte 1C:05:D8:A2…. Nginx, DNS, secrets non touchés.
Non vérifié par l'agent : rendu de la navigation admin dans le navigateur du propriétaire (Basic Auth + session réelle) ; contrôlé seulement sur banc avec captures.
Retour arrière : production → remettre `5sursync:i18n-20261009` dans compose.production.yaml puis `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps --no-build app-production` ; préproduction → `sudo docker tag 5sursync:pre-admin-crm-link-preprod 5sursync:local && sudo docker compose up -d --no-deps --no-build app`.

## Recette Microsoft Graph réelle contact@ — 2026-10-09 — LECTURE/REFUS RÉUSSIS ; BROUILLON NEUF CRÉÉ ; RÉPONSE EN ATTENTE
Le propriétaire a créé et vérifié les deux attributions Exchange (InScope True contact@, False ydiop@). Recette selon microsoft365.md §15, détail en fin de ce fichier-là ; preuves documentation/qa/m365-recette/.
a) Script autonome (GET seulement, 10:30 UTC) : jetons des deux applications 200 avec les certificats du VPS ; contact@ lu 200 ; ydiop@ 403 ErrorAccessDenied pour les deux applications ; l'application envoi refusée en lecture sur contact@ (403). Aucun appel d'envoi.
b) Banc jetable (base recette_test, image admin-crm-link-preprod-20261009, sans serveur ni worker : ni synchronisation ni reprise 90 jours ; seuls les messages de youssouphadiop@hotmail.fr lus ; envoi bloqué par garde réseau, identité d'envoi factice, liste vide) : brouillon neuf « [RECETTE 5sursync] Brouillon de test – ne pas envoyer » créé dans les Brouillons de contact@, signature une fois, logo inline une fois. Réponse dans le fil du message de test : en attente de la confirmation du propriétaire. Brouillons conservés pour son contrôle visuel dans Outlook.
Production, préproduction, Nginx, DNS et secrets non modifiés. Banc (conteneur synrecette-db, réseau synrecette-net) laissé en place jusqu'à la réponse en brouillon, puis à supprimer. Correction documentaire : marqueur de signature réel `sync5-signature` (et non `data-5sync-signature`).
10:39 UTC, sur demande du propriétaire (boîte nettoyée le matin, anciens messages et brouillons à ignorer) : nouveau brouillon « [RECETTE 5sursync] Nouveau test signature – 09/10/2026 10:39 (heure de Dakar, UTC) » à youssouphadiop@hotmail.fr, dans les Brouillons de contact@, signature une fois, logo inline une fois, aucun envoi. Validation visuelle Outlook par le propriétaire en attente.
Signature validée par le propriétaire (capture Outlook). « De » affiché ydiop@ : Graph montre from et sender vides sur le brouillon (Outlook n'a rien enregistré) ; le CRM ne fixe pas d'expéditeur, Outlook propose le compte par défaut. Envoi CRM prévu par la boîte contact@ avec l'application envoi limitée à contact@ ; expéditeur réel à prouver lors de l'envoi de recette. Correctif appliqué au code (banc seulement, non déployé) : from et sender = contact@ sur brouillons neufs, réponses et réenregistrements ; envoi bloqué avec message clair si le brouillon est introuvable dans contact@ ou si from/sender diffère. Tests : typecheck 0, unitaires 49 (9 ignorés), intégration 66/66, navigateur 48/48 ; image 5sursync:mail-sender-test-20261009. Réel 10:56 UTC : brouillon « [RECETTE 5sursync] Test expéditeur contact@ – 09/10/2026 10:56 » avec from et sender = contact@5sursync.com selon Graph (nom affiché « contact »). Champ De dans Outlook à confirmer par le propriétaire. Aucun envoi.
Envoi réel unique autorisé par le propriétaire, 11:11 UTC, depuis le banc par le chemin CRM et l'application envoi (liste limitée à youssouphadiop@hotmail.fr, un seul appel /send) : « [RECETTE 5sursync] Envoi de test unique – 09/10/2026 11:11 » accepté par Microsoft (202), puis vérifié dans les Éléments envoyés de contact@ (in_sent, from et sender = contact@5sursync.com). CORRECTION : non livré, rapport de non-remise 550 5.7.708 « Access denied, traffic not accepted from this IP » AS(7230) à 11:11:07 (Failed dans le suivi Exchange, locataire en essai gratuit).
Second envoi unique autorisé après passage à l'abonnement payant, 11:38:59 UTC (« [RECETTE 5sursync] Vérification envoi après passage au payant – 09/10/2026 11:38 UTC ») : 202, Éléments envoyés avec from/sender contact@, puis MÊME REJET 550 5.7.708 AS(7230) à 11:39:02. Essais arrêtés ; aucune permission élargie, DNS non modifié. Envoi sortant bloqué côté Microsoft : dossier support documentation/qa/m365-recette/support-microsoft-5.7.708.md. Lecture, brouillons, expéditeur et chemin d'envoi du CRM fonctionnent.
Non fait (feu vert séparé) : activation en production. Réponse en brouillon dans un fil : attend un nouveau message de test.

## Messagerie du CRM via Simafri (SMTP/IMAP) — 2026-10-09 — CODÉE ET TESTÉE SUR BANC, NON DÉPLOYÉE, NON ACTIVÉE
Demande du propriétaire : abandon de l'envoi Microsoft Graph (deux rejets 550 5.7.708) au profit de la boîte Simafri `contact@crm.5sursync.com` (SMTP `mail.crm.5sursync.com:587` STARTTLS, IMAP `da-uk2.hostns.io:993`). Détails, paramètres, saisie du mot de passe, limites, mise en service et retour arrière : documentation/messagerie-simafri.md.
Constaté depuis le VPS sans authentification (`openssl s_client`, 09/10) : certificats valides pour SMTP 587 et IMAP da-uk2.hostns.io ; IMAP sur mail.crm.5sursync.com:993 refusé (hostname mismatch), conformément au message du propriétaire. Aucune connexion authentifiée à la vraie boîte, aucun envoi réel.
Code : fournisseur unique choisi par `MAIL_PROVIDER` (graph par défaut, conservé ; imap = Simafri), paramètres Simafri figés pour la production, vrais serveurs refusés hors production ; nouveaux modules src/lib/mail/imap.ts, imap-sync.ts, imap-service.ts, mime.ts, errors.ts ; service.ts aiguille après contrôle des droits ; pages /crm/messagerie adaptées (pièces jointes, états SMTP, copie dans Envoyés, déclaration manuelle d'un envoi incertain) ; classement des non-remises (seule l'adresse inexistante bloque ; 5.7.708 ne bloque plus, y compris côté Microsoft) ; script de contrôle sans envoi scripts/mail-imap-check.ts ; migration additive src/migrations/20261009_150000_crm_mail_imap (NON appliquée, ni en production ni en préproduction). Dépendances exactes : imapflow 2.3.0, mailparser 3.9.37, smtp-server 3.19.18 (dev) ; npm audit 0 vulnérabilité. next.config : actions serveur 5 Mo (pièces jointes 4 Mo).
Tests (bancs jetables, réseau interne, Dovecot 2.3.21.1 réel + faux SMTP, autorité de test, fixtures) : typecheck 0 erreur hors documentation/qa/m365-recette/recette-b.ts (script ignoré par Git, antérieur, chemins d'import faux) ; unitaires 54 réussis, 0 échec, 9 ignorés ; intégration Simafri 104/104 (source et image) ; navigateur Simafri 32/32 ; contrôle sans envoi scripts/mail-imap-check.ts OK sur le banc (aucun message transmis) ; non-régression Microsoft 66/66 et 48/48 ; CRM 136/136. Image de test 5sursync:mail-imap-test-20261009 (sha256:189e26dfe95a…, SITE_ORIGIN préproduction par défaut : ce n'est PAS l'image de production). Preuves : tests/out-mail-imap/, tests/out-mail/, tests/out-crm/ (ignorés par Git).
Non testé faute de vraie boîte : attributs SPECIAL-USE et UIDPLUS chez Simafri, copie automatique éventuelle dans Envoyés, comportement du webmail sur les brouillons, délivrabilité (message manuel classé en indésirables chez Hotmail malgré SPF/DKIM/DMARC/compauth pass).
Production, préproduction, Nginx, DNS, secrets, routage Microsoft, SMTP no-reply et INA : inchangés. Aucune variable MAIL_* ajoutée. Fichier secrets/crm_mail_password : à créer par le propriétaire (procédure §5), non créé.
Incident disque 09/10 ~13:30 UTC : / à 100 % (900 Mo libres) pendant la construction d'image (échec ENOSPC). Libéré uniquement le cache de construction Docker inutilisé (`docker builder prune -f`, 9,7 Go puis 1,8 Go) et node_modules installé sur l'hôte par l'agent pendant cette session ; aucune image, aucun conteneur, aucun volume supprimé. Services vérifiés sains ensuite (app-production, app, postgres healthy). Après tests : 92 %, 7,9 Go libres. ~50 Go d'images anciennes (points de retour) sont récupérables : décision du propriétaire. Le conteneur synrecette-db (banc de recette Microsoft d'une session précédente) tourne toujours.
Prochaine étape (feu vert requis) : sauvegarde, migrations crm_mail + admin_rights + crm_mail_imap sur la base de production, saisie du mot de passe par le propriétaire, image de production, contrôle sans envoi, puis UN envoi réel vers youssouphadiop@hotmail.fr et récupération de la réponse dans le CRM (documentation/messagerie-simafri.md §7).
Feu vert du propriétaire (« feu vert », 09/10 ~13:50 UTC). Fait par l'agent :
- Fichier secrets/crm_mail_password constaté présent (mode 400, inaops, saisi par le propriétaire ; non lu).
- Sauvegarde backups/20261009T135314Z-pre-simafri (dumps syncit et syncit_preprod, fichiers de production, compose.yaml, compose.production.yaml, lockfile), restauration vérifiée dans une base temporaire (214 entreprises, 1 admin, 9 migrations) puis base temporaire supprimée.
- Écart code production → arbre contrôlé : messagerie, droits des comptes (admin_rights) et les trois migrations uniquement.
- Image de production 5sursync:mail-simafri-20261009 (sha256:dba203006a02…, SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1), banc Simafri rejoué sur cette image : intégration 104/104, contrôle sans envoi OK, navigateur 32/32.
- Préproduction : migration 20261009_150000_crm_mail_imap appliquée à syncit_preprod ; 5sursync:local retaguée sur mail-imap-test-20261009 (retour : 5sursync:pre-simafri-preprod), app recréée --no-deps --no-build, healthy, 0 ligne error/warn ; HTTPS (résolution forcée) /, /en, /contact, /api/health 200, /crm et /admin 401. Messagerie inactive en préproduction (par conception).
- Production : NON FAITE. Modification de compose.production.yaml + migrations + recréation refusées par le contrôle des permissions de l'agent (« Production Deploy »). Base de production toujours à 9 migrations, conteneur sur admin-crm-link-20261009, compose.production.yaml inchangé. Commandes à exécuter par le propriétaire : documentation/messagerie-simafri.md §7 et réponse de l'agent du 09/10.
Aucun envoi réel effectué.
Production réalisée par l'agent (09/10 14:28–14:55 UTC), après ajout par le propriétaire de règles d'autorisation explicites :
- compose.production.yaml corrigé (point en trop dans l'image, indentation du secret crm_mail_password), config validée.
- Migrations appliquées à syncit : 20261008_173554_crm_mail, 20261008_185702_admin_rights, 20261009_150000_crm_mail_imap (Done) ; ydiop@5sursync.com : mail_access send, manage_admins true.
- Premier démarrage sur mail-simafri-20261009 : IMAP OK, SMTP refusé par Simafri « 550 Bad HELO - Host impersonating domain name [crm.5sursync.com] » (nom EHLO codé en dur), affiché à tort « smtp-tls » (classement trop large). Corrigé : EHLO = nom DNS inverse du VPS vmi3557177.contaboserver.net (essai STARTTLS sans authentification OK), refus serveur distingués des échecs TLS ; test unitaire ajouté. Image 5sursync:mail-simafri-20261009b (sha256:c3e223589f4c…) : unitaires messagerie 15/15, banc Simafri intégration 104/104 + contrôle + navigateur 32/32. Image intermédiaire mail-simafri-20261009 supprimée.
- Production sur 5sursync:mail-simafri-20261009b, healthy, 0 ligne error/warn. Contrôle sans envoi : IMAP OK (Brouillons « Drafts », Envoyés « Sent » par attributs SPECIAL-USE, UIDPLUS oui), SMTP connexion + STARTTLS certificat vérifié + authentification OK, QUIT sans message. HTTPS (résolution forcée) /, /en, /a-propos, /contact, /api/health, /support/connexion 200 ; /crm, /admin 401.
- Première synchronisation : Réception 2, Envoyés 2 (échange de test manuel antérieur), aucune erreur, non rattachés (« À attribuer »). Envoi limité à youssouphadiop@hotmail.fr. Aucun envoi effectué par l'agent.
- Retour arrière : backups/20261009T135314Z-pre-simafri/compose.production.yaml (image admin-crm-link-20261009) puis up -d --no-deps --no-build app-production ; migrations additives.
Nettoyage disque demandé par le propriétaire (« libère de l'espace », 09/10 ~15:05 UTC) : / passé de 96 % (4,3 Go libres) à 23 % (75 Go libres).
- Docker : anciennes étiquettes 5sursync supprimées. Conservées : mail-simafri-20261009b (production), admin-crm-link-20261009 et i18n-20261009 (retours production), local = mail-imap-test-20261009 (préproduction), pre-simafri-preprod = admin-crm-link-preprod-20261009 (retour préproduction) ; images de base et de test (postgres, node, dovecot, playwright) conservées. Volumes anonymes inutilisés (bancs de test) supprimés (`docker volume prune`, volumes nommés non touchés), cache de construction vidé (20 Go). Conteneur synrecette-db et réseau synrecette-net (banc de recette Microsoft) supprimés, comme prévu après la recette.
- Hors Docker : `apt-get clean`, journaux systemd ramenés à 100 Mo, fichiers temporaires de l'agent. Non touchés : ~/.vscode-server (4,8 Go, utilisé par l'éditeur), fichiers temporaires d'une autre session Claude (~1 Go), backups/ (114 Mo).
Services vérifiés après : app-production, app (préproduction) et postgres healthy.

## DNS 5sursync.com incohérent — 2026-10-09 ~21:50 UTC — CONSTAT, rien modifié
Symptôme signalé : après expiration de session, un rechargement affiche parfois l'ancien site WordPress. Cause : deux zones DNS contradictoires. Le registre .com délègue à ns1/ns2.dns-parking.com (Hostinger) : A 5sursync.com = 185.187.169.152 (ce VPS), zone complète (MX Outlook + mail.5sursync.com, SPF/Brevo, DMARC, crm/mail.crm). Mais cette zone publie à l'apex NS ns1/ns2.cloudns.io, dont la zone est périmée : A 5sursync.com et www = 91.204.209.201 (ancien hébergeur LiteSpeed/WordPress, toujours en ligne), TTL 3600, sans crm/DMARC ni MX secondaire. Les résolveurs qui suivent les NS de la zone enfant basculent par intermittence vers l'ancien serveur, où le cookie de session n'existe pas.
Correction (propriétaire, panneau Hostinger) : remplacer les NS de l'apex par ns1.dns-parking.com et ns2.dns-parking.com, puis désactiver ou aligner la zone ClouDNS. Effet complet après expiration des caches (jusqu'à 48 h pour les NS). Aucune action DNS faite par l'agent.
Premier envoi de recette depuis le CRM (09/10 22:05 UTC, brouillon n° 1 vers youssouphadiop@hotmail.fr) : état « Refusé par le serveur SMTP », code smtp-unreachable ; rien n'est parti, brouillon intact dans Drafts (constaté dans le webmail par le propriétaire). Cause : `mail.crm.5sursync.com` introuvable (ENOTFOUND) depuis le VPS. Incohérence DNS du domaine (déjà notée dans production-deploiement.md) : le .com délègue à ns1/ns2.dns-parking.com (Hostinger, enregistrement présent, 91.204.209.201), mais les NS d'apex publiés par cette zone sont ns1/ns2.cloudns.io, qui répondent NXDOMAIN pour mail.crm.5sursync.com et pour le MX de crm.5sursync.com. Le résolveur du VPS (Contabo 195.179.224.53) suit ClouDNS ; 1.1.1.1 et 8.8.8.8 répondent correctement. Effets possibles aussi sur la réception et la délivrabilité de crm.5sursync.com selon les résolveurs. Correction proposée au propriétaire (DNS non modifié par l'agent) : NS d'apex Hostinger = ns1/ns2.dns-parking.com, ou zone complète chez ClouDNS. Contournement proposé, non appliqué : `dns: [1.1.1.1, 8.8.8.8]` pour app-production. Après correction : « Vérifier l'état » remet le brouillon en brouillon, puis nouvel envoi.
DNS (10/10, ~00:30 UTC) : le propriétaire a aligné la zone ClouDNS (ancien DirectAdmin) sur Hostinger. Vérifié sur ns1 et ns2.cloudns.io : A @ et www 185.187.169.152, nouveau SPF @, mail.crm A, crm MX, x._domainkey.crm, _dmarc.crm. Encore absents chez ClouDNS à 00:40 : TXT SPF de crm, MX 10 mail.5sursync.com, TXT MS= et brevo-code, _dmarc, brevo1/brevo2._domainkey. NS d'apex cachés chez Hostinger (cloudns.io) : correction à demander au support Hostinger. Anomalie Hostinger non liée : deux CNAME pour autodiscover.
RECETTE RÉELLE RÉUSSIE (10/10 00:50 UTC) — envoi unique du brouillon n° 1 « TEST » vers youssouphadiop@hotmail.fr, par le propriétaire depuis le CRM : « Vérifier l'état » (verified-not-sent, après l'échec DNS de la veille), puis envoi confirmé ; SMTP 250 (00:50:59), copie enregistrée dans Envoyés (00:51:00), brouillon retiré de Drafts (00:51:00). Boîte : Drafts 0, Sent 3 (2 tests manuels antérieurs + celui-ci : une seule copie). Synchronisation suivante : copie lue une fois (message n° 5), rattachée par « draft » à l'entreprise 243. Reçu par le propriétaire dans le Courrier entrant Hotmail (pas en indésirables), expéditeur « L'équipe 5/Sync IT <contact@crm.5sursync.com> », signature et logo une seule fois, adresse contact@crm.5sursync.com affichée. Journal complet : prepare, send-request, send-failed (smtp-unreachable, DNS), verified-not-sent, send-request, send-accepted, sent-copy-saved, draft-removed, tous par Youssoupha DIOP.
Reste : réponse depuis Hotmail et sa récupération dans le CRM (même fil, rattachement si un contact a l'adresse exacte).
Réponse Hotmail reçue (10/10 00:53 UTC, « Re: TEST », message n° 6) : synchronisée une fois, même fil que l'envoi (conversation = Message-ID du message CRM, In-Reply-To correct), indice « Ce fil contient un message rattaché à 5surSync IT » affiché. Non rattachée automatiquement, conformément à la règle : youssouphadiop@hotmail.fr est l'adresse générale de l'entreprise 243 (5surSync IT), aucun contact ne porte cette adresse ; l'état « ambiguous » s'affiche « plusieurs fiches possibles », libellé imprécis dans ce cas (une seule entreprise, par son adresse générale) — amélioration de libellé proposée, non faite. RECETTE SIMAFRI COMPLÈTE : envoi, copie unique, livraison en boîte de réception Hotmail, réponse récupérée dans le fil.

## Modèles de devis et de facture à la charte du site — 2026-10-10 — CONSTRUIT ET TESTÉ, NON DÉPLOYÉ
Demande du propriétaire : harmoniser le design des devis et factures avec celui du site. Modifiés : aperçu A4 `src/app/(crm)/crm/documents/[id]/apercu/page.tsx`, styles `.crm-sheet*` de `src/app/(crm)/crm.css`, PDF serveur `src/lib/crm-pdf.ts` (même composition, logo PNG transparent au lieu du JPEG). Détail de la charte et de la composition : documentation/crm.md, « Modèles de devis et de facture ». Aucune donnée, migration, règle de calcul ou de numérotation modifiée.
Tests (conteneurs jetables, fixtures uniquement) : typecheck sans erreur dans le code applicatif (6 erreurs préexistantes, hors suivi git, dans documentation/qa/m365-recette/recette-b.ts : imports de modules mail déplacés) ; unitaires 54 réussis, 9 ignorés, 0 échec (dont PDF multipage valide) ; banc tests/crm-run.sh sur l’image 5sursync:devis-design-20261010 : 137/137 (nouveau contrôle : aperçu sans débordement à 390 px). PDF de facture, devis et avoir brouillon rendus en image par pdftoppm et inspectés ; aperçu écran, impression et mobile inspectés. Preuves : documentation/qa/devis-factures-design/.
Limites : sur mobile, le tableau des lignes défile horizontalement dans la feuille (désignation étroite) ; impression vérifiée en émulation navigateur, pas sur imprimante réelle. NON FAIT : déploiement préproduction et production (image locale seulement).

## Suivi commercial, accueil « Aujourd’hui » et relances dans /crm — 2026-10-10 — CONSTRUIT ET TESTÉ SUR BANC, NON MIGRÉ, NON DÉPLOYÉ
Demande du propriétaire : accueil quotidien, étapes commerciales, relances manuelles. Choix validés par lui : étapes portées par l’entreprise, étape « Contacté, sans réponse » ajoutée, prochaine action obligatoire. Détail fonctionnel : documentation/crm.md, section « Suivi commercial ». Aucun envoi automatique ajouté.
Fichiers : src/lib/crm.ts (vocabulaire, withMessage garde l’ancre #), src/lib/crm-schema.ts, src/lib/crm-import.ts (étape exclue de l’import), src/collections/crm.ts et index.ts (champs, hook, automatismes devis/opportunité), src/app/(crm)/crm/actions.ts (recordFollowUp, moveProspect, toggleActivity, conversion, suppression enfant par enfant), page.tsx (accueil), suivi/page.tsx (nouveau), clients/page.tsx, clients/[id]/page.tsx, export/[kind]/route.ts, src/components/crm/parts.tsx et client.tsx (DragBoard paramétrable, navigation), crm.css, src/payload-types.ts (pages_copy.value laissé en string comme avant), migration 20261010_020200_crm_suivi (.ts/.json, ligne pages_copy retirée comme dans les migrations CRM précédentes), tests/crm.test.ts, tests/crm-e2e.py.
Tests (conteneurs jetables, réseau interne, base *_test, comptes fixtures) : typecheck 0 erreur dans le code applicatif (6 erreurs anciennes dans documentation/qa/m365-recette/recette-b.ts) ; unitaires 56 réussis, 9 ignorés, 0 échec ; migration sur données fixtures : classement attendu (contacted / to-contact / won ×2 / engaged), puis down (WhatsApp → note, colonnes retirées) et up de nouveau ; banc tests/crm-run.sh sur 5sursync:suivi-test-20261010 (sha256:091a03e4481c…) : 172/172 (137 anciens + accueil, planification rapide, tableau, glisser-déposer, suivi refusé sans prochaine action, compte rendu, Perdu refusé sans raison puis accepté, filtre, export, gain via opportunité, mobile 390 px sur 9 pages avec contrôle que la page existe). Journal applicatif : uniquement les deux refus anonymes /api/cms attendus. Captures contrôlées : accueil, tableau, fiche, mobile.
Défauts trouvés et corrigés pendant les tests : colonnes du tableau qui se chevauchaient (passé à 4 + 3 colonnes) ; contrôle mobile qui réussissait sur une page 404 (fiche supprimée plus tôt dans le test) ; un échec ponctuel de suppression d’entreprise (activité restante, erreur masquée par la suppression groupée de Payload) : suppression rendue séquentielle et erreurs remontées ; non reproduit ensuite (5 essais API, 3 passages du banc), cause exacte non identifiée.
Comportement modifié à connaître : l’accueil /crm s’appelle « Aujourd’hui » ; « Marquer comme faite » sur la dernière action d’une entreprise en cours ouvre sa fiche ; l’export CSV des entreprises a trois colonnes de plus, à la fin.
NON FAIT : migration de la base de production (syncit) et de la préproduction (syncit_preprod), images de production et de préproduction, bascules, mise à jour du manuel de formation. L’arbre contient aussi les modèles de devis/factures non déployés de l’autre session (devis-design-20261010) : une image construite depuis l’arbre embarque les deux livraisons. Avant mise en ligne : sauvegarde, migration (vérifier « Migrated: 20261010_020200_crm_suivi »), puis image. Les images en ligne restent compatibles avec le schéma migré (colonnes nullables, valeur d’enum ajoutée non lue).
Conteneurs et réseau de test supprimés. node_modules réinstallé dans le dépôt (ignoré par git, ~1 Go) pour typecheck et tests.
### Déploiement demandé par le propriétaire (« deploie ») — 2026-10-10 ~09:52 UTC — BLOQUÉ PAR LES PERMISSIONS DE L'AGENT
Fait : sauvegarde backups/20261010T095220Z-pre-suivi (syncit.dump, syncit_preprod.dump au format pg_dump -Fc, mode 600 ; 45 tables de données listées par pg_restore -l dans chacun ; copie de compose.production.yaml ; identifiant de l'image préproduction en place).
Refusé à l'agent par le contrôle des permissions : restauration de contrôle dans une base temporaire et lecture des comptes de la base de production (« Production Reads »), construction de l'image de production (« Production Deploy »). Donc NON FAITS : images suivi-20261010 / suivi-preprod-20261010, migrations, bascules. Production toujours sur 5sursync:mail-simafri-20261009b, base inchangée. Commandes à lancer par le propriétaire : réponse de l'agent du 10/10.
Suite (propriétaire : « lance-la toi-même » ; modèles de devis de l'autre session inclus volontairement) : images construites par l'agent, 5sursync:suivi-20261010 (production, SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1, sha256:c8c560a6ce88…) et 5sursync:suivi-preprod-20261010 (= image du banc 172/172, sha256:091a03e4481c…). Migration de la préproduction refusée à l'agent par le contrôle des permissions ; aucune migration ni bascule faite, production toujours sur mail-simafri-20261009b.
Nettoyage demandé par le propriétaire (« ne pas remplir l'espace de sauvegardes inutiles ») : node_modules du dépôt (953 Mo) et cache de construction Docker (12,3 Go) supprimés, étiquette en double suivi-test-20261010 retirée (même image que suivi-preprod-20261010). / : 44 % → 31 % (67 Go libres). Conservés : sauvegarde backups/20261010T095220Z-pre-suivi (488 Ko, nécessaire avant la migration), images suivi-20261010 et suivi-preprod-20261010 (à déployer). Services healthy après. Pour les prochains tests : npm ci dans un conteneur, puis supprimer node_modules.
Suppression des anciennes images de retour arrière demandée par le propriétaire (« supprime ») : refusée à l'agent par le contrôle des permissions ; aucune image supprimée. Commande fournie au propriétaire.

## Ticket Support « introuvable » — 2026-10-10 — CONSTAT, rien modifié
Signalé par le propriétaire : ticket de test non retrouvé dans le back-office. Base syncit (comptages seulement) : 0 ticket, 0 compte client, 0 demande de contact. Journal Nginx : une seule tentative, POST /api/support/tickets 403 le 10/10 à 00:58:51, après connexion admin au CRM à 00:50. Cause : la session était celle de l'administrateur (cookie payload-token partagé) ; /support et /support/nouveau acceptent un admin et affichent le formulaire, mais l'API refuse la création (« Créez ce ticket depuis l'administration. ») : rien n'est enregistré, par conception. Défaut d'ergonomie : le formulaire ne devrait pas être proposé à un admin. Un vrai test exige un compte client invité depuis une fiche Client, activé dans une fenêtre privée. Aucune alerte équipe sur nouveau ticket (limite déjà connue).

## Profils du back-office : complet, CRM (assistante), technicien — 2026-10-10 — CONSTRUIT ET TESTÉ SUR BANC, NON MIGRÉ, NON DÉPLOYÉ
Demande du propriétaire : son assistante ne gère que le CRM, les techniciens que les tickets. Choix validés : tickets masqués pour le profil CRM ; devis et factures préparés en brouillon seulement. Détail : crm.md, « Profils du back-office ».
Fichiers : src/lib/access.ts, src/collections/index.ts (champ role, accès par collection, menus du contenu masqués hors profil complet), src/collections/crm.ts (accès CRM, brouillons seulement), src/lib/crm-server.ts (garde + ctx.full), pages /crm (accueil, fiche, document, layout), actions.ts (envoi de document, garde de suppression), src/components/admin/Overview.tsx et CrmNavLink.tsx, routes /team/invitations, migration 20261010_105721_admin_roles (.ts/.json ; défaut 'full' pour les comptes existants puis 'crm' ; ligne pages_copy retirée), payload-types.ts, tests/access.test.ts, tests/integration.ts (fixtures role), tests/crm-e2e.py.
Tests (conteneurs jetables, fixtures) : typecheck 0 erreur applicative ; unitaires 57 réussis / 9 ignorés / 0 échec ; SQL de migration testé (compte existant → full, nouveau → crm) ; banc CRM 196/196 (172 précédents + 24 profils : création des comptes par le propriétaire, élévation refusée, API par profil, brouillon accepté puis émission refusée, connexion CRM → /crm, /admin → /crm, accueil et fiche sans Support, technicien : tableau de bord tickets seuls, menu sans CRM ni contenu, /crm 404) ; banc admin 28/29 (échec ancien du logo de connexion, identique à la référence). Captures profile-crm.png et profile-technician.png contrôlées.
Constat : `payload migrate:down` annule tout le dernier lot de migrations (pas une seule) ; sur une base jetable il échoue sur l’ancienne migration showcase. En production, ces deux migrations formeront un lot à elles seules.
IMPORTANT déploiement : les images suivi-20261010 / suivi-preprod-20261010 construites ce matin NE CONTIENNENT PAS les profils ; il faut reconstruire depuis l’arbre courant, puis appliquer les deux migrations (crm_suivi et admin_roles). Image de test supprimée, cache de construction vidé, node_modules supprimé.
Avant d’ouvrir un compte réel : entrée Basic Auth Nginx propre à chaque personne (commande dans crm.md). Aucun compte réel créé par l’agent.

### Déploiement suivi commercial + profils — 2026-10-10 11:14–11:30 UTC (« deploie »)
Fait par l'agent : sauvegarde backups/20261010T111435Z-pre-suivi-roles (syncit et syncit_preprod en pg_dump -Fc, 45 tables de données chacun, compose.production.yaml, image préproduction précédente) ; la sauvegarde du matin (20261010T095220Z-pre-suivi), devenue inutile, a été supprimée. Images 5sursync:suivi-roles-20261010 (production, SITE_ORIGIN=https://5sursync.com, SITE_INDEXABLE=1, sha256:7c6f5c8f6613…) et 5sursync:suivi-roles-preprod-20261010 (sha256:396608cc6678…), construites depuis l'arbre courant (suivi commercial, profils, modèles de devis de l'autre session).
PRÉPRODUCTION DÉPLOYÉE : migrations crm_suivi et admin_roles appliquées à syncit_preprod (lot 5) ; 5sursync:local = suivi-roles-preprod-20261010 (retour : 5sursync:pre-suivi-roles-preprod) ; healthy, 0 ligne error/warn ; HTTPS /, /en, /contact, /realisations, /api/health, /support/connexion 200 ; /crm, /crm/suivi, /admin 401 ; dans le conteneur /crm/suivi anonyme 307 vers la connexion.
PRODUCTION : base syncit MIGRÉE (« Migrated: 20261010_020200_crm_suivi » et « 20261010_105721_admin_roles », 11:29:30 UTC) ; compose.production.yaml pointe sur 5sursync:suivi-roles-20261010 (copie : backups/compose.production.yaml.pre-suivi-roles-20261010). Recréation du conteneur REFUSÉE à l'agent (« Production Deploy »). Le conteneur tourne donc toujours sur mail-simafri-20261009b, compatible avec le schéma migré : healthy, HTTPS /, /contact, /api/health 200, /crm et /admin 401. Commande à lancer par le propriétaire : sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps --no-build app-production
Retour arrière production : remettre la copie de compose.production.yaml puis la même commande ; les migrations peuvent rester (colonnes additives).
PRODUCTION BASCULÉE par le propriétaire (12:31 UTC) puis vérifiée par l'agent : 5sursync-app-production-1 sur 5sursync:suivi-roles-20261010, healthy, 0 ligne error/warn ; HTTPS 5sursync.com /, /en, /a-propos, /realisations, /contact, /api/health, /support/connexion 200 ; /crm, /crm/suivi, /admin 401 (Basic Auth) ; dans le conteneur /crm et /crm/suivi anonymes 307 vers /admin/login, /admin/login 200. Relais INA direction, mobile, auth : même empreinte 1C:05:D8:A2…. Non vérifié par l'agent : rendu avec une session réelle (Basic Auth + compte) ; à contrôler par le propriétaire. Manuel de formation non mis à jour.
