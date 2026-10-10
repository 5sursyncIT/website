# CRM clients — /crm

Outil interne de suivi commercial pour l’équipe 5/Sync IT. Il est réservé aux
administrateurs Payload et n’est jamais visible des comptes clients du Support.

Manuel de formation des utilisateurs (Claude Docs, privé tant qu’il n’est pas partagé) :
https://claude.ai/code/artifact/aa0c4bd2-3711-466c-adbe-dd1c678840f6

## Accès

- Adresse : `https://5sursync.com/crm` (et `https://preprod.5sursync.com/crm`), ou le
  lien « Ouvrir le CRM → » du tableau de bord `/admin` et encart « CRM clients → » en tête de la navigation admin.
- Session : celle de l’administration (cookie `payload-token`, durée 1 h). Un visiteur
  anonyme est redirigé vers `/admin/login?redirect=/crm`. Un compte client connecté
  reçoit une 404.
- Chaque page, action de formulaire et export appelle `crmContext()`
  (`src/lib/crm-server.ts`). Toutes les opérations passent par l’API locale Payload
  avec `overrideAccess: false` : les collections CRM sont `adminOnly`.
- Nginx : `/crm` n’est **pas encore** couvert par la Basic Auth qui protège
  `/admin|api/cms|team|api/team`. Pour l’ajouter (recommandé, même protection que
  l’admin), voir « Mise en service », étape 4.

## Fonctions

| Page | Contenu |
|---|---|
| `/crm` | « Aujourd’hui » (depuis le 10/10, voir « Suivi commercial ») puis indicateurs : clients actifs, prospects, pipeline ouvert et pondéré, gains et pertes du mois, tâches en retard ou du jour. Barres du pipeline par étape, prochaines clôtures, tâches, demandes du site non converties, dernières activités. |
| `/crm/clients` | Entreprises : recherche (nom, email, ville, secteur, téléphone), filtre par statut, tri, pagination par 25, export CSV. |
| `/crm/clients/[id]` | Fiche : chiffres clés, bouton « Ouvrir WhatsApp », activités (à faire et historique), opportunités, contacts, résumé Support (utilisateurs et 5 derniers tickets, liens vers l’admin), modification, suppression. |
| `/crm/opportunites` | Pipeline en 4 colonnes (Piste, Qualifiée, Proposition envoyée, Négociation), changement d’étape sur chaque carte, filtre par responsable, vue « Gagnées et perdues », création, export CSV. |
| `/crm/opportunites/[id]` | Détail, activités liées, modification, suppression. |
| `/crm/contacts`, `/crm/contacts/[id]` | Interlocuteurs : recherche, création, fiche, modification, suppression. |
| `/crm/taches` | Tâches en retard, du jour, à venir, sans échéance ; « Marquer comme faite » ou « Rouvrir » ; filtres « Assignées à moi » et par type. |
| `/crm/demandes` | Demandes reçues par le formulaire Contact. « Convertir » crée le prospect (ou rattache la demande à une entreprise existante, proposée automatiquement si le nom est identique), son contact, une activité contenant le message et, si la case est cochée, une opportunité « Piste ». La demande d’origine n’est pas modifiée. |
| `/crm/documents` | Devis et factures : liste avec recherche, filtres par type et statut, montant restant à encaisser, export CSV. |
| `/crm/documents/nouveau`, `/crm/documents/[id]` | Création en brouillon (lignes : désignation, quantité, unité, prix HT ; TVA 18 % par défaut), suivi des statuts, conversion d’un devis en facture. |
| `/crm/documents/[id]/apercu` | Feuille A4 imprimable (logo, coordonnées, RCCM, NINEA, client, lignes, totaux HT/TVA/TTC, conditions), à la charte du site (voir « Modèles de devis et de facture »). L’impression du navigateur produit le PDF. |
| `/crm/activites/[id]` | Modification d’une activité (type, objet, contact, échéance, assignation, rappel, terminée) et état de son rappel email. |
| `/crm/recherche` | Recherche globale (entreprises, contacts, opportunités, devis et factures), aussi accessible depuis le champ du menu. |
| `/crm/export/clients`, `/contacts`, `/opportunites`, `/documents` | CSV séparé par des `;` avec BOM UTF-8 (ouverture directe dans Excel en français). Les cellules commençant par `= + - @` sont préfixées d’une apostrophe pour neutraliser les formules. Réponse `no-store`. |

Règles métier (hooks des collections, donc appliquées à toute écriture, y compris par l’API) :
- une opportunité passée à « Gagnée » transforme un prospect en client ;
- « Gagnée » met la probabilité à 100 %, « Perdue » à 0 % ; la date de conclusion est
  posée à la clôture et effacée si l’opportunité est rouverte ; à la création, la
  probabilité par défaut dépend de l’étape (10, 25, 50, 75 %) ;
- le contact d’une opportunité ou d’une activité doit appartenir à la même
  entreprise ; l’entreprise d’une activité suit celle de son opportunité ou de son contact ;
