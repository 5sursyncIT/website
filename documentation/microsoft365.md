# CRM ↔ boîte partagée Microsoft 365 contact@5sursync.com

> **9 octobre 2026 — remplacée par Simafri (SMTP/IMAP)** pour la messagerie du CRM, après les
> deux rejets 550 5.7.708 de la recette (fin de ce document). Ce connecteur reste dans le code,
> sélectionnable par `MAIL_PROVIDER=graph`, pour le retour arrière ; applications Entra,
> certificats et données Microsoft ne sont pas modifiés. Voir `messagerie-simafri.md`.

**Statut au 8 octobre 2026 (17:35 UTC)** : plan **validé par le propriétaire** (option B,
assistante en brouillon seulement, étapes Microsoft par Charlie, sinon par le propriétaire).
Fait : isolation de la préproduction (section 7, « Réalisé ») ; deux certificats générés sur le
VPS (section 4, étape 2) ; code de la messagerie écrit et testé contre un faux Graph local
(section 14). **Pas encore fait côté Microsoft** : applications Entra, droits Exchange
(étapes 1, 3, 4, 5, par Charlie ou le propriétaire). **Préproduction** : code déployé le 8/10 à 19:20 UTC
(image `mail-preprod-20261008`, migrations crm_mail et admin_rights appliquées à `syncit_preprod`),
messagerie inactive par conception. **Production : code non déployé, migration non appliquée, messagerie non activée.**

## 1. Constaté (lecture seule, sources publiques)

| Élément | Valeur | Source |
|---|---|---|
| Locataire Microsoft 365 | `17ea5f54-f67a-4949-b5b9-92a78a9d4fe7` (géré, non fédéré) | `login.microsoftonline.com/5sursync.com/.well-known/openid-configuration`, `getuserrealm` |
| MX principal | `5sursync-com.mail.protection.outlook.com` (priorité 0) | DNS |
| MX secondaire | `mail.5sursync.com` (priorité 10, 91.204.209.201, hébergeur du no-reply) | DNS |
| SPF | Outlook + Brevo + plages de l'hébergeur | DNS |
| Autodiscover | `autodiscover.outlook.com` | DNS |

