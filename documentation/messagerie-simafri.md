# Messagerie du CRM via Simafri (SMTP + IMAP) — contact@crm.5sursync.com

**Mise à jour 9 octobre 2026, 14:55 UTC : EN PRODUCTION** (image `mail-simafri-20261009b`,
migrations appliquées, contrôle sans envoi OK, envoi limité à youssouphadiop@hotmail.fr ;
détails dans ETAT.md). Texte d'origine ci-dessous.

**Statut au 9 octobre 2026** : code et tests isolés terminés (banc jetable, aucun envoi
réel, aucune connexion authentifiée à la vraie boîte). **Rien n'est déployé ni activé.**
Production : migrations `crm_mail`, `admin_rights` et `crm_mail_imap` **non appliquées**,
messagerie inactive. Préproduction : jamais connectée à la vraie boîte (refus par conception).

## 1. Pourquoi

Les deux envois de recette Microsoft Graph (09/10, 11:11 et 11:38 UTC) ont été acceptés par
Graph (202) puis rejetés par Exchange : `550 5.7.708 Access denied, traffic not accepted
from this IP`, y compris après le passage au payant. Les permissions fonctionnaient ; le
blocage porte sur la livraison sortante du locataire (microsoft365.md, recette).
Décision du propriétaire : une boîte dédiée chez Simafri, `contact@crm.5sursync.com`.

Inchangés : le CRM reste sur https://5sursync.com/crm ; `crm.5sursync.com` ne sert qu'à la
messagerie ; les boîtes `@5sursync.com` restent chez Microsoft (routage non modifié) ; le
SMTP no-reply du site (`mail.5sursync.com:465`, `contact-smtp.ts`) n'est pas touché ;
applications, certificats et données Microsoft sont conservés (retour arrière, §8).

## 2. Paramètres

| Élément | Valeur | Vérification |
|---|---|---|
| Boîte, identifiant, expéditeur, réponse | `contact@crm.5sursync.com` | fournie par le propriétaire |
| Nom affiché | `L’équipe 5/Sync IT` | |
| SMTP | `mail.crm.5sursync.com:587`, STARTTLS obligatoire | certificat Let’s Encrypt valide, vérifié depuis le VPS le 09/10 (`openssl s_client -starttls smtp`) |
| IMAP | `da-uk2.hostns.io:993`, TLS implicite | certificat valide pour ce nom, vérifié le 09/10 |
| IMAP sur `mail.crm.5sursync.com:993` | **refusé** | certificat d'un autre nom (« hostname mismatch ») : jamais utilisé |
| Mot de passe | fichier secret serveur `secrets/crm_mail_password` | saisi par le propriétaire (§5) |
| Nom EHLO | `vmi3557177.contaboserver.net` (DNS inverse du VPS) | Simafri refuse un nom de ses propres domaines : « 550 Bad HELO - Host impersonating domain name » (constaté le 09/10 avec `crm.5sursync.com`) |

Ces valeurs sont **figées dans le code** pour la production (`SIMAFRI` dans
`src/lib/mail/config.ts`) : toute autre valeur (hôte, port, adresse, autorité de
certification de test) depuis l'origine de production désactive la messagerie
(« configuration »). À l'inverse, les vrais serveurs sont refusés depuis toute autre origine
(préproduction, bancs) : « origin ». La validation TLS n'est jamais désactivable : certificat
vérifié contre les autorités du système et le nom d'hôte, TLS 1.2 minimum, en IMAP comme en SMTP.

Variables (production) :

| Variable | Valeur |
|---|---|
| `MAIL_ENABLED` | `true` |
| `MAIL_PROVIDER` | `imap` (`graph` ou absent = Microsoft, conservé pour le retour arrière) |
| `MAIL_PASSWORD_FILE` | `/run/secrets/crm_mail_password` |
| `MAIL_SEND_ALLOWLIST` | absent = envoi fermé ; `youssouphadiop@hotmail.fr` pour la recette ; `*` = ouvert |
| `MAIL_SYNC_SINCE_DAYS` | facultatif, 90 par défaut (reprise initiale) |
| `MAIL_IMAP_DRAFTS_PATH`, `MAIL_IMAP_SENT_PATH` | seulement si le serveur n'annonce pas les attributs SPECIAL-USE (voir §6) |

Réservées aux bancs (refusées en production) : `MAIL_SMTP_HOST/PORT`, `MAIL_IMAP_HOST/PORT`,
`MAIL_ADDRESS`, `MAIL_USER`, `MAIL_TLS_CA_FILE`.

## 3. Ce qui change dans le code