- un seul interlocuteur principal par entreprise ;
- une activité sans échéance (appel, email, rendez-vous, note) est enregistrée comme
  faite ; une tâche ou une activité datée reste à faire ;
- une entreprise qui a des utilisateurs ou des tickets Support ne peut pas être
  supprimée depuis le CRM : la passer en « Ancien client ». Sinon, la suppression
  efface aussi ses contacts, opportunités et activités.

Devis et factures (`crm-documents`) :
- créés en brouillon, sans numéro. Le numéro `DEV-AAAA-NNNN` ou `FAC-AAAA-NNNN` est attribué quand le document quitte le brouillon (devis envoyé ou accepté, facture émise) : on prend le plus grand numéro de l’année, plus 1. Un index unique empêche les doublons ; deux émissions simultanées donnent une erreur et il suffit de réessayer.
- devis : brouillon → envoyé → accepté ou refusé (retour à « envoyé » possible). Modifiable en brouillon et en envoyé. « Accepté » passe l’opportunité liée à « Gagnée » avec le montant HT du devis.
- facture : brouillon → émise → payée (paiement annulable) ou annulée. Une facture émise ne se modifie plus et ne se supprime pas ; seuls les brouillons se suppriment.
- totaux recalculés côté serveur à chaque enregistrement, arrondis au franc ; contact et opportunité contrôlés comme appartenant à la même entreprise.
- Le CRM n’envoie pas les documents par email : impression ou PDF depuis l’aperçu.

Rappels email (`src/lib/crm-reminders.ts`, worker démarré par `instrumentation.ts`) :
- désactivés sauf si `APP_ORIGIN=https://5sursync.com`, `SMTP_ENABLED=true` **et** `CRM_EMAIL_ENABLED=true`. La préproduction, qui partage la base, ne réserve donc jamais rien.
- un rappel par tâche et par échéance, 30 minutes avant (jusqu’à 1 jour de retard), envoyé à la personne assignée, sinon à l’auteur, si la case « Rappel par email » est cochée. Changer l’échéance programme un nouveau rappel.
- un récapitulatif par administrateur et par jour à partir de 7 h (Dakar = UTC) : tâches en retard ou du jour.
- registre `app_crm_reminders` et `app_crm_digests` : réservation avec bail de 5 minutes, état `accepted` / `failed` / `uncertain` (la réponse réelle de SMTP), aucun renvoi automatique. Un envoi interrompu passe en `uncertain`. L’état s’affiche sur les activités.
- même transport SMTP approuvé que les notifications de contact (`no-reply@5sursync.com`).

Recherche : colonne `search_text` (minuscules, sans accents) sur entreprises, contacts, opportunités et documents, recalculée à chaque enregistrement ; requête `LIKE` plus `word_similarity` de `pg_trgm` (seuil 0,45, mesuré : « mnistere » → « ministère » 0,67, mot sans rapport ≤ 0,33). Index GIN trigramme.

Pipeline : glisser-déposer d’une carte vers une colonne ou vers « Gagnée » / « Perdue » (confirmation pour Perdue). Le dépôt soumet le formulaire de la carte, donc la même action serveur que « OK ». Le choix par liste reste disponible au clavier et sur téléphone.

Fuseau : Africa/Dakar (UTC+0 toute l’année). Montants en FCFA HT, sans devise multiple.

## Données

Une entreprise du CRM est la même fiche que le « Client » du Support (collection
`clients`). Elle reçoit des champs supplémentaires : statut commercial
(prospect / client / ancien client), responsable, origine, demande d’origine,
secteur, NINEA/RCCM, email, téléphone, site web, adresse, ville, pays, notes.
Les entreprises déjà présentes reçoivent le statut « Client ».

Nouvelles collections (admins seuls ; masquées de `/admin` depuis le 2026-10-09 : `admin.hidden`, gestion uniquement par `/crm`) :
`crm-contacts`, `crm-deals` (opportunités), `crm-activities` (activités et tâches,
avec lien éventuel vers la demande de contact convertie), `crm-documents` (devis et
factures, v2).

Migration v2 `src/migrations/20261008_102236_crm_v2.ts`, additive : tables
`crm_documents` et `crm_documents_lines`, colonnes `search_text` (clients, contacts,
opportunités) et `remind` (activités, par défaut vrai), extension `pg_trgm` avec ses
index GIN, tables `app_crm_reminders` et `app_crm_digests`, puis remplissage de
`search_text` pour les lignes existantes. La ligne `pages_copy` générée par Payload
a de nouveau été retirée. Testée sur une base jetable dans les deux sens : `down`,
données ajoutées, `up`, recherche remplie. Les `down` générés par Payload échouaient
(contrainte déjà supprimée par `DROP TABLE … CASCADE`) : `IF EXISTS` a été ajouté dans
les deux migrations CRM. Les images v1 restent compatibles avec le schéma v2.

