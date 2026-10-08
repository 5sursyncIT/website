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
Fonctions : tableau de bord (clients, prospects, pipeline ouvert et pondéré, gains du mois, tâches en retard), entreprises (champs commerciaux ajoutés à la collection clients existante), contacts, opportunités en pipeline à 4 étapes plus gagnée/perdue, activités et tâches, conversion des demandes du formulaire Contact en prospects, exports CSV. Accès réservé aux admins Payload ; collections CRM visibles aussi dans /admin (groupe CRM) ; lien « Ouvrir le CRM » ajouté au tableau de bord admin ; /crm ajouté au robots.txt.
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