Le CRM n'est pas réécrit : mêmes pages, mêmes tables, mêmes droits. Un seul fournisseur est
construit à la fois (`mailStatus()` → `mailDeps()`), choisi par `MAIL_PROVIDER` :
le connecteur Graph n'existe pas en mémoire quand Simafri est actif, et inversement. Chaque
brouillon porte son fournisseur ; un brouillon Microsoft ne peut pas partir par Simafri (et
inversement) : **aucun message ne peut partir par les deux**.

| Fichier | Rôle |
|---|---|
| `src/lib/mail/config.ts` | choix exclusif du fournisseur, paramètres Simafri figés, secret lu à chaque connexion (jamais sérialisable) |
| `src/lib/mail/imap.ts` | connexions IMAP (imapflow, sans journal) et SMTP pas à pas (nodemailer) ; dossiers par attributs ; codes d'erreur sans valeur |
| `src/lib/mail/imap-sync.ts` | synchronisation UID/UIDVALIDITY, reprise, dédoublonnage, rapports de non-remise |
| `src/lib/mail/imap-service.ts` | brouillons, réponses, envoi, copie dans Envoyés, vérification |
| `src/lib/mail/mime.ts` | construction MIME (texte + HTML, pièces jointes, logo intégré) et lecture (mailparser) |
| `src/lib/mail/rules.ts` | signature selon l'adresse de la boîte, classement des non-remises, libellés d'état SMTP |
| `src/lib/mail/service.ts` | contrôle des droits puis aiguillage Graph / Simafri |
| `src/migrations/20261009_150000_crm_mail_imap.ts` | migration **additive** (colonnes et état IMAP, aucune donnée modifiée) |
| `scripts/mail-imap-check.ts` | contrôle de connexion **sans envoi** (§5) |
| pages `/crm/messagerie…` | libellés selon le fournisseur, pièces jointes, actions « copie dans Envoyés » et « déclarer non parti » |

Dépendances ajoutées (versions exactes, `npm audit` : 0 vulnérabilité) : `imapflow` 2.3.0,
`mailparser` 3.9.37 ; en développement `smtp-server` 3.19.18 (faux serveur des tests).
`next.config.mjs` : actions serveur limitées à 5 Mo (pièces jointes, 4 Mo au total ; Nginx 6 Mo).

Conservé tel quel : entreprises, contacts, historiques, rattachements manuels (jamais écrasés
par une synchronisation, y compris après un changement d'UIDVALIDITY : testé), droits
lecture / rédaction / envoi / administration des comptes, validation explicite (case à cocher
+ confirmation) avant envoi, journal, protection contre le double envoi (verrou en base),
rattachement automatique seulement sur adresse exacte d'un seul contact, sinon « À attribuer ».
Aide supplémentaire sans automatisme : sur un message non rattaché d'un fil déjà rattaché, la
page l'indique (« À vérifier avant de rattacher »).

## 4. Fonctionnement

**Envoi (SMTP)** : le message MIME est construit une fois et déposé dans Brouillons. À l'envoi,
le CRM relit ce brouillon exact (UID + empreinte), vérifie l'expéditeur (`From` = la boîte,
`Sender` absent ou identique), l'absence de `Cci`, puis prend les destinataires **dans le
message lui-même** (pas dans le formulaire) et applique la liste de recette et les adresses
bloquées. Envoi des octets exacts (date remise à l'heure de l'envoi), enveloppe `MAIL FROM`
= la boîte. États distincts :

| État | Sens |
|---|---|
| Accepté par le serveur SMTP | réponse 250 ; pas une preuve de réception |
| Accepté, copie dans Envoyés | copie déposée par le CRM, ou déjà présente (serveur qui copie lui-même : pas de doublon, recherche par Message-ID avant tout dépôt) |
| Refusé par le serveur SMTP | le serveur a répondu par un refus, ou échec TLS / authentification / connexion **avant** tout envoi : rien n'est parti |
| Résultat incertain | connexion coupée après transmission, sans réponse : le message a pu partir ; jamais renvoyé automatiquement |
| Échec de livraison | rapport de non-remise reçu plus tard, avec sa nature (ci-dessous) |

Si SMTP accepte mais que la copie dans Envoyés échoue : l'état reste « Accepté par le serveur
SMTP », la page le signale et propose « Enregistrer la copie dans Envoyés » (dépôt IMAP
seulement, **aucun nouvel envoi** : testé). Un envoi incertain ne peut être remis en
brouillon que par une personne ayant le droit d'envoi, après case « J'ai vérifié : ce
message n'est pas parti » (journalisé) ; l'action n'envoie rien.