Migration `src/migrations/20261008_090825_crm.ts`, uniquement additive : 3 tables
`crm_*`, 4 types enum, colonnes nullables ou avec valeur par défaut sur `clients`,
3 colonnes nullables sur `payload_locked_documents_rels`, clés étrangères et index.
Aucune donnée existante n’est modifiée, à part la valeur par défaut `stage = 'client'`
posée sur les entreprises existantes. La ligne `pages_copy.value DROP NOT NULL`, que
Payload avait générée à cause d’une différence ancienne entre la configuration et la
base, a été retirée volontairement (dans `up`, `down` et le snapshot JSON).
Les images actuellement en ligne restent compatibles avec le schéma migré : elles
ignorent les nouvelles tables et colonnes, et `stage` a une valeur par défaut. La
migration peut donc précéder le changement d’image.

Code : `src/collections/crm.ts`, `src/lib/crm.ts` (vocabulaire, CSV, sécurité des
redirections), `src/lib/crm-server.ts` (garde, dates), `src/app/(crm)/` (layout racine
séparé, pages, `crm/actions.ts` pour les actions serveur, `crm.css`),
`src/components/crm/`.
Les formulaires fonctionnent aussi sans JavaScript. Après chaque enregistrement, la
page affiche un message de confirmation ou d’erreur.

## Tests effectués (8 octobre 2026)

- Typecheck : 0 erreur. Tests unitaires : 13 réussis (dont 3 CRM : CSV, pipeline
  pondéré, redirections limitées à /crm), 9 ignorés (PostgreSQL requis).
- `next build` : 11 routes `/crm` compilées.
- Banc jetable `tests/crm-run.sh <image>` (réseau Docker interne, PostgreSQL
  `syncit_test`, comptes fixtures uniquement) : 7 migrations dont CRM, seed, puis
  `tests/crm-e2e.py` dans Chromium Playwright. Résultat : 50/50 (voir
  `documentation/qa/crm/crm-results.json` et les captures du même dossier). Contrôles : redirection
  anonyme, refus API anonyme et client, conversion d’une demande, pipeline et
  promotion prospect → client, validation, normalisation du site web, contact
  principal, tâche en retard puis faite, refus d’un contact d’une autre entreprise,
  indicateurs, filtres et recherche, export CSV avec formule neutralisée, 404 pour un
  compte client activé, suppression protégée, absence de débordement à 390 px sur
  4 pages, aucune erreur navigateur.
- Banc admin existant `tests/admin-ux-run.sh` : 28/29 sur l’image CRM, résultat
  identique sur l’image actuellement en production (`admin-logo-20261007`). Le seul
  échec, « brand logo on login », existait déjà : le test cherche une image alors que
  la connexion affiche le logo animé en vidéo depuis le 7 octobre. Ce n’est donc pas
  une régression.
- Images : `5sursync:crm-preprod-20261008` (sha256:a3fbcd9d1f3b…, testée 50/50) et
  `5sursync:crm-20261008` (production, sha256:d30913e32302…, même source, arguments
  de build de production). `crm-test-20261008` est une image intermédiaire.

## Mise en service v1 (historique : migration appliquée par le propriétaire le 8 octobre)

La base PostgreSQL est **partagée entre production et préproduction** : la migration
s’applique aux deux en même temps.

1. Sauvegarde : `deployment/backup.sh` (ou `pg_dump` comme pour les releases
   précédentes) ; vérifier le fichier produit.
2. Migration, avec l’image CRM et sortie complète. Il faut voir
   `Migrated: 20261008_090825_crm` puis `Done.` :
   `sudo docker compose run --rm --no-deps app npx payload migrate`
   (après avoir retagué `5sursync:crm-preprod-20261008` en `5sursync:local`, ou avec
   `RELEASE_TAG=crm-preprod-20261008`).
3. Images : préproduction `5sursync:crm-preprod-20261008` (retag `local`, puis
   `sudo docker compose up -d --no-deps app`) ; production `5sursync:crm-20261008`
   (construite avec `SITE_ORIGIN=https://5sursync.com SITE_INDEXABLE=1`), dans
   `compose.production.yaml`, puis
   `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`.
4. Recommandé : ajouter `crm` à l’expression de la location protégée dans les deux
   vhosts (`^/(admin|api/cms|team|api/team|crm)(/|$)`), `sudo nginx -t`, puis reload.
   Les actions serveur font un POST sur l’URL de la page : elles restent donc dans
   cette location.
5. Contrôles : `/crm` anonyme 307 (ou 401 avec Basic Auth), connexion admin puis
   `/crm` 200, pages publiques 200, `/support` 307.

Retour arrière : remettre l’image précédente (`admin-logo-20261007` en production,
`before-crm-preprod` à créer à partir de `local` avant le retag). Le schéma CRM
peut rester en place : il est inerte pour les anciennes images. Le `down` de la
migration supprime les tables CRM et leurs données : ne l’exécuter qu’après
sauvegarde.