À vérifier par un administrateur (non visible publiquement) : type exact de `contact@` (boîte
partagée, alias d'une autre boîte ou groupe), adresse SMTP principale, UPN, identifiant
Entra (`ExternalDirectoryObjectId`), connexion directe bloquée.

Remarque : le MX secondaire `mail.5sursync.com` peut recevoir du courrier si Exchange Online
est injoignable pour l'expéditeur ; ces messages n'arriveraient pas dans la boîte partagée et
ne seraient pas vus par le CRM. Indépendant de ce projet, à garder en tête.

Existant préservé : SMTP no-reply du site (`mail.5sursync.com`, notifications de contact et
emails du CRM, `src/lib/contact-smtp.ts`), bouton WhatsApp manuel, entreprises importées et
historiques. Le CRM ne connaît aujourd'hui qu'un niveau « administrateur » (pas de rôles).

## 2. Architecture retenue

- **Microsoft Graph côté serveur, flux « client credentials »** (application sans utilisateur),
  authentification par **certificat** (clé privée générée sur le VPS, jamais transmise ; seul
  le certificat public est déposé dans Entra). Pas de secret client à copier-coller.
- **Deux applications Entra distinctes** pour séparer réellement les droits côté Microsoft :
  - `5sursync CRM – lecture et brouillons` : rôle Exchange `Application Mail.ReadWrite`
    (lecture, synchronisation, création de brouillons et de réponses ; **ne permet pas d'envoyer**) ;
  - `5sursync CRM – envoi` : rôle Exchange `Application Mail.Send` (envoi uniquement).
  Option plus stricte : une troisième application en `Application Mail.Read` pour la seule
  synchronisation (la seconde ne servant qu'aux brouillons).
- **Aucune permission Microsoft Graph dans Entra** (pas de `Mail.*` application, pas de
  consentement administrateur) : Microsoft précise que les droits Entra s'**ajoutent** aux
  droits Exchange RBAC et annuleraient la restriction à une seule boîte.
- **Portée Exchange limitée à la seule boîte contact@** par une étendue de gestion
  (management scope).
- **Synchronisation par interrogation (« delta query ») toutes les 2 minutes**, dossiers
  Boîte de réception et Éléments envoyés, identifiants immuables (`Prefer: IdType="ImmutableId"`).
  Pas de webhook : il exigerait une route publique entrante ; l'interrogation reprend seule
  après une interruption grâce au `deltaLink` mémorisé.
- **Production uniquement, avec isolation réelle de la préproduction** : voir section 7.
  L'absence de certificat ne suffit pas, la base étant partagée.
- Droits dans le CRM, par administrateur : **lecture**, **rédaction**, **envoi** (nouveau champ,
  migration additive). Journal de qui a préparé et qui a envoyé chaque message.

## 3. Droits exacts demandés

| Où | Objet | Droit | Portée |
|---|---|---|---|
| Entra ID | Application `5sursync CRM – lecture et brouillons` | **aucune** permission API, aucun consentement | — |
| Entra ID | Application `5sursync CRM – envoi` | **aucune** permission API, aucun consentement | — |
| Exchange Online | Pointeur de principal de service (lecture et brouillons) | `Application Mail.ReadWrite` | étendue `5sursync CRM - boite contact` |
| Exchange Online | Pointeur de principal de service (envoi) | `Application Mail.Send` | étendue `5sursync CRM - boite contact` |
| Exchange Online | Étendue de gestion | `PrimarySmtpAddress -eq '<adresse vérifiée>'` | une seule boîte |
| Boîte partagée | contact@ | **inchangée** : pas de mot de passe, connexion directe toujours bloquée | — |

Ce que `Mail.ReadWrite` permet techniquement sur contact@ : lire, créer, modifier et supprimer
des messages. Le code du CRM se limite à lire, créer des brouillons et des réponses brouillon,
et modifier ses propres brouillons ; il ne supprime ni ne déplace aucun message reçu.

Rôles administrateur nécessaires pour faire les étapes : **Exchange Administrator** (ou membre
du groupe Organization Management) pour Exchange ; **Application Administrator** ou
**Cloud Application Administrator** pour Entra. Un Global Administrator a les deux.

Délai Microsoft : les droits Exchange RBAC peuvent mettre **30 minutes à 2 heures** à
s'appliquer (cache) ; `Test-ServicePrincipalAuthorization` voit le résultat immédiatement.

## 4. Étapes d'administration (à exécuter après validation)

### Étape 1 — Vérifier la boîte (Exchange Online PowerShell, lecture seule)
```powershell
Connect-ExchangeOnline -UserPrincipalName <votre compte admin>
Get-Recipient -Identity contact@5sursync.com | Format-List Name,RecipientTypeDetails,PrimarySmtpAddress
Get-Mailbox -Identity contact@5sursync.com | Format-List DisplayName,RecipientTypeDetails,PrimarySmtpAddress,UserPrincipalName,ExternalDirectoryObjectId,EmailAddresses
```
Attendu : `RecipientTypeDetails = SharedMailbox`. Me transmettre `PrimarySmtpAddress`,
`UserPrincipalName`, `ExternalDirectoryObjectId` (ce ne sont pas des secrets).
Si `contact@` est un alias d'une autre boîte ou un groupe : s'arrêter et en discuter.
Contrôle que la connexion directe reste bloquée : Entra > Utilisateurs > la boîte >
« Connexion bloquée » = Oui (ne rien changer).

### Étape 2 — Certificats (FAIT le 8 octobre 2026, 17:31 UTC, par l'agent)
Deux paires RSA 3072, auto-signées, SHA-256, valables jusqu'au **8 octobre 2027** :

| Application | Certificat public (à charger dans Entra) | Clé privée (VPS uniquement) | Empreinte SHA-1 |
|---|---|---|---|
| lecture et brouillons | `deployment/m365/m365-read.cer` (CN=5sursync CRM lecture-brouillons) | `secrets/m365_read_key.pem` (400) | `5081B73D1C2F271E38DC86385C30C3B7C5DDD287` |
| envoi | `deployment/m365/m365-send.cer` (CN=5sursync CRM envoi) | `secrets/m365_send_key.pem` (400) | `FE928D8B969D3BF24C949AE0510D7552FC84452A` |

Après chargement, Entra affiche l'empreinte : elle doit être identique. Les clés privées n'ont
jamais été affichées ni copiées.

### Étape 3 — Applications Entra (portail Entra, Identité > Applications > Inscriptions d'applications)
Pour chacune des deux applications :
1. « Nouvelle inscription » : nom ci-dessus ; « Comptes dans cet annuaire organisationnel
   uniquement » ; pas d'URI de redirection.
2. « Autorisations des API » : supprimer `User.Read` (délégué, ajouté par défaut). N'ajouter
   **aucune** permission ; ne pas cliquer « Accorder le consentement ».
3. « Certificats et secrets » > Certificats > Charger le `.cer` correspondant. Ne créer
   **aucun** secret client.
4. Noter : ID d'application (client), et dans **Applications d'entreprise** (pas
   « Inscriptions ») l'**ID d'objet** du principal de service.

### Étape 4 — Droits Exchange limités à la boîte
```powershell
New-ServicePrincipal -AppId <AppId lecture> -ObjectId <ObjectId entreprise lecture> -DisplayName "5sursync CRM lecture-brouillons"
New-ServicePrincipal -AppId <AppId envoi> -ObjectId <ObjectId entreprise envoi> -DisplayName "5sursync CRM envoi"
New-ManagementScope -Name "5sursync CRM - boite contact" -RecipientRestrictionFilter "PrimarySmtpAddress -eq '<PrimarySmtpAddress vérifiée>'"
New-ManagementRoleAssignment -Name "5sursync CRM lecture-brouillons contact" -App <ObjectId entreprise lecture> -Role "Application Mail.ReadWrite" -CustomResourceScope "5sursync CRM - boite contact"
New-ManagementRoleAssignment -Name "5sursync CRM envoi contact" -App <ObjectId entreprise envoi> -Role "Application Mail.Send" -CustomResourceScope "5sursync CRM - boite contact"
```

### Étape 5 — Contrôles de restriction (à faire avant tout branchement)
```powershell
Test-ServicePrincipalAuthorization -Identity "5sursync CRM lecture-brouillons" -Resource contact@5sursync.com | Format-Table
Test-ServicePrincipalAuthorization -Identity "5sursync CRM lecture-brouillons" -Resource <une autre boîte, ex. ydiop@5sursync.com> | Format-Table
Test-ServicePrincipalAuthorization -Identity "5sursync CRM envoi" -Resource contact@5sursync.com | Format-Table
Test-ServicePrincipalAuthorization -Identity "5sursync CRM envoi" -Resource <une autre boîte> | Format-Table
Get-ApplicationAccessPolicy   # anciennes politiques : aucune ne doit concerner ces applications
```
Attendu : `InScope = True` pour contact@, `False` pour l'autre boîte.
Côté Entra : Applications d'entreprise > chaque application > Autorisations : **liste vide**
(aucune permission accordée par un administrateur).
Puis, côté agent, contrôle réel par Graph : lecture de contact@ autorisée ; lecture et envoi
depuis une autre boîte **refusés (403)** — sans aucun envoi réel.

## 5. Fonctions prévues (après validation)

- Fiches entreprise et contact : historique des messages reçus et envoyés (y compris ceux
  envoyés depuis Outlook dans cette boîte), lecture d'un message, pièces jointes.
- Rattachement (règle renforcée le 8/10 après avis de Charlie) : automatique **seulement** si
  l'adresse exacte correspond à **un seul contact** et à rien d'autre (ni doublon, ni adresse
  générale d'une autre entreprise). Adresse générale d'entreprise seule, doublon, plusieurs
  fiches, domaine seul ou adresse inconnue → **file « À attribuer »**, attribution manuelle
  journalisée et jamais remplacée par la synchronisation.
  Domaines de messagerie publics (gmail.com…) jamais utilisés pour suggérer une entreprise.
- Nouveau message en brouillon ; réponse dans le **vrai fil** (`createReply` de Graph) ;
  enregistrer ne fait **jamais** partir le message.
- Envoi uniquement par un bouton explicite, pour un administrateur ayant le droit « envoi »,
  avec récapitulatif (expéditeur contact@, destinataires, objet).
- Signature professionnelle validée ajoutée **une seule fois** (bloc marqué, non dupliqué en
  cas de réponse ou de réenregistrement).
- États distincts : « accepté par Microsoft » (réponse 202 de Graph), « présent dans les
  Éléments envoyés » (constaté par la synchronisation), « échec de livraison » (rapport de
  non-remise reçu, rattaché au prospect). Jamais présentés comme une preuve de réception.
- Délai dépassé ou résultat incertain : état « incertain », vérification dans Éléments envoyés
  et Brouillons avant toute nouvelle tentative ; aucune relance automatique.
- Adresse rejetée (non-remise) : marquée, envoi vers elle bloqué jusqu'à levée manuelle.
- HTML des emails : nettoyé côté serveur (liste blanche), affiché dans un cadre isolé sans
  script, images distantes bloquées par défaut. Pièces jointes servies par une route CRM
  authentifiée, en téléchargement, sans stockage disque.
- Fonctions internes pour Charlie (sans route publique) : rechercher un contact, lire son
  historique, préparer un brouillon, envoyer un brouillon autorisé, enregistrer une activité.

## 6. Décisions

Prises (8 octobre, recommandation de Charlie relayée par le propriétaire) : **deux
applications** ; **reprise initiale des 90 derniers jours** (au premier lancement, filtre
`receivedDateTime ge` J-90 sur chaque dossier, limité à 5 000 messages par dossier par Graph).

Prises le 8 octobre (propriétaire) : **option B** (base de préproduction séparée) ;
l'assistante **prépare des brouillons**, l'envoi reste au propriétaire ; étapes Microsoft
exécutées par **Charlie**, à défaut par le propriétaire ; droits et étapes **validés**.

En attente : adresse de test pour l'unique envoi réel de recette.

## 7. Isolation de la préproduction (base partagée)

### Constat (lecture seule, 8 octobre)
PostgreSQL 17.11, une base `syncit`, un seul identifiant applicatif `syncit` (superutilisateur),
utilisé par la production **et** la préproduction (même secret `database_uri`). Les deux
conteneurs partagent aussi le **même `payload_secret`** et les **mêmes volumes**
`private_files` (fichiers clients du Support) et `public_media`. Droits hérités : `PUBLIC`
peut se connecter à toutes les bases (`CONNECT`, `TEMP` par défaut) et a `USAGE` sur le schéma
`public` (pas `CREATE`, comportement PostgreSQL ≥ 15). Aucun privilège par défaut défini.

### Option A — interdire seulement un schéma `crm_mail` : insuffisante
Même avec un identifiant de préproduction sans droit sur `crm_mail`, la préproduction
garderait la main sur ce qui gouverne la production :
- `admins` et `admins_sessions` : créer un administrateur, changer un hachage de mot de passe,
  ouvrir une session ; les futurs droits messagerie (lecture, rédaction, envoi) seraient
  stockés au même endroit et modifiables ;
- le **`payload_secret` partagé** permet de fabriquer un jeton administrateur valide en
  production, sans même toucher la base : c'est décisif ;
- `payload_migrations`, globals et contenus affichés en production (`pages`, `pages_copy`,
  `social_links`…), registres d'emails `app_*`, demandes de contact, CRM ;
- volume `private_files` (pièces jointes clients du Support).
Des droits par colonne ou des règles RLS ne fermeraient pas le point du secret partagé et
seraient fragiles à chaque migration. **Option écartée.**

### Option B — base de préproduction séparée : recommandée
- Nouvel identifiant `syncit_preprod` (non superutilisateur, sans `CREATEROLE` ni `CREATEDB`)
  propriétaire d'une nouvelle base `syncit_preprod` ; `REVOKE CONNECT, TEMP ON DATABASE syncit
  FROM PUBLIC` : la préproduction ne peut plus ouvrir la base de production.
- Nouveau `payload_secret_preprod` ; nouveaux volumes `private_files_preprod` et
  `public_media_preprod` (copie des médias publics).
- Contenu de la base de préproduction : migrations, puis **copie du seul contenu public**
  (pages, textes, réseaux sociaux, projets, études de cas, médias). **Aucune donnée client**
  (CRM, demandes de contact, tickets, comptes) et **aucun compte administrateur** : le
  propriétaire crée son accès de préproduction lui-même par le tunnel privé, comme pour le
  premier administrateur.
- Droits futurs : les migrations de préproduction tournent avec `syncit_preprod`, propriétaire
  de sa base ; les objets qu'elles créent lui appartiennent, sans aucun lien avec `syncit`.
  En production, `crm_mail` appartient à `syncit`, avec `REVOKE ALL ON SCHEMA crm_mail FROM
  PUBLIC` et privilèges par défaut du schéma sans `PUBLIC` pour les tables et séquences.
  Limite PostgreSQL vérifiée en test : le droit `EXECUTE` accordé par défaut à `PUBLIC` sur
  les **nouvelles fonctions** ne peut pas être retiré schéma par schéma ; c'est l'absence de
  `USAGE` sur `crm_mail` qui empêche tout autre rôle de les appeler (« permission denied for
  schema crm_mail », contrôlé).
- Effort : environ une demi-journée de travail de l'agent (création, copie du contenu,
  `compose.yaml`, procédure de migration en deux passes, recette complète de la préproduction),
  quelques minutes d'interruption de la préproduction, aucune interruption de la production.
  Action du propriétaire : créer son compte administrateur de préproduction.
- **Conséquence d'usage** : une modification de contenu faite dans l'admin de préproduction
  n'apparaîtra plus en production (aujourd'hui elle apparaît, la base étant commune).
  Le contenu de production se modifie dans l'admin de production.
- Chaque migration future se lance deux fois (préproduction puis production) : documenté
  dans la procédure de déploiement.

### Réalisé (8 octobre 2026, 17:29–17:33 UTC, par l'agent, après validation de l'option B)
1. Sauvegarde complète vérifiée : `backups/20261008T172946Z/` (dump de la base, 38 tables de
   données ; fichiers ; `compose.yaml` et `compose.production.yaml`).
2. Secrets générés sans affichage (`deployment/generate-preprod-secrets.py`) :
   `secrets/db_password_preprod`, `database_uri_preprod`, `payload_secret_preprod` (600).
3. `deployment/create-preprod-database.py` (mot de passe transmis à psql sur l'entrée
   standard, jamais en ligne de commande) : rôle `syncit_preprod` (ni superutilisateur, ni
   CREATEDB, ni CREATEROLE, ni BYPASSRLS, NOINHERIT), base `syncit_preprod` dont il est
   propriétaire ; `REVOKE ALL ON DATABASE syncit, postgres, syncit_preprod FROM PUBLIC`.
4. `compose.yaml`, service `app` : secrets `database_uri_preprod` et `payload_secret_preprod`,
   volumes `private_files_preprod` et `public_media_preprod`. `compose.production.yaml`
   inchangé (vérifié par `docker compose config`).
5. Les 9 migrations appliquées à `syncit_preprod` avec l'identifiant de préproduction
   (l'extension `pg_trgm` est « trusted » : créée sans superutilisateur).
6. Contenu public copié en une transaction (8 tables : pages, pages_copy, social_links,
   social_links_links, media, projects, case_studies, case_studies_tags ; 9 / 348 / 1 / 1 / 4 /
   9 / 8 lignes) et 4 fichiers médias. **0 administrateur, 0 entreprise, 0 demande, 0 activité.**
7. Préproduction recréée (étiquette de retour `5sursync:pre-isolation-preprod`), saine.

Preuves : depuis le conteneur de préproduction, avec son propre identifiant :
`syncit_preprod` connexion OK (`rolsuper = false`) ; `syncit` **refusé** (« permission denied
for database "syncit" ») ; `postgres` refusé. Secrets visibles dans le conteneur :
`database_uri_preprod`, `payload_secret_preprod` uniquement. HTTPS préproduction : /, /contact,
/realisations, /a-propos, /support/connexion, /api/health, un média : 200 ; /crm et /admin 401 ;
/support 307 ; titres de /realisations identiques à la production ; 0 erreur au journal.
Production inchangée : saine, /, /contact, /api/health 200, /crm 401, 214 entreprises.

**Action du propriétaire** : la préproduction n'a plus aucun administrateur. Pour s'y
connecter, créer son compte par le tunnel SSH privé (même procédure que le premier
administrateur, `BOOTSTRAP_ADMIN_EMAIL=ydiop@5sursync.com`, port local 3105).
**Désormais** : le contenu de production se modifie dans l'admin de production ; toute
migration future se lance deux fois (préproduction : `docker compose run --rm --no-deps app
npx payload migrate` ; production : avec l'image et les secrets de production).

### Dans tous les cas
- Certificats montés **uniquement** dans `app-production` ; module messagerie actif seulement
  si `MAIL_ENABLED=true`, `APP_ORIGIN=https://5sursync.com` et certificats présents.
- **Retour arrière de la fonction** : `MAIL_ENABLED` retiré et certificats démontés en
  production (synchronisation et envoi arrêtés, données `crm_mail` conservées et inertes).
  Les restrictions d'accès restent en place ; **aucun retour au compte superutilisateur
  partagé** pour la préproduction.

### Ce qui est conservé dans `crm_mail`
Uniquement des **identifiants Microsoft et des métadonnées** : identifiant immuable,
`internetMessageId`, `conversationId`, dossier, expéditeur, destinataires, objet, dates, présence
de pièces jointes, états d'envoi, rattachements, auteur et horodatages des actions. **Aucun
corps de message, aucun extrait (`bodyPreview`), aucune pièce jointe**, y compris pour les
brouillons et la file d'envoi : le texte d'un brouillon vit dans le dossier Brouillons de
contact@ et il est relu ou modifié par Graph.

## 8. Règles de test

- Développement et tests automatiques contre un **faux service Graph local**, sur base
  jetable, sans réseau : aucun appel à Microsoft, aucun envoi.
- **Aucun appel d'envoi « censé être refusé »** vers un destinataire réel. Le refus d'envoi
  depuis une autre boîte est vérifié par `Test-ServicePrincipalAuthorization` (simulation
  Exchange, n'envoie rien). Les contrôles réels de refus par Graph portent sur la **lecture**
  (requêtes GET).
- Pendant la recette, le code n'accepte comme destinataire **que les adresses de la liste de
  recette** (`MAIL_SEND_ALLOWLIST`), confirmées par le propriétaire ; tout autre destinataire
  est refusé avant tout appel à Microsoft. La liste est levée seulement après validation.
- Un seul envoi réel prévu, vers l'adresse de test confirmée, après accord explicite.
- Aucun test sur de vrais prospects.

## 9. Signature

Validée par le propriétaire (8 octobre) : slogan **« Des solutions informatiques pour faire
avancer votre entreprise. »**, logo horizontal **à droite du texte**, WhatsApp
+221 76 881 30 39, identité de la boîte partagée (pas de nom de personne). Charte : bleu nuit
`#092234`, turquoise `#2ee9d8`. Mise en page HTML en deux colonnes (texte à gauche, logo à
droite, logo joint au message plutôt qu'en image distante) et version texte :

```
--
L'équipe 5/Sync IT
Des solutions informatiques pour faire avancer votre entreprise.
Almadie 2, Résidence El'hadji Oumar Dieng, 4ème A, Dakar, Sénégal
Tél. +221 33 805 79 09 · +221 77 097 29 08 · WhatsApp +221 76 881 30 39
contact@5sursync.com · https://5sursync.com
```

Ajoutée une seule fois (tableau `id`/`class` = `sync5-signature`, détecté avant tout ajout ;
corrigé le 9/10 : le code n'a jamais utilisé `data-5sync-signature`).
Rendu exact à valider sur capture avant la recette.

## 10. Certificats : renouvellement et alerte

- Validité 12 mois. Date d'expiration lue dans le certificat par l'application à chaque
  démarrage et chaque jour.
- Alerte à **J-30, J-14, J-7 et J-1** : bandeau dans le CRM pour les administrateurs, et email
  au propriétaire par le SMTP no-reply existant (une seule fois par palier, enregistré).
  Bandeau rouge et synchronisation suspendue proprement à l'expiration.
- Renouvellement sans coupure : générer une nouvelle paire sur le VPS ; charger le nouveau
  `.cer` dans Entra **à côté** de l'ancien (Entra accepte plusieurs certificats) ; remplacer le
  fichier secret ; redémarrer `app-production` ; vérifier la synchronisation ; retirer
  l'ancien certificat dans Entra. Commandes : section 13.
- Réalisé dans le code : `src/lib/mail/worker.ts` (`certThreshold`, `certificateAlerts`,
  paliers 30/14/7/1/0 jours, registre `crm_mail.cert_alerts`, une alerte par palier et par
  certificat ; email à `MAIL_ALERT_TO` par le SMTP no-reply si `SMTP_ENABLED=true`, sinon
  bandeau seul) ; bandeau dans `src/app/(crm)/crm/layout.tsx` dès J-30.

## 11. Fonctions internes pour Charlie (`src/lib/mail/service.ts`)

Mêmes fonctions que les pages `/crm` : chacune vérifie d'abord le droit de l'acteur
(`MailActor = { id, level, channel }`, `channel = "charlie"` pour journaliser l'origine).
**Aucune route publique ne les expose.** Brancher Charlie demandera une étude séparée : mode de
connexion réellement pris en charge par Charlie, authentification forte, compte
administrateur dédié avec son propre droit (`draft` recommandé), journalisation ; une API ou
un serveur MCP ne suffit pas à lui seul.

| Fonction | Droit minimal | Effet |
|---|---|---|
| `searchContacts(deps, actor, texte)` | lecture | contacts et entreprises (20 au plus) |
| `history(deps, actor, { clientId } \| { contactId })` | lecture | métadonnées des échanges et brouillons d'une fiche |
| `readMessage(deps, actor, id, "text" \| "html")` | lecture | corps relu chez Microsoft (HTML nettoyé), pièces jointes listées |
| `prepareDraft(deps, actor, { clientId, contactId, to, cc, subject, text })` | rédaction | brouillon dans contact@, signature unique ; **n'envoie jamais** |
| `prepareReply(deps, actor, messageId, text)` | rédaction | réponse en brouillon dans le vrai fil (`createReply`) |
| `updateDraft` / `submitDraft` / `discardDraft` | rédaction | modifier, signaler pour validation, abandonner |
| `sendAuthorizedDraft(deps, actor, draftId)` | **envoi** | envoi explicite d'un brouillon (contrôles ci-dessous) |
| `verifyDraft(deps, actor, draftId)` | lecture | vérification en lecture seule après un résultat incertain |
| `assign` / `unassign` | rédaction | rattachement manuel d'un message |
| `logActivity(payload, user, actor, { clientId, contactId, subject, messageId })` | rédaction | activité « Email » sur la fiche (objet et référence, jamais le corps) |
| `liftSuppression(deps, actor, adresse)` | envoi | lever le blocage d'une adresse rejetée |

Contrôles de `sendAuthorizedDraft`, dans l'ordre : droit « envoi » ; brouillon à l'état
`draft` ; relecture chez Microsoft (toujours brouillon, `changeKey` identique à celle écrite
par le CRM, destinataires réels y compris Cci) ; liste de recette ; adresses bloquées ;
réservation unique (`state='sending'`) ; appel `send` avec l'application d'envoi.

## 12. Activation en production (à faire après les étapes Microsoft)

1. Sauvegarde : `sh deployment/backup.sh` (+ `compose.production.yaml`).
2. Migrations `20261008_173554_crm_mail` et `20261008_185702_admin_rights` sur **les deux bases** (additive : colonne
   `admins.mail_access`, droit « envoi » donné à ydiop@5sursync.com, schéma `crm_mail`) :
   préproduction : `RELEASE_TAG=mail-preprod-20261008 sudo -E docker compose run -T --rm --no-deps app npx payload migrate` ;
   production : `sudo docker compose -f compose.yaml -f compose.production.yaml run -T --rm --no-deps app-production npx payload migrate`
   avec l'image `5sursync:mail-20261008` dans `compose.production.yaml`. Il faut voir les deux
   lignes `Migrated:` puis `Done.`
3. Code sans activation : image `5sursync:mail-20261008` en production,
   `5sursync:mail-preprod-20261008` en préproduction. Les pages affichent « Messagerie non
   activée ». Aucune connexion à Microsoft.
4. Après les étapes 1 à 5 de la section 4 : compléter
   `deployment/compose.production.mail.yaml` à partir du modèle `.example`, avec
   `MAIL_SEND_ALLOWLIST` = adresse de test confirmée, puis redémarrer `app-production` avec ce
   fichier en plus. Contrôles : onglet « État et diagnostic » (dernier succès, aucune
   erreur), messages reçus et envoyés des 90 derniers jours visibles, file « À attribuer ».
5. Recette réelle (section 15), puis `MAIL_SEND_ALLOWLIST: '*'` sur décision du propriétaire.

Retour arrière : retirer `deployment/compose.production.mail.yaml` de la commande et
redémarrer (synchronisation et envoi arrêtés, données `crm_mail` conservées et inertes) ;
image précédente `5sursync:whatsapp-20261008` possible (le schéma ajouté lui est indifférent).
Les restrictions d'accès PostgreSQL de la préproduction restent en place. Le `down` de la
migration supprime le schéma `crm_mail` et ses données : sauvegarde avant.

## 13. Diagnostic et reprise

- Onglet **/crm/messagerie → État et diagnostic** : par dossier, date de reprise initiale,
  dernier passage, dernier succès, reprise terminée ou en cours, dernière erreur (code court) ;
  configuration (boîte, 90 jours, état de l'envoi, expiration des certificats) ; adresses
  bloquées ; bouton « Synchroniser maintenant ».
- Codes d'erreur : `graph-401/403-…` (droits Exchange ou certificat : refaire l'étape 5),
  `token-refused` / `invalid_client` (certificat absent d'Entra ou expiré), `graph-unavailable`
  (Microsoft ou réseau : reprise automatique au passage suivant), `reset:SyncStateNotFound`
  (Microsoft a perdu l'état : reprise automatique depuis la même date, sans doublon).
- Interruption (redémarrage, coupure) : la synchronisation reprend au `nextLink` ou au
  `deltaLink` enregistré ; un envoi interrompu passe « incertain » (jamais relancé) ; utiliser
  « Vérifier l'état » sur le brouillon.
- Journal applicatif : lignes `crm-mail:` uniquement avec des codes, jamais de contenu.
- Renouvellement d'un certificat (exemple « lecture ») :
  ```
  umask 077
  openssl req -x509 -newkey rsa:3072 -sha256 -days 365 -nodes -subj "/CN=5sursync CRM lecture-brouillons/O=5sursync IT" \
    -keyout secrets/m365_read_key.new.pem -out deployment/m365/m365-read.new.cer
  ```
  charger `m365-read.new.cer` dans Entra à côté de l'ancien ; remplacer les fichiers
  (`mv`, droits 400 pour la clé) ; redémarrer `app-production` ; vérifier « Dernier succès » ;
  supprimer l'ancien certificat dans Entra.

## 14. Code et tests (8 octobre 2026)

Code : `src/lib/mail/` (`access.ts`, `config.ts`, `graph.ts`, `rules.ts`, `store.ts`,
`sync.ts`, `service.ts`, `worker.ts`, `crm.ts`), `src/app/(crm)/crm/messagerie/` (liste,
message, version HTML isolée, pièces jointes, nouveau mail, brouillon, actions),
`src/components/crm/mail.tsx`, section « Emails contact@ » des fiches entreprise et contact,
menu « Messagerie contact@ », champ `mailAccess` des administrateurs
(`src/collections/index.ts`), migration `20261008_173554_crm_mail`.

Droits des comptes (séparés du droit d'envoi le 8/10, après avis de Charlie) :
- nouveau droit **« Gère les comptes administrateurs »** (`manageAdmins`, migration
  `20261008_185702_admin_rights`), donné au seul propriétaire ydiop@5sursync.com (et, sur une
  base neuve, au premier compte créé par la procédure d'amorçage privée) ;
- sans ce droit, un administrateur ne modifie que son propre nom et mot de passe : il ne
  crée, ne modifie ni ne supprime aucun autre compte, **même avec le droit d'envoi** ;
- les droits (`mailAccess`, `manageAdmins`) ne sont modifiables que par un gestionnaire des
  comptes, et **jamais sur son propre compte** (pas d'auto-élévation, même par appel direct
  à l'API) ;
- testé par appels directs à l'API REST pour l'assistante (brouillons), un expéditeur sans
  gestion des comptes et le propriétaire.

Tests (aucun appel à Microsoft, aucun email réel, réseau Docker interne) :
- `npm test` : 45 réussis, 9 ignorés (PostgreSQL), dont `tests/mail.test.ts` (9 : droits,
  destinataires et liste de recette, rattachement exact et ambiguïté, rapports de non-remise,
  signature unique et logo à droite, nettoyage HTML, assertion de certificat RS256/x5t,
  activation production seulement, paliers d'alerte) ;
- `tests/mail-integration.ts` : **58/58** sur PostgreSQL jetable et faux Graph
  (`tests/fake-graph.ts`, qui vérifie la signature des jetons et simule le RBAC Exchange) ;
- `tests/mail-run.sh` + `tests/mail-e2e.py` : **48/48** dans Chromium (application complète
  avec messagerie activée contre le faux Graph, certificats de test générés pour l'occasion) ;
- non-régression : `tests/crm-run.sh` 133/133 (WhatsApp compris) ; `tests/admin-ux-run.sh`
  28/29, identique à la référence (échec ancien « logo de connexion »).
Preuves : `documentation/qa/crm-mail/`.

Limites connues :
- Le faux Graph reproduit le comportement documenté ; trois points ne seront prouvés qu'en
  recette réelle : conservation de l'`internetMessageId` et de l'identifiant immuable entre le
  brouillon et les Éléments envoyés, détection d'un rapport de non-remise Exchange réel,
  rendu de la signature dans Outlook et Gmail.
- Texte des mails en texte brut (pas d'éditeur riche) ; réponse à un seul fil par brouillon.
- Une modification du brouillon dans Outlook bloque l'édition et l'envoi depuis le CRM (pour
  ne rien écraser) : il faut alors terminer dans Outlook.
- La reprise initiale est plafonnée par Microsoft à 5 000 messages par dossier.
- Les messages déplacés vers un sous-dossier dans Outlook apparaissent « supprimé ou
  déplacé » (seuls Boîte de réception et Éléments envoyés sont suivis).
- Pas de webhook : délai de 2 minutes au plus (« Synchroniser maintenant » sinon).

## 15. Recette réelle (après activation, avec accord du propriétaire)

**La messagerie reste inactive en production jusqu'à la configuration Microsoft et à cette
recette.** Les tests contre le faux Microsoft ne prouvent pas les autorisations réelles des
applications : seuls l'étape 5 de la section 4 et les contrôles ci-dessous le font.

1. Étape 5 de la section 4 passée (InScope True / False) et liste Entra vide.
2. Lecture : l'onglet État montre les deux dossiers terminés ; un email envoyé à contact@
   depuis une adresse de test apparaît dans « À attribuer » ou sur la bonne fiche.
3. Refus réels en lecture seule : lecture d'une autre boîte par Graph → 403.
4. Brouillon, puis réponse dans le fil, depuis le CRM : présents dans les Brouillons de
   contact@ dans Outlook, signature unique, logo à droite, **rien d'envoyé**.
5. **Un seul envoi réel**, vers l'adresse de test confirmée par le propriétaire : « Accepté par
   Microsoft », puis « Présent dans les Éléments envoyés » ; expéditeur contact@ vu par le
   destinataire ; réponse du destinataire rattachée au même fil.
6. Absence de doublons après deux synchronisations.

### Recette réelle — 9 octobre 2026 (en cours, ni production ni préproduction modifiées)
Étapes Entra/Exchange faites par le propriétaire : `Test-ServicePrincipalAuthorization` True pour
contact@, False pour ydiop@, pour chaque application. AppId lecture-brouillons
`3e51bee4-4a6b-42ab-95a2-cba6ac7a5517`, envoi `2f978a1d-831d-432f-a4c6-613f22b0b7d2`, ObjectId de
la boîte `8b3a8727-e9ac-480b-acac-7b6c5f18e482` (identifiants, pas des secrets).
Preuves et scripts : `documentation/qa/m365-recette/`.

- **a. Lecture et refus (script autonome, GET uniquement, 10:30 UTC) : RÉUSSI.** Jetons des deux
  applications obtenus par certificat (HTTP 200, aucun rôle Entra dans le jeton : droits portés
  uniquement par Exchange RBAC). contact@ lisible (200) ; ydiop@ refusé (403
  `ErrorAccessDenied`) pour les deux applications ; l'application envoi ne peut pas lire contact@
  (403). Aucun appel d'envoi. Seuls codes et compteurs affichés.
- **b. Brouillons (banc jetable, 10:32 UTC).** Script `recette-b.ts` lancé dans l'image
  `5sursync:admin-crm-link-preprod-20261009`, base PostgreSQL jetable `recette_test`, aucun port
  publié. Pas de serveur Next, donc **pas de worker, pas de synchronisation, pas de reprise
  90 jours** ; seuls les messages de `youssouphadiop@hotmail.fr` sont lus (filtre Microsoft
  + contrôle local). Envoi impossible : garde réseau (seuls jeton lecture, GET/POST/PATCH des
  chemins de brouillon de contact@ ; `/send`, `/reply`, `/forward`… refusés avant sortie),
  identité d'envoi factice non enregistrée dans Entra, `MAIL_SEND_ALLOWLIST` vide, acteur au
  niveau « brouillons ».
  - Brouillon neuf (CRM n°1, objet « [RECETTE 5sursync] Brouillon de test – ne pas envoyer », à
    youssouphadiop@hotmail.fr) : présent dans Brouillons, `isDraft` vrai, signature une fois
    (première ligne et slogan 1 fois), logo inline `5sync-it.jpg` référencé une fois.
  - Message de test déjà présent : 1 message de l'adresse de test, reçu le 08/10 à 17:25 UTC,
    objet « TEST ».
  - Réponse en brouillon dans le fil : **en attente de la confirmation du propriétaire**.
  - Rendu visuel de la signature et du logo dans Outlook : **à vérifier par le propriétaire** ;
    brouillons conservés jusqu'à sa validation.
- 9/10, 10:39 UTC, à la demande du propriétaire (boîte nettoyée le matin, anciens messages et
  brouillons à ignorer) : nouveau brouillon CRM n°2 « [RECETTE 5sursync] Nouveau test signature –
  09/10/2026 10:39 (heure de Dakar, UTC) » à youssouphadiop@hotmail.fr, dans Brouillons,
  signature une fois, logo inline une fois. Rendu visuel à valider par le propriétaire dans Outlook.
- Expéditeur (9/10, 10:45 UTC, lecture seule) : le propriétaire voit « De : ydiop@5sursync.com »
  en ouvrant le brouillon n°2 dans Outlook. Graph : `from` et `sender` **vides** sur le brouillon,
  `changeKey` inchangé depuis la création (Outlook n'a rien enregistré). Le CRM ne fixe aucun
  expéditeur ; Outlook propose donc le compte par défaut de la personne qui ouvre le brouillon.
  Chemin d'envoi du CRM : `POST /users/{ObjectId contact@}/messages/{id}/send` avec l'application
  envoi, limitée par Exchange à contact@ (ydiop@ InScope False) : l'expéditeur attendu est la boîte
  qui contient le message, contact@. Non prouvé tant qu'aucun envoi réel : à contrôler lors de
  l'envoi de recette (`from`/`sender` de l'élément envoyé et en-têtes chez le destinataire).
  Risque : un brouillon envoyé **depuis Outlook** avec « De » laissé sur ydiop@ partirait de ydiop@.
- **Correctif expéditeur (9/10, code testé sur banc, non déployé)** :
  - `service.ts` : `from` et `sender` = adresse de la boîte (`MAIL_MAILBOX_ADDRESS`) à la
    création d'un brouillon (`POST /messages`), dans le `PATCH` d'une réponse (`createReply`) et à
    chaque réenregistrement (`updateDraft`).
  - Avant tout envoi (`sendAuthorizedDraft`), lecture du brouillon par `/users/{contact@}` puis
    `rules.ts` `senderRefusal` : envoi **bloqué avant tout appel d'envoi** si le brouillon est
    introuvable dans contact@, si `from` est vide ou différent de contact@, ou si `sender` est
    renseigné et différent ; message d'erreur explicite dans le CRM. Ce contrôle précède celui de
    la modification dans Outlook et la liste de recette.
  - Faux Graph : `from`/`sender` conservés, contact@ par défaut à l'envoi (comportement Exchange),
    contrôle `set-from`. Tests : unitaire « sender » ; intégration +8 (brouillon et réponse avec
    contact@, blocage De = ydiop@, De vide, sender = ydiop@, brouillon hors boîte, aucun envoi et
    état inchangé, message envoyé avec contact@). Résultats : typecheck 0, unitaires 49/9 ignorés,
    intégration 66/66, navigateur 48/48. Image de banc `5sursync:mail-sender-test-20261009`.
  - Réel (10:56 UTC) : brouillon n°3 « [RECETTE 5sursync] Test expéditeur contact@ – 09/10/2026
    10:56 » ; Graph renvoie `from` et `sender` = contact@5sursync.com (nom affiché « contact »,
    nom d'affichage de la boîte dans Exchange). Affichage du champ De dans Outlook à confirmer par
    le propriétaire. Aucun envoi.
- **Envoi réel unique (9/10, 11:11 UTC, autorisé par le propriétaire)** depuis le banc, par le
  chemin du CRM (`sendAuthorizedDraft`) et l'application envoi ; `MAIL_SEND_ALLOWLIST` =
  youssouphadiop@hotmail.fr ; garde : un seul `POST /send`, pour le seul brouillon créé dans
  l'exécution, refus si une tentative existe déjà. Brouillon n°4 « [RECETTE 5sursync] Envoi de
  test unique – 09/10/2026 11:11 (heure de Dakar, UTC) » (signature 1, logo 1) : **« accepted »
  (202)**, 1 appel d'envoi. Vérification lecture seule (`verifyDraft`, 11:11:13) : état
  **in_sent**, 1 élément dans les Éléments envoyés de contact@, `isDraft` faux, `from` et
  `sender` = contact@5sursync.com, destinataire youssouphadiop@hotmail.fr, envoyé 11:11:05 UTC.
  **Non livré** : rapport de non-remise reçu dans contact@ à 11:11:07 UTC, `550 5.7.708 Service
  unavailable. Access denied, traffic not accepted from this IP … AS(7230)` (statut Failed confirmé
  par Charlie dans le suivi Exchange ; locataire alors en essai gratuit). 202 et présence dans les
  Éléments envoyés ne prouvaient pas la livraison.
- **Second envoi unique (9/10, 11:38:59 UTC, autorisé après passage à l'abonnement payant)**, même
  chemin et mêmes gardes (garde par objet : une seule tentative par objet de recette). Brouillon
  n°5 « [RECETTE 5sursync] Vérification envoi après passage au payant – 09/10/2026 11:38 UTC » :
  202 « accepted », 1 appel d'envoi, Message-ID
  `<AS2PR09MB5959FB98858BD1E1D9A2A82C93922@AS2PR09MB5959.eurprd09.prod.outlook.com>` ; dans les
  Éléments envoyés avec from et sender = contact@5sursync.com. **Rapport de non-remise à 11:39:02 :
  même rejet 550 5.7.708 AS(7230)** `[AS8PR09MB6433.eurprd09.prod.outlook.com
  2026-10-09T11:38:59.711Z 08DF249A4A1BE975]`. **Essais arrêtés** ; aucune permission élargie, DNS
  non modifié. Suivi Exchange non accessible à l'agent. Dossier pour le support Microsoft :
  `documentation/qa/m365-recette/support-microsoft-5.7.708.md`.
  Le code de l'envoi, les droits Graph/Exchange et l'expéditeur fonctionnent ; le blocage est la
  restriction d'envoi sortant du locataire côté Microsoft.
- Non fait (feu vert séparé) : activation en production ; réponse en brouillon dans un fil (attend un
  nouveau message de test) ; rattachement de la réponse du destinataire.