**Rapports de non-remise** : la partie `message/delivery-status` (RFC 3464) donne chaque
destinataire et son code. **Seule une adresse inexistante ou désactivée** (5.1.1, 5.1.2,
5.1.3, 5.1.6, 5.1.10, 5.2.1) **bloque l'adresse** pour les envois suivants. Un blocage de
transport ou de politique (5.7.x dont **5.7.708**, 5.4.x, boîte pleine 5.2.2…) est affiché
sur l'envoi sans bloquer le destinataire ; un retard (4.x.x, « delayed ») n'est pas un échec.
Le rapport est rattaché à l'envoi exact grâce au Message-ID d'origine qu'il cite, sinon par
adresse (30 jours). Le même classement s'applique désormais au chemin Microsoft (auparavant
tout rapport bloquait l'adresse : le rejet 5.7.708 aurait bloqué le destinataire de recette).
Limite : Exchange signale parfois une adresse inexistante en 5.4.1 ; classée « transport »,
donc non bloquée (choix prudent).

**Synchronisation IMAP (toutes les 2 minutes, production seulement)** : Réception et Envoyés,
ouverts en **lecture seule** (EXAMINE) et lus en `BODY.PEEK` : aucun message marqué lu,
déplacé, supprimé. Par dossier : UIDVALIDITY et dernier UID, enregistrés après chaque page
de 50 → une interruption reprend au dernier UID. UIDVALIDITY différente : relecture depuis la
date initiale ; les messages étant identifiés par leur Message-ID, aucun doublon. Message-ID,
In-Reply-To et References conservés ; fil = fil d'un message connu cité, sinon première
référence. Message supprimé dans le webmail : marqué « supprimé ou déplacé », historique
conservé. Corps et pièces jointes lus à la demande, jamais stockés (affichage HTML filtré,
sandbox CSP ; pièces jointes toujours en téléchargement, 25 Mo au plus, inchangé).

**Dossiers Brouillons et Envoyés** : identifiés par leurs attributs IMAP `\Drafts` et `\Sent`
(RFC 6154) tels qu'annoncés par le serveur, jamais par leur nom (testé avec des dossiers
leurres « Drafts » / « Sent » sans attribut). Si le serveur Simafri ne les annonce pas, la
messagerie refuse de fonctionner (« Dossiers non annoncés ») jusqu'à configuration explicite
de `MAIL_IMAP_DRAFTS_PATH` / `MAIL_IMAP_SENT_PATH` ; le contrôle du §5 le montre.