## v3 — avoirs, acomptes, paiements partiels, TVA par ligne, envoi par email, glisser-déposer tactile et clavier, recherche étendue

- **Avoirs** (`kind = credit`, numéros `AV-AAAA-NNNN`) : créés depuis une facture émise non annulée (copie de ses lignes positives, à réduire pour un avoir partiel). L’entreprise est celle de la facture. À l’émission, le total ne peut pas dépasser le montant encore créditable (total de la facture moins les avoirs déjà émis). Un avoir émis est définitif et réduit le reste dû ; il peut solder la facture.
- **Acomptes** : depuis un devis envoyé ou accepté, « Créer la facture d’acompte » (pourcentage de 1 à 99) produit une facture `invoiceType = deposit` avec une ligne par taux de TVA du devis. La facture de solde reprend les lignes du devis et ajoute une ligne négative par ligne de chaque acompte émis. Elle est refusée tant qu’un acompte est encore en brouillon. Un seul solde par devis.
- **Paiements partiels** : tableau `payments` (date, montant TTC, mode et référence) sur une facture émise. `amountPaid` et `balance` (reste dû = total − paiements − avoirs émis) sont recalculés côté serveur. Le statut passe seul à « Soldée » quand le reste dû atteint 0, et revient à « Émise » si un paiement est supprimé. Les trop-perçus sont refusés. Une facture payée ou créditée ne s’annule plus : il faut passer par un avoir.
- **TVA par ligne** : chaque ligne a son taux (taux du document par défaut, 0 pour une ligne exonérée). La TVA est calculée et arrondie par taux, puis détaillée sur la fiche, l’aperçu et le PDF. Les prix négatifs ne sont admis que sur une facture (déductions).
- **Modèles de devis et de facture** (2026-10-10) : l’aperçu HTML (`crm.css`, classes `.crm-sheet*`) et le PDF serveur reprennent la charte du site public (`globals.css`) : marine `#092234`, aqua `#2ee9d8`, sarcelle `#00b9b4`, encre `#080d24`, gris-bleu `#4a6482`, fond pâle `#eaf7fc`, Arial/Helvetica, angles droits. Composition commune : bandeau marine à liseré aqua en haut de page ; logo transparent ; surtitre en capitales espacées précédé d’un carré aqua (« Facture », « Devis », « Avoir »…), numéro en grand titre et court filet aqua ; bandeau pâle Date / Échéance ou Validité / Facture d’origine / Montant TTC ou Reste à payer ; colonnes Émetteur et Destinataire (filet sarcelle) ; Objet ; tableau à en-tête marine et numéros de ligne « 01, 02 » en gris clair ; conditions à gauche des totaux ; Total TTC en bloc marine (montant aqua), Reste à payer en bloc aqua ; cadre « Bon pour accord » des devis ; pied légal avec carré aqua et numéro de page. Le cadre de signature n’apparaît plus sur l’aperçu d’un avoir (aligné sur le PDF). Aucune donnée nouvelle n’est affichée (pas de coordonnées bancaires : non fournies).
- **PDF côté serveur** (`src/lib/crm-pdf.ts`, `pdf-lib` 1.17.1, polices standard Helvetica et jeu de caractères WinAnsi ; tout caractère hors de ce jeu est remplacé par « ? ») : `/crm/documents/[id]/pdf`, multipage avec en-tête de tableau répété, pied de page légal et numéro de page, mention BROUILLON en filigrane. Contrôlé visuellement : `documentation/qa/devis-factures-design/` (modèles actuels ; anciens rendus dans `documentation/qa/crm-v3/`).
- **Envoi par email** (`src/lib/crm-document-mail.ts`) : document numéroté seulement, depuis `no-reply@5sursync.com`, PDF en pièce jointe. Les réponses vont à l’administrateur expéditeur (Reply-To) et il reçoit une copie cachée. Registre `app_crm_document_mails` : `accepted`, `failed` ou `uncertain` selon la réponse réelle de SMTP ; un envoi resté `dispatching` plus de 5 minutes s’affiche « incertain ». Pas de renvoi automatique ; chaque clic envoie un nouvel email. Une activité « Email » est ajoutée à l’entreprise quand l’envoi est accepté.
- **Un seul interrupteur pour tous les emails du CRM** (rappels et documents) : `CRM_EMAIL_ENABLED=true`, en plus de `APP_ORIGIN=https://5sursync.com` et `SMTP_ENABLED=true`. Il remplace `CRM_REMINDERS_ENABLED`, qui n’avait jamais été déployé.
- **nodemailer 9.1.1 → 10.0.16** : la version précédente était touchée par des avis de sécurité (GHSA-v53p-9fqp-m79j et GHSA-prgh-xp8r-p3m5, déni de service par l’analyse des adresses ; GHSA-g57g-f23g-4646, enveloppe malformée ; GHSA-6vj9-mwq6-2f5v). Le seul changement incompatible de la version 10 est « Node.js 20 minimum » (nous sommes en Node 22). `npm audit --omit=dev` : 0 vulnérabilité. Testé contre un serveur SMTP local jetable (pièce jointe PDF, copie cachée non transmise dans les en-têtes). Ce même module envoie les notifications de contact en production.
- **Glisser-déposer** : poignée ⠿ sur chaque carte, au doigt, au stylet ou à la souris (événements « pointer », copie flottante, défilement du pipeline près des bords). Au clavier : focus sur la poignée, Entrée, flèches, Entrée (Échap pour annuler), avec des annonces pour les lecteurs d’écran. Le glisser natif à la souris sur la carte reste disponible.
- **Recherche** : notes des entreprises et des contacts, objet et détails des activités (`search_text` + index trigramme sur `crm_activities`). Section « Activités » dans la recherche globale, et champ de recherche sur la page Tâches.

Migration v3 `src/migrations/20261008_112152_crm_v3.ts`, additive : valeur `credit` ajoutée au type des documents, colonnes `invoice_type`, `credit_for_id`, `amount_paid`, `balance`, `vat_rate` sur les lignes, table `crm_documents_payments`, `search_text` sur les activités, table `app_crm_document_mails`. Remplissage des données existantes : taux des lignes v2 = taux du document ; une facture v2 « payée » reçoit une ligne de paiement de son total (reste dû 0) ; recherche recalculée. Testée sur base jetable : `up` avec des données v2, `down`, puis `up`. **Le `down` supprime les avoirs** (la valeur `credit` ne peut pas être retirée du type tant qu’elle est utilisée) : sauvegarde obligatoire avant tout retour arrière.

## Mise en service v3 (non effectuée)

La migration v2 a été appliquée par le propriétaire. Pour la v3 :
1. Sauvegarde (`sh deployment/backup.sh`).
2. Migration, avec l’image `5sursync:crm-v3-preprod-20261008`. Il faut voir `Migrated:  20261008_112152_crm_v3` puis `Done.` :
   `RELEASE_TAG=crm-v3-preprod-20261008 sudo -E docker compose run -T --rm --no-deps app npx payload migrate`
3. Préproduction : `sudo docker tag 5sursync:crm-v3-preprod-20261008 5sursync:local` puis `sudo docker compose up -d --no-deps app`.
4. Production : image `5sursync:crm-v3-20261008` dans `compose.production.yaml` et, pour les emails du CRM, `CRM_EMAIL_ENABLED: 'true'` dans `environment`. Puis
   `sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`.
   Cette image embarque nodemailer 10 : vérifier ensuite qu’une demande de contact réelle produit bien sa notification (état « Acceptée par SMTP » dans l’admin).
Les images v1 et v2 restent compatibles avec le schéma v3 : la migration peut donc précéder le changement d’image.

## Limites

- Envoi par email : un seul destinataire par envoi (plus la copie cachée à l’expéditeur). Une acceptation par le serveur SMTP ne prouve pas la réception. Aucun suivi d’ouverture.
- PDF : polices standard, donc jeu de caractères WinAnsi (français complet ; les caractères hors de ce jeu deviennent « ? »). Pas de signature électronique.
- Pas de relance automatique des factures impayées (le tableau de bord signale les factures en retard).
- Paiements saisis à la main : pas de rapprochement bancaire ni de lien avec Wave, Orange Money ou un logiciel de comptabilité.
- Glisser-déposer tactile testé avec un pointeur souris (même code que le doigt), pas sur un appareil physique. Les annonces clavier ont été vérifiées dans le DOM, pas avec un vrai lecteur d’écran.
- La recherche tolère une petite faute par mot ; elle ne cherche pas dans les lignes des devis et factures (seulement leur numéro et leur objet).
- Formulaires : les champs saisis sont perdus si le serveur refuse l’enregistrement. Lignes de document : 8 lignes vides proposées ; enregistrer pour en obtenir d’autres (60 au maximum).
- Admin et client partagent le cookie `payload-token` sur le même domaine : ne pas tester un compte client dans le navigateur de la session admin.

## Import de prospects (8 octobre 2026)
`imports/build_crm_import_sql.py <json> <sortie.sql> ROLLBACK|COMMIT` produit un SQL transactionnel à partir d'un export de prospection au format `crm_prospects_*.json` (schema_version 1) : une entreprise « Prospect » par organisation et une activité email terminée, sans contact, opportunité, tâche ni rappel. Toujours lancer d'abord la version ROLLBACK (simulation) puis faire une sauvegarde. Le SQL contourne les hooks Payload mais en reproduit l'effet (search_text, done_at, auteur). Détail et résultat : ETAT.md, section « Import des prospects contactés le 8 octobre ».