**Suppressions** : aucune suppression automatique. Seul le brouillon **créé par le CRM** est
retiré de Brouillons, par son UID seulement (`UID EXPUNGE`, extension UIDPLUS obligatoire,
sinon rien n'est retiré) : après envoi réussi et copie dans Envoyés, lors d'un réenregistrement
(nouvelle version déposée d'abord, ancienne retirée ensuite : jamais zéro brouillon), ou sur
« Abandonner ». Un brouillon modifié ailleurs n'est jamais retiré ni écrasé.

### Brouillons : où ils sont, ce qui est promis

Le texte d'un brouillon n'est pas en base : il est déposé (`APPEND`, drapeaux `\Draft \Seen`)
dans le dossier Brouillons de la boîte. Il est donc **visible dans le webmail Simafri et dans
Outlook** configuré en IMAP sur cette boîte, avec signature et pièces jointes. Le CRM retrouve
son brouillon par UIDVALIDITY + UID + empreinte des octets ; un message IMAP étant immuable,
toute modification faite ailleurs crée un autre message : le CRM l'affiche alors comme
« modifié dans le webmail ou Outlook » et refuse de l'écraser ou de l'envoyer (terminer
là-bas). **Pas de synchronisation bidirectionnelle promise** : un brouillon créé dans le
webmail n'apparaît pas dans le CRM, et une modification faite ailleurs n'est pas réimportée.
Le comportement réel du webmail Simafri (conserve-t-il le Message-ID en réenregistrant ?)
n'est pas testé : à observer lors de la recette.

### Signature

Signature validée réutilisée telle quelle (logo fixe à droite, charte, slogan « Des solutions
informatiques pour faire avancer votre entreprise. », coordonnées, WhatsApp +221 76 881 30 39),
avec l'adresse de la boîte active (`contact@crm.5sursync.com`). Une seule fois dans le HTML
et dans la version texte ; logo en pièce intégrée unique (`cid:sync5-logo`) : vérifié sur le
brouillon, après réenregistrement, sur la réponse et sur les octets reçus par le serveur SMTP.

## 5. Saisie du mot de passe (propriétaire, sur le VPS)

Le mot de passe ne passe ni par le chat, ni par Git, ni par le navigateur, ni par les
journaux. Le fichier est monté dans le seul conteneur de production (secret Docker) ; le
code le relit à chaque connexion et ne l'affiche jamais. Dans un terminal SSH sur `ina-relay` :

```bash
cd /home/inaops/5sursync
umask 077
IFS= read -rs -p "Mot de passe de contact@crm.5sursync.com : " P; echo
printf '%s' "$P" > secrets/crm_mail_password; unset P
chmod 400 secrets/crm_mail_password
ls -l secrets/crm_mail_password      # -r-------- inaops (uid 1001 = utilisateur du conteneur)
```

`read -s` n'affiche rien et rien n'entre dans l'historique du shell. `secrets/` est exclu de
Git. Pour changer le mot de passe : `chmod 600`, même commande, `chmod 400`, puis recréer le
conteneur. Pas de compte Simafri en préproduction ni sur un banc de longue durée.

**Contrôle sans envoi** (après le §7, ou dans un conteneur ponctuel de l'image, même
environnement que la production) : `npx tsx scripts/mail-imap-check.ts`. Il se connecte en
IMAP (lecture seule, compte des messages), identifie Brouillons / Envoyés et l'extension
UIDPLUS, puis ouvre SMTP, STARTTLS (certificat vérifié) et s'authentifie, et termine par QUIT
avant toute adresse : **aucun message n'est envoyé**, rien n'est modifié.

## 6. Tests (banc jetable, 9 octobre 2026)

Réseau Docker interne sans Internet, PostgreSQL `syncit_test` éphémère, **vrai serveur IMAP
Dovecot 2.3.21.1** (`tests/imap/dovecot.conf`, dossiers « Brouillons perso » / « Messages
envoyés » porteurs des attributs et leurres « Drafts » / « Sent » sans attribut), faux serveur
SMTP 587 STARTTLS + AUTH (`tests/fake-smtp.ts`), autorité de certification de test générée
pour le banc. Commande : `tests/mail-imap-run.sh <image>` (ou `src`).

- Typecheck : 0 erreur dans le code (seul `documentation/qa/m365-recette/recette-b.ts`,
  script de recette ignoré par Git et antérieur, échoue sur ses chemins d'import).
- Unitaires (`npm test`) : 54 réussis, 0 échec, 9 ignorés (activation exclusive et refus
  production/préproduction, classement des non-remises, MIME, issues SMTP, pièces jointes).
- Intégration Simafri (`tests/mail-imap-integration.ts`) : **104/104**, sur le code source
  puis sur l'image `5sursync:mail-imap-test-20261009` (sha256:189e26dfe95a…). Couvre : refus TLS (autorité inconnue, autre nom
  d'hôte) en IMAP et SMTP, mauvais mot de passe, dossiers par attributs, synchronisation
  initiale 90 jours, lecture sans marquer lu, liens exacts / ambigus / inconnus, incrémental,
  suppression, reprise après interruption, changement d'UIDVALIDITY sans doublon,
  rattachements manuels conservés, HTML filtré, pièces jointes reçues, droits
  (lecture / brouillon / envoi), brouillons dans Brouillons avec `\Draft`, signature et logo
  uniques, pièces jointes ajoutées / conservées / retirées, refus exécutable et > 4 Mo,
  réponse dans le fil (In-Reply-To, References, RE:, citation), brouillon modifié ailleurs ni
  écrasé ni envoyé, expéditeur / Sender / Cci contrôlés, destinataires pris dans le message,
  brouillon Microsoft refusé par Simafri, envoi accepté puis copie unique dans Envoyés et
  brouillon retiré, double clic refusé, serveur qui copie lui-même (pas de doublon), copie
  impossible puis reprise sans renvoi, refus 550 / 451, acceptation partielle, coupure après
  transmission (incertain, déclaration manuelle), non-remise 5.1.1 (bloque) vs 5.7.708 (ne
  bloque pas), réponse du destinataire dans le fil et rattachée, aucune suppression hors
  brouillons du CRM, aucun corps / mot de passe en base.
- Navigateur Simafri (`tests/mail-imap-e2e.py`, même banc, application configurée en
  `MAIL_PROVIDER=imap` vers les serveurs de test) : **32/32** — page d'état (boîte, STARTTLS,
  certificats vérifiés, mot de passe jamais affiché), synchronisation manuelle, carte de
  l'entreprise, lecture sans marquer lu, réponse avec pièce jointe (dossier Brouillons,
  `\Draft`, In-Reply-To, signature et logo uniques), nouveau brouillon avec deux pièces
  jointes, retrait d'une pièce jointe et texte remplacé (un seul brouillon dans la boîte),
  exécutable refusé, assistante sans envoi, envoi par le propriétaire après case de
  confirmation (« Accepté, copie dans Envoyés »), un seul message SMTP, une copie dans
  Envoyés, journal, plus de formulaire d'envoi, affichage 390 px, aucune erreur navigateur ;
  journal applicatif sans erreur.
- Contrôle sans envoi `scripts/mail-imap-check.ts` exécuté dans l'application du banc : IMAP
  et SMTP OK, Brouillons / Envoyés trouvés par attributs, UIDPLUS présent, aucun message
  reçu par le faux SMTP (le test navigateur qui suit en compte exactement un, le sien).
- Non-régression sur la même image : Microsoft (`tests/mail-run.sh`) intégration **66/66**,
  navigateur **48/48** ; CRM complet (`tests/crm-run.sh`) **136/136**.

Non testé (impossible sans la vraie boîte) : attributs SPECIAL-USE et UIDPLUS du serveur
Simafri, copie automatique éventuelle dans Envoyés par Simafri, comportement du webmail sur
les brouillons, délivrabilité (le message manuel de test était arrivé en indésirables chez
Hotmail malgré SPF / DKIM / DMARC / compauth « pass »).

## 7. Mise en service (après feu vert, rien n'est fait)

1. Sauvegarde : `pg_dump` de la base de production (sauvegarde-restauration.md) et copie de
   `compose.production.yaml` dans `backups/`.
2. Migrations sur la base de production, dans l'ordre : `20261008_173554_crm_mail`,
   `20261008_185702_admin_rights`, `20261009_150000_crm_mail_imap` (additives ; la première
   donne le droit « envoi » au seul compte ydiop@5sursync.com). Accord explicite requis.
3. Saisie du mot de passe (§5).
4. Image construite depuis cet arbre (avec `SITE_ORIGIN=https://5sursync.com`).
5. `compose.production.yaml` : ajouter au service `app-production`
   ```yaml
       environment:
         MAIL_ENABLED: 'true'
         MAIL_PROVIDER: imap
         MAIL_PASSWORD_FILE: /run/secrets/crm_mail_password
         MAIL_SEND_ALLOWLIST: youssouphadiop@hotmail.fr
       secrets: [database_uri, payload_secret, smtp_password, crm_mail_password]
   secrets:
     crm_mail_password:
       file: ./secrets/crm_mail_password
   ```
   Aucune variable `MAIL_*` Microsoft n'est nécessaire (elles seraient ignorées).
6. Recréation du seul conteneur (`--no-deps --no-build`), contrôle sans envoi (§5), puis
   contrôle de l'onglet « État et diagnostic » de /crm/messagerie.

### Recette réelle proposée (feu vert séparé, un seul envoi)

Liste de recette = `youssouphadiop@hotmail.fr` uniquement. Un brouillon « [RECETTE 5sursync]
Envoi Simafri – date » préparé dans le CRM (signature, logo, une petite pièce jointe), contrôlé
dans le webmail, puis **un seul envoi** confirmé dans le CRM par le propriétaire. Vérifications :
état « Accepté, copie dans Envoyés », une seule copie dans Envoyés, en-têtes reçus chez Hotmail
(SPF / DKIM / DMARC, dossier d'arrivée). Puis réponse depuis Hotmail : elle doit apparaître
dans le CRM, dans le même fil, rattachée au contact s'il existe avec cette adresse exacte.
Pas de campagne, pas de reprise massive des anciens messages (la boîte est neuve ; reprise
initiale limitée à 90 jours, réglable par `MAIL_SYNC_SINCE_DAYS`).

## 8. Retour arrière

- **Couper la messagerie Simafri** : retirer `MAIL_ENABLED` (ou `MAIL_PROVIDER`) puis
  recréer le conteneur. Les brouillons et messages restent dans la boîte Simafri ; les
  lignes du CRM restent consultables (métadonnées).
- **Revenir à Microsoft** : `MAIL_PROVIDER: graph` + variables et certificats Microsoft
  (microsoft365.md) ; applications Entra, certificats `secrets/m365_*` et données Microsoft
  n'ont pas été touchés. Les brouillons Simafri ne peuvent pas partir par Microsoft.
- **Image** : remettre l'étiquette précédente dans `compose.production.yaml`.
- **Schéma** : la migration `crm_mail_imap` est additive et ne gêne pas l'ancien code ; sa
  fonction `down` existe mais supprime les colonnes et l'état IMAP (à n'utiliser qu'avec une
  sauvegarde).
- **Mot de passe** : changer le mot de passe chez Simafri invalide immédiatement l'accès du CRM.