## Import CSV d'entreprises — /crm/clients/importer (8 octobre 2026)
Bouton « Importer (CSV) » de la liste des entreprises. Deux étapes :
1. **Vérifier le fichier** (rien n'est écrit) : chaque ligne reçoit un résultat — à créer, à compléter, ignorée (déjà présente) ou erreur avec sa raison ; les erreurs sont listées en premier.
2. **Importer** : le serveur relit le même texte, refait l'analyse contre la base à cet instant et écrit tout dans **une transaction** Payload (`initTransaction` / `commitTransaction`) : si le CRM refuse une ligne, rien n'est enregistré. Les lignes en erreur ne sont jamais importées.

Format : première ligne = titres. Seule « Entreprise » (ou « Nom », « Société », « Raison sociale »…) est obligatoire ; reconnues aussi Statut, Origine, Secteur, NINEA/RCCM, Email, Téléphone, Site web, Adresse, Ville, Pays, Notes (accents, casse et ponctuation ignorés ; autres colonnes signalées comme ignorées, ex. Responsable, Créée le). Statut et origine acceptent le code ou le libellé français. Séparateur `;`, `,` ou tabulation détecté sur l'en-tête ; guillemets RFC 4180 (retours à la ligne inclus) ; UTF-8 (avec ou sans BOM), sinon Windows-1252 (CSV d'Excel français). 512 Ko et 2 000 lignes au plus. L'export `/crm/export/clients` se réimporte tel quel (l'apostrophe anti-formule ajoutée par l'export est retirée). Modèle : `/crm/export/modele-clients`.
Validation : mêmes règles que le formulaire « Nouvelle entreprise » (`src/lib/crm-schema.ts`, partagé avec `actions.ts`). Site sans `http` complété en `https://`, email mis en minuscules.
Doublons : même nom (sans accents ni casse), même email ou même site (sans `https://`, `www.` ni `/` final), dans la base comme à l'intérieur du fichier (la deuxième occurrence est une erreur). Option « L'ignorer » (défaut) ou « Compléter ses champs vides » : seuls les champs vides de la fiche existante sont remplis ; nom, statut et responsable ne sont jamais modifiés. Option « Me désigner responsable » pour les fiches créées. Aucun contact, opportunité, activité ni email n'est créé.
Code : `src/lib/crm-import.ts` (fonctions pures), `previewClientImport` et `importClients` dans `src/app/(crm)/crm/actions.ts`, `src/components/crm/import.tsx`, `src/app/(crm)/crm/clients/importer/page.tsx`. Tests : `tests/crm-import.test.ts` (8) et scénario « CSV import » de `tests/crm-e2e.py`.

## Bouton « Ouvrir WhatsApp » — fiches entreprise et contact (8 octobre 2026)
Ouvre `https://wa.me/<numéro international en chiffres>` dans un nouvel onglet (sur téléphone, l’application WhatsApp prend le relais) : la page CRM, ses volets ouverts et les saisies en cours restent intacts. Le message est rédigé et envoyé par la personne dans WhatsApp. Aucun message prérempli, aucune API WhatsApp Business, aucun envoi automatique, aucun chatbot ni IA, aucune synchronisation. **Le clic n’écrit rien** : pas d’activité, pas de changement de statut ; l’assistante note elle-même l’échange dans « Activités ». Un numéro public ne vaut pas consentement à la prospection WhatsApp (rappel affiché dans le panneau).

Données : **aucun nouveau champ, aucune migration, aucune donnée modifiée**. Le CRM n’a pas de champ WhatsApp ; on lit les champs existants `phone` et `notes` des entreprises et des contacts :
- un numéro est « indiqué comme WhatsApp » si son segment le dit (`WhatsApp`, `Whats App`, `WA`) : ex. `33 800 00 00 / WhatsApp : 77 123 45 67`, `+221 77 123 45 67 (WA)`. Segments séparés par `/ , ; |`, retour à la ligne ou « ou » ;
- dans les notes, seuls les numéros d’une ligne/segment mentionnant WhatsApp sont repris (jamais les dates ou montants) ;
- pour marquer un numéro, il suffit donc d’écrire « WhatsApp » à côté dans le champ Téléphone.

Normalisation (`src/lib/whatsapp.ts`) : espaces, points, tirets, parenthèses, `+` et `00` retirés ; `(0)` après l’indicatif retiré (`+33 (0)6…`). Un numéro sans indicatif ne reçoit `+221` que si le pays de l’entreprise est le Sénégal (« Sénégal », « SENEGAL », « SN ») et qu’il a le format sénégalais (9 chiffres commençant par 7 ou 3) ; `221 77 …` sans `+` est aussi accepté. Pays vide ou autre pays : **aucun indicatif deviné**, le numéro est signalé « Indicatif manquant » à corriger au format international. Contrôles : `+221` suivi de 9 chiffres valides, autres indicatifs 8 à 15 chiffres, pas de lettres.

Interface (`src/components/crm/whatsapp.tsx`), juste sous les coordonnées :
- un seul numéro au total, valide et indiqué WhatsApp : lien direct « Ouvrir WhatsApp » ;
- sinon le bouton ouvre un panneau : chaque interlocuteur (entreprise puis contacts, numéros WhatsApp en tête) avec son numéro normalisé et le texte saisi ; **rien n’est présélectionné** ; un numéro non indiqué comme WhatsApp exige de cocher une confirmation (« inscription non vérifiée ») ; le lien affiche `wa.me/…` pour contrôle ;
- numéros absents ou invalides listés avec la raison et « Corriger les coordonnées » (ouvre le formulaire de la fiche sur le champ Téléphone/Notes, ou la fiche du contact) ;
- clavier : bouton `aria-expanded`, boutons radio, Échap ferme et rend le focus ; libellé + icône ; testé à 390 px.
Fiche contact : uniquement les numéros de ce contact, avec le pays de son entreprise. Permissions : celles du CRM (`crmContext`), rien d’ajouté.

Tests : `tests/whatsapp.test.ts` (7 tests : formats internationaux, local sénégalais, indicatif non deviné, refus motivés, extraction et libellé WhatsApp, notes, choix entre plusieurs contacts, modes, entrées non modifiées) ; scénario « WhatsApp » de `tests/crm-e2e.py` (22 contrôles, wa.me intercepté par Playwright, aucun message réel). Limites : seul le Sénégal reçoit un indicatif automatique ; l’inscription sur WhatsApp n’est jamais vérifiée ; un numéro mal libellé (« WhatsApp » écrit loin du numéro, dans un autre segment) n’est pas reconnu comme WhatsApp mais reste proposé avec confirmation.

## Messagerie contact@ (Microsoft 365) — 8 octobre 2026
Menu « Messagerie contact@ » et carte « Emails contact@ » sur les fiches entreprise et contact : échanges reçus et envoyés de la boîte partagée (y compris depuis Outlook), file « À attribuer », brouillons et réponses dans le fil, envoi explicite réservé au droit « envoi ». Droit par administrateur (`mailAccess` : aucun, lecture, brouillons, envoi). Configuration Microsoft, droits, synchronisation, diagnostic, reprise, fonctions pour Charlie et tests : `documentation/microsoft365.md`. Production : non activée tant que les étapes Microsoft ne sont pas faites.
**9 octobre 2026 : nouvelle orientation** — la messagerie du CRM passe par la boîte Simafri `contact@crm.5sursync.com` en SMTP/IMAP (Microsoft bloque la livraison sortante, 550 5.7.708). Mêmes pages, droits et règles ; pièces jointes à l'envoi ; un seul fournisseur actif (`MAIL_PROVIDER`). Détails, paramètres, saisie du mot de passe, tests et retour arrière : `documentation/messagerie-simafri.md`. Non activée.

## Suivi commercial, accueil « Aujourd’hui » et relances (10 octobre 2026)

Demande du propriétaire : faire du CRM l’outil de travail quotidien (lui et son assistante),
en commençant par l’accueil du jour, les étapes commerciales et les relances manuelles.
Choix validés : étapes portées par l’**entreprise** (pas par les opportunités), étape
« Contacté, sans réponse » ajoutée, **prochaine action obligatoire** tant que l’entreprise
est en cours. Aucun envoi automatique : les échanges restent faits par l’équipe ; Dolibarr
n’est pas concerné.

Étapes (`clients.pipeline`) : À contacter → Contacté, sans réponse → Échange engagé →
Besoin identifié → Rendez-vous → Devis envoyé, plus « En attente (budget) » ; Gagné et
Perdu ferment le suivi. Raisons de perte (liste) : pas de budget, pas de besoin,
concurrent retenu, prix, aucune réponse, projet abandonné ou reporté, autre.

Règles (hook `clientPipelineHook`, donc aussi via l’API) : date de changement d’étape
(`pipeline_at`) ; « Gagné » fait passer un prospect en client ; « Perdu » exige une raison,
effacée si l’entreprise est rouverte. Automatismes : opportunité gagnée ou devis accepté →
« Gagné » ; devis envoyé → « Devis envoyé » (seulement depuis une étape antérieure ou
« En attente ») ; demande du site convertie → « Échange engagé » et action « Répondre à la
demande de … » due immédiatement, assignée à la personne qui convertit.

Pages :
- `/crm` « Aujourd’hui » : actions du jour et en retard (type, objet, entreprise, étape,
  date, responsable, bouton « Fait → noter la suite »), nouvelles demandes du site non
  converties, tickets Support ouverts ou en cours (plus ancien d’abord, signalés après 24 h
  sans mise à jour), entreprises en cours sans prochaine action (les plus avancées d’abord,
  planification en une ligne : type, date, responsable). Vue « Toute l’équipe » ou « Mes
  actions ». Les anciens indicateurs suivent, avec un graphique par étape commerciale.
- `/crm/suivi` : tableau par étape (4 + 3 colonnes sur ordinateur, défilement sur mobile),
  carte = entreprise, prochaine action (en rouge si en retard ou absente), responsable ;
  glisser-déposer souris, doigt ou clavier, et liste + OK ; zones Gagné / Perdu (Perdu
  renvoie à la fiche pour la raison) ; filtres responsable, recherche, « sans prochaine
  action » ; 40 cartes par colonne, le reste via la liste des entreprises.
- Fiche entreprise : bloc « Suivi commercial » en tête (étape et depuis quand, prochaine
  action) et formulaire en trois parties : ce qui s’est passé (action prévue terminée ou
  nouvel échange, résumé, interlocuteur, détails), étape, prochaine action (type, objet,
  date, responsable ; par défaut demain 9 h et le responsable de l’entreprise). Sans date,
  le formulaire est refusé tant que l’entreprise est en cours et n’a pas d’autre action
  prévue. Le compte rendu d’une action terminée est ajouté à ses détails. Un premier
  échange fait passer « À contacter » à « Contacté, sans réponse » si aucune autre étape
  n’est choisie.
- « Marquer comme faite » sur la dernière action prévue d’une entreprise en cours ouvre sa
  fiche avec la demande de planifier la suite.
- Liste des entreprises : filtre par étape (ou « en cours »), colonnes Étape et Prochaine
  action. Export CSV : trois colonnes ajoutées à la fin (étape, raison de perte, prochaine
  action) ; l’import CSV les ignore (l’étape suit les échanges).
- Nouveau type d’activité « WhatsApp » (note d’un échange fait dans WhatsApp ; rien n’est lu
  ni envoyé).

Migration `20261010_020200_crm_suivi` (additive) : colonnes `pipeline`, `lost_reason`,
`pipeline_at` sur `clients`, index, valeur `whatsapp` de l’enum des activités. Classement
initial : clients et anciens clients → Gagné ; prospects issus d’une demande du site →
Échange engagé ; prospects ayant un appel, email ou rendez-vous terminé → Contacté, sans
réponse (les 27 prospectés le 8/10) ; les autres → À contacter. Aucune prochaine action
n’est créée par la migration : toutes les entreprises en cours apparaissent donc d’abord
dans « sans prochaine action » de l’accueil. `down` testé : retire les colonnes, les
activités WhatsApp deviennent des notes.

Correctif lié : la suppression d’une entreprise supprime ses enfants un par un. La
suppression groupée de Payload rangeait un échec dans son résultat sans erreur, ce qui
donnait ensuite une erreur de clé étrangère. Cela s’est produit une fois sur le banc, sans
qu’on ait pu le reproduire ensuite : la cause exacte n’est pas identifiée.

Tests : voir ETAT.md, section du 10 octobre.

## Profils du back-office (10 octobre 2026)

Champ « Profil » (`admins.role`) sur chaque compte de l’équipe, choisi par un administrateur
complet qui gère les comptes (jamais sur son propre compte) :

| Profil | Accès |
|---|---|
| Administrateur complet (`full`) | Tout, comme avant. Seul profil pouvant gérer les comptes (`manageAdmins` forcé à faux sinon). |
| CRM uniquement (`crm`) | `/crm` complet (entreprises, suivi, contacts, opportunités, tâches, demandes du site, messagerie selon son droit), devis et factures **en brouillon seulement** (pas d’émission, de statut, de paiement, d’avoir ni d’envoi par email). Pas de tickets Support, pas d’administration : `/admin` le renvoie vers `/crm`, lien « Mon compte » pour son mot de passe. |
| Technicien (`technician`) | Tickets Support dans `/admin` : lire, répondre, notes internes, statuts, fichiers ; entreprises et comptes clients en lecture (contexte). Ni suppression de ticket, ni CRM (`/crm` 404), ni demandes du site, ni contenu du site, ni invitations. |

Règles dans `src/lib/access.ts` (`staffRole`, `isFullAdmin`, `canUseCRM`, `isTicketStaff`) ;
`adminOnly` signifie désormais « administrateur complet ». Profil absent ou inconnu = aucun
droit. Le garde-fou de suppression d’une entreprise compte les comptes et tickets Support
avec tous les droits, quel que soit le profil.

Migration `20261010_105721_admin_roles` : comptes existants « complet », nouveaux comptes
« CRM » par défaut (moindre privilège).

Créer un compte (propriétaire) : /admin → Administrateurs → créer, profil, droit messagerie,
mot de passe provisoire transmis en privé ; la personne le change dans « Mon compte ».
Nginx : /admin et /crm sont derrière la Basic Auth (utilisateur `ydiop`) ; chaque personne
doit avoir sa propre entrée, créée par le propriétaire sur le VPS :
`sudo htpasswd -B /etc/nginx/5sursync-admin.htpasswd <identifiant>` (mot de passe saisi par
lui ou par la personne, jamais par l’agent), sans reload nécessaire.
