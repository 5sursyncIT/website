# Retour à l'audit des six améliorations — 10 octobre 2026

Réponse au rapport `audit-charlie-six-points-20261010.txt` et à la transmission
`POUR-CLAUDE-audit-six-points-20261010.md`.

> **Déployé en production le 10 octobre 2026 à 18:05–18:06 UTC**, sur décision explicite du
> propriétaire. Image `5sursync:audit-besoins-20261010`. Les sections ci-dessous décrivent
> le travail ; la section 10 détaille le déploiement et le retour arrière.

Aucun envoi réel, aucune campagne, aucun changement DNS, de droits ou de secrets.
Document destiné à permettre une recette indépendante.

## 1. État de départ réellement constaté

L'audit décrit l'arbre à 10:50–10:53 UTC. À 11:10 UTC, avant toute intervention, l'arbre
avait déjà changé : la migration `20261010_105721_admin_roles` et les profils de comptes
(complet / CRM / technicien) avaient été ajoutés à 10:55–10:58 par une autre session.
Sept sessions Claude étaient actives sur le même dépôt ; une autre a modifié la marque de
l'administration (`Brand.tsx`, `custom.css`, `payload.config.ts`, `Overview.tsx`,
`importMap.js`) pendant mon travail, à 12:41–12:52.

**Conséquence pratique :** je n'ai jamais synchronisé l'arbre entier. Les empreintes
SHA-256 de chaque fichier cible ont été relevées avant et après, et seuls mes 42 fichiers
ont été écrits, par archive ciblée. Les cinq fichiers de l'autre session ont été
explicitement exclus et sont intacts. Aucun retour arrière n'a été fait sur le travail
antérieur (suivi commercial, migration `crm_suivi`, redesign devis/factures, profils de
comptes) : tout est conservé et compilé dans la candidate.

Copie de sécurité des versions d'avant mon intervention :
`backups/source-avant-audit-six-points-20261010/avant.tar.gz` (35 fichiers).

## 2. Ce qui est corrigé

### P1 — Demandes anciennes non traitées masquées (le défaut le plus grave)

`src/app/(crm)/crm/page.tsx` prenait les 30 dernières demandes **puis** retirait les
converties : une demande plus ancienne restée en attente disparaissait et l'accueil
affichait « Aucune demande non traitée ».

Le filtrage se fait désormais **dans la requête** (`id: { not_in: [converties] }`), donc le
compteur et la liste sont globaux. Même correction sur `/crm/demandes` : l'onglet
« À traiter » est un filtre global avec un total et une pagination réels ; le message
« Aucune demande à traiter sur cette page » (vrai mais trompeur) a disparu.

*Vérifié* : 34 demandes créées par le formulaire public, les 32 plus récentes converties ;
l'accueil affiche 3 et nomme « Demande 00 ». Capture `limits-accueil.png`.

### P2 — Prochaine action fausse au-delà de 50 activités

`clients/[id]/page.tsx` calculait la prochaine action sur les 50 activités les plus
récemment créées : une action ancienne toujours ouverte disparaissait et la fiche affichait
« Aucune action prévue ». Deux requêtes dédiées remplacent la fenêtre : toutes les tâches
ouvertes (triées par échéance, sans plafond) et l'historique paginé (20 par page).

*Vérifié* : action datée du 1er septembre, 60 activités plus récentes créées ensuite ;
la fiche l'affiche comme prochaine action, l'historique se pagine.

### P2 — Invariant « prochaine action » incohérent

Décision prise avec le propriétaire : **une alerte cohérente partout, jamais un refus.**
Le formulaire de suivi garde son blocage (la prochaine action y est un champ que la
personne est déjà en train de remplir) ; le tableau, la fiche, l'accueil, le message après
enregistrement et le résumé d'import signalent l'entreprise sans la refuser. Les écritures
par l'API, l'administration et l'import CSV restent possibles — les bloquer casserait
l'import et les intégrations. La règle est écrite une seule fois, dans
`missingNextAction()` (`src/lib/crm.ts`), avec son raisonnement.

Ajouts : `saveClient` avertit, `importClients` indique combien d'entreprises importées
restent sans action.

*Vérifié* : entreprise passée à « Rendez-vous » par l'API, sans action ; elle apparaît dans
« Entreprises en cours sans prochaine action » et sa carte est marquée sur le tableau.

### P2 — Support « sans réponse » trompeur, et priorité réelle

Le libellé venait de `updatedAt`, qu'une note interne ou un changement de statut suffit à
bouger. Il est maintenant lu **dans les réponses** (`waitingState`, `src/lib/support.ts`) :
l'équipe doit une réponse si elle n'a jamais répondu, ou si le client a parlé en dernier.
Trois libellés distincts : « jamais répondu, reçu le… », « sans réponse de l'équipe depuis
le… », « répondu le… ».

Priorité de tri introduite (`tickets.priority` : urgente / haute / normale / basse, défaut
normale), **réglée par l'équipe seulement** — le formulaire client public est inchangé, pour
que tout ne devienne pas « urgent ». L'accueil trie : en attente d'abord, puis par priorité,
puis par ancienneté de l'attente.

*Vérifié* : trois tickets, le ticket urgent sans réponse en tête, celui auquel l'équipe a
répondu signalé comme répondu, et plus aucune mention « mis à jour le ».

### P2 — Formulaire Support voué à l'échec pour un administrateur

`/support/nouveau` montrait le formulaire à un administrateur, puis l'API refusait en 403
une fois le formulaire rempli. La page détecte maintenant un compte sans entreprise
cliente, explique pourquoi, et renvoie vers `/admin/collections/tickets/create`. Le bouton
« Ouvrir un ticket » de `/support` est adapté de la même façon.

### P2 — Formulaire projet lié au service, et réalisations pertinentes

- Les CTA des quatre pages services pointent vers `/contact?service=<page>`.
- `/contact` présélectionne le besoin correspondant, rappelle le service au visiteur, et
  transmet le contexte ; le besoin reste modifiable.
- Le service consulté est **stocké avec la demande** (`contact_requests.service`, borné aux
  quatre pages connues : une valeur inventée est refusée en 400) et affiché dans
  l'administration sous « Page consultée ».
- Chaque page service affiche 2 à 3 **réalisations réellement publiées**, résolues contre les
  études de cas (`casesForService`) : une étude dépubliée disparaît au lieu de laisser un
  lien mort. Le choix éditorial est centralisé dans `serviceCaseAnchors`.
- `localePath()` préservait le `#ancre` mais perdait la `?query` : les CTA anglais seraient
  partis vers la page française. Corrigé et testé.

### P2 — Indicateurs commerciaux demandés : `/crm/rapports` (nouveau)

Période au choix (30 j, 90 j, ce mois, 12 mois). Chaque indicateur affiche **ce qu'il compte
et sur quel dénominateur** : entreprises contactées, taux de réponse, rendez-vous réalisés,
devis envoyés (avec montant), demandes du site, entreprises perdues. Plus : échanges par
type, services demandés par besoin **et par page consultée**, raisons de perte agrégées.

Aucun chiffre estimé. La limite du taux de réponse est écrite sur la page : seule l'étape
*actuelle* de chaque entreprise est connue, l'historique des changements d'étape n'est pas
conservé — une entreprise contactée puis reclassée « Perdu » n'est pas comptée comme ayant
répondu. À lire comme un ordre de grandeur, pas comme un taux d'ouverture de campagne.

### P2 — État système : `/crm/systeme` (nouveau)

Un seul tableau : messagerie (synchronisation et dernière erreur), adresses bloquées,
demandes non traitées **avec l'âge de la plus ancienne**, tickets sans réponse de l'équipe,
dernière sauvegarde, **dernière restauration réellement testée**. Réservé aux
administrateurs complets ; le lien est caché aux comptes CRM seuls.

Le point central de l'audit est respecté : *l'existence d'un fichier de sauvegarde ne prouve
pas qu'il se restaure.* La page ne déduit rien. Elle lit un journal
(`app_backup_events`) écrit par les scripts :

- `deployment/backup.sh` enregistre chaque sauvegarde, **y compris les échecs** (sinon une
  sauvegarde silencieusement cassée se lit comme « aucune sauvegarde »).
- `deployment/restore-test.sh` (nouveau) restaure une sauvegarde dans une base de contrôle
  **jetable**, vérifie que les tables attendues sont peuplées, supprime la base, et
  enregistre le résultat. Il ne touche jamais `syncit`.

Tant qu'aucun test n'a été exécuté, la page affiche « Jamais testée » — c'est l'état
actuel et c'est volontaire. Capture `limits-systeme.png`.

## 3. Deux défauts latents découverts en chemin

`src/payload-types.ts` était **périmé dans le dépôt** : il ne contenait ni `pipeline`,
`lostReason`, `pipelineAt` (suivi commercial), ni `role` (profils de comptes), ni le type
d'activité `whatsapp`. Sa régénération a fait apparaître deux bugs réels que le fichier
périmé masquait :

1. `scripts/seed-enrichment.ts` appelait `row.value.replace(...)` alors qu'un texte de page
   peut légitimement être vide (missions par pays) → plantage au premier texte vide.
   Corrigé : une mission laissée vide reste vide, elle n'est pas transformée en `""`.
2. `tests/enrichment.ts` construisait un `Record<string,string>` à partir de valeurs
   nullables.

Ces deux corrections sont **hors du périmètre des six points** mais étaient nécessaires :
sans elles le projet ne compile pas avec des types exacts.

## 4. Fichiers modifiés

**Correctifs des six points (14)** — `src/app/(crm)/crm/page.tsx`,
`src/app/(crm)/crm/demandes/page.tsx`, `src/app/(crm)/crm/clients/[id]/page.tsx`,
`src/app/(crm)/crm/actions.ts`, `src/app/(crm)/crm/layout.tsx`, `src/lib/crm.ts`,
`src/lib/support.ts`, `src/collections/index.ts`, `src/components/crm/client.tsx`,
`src/app/(site)/support/nouveau/page.tsx`, `src/app/(site)/support/page.tsx`,
`src/app/(site)/api/support/tickets/route.ts`, `src/lib/contact-delivery.ts`,
`src/lib/validation.ts`.

**Nouveaux (8)** — `src/app/(crm)/crm/rapports/page.tsx`,
`src/app/(crm)/crm/systeme/page.tsx`, `src/lib/backup-state.ts`,
`src/components/ServiceCases.tsx`, `deployment/restore-test.sh`,
`src/migrations/20261010_113000_support_priority_service.ts`,
`src/migrations/20261010_113500_backup_state.ts`, `tests/crm-limits.py`,
`tests/crm-limits-run.sh`.

**Contexte de service et réalisations (15)** — `src/lib/contact-topics.ts`,
`src/lib/locale.ts`, `src/lib/showcase.ts`, `src/components/ContactForm.tsx`,
`src/content/contact.tsx` et les 4 `src/content/<service>.tsx`, les 4 routes FR et 4 routes
EN des services, `src/app/(site)/contact/page.tsx`, `src/app/(site-en)/en/contact/page.tsx`,
`src/app/(site)/globals.css`.

**Divers** — `src/migrations/index.ts`, `src/payload-types.ts` (régénéré),
`deployment/backup.sh`, `scripts/seed-enrichment.ts`, `tests/crm.test.ts`,
`tests/integration.ts`, `tests/enrichment.ts`.

## 5. Tests réellement exécutés

Image candidate : **`5sursync:audit-besoins-20261010`**,
sha256 `44de5e023fa731bbb04310f3cf11c69cd63c874fff0af1e4451a91fde12b7fcf`
(remplace `audit-six-points-20261010`, qui précédait le traitement du point 3).
Construite à partir de l'arbre courant, elle contient donc aussi le suivi commercial, les
profils de comptes et le redesign des documents livrés par les autres sessions.

| Contrôle | Résultat |
| --- | --- |
| `tsc --noEmit` sur `src/`, `tests/`, `scripts/` | **0 erreur** |
| Build image (`docker build`) | **réussi**, routes `/crm/rapports` et `/crm/systeme` présentes |
| Unitaires `tests/*.test.ts` (base jetable) | **73 tests, 0 échec** (64 réussis, 9 ignorés — ignorés préexistants) |
| Recette navigateur existante `crm-run.sh` | **196/196**, 0 erreur navigateur |
| Nouvelle recette de limites `crm-limits-run.sh` | **61/61**, 0 erreur navigateur |
| Migrations sur copie des données réelles | appliquées, puis redescendues, 215 entreprises intactes |

Bancs jetables uniquement : réseau Docker interne, base `syncit_test`, comptes et contenu
fictifs, messagerie désactivée, aucun port publié, conteneurs supprimés ensuite. Aucune
donnée client, aucun mail réel.

Les 55 contrôles de limites couvrent exactement les cas que l'audit signalait comme non
testés : plus de 30 demandes, plus de 50 activités, tri réel par urgence, absence de
prochaine action créée par API, contexte de service, indicateurs, état système, et le
parcours Support d'un administrateur.

Preuves : `tests/out-crm-limits/crm-limits-results.json`, `tests/out-crm/crm-results.json`,
captures `limits-accueil.png`, `limits-fiche.png`, `limits-rapports.png`,
`limits-systeme.png`, `limits-service-*.png`.

## 6. Ce qui reste à faire

1. ~~Rien de ce rapport n'est déployé.~~ **Déployé le 10 octobre à 18:05–18:06 UTC**
   (section 9). `/crm/rapports` et `/crm/systeme` répondent désormais 307 vers la connexion,
   et non plus 404.
   À noter, l'écart de livraison constaté par l'audit a été comblé **par une autre session
   pendant mon travail**, pas par moi : les migrations `crm_suivi` et `admin_roles` ont été
   appliquées à la production le 10 octobre à 11:29 UTC (lot 10), et la production a basculé
   sur `5sursync:suivi-roles-20261010` à 12:31 UTC. Vérifié à 14:18 UTC : `/crm/suivi`
   répond 307 vers la connexion (et non plus 404) et `clients.pipeline`, `lost_reason`,
   `pipeline_at` existent bien en base de production. Le constat « suivi absent de la
   production » du rapport d'audit n'est donc plus d'actualité — mais ses parcours
   authentifiés réels n'ont toujours pas été exercés.
2. **Point 3 : traité le 10 octobre à 16:13 UTC.** Une entreprise porte désormais ses
   **besoins et services demandés** (`clients.needs`, cases à cocher) et un **détail du
   besoin** en texte libre (`clients.needsDetail`). Le vocabulaire est celui du formulaire
   public et des tickets (`lib/contact-topics`), de sorte qu'une demande convertie, un
   ticket et une fiche parlent des mêmes services, sans traduction.
   La conversion d'une demande du site **reporte le sujet choisi par le visiteur** dans les
   besoins de l'entreprise — à la création comme sur une entreprise existante, sans jamais
   remplacer ceux déjà saisis ; un sujet inconnu est ignoré. La fiche affiche les besoins,
   et dit explicitement « Aucun besoin renseigné » quand il n'y en a pas. Les indicateurs
   gagnent une vue « Besoins déclarés sur les fiches », qui complète le flux entrant des
   demandes du site par une vision durable.
   Les besoins **ne s'importent pas depuis un CSV** : ils se renseignent au fil des
   échanges, donc une réimportation ne peut pas les écraser.
3. **Restauration testée le 10 octobre à 14:57 UTC — réussie.** Sur accord du
   propriétaire, `deployment/restore-test.sh` a restauré
   `backups/20261010T111435Z-pre-suivi-roles/syncit.dump` (280 Ko) dans une base de contrôle
   jetable : **9 pages, 1 administrateur, 215 entreprises, 12 migrations** restaurés, base
   supprimée ensuite. Vérifié après coup : seules `syncit`, `postgres` et `syncit_preprod`
   subsistent, la production est inchangée (9 pages, 215 entreprises, 14 migrations),
   les trois conteneurs sont *healthy* et le disque n'a pas bougé (46 %).
   C'est la première preuve réelle qu'une sauvegarde de ce projet se restaure.
   Le point de retour arrière du déploiement de ce matin est donc valide.
   **Deux réserves :** le test n'a pas pu être *enregistré* (la table `app_backup_events`
   n'existe pas tant que la migration `backup_state` n'est pas appliquée), donc
   `/crm/systeme` afficherait encore « Jamais testée » ; et la sauvegarde testée est
   **antérieure** aux migrations `crm_suivi` et `admin_roles` (12 migrations contre 14 en
   production) — voir le point 4.
4. **Sauvegarde de l'état actuel : prise et vérifiée le 10 octobre à 15:23 UTC.**
   `backups/20261010T152303Z/` contient les deux bases (`syncit.dump`, `syncit_preprod.dump`),
   les fichiers des deux applications, la composition, le verrou de dépendances et l'image
   déployée. Sa restauration a été testée à 15:27 : **9 pages, 1 administrateur,
   215 entreprises, 14 migrations**. Le trou était réel — la sauvegarde précédente datait
   de 11:14, donc d'avant les migrations de 11:29.
   `deployment/backup.sh` a été corrigé au passage : il faisait le `pg_dump` de la base de
   **production** mais l'archive des fichiers via le service `app`, qui est la
   **préproduction** (`app-production` n'existe qu'avec `compose.production.yaml`). Il
   sauvegarde désormais les deux bases et les fichiers des deux applications, suivant la
   convention des sauvegardes manuelles récentes. Vérifié : les volumes des deux
   environnements sont bien distincts ; leurs contenus sont identiques simplement parce que
   les mêmes quatre médias y ont été déposés le 8 octobre.
5. **Aucun cron de sauvegarde** n'a été installé — aucune automatisation sans demande.
6. **Gagné / Perdu** restent des zones de dépôt et des listes séparées, pas des colonnes
   persistantes du tableau. Signalé par l'audit, non modifié : à trancher.
7. **Dolibarr** reste l'ERP par l'organisation d'usage ; aucun connecteur n'a été écrit ni
   inventé.

## 6 bis. Migrations vérifiées sur une copie des données réelles

Fait le 10 octobre à 15:29 UTC, sans toucher la production : la sauvegarde de 15:23 a été
restaurée dans une base jetable `syncit_migration_test`, les deux migrations en attente y
ont été appliquées avec l'image candidate, puis redescendues, puis la base supprimée.

| Étape | Résultat |
| --- | --- |
| Copie des données réelles | 14 migrations, 215 entreprises, 0 ticket |
| `payload migrate` | `support_priority_service` **18 ms**, `backup_state` **19 ms**, « Done. » |
| Schéma après migration | `tickets.priority` et `contact_requests.service` créées, table `app_backup_events` présente |
| Données après migration | **215 entreprises, 9 pages — inchangées** |
| `payload migrate:down` | les deux migrations redescendues, « Done. » |
| Après retour arrière | 14 migrations, **215 entreprises intactes**, journal supprimé |

Les deux migrations sont donc **rapides, additives et réversibles sur les données réelles**.
État vérifié après coup : la production a toujours 14 migrations et 215 entreprises,
`tickets.priority` et `contact_requests.service` **n'y existent pas**, `/api/health` répond
200, les trois conteneurs sont *healthy* et le disque n'a pas bougé. Aucune base résiduelle.

## 7. Modifications durables à signaler avant déploiement

- **Deux migrations nouvelles**, à appliquer dans cet ordre après `admin_roles` :
  `20261010_113500_backup_state` (table `app_backup_events`) puis
  `20261010_155457_client_needs`. Cette dernière a été **générée par `payload migrate:create`
  contre une copie jetable de la base de production**, donc l'écart qu'elle décrit est exact.
  Elle couvre : `clients_needs` + `clients.needs_detail`, `tickets.priority` (+ index),
  `contact_requests.service`, et la levée de la contrainte `NOT NULL` sur `pages_copy.value`.
  Ce dernier point est un **correctif d'un écart préexistant** : le code autorise déjà une
  mission par pays vide, la base la refusait encore.
  Une première version manuscrite (`20261010_113000_support_priority_service`) a été retirée :
  faute de snapshot `.json`, elle faisait double emploi avec la migration générée.
  Tout est additif, avec un `down()` vérifié, et aucune donnée existante n'est modifiée : les
  tickets existants deviennent « normale », les demandes antérieures gardent `service` à
  NULL et s'affichent « sans page de service », les entreprises démarrent sans besoin.
- **`/contact` et `/en/contact` deviennent rendues à la demande** (elles lisent `?service=`),
  au lieu d'être régénérées toutes les 300 s. Elles exigent donc une origine approuvée **au
  moment de la requête** : vérifié, la production fournit `SITE_ORIGIN=https://5sursync.com`
  et la préproduction `APP_ORIGIN=https://preprod.5sursync.com`. Sans l'une des deux, ces
  pages renverraient 500 — c'est le seul point à revérifier avant bascule.
- **`deployment/backup.sh` est modifié** : il enregistre désormais chaque sauvegarde en base.
  Si la table n'existe pas encore, il affiche un avertissement et la sauvegarde se fait
  quand même.
- Le filtrage des demandes non traitées utilise un `NOT IN` sur les demandes converties.
  Correct et borné aujourd'hui ; à repenser si le nombre de demandes converties devient très
  grand (plusieurs milliers).

## 8. Séquence de recette et de mise en production proposée

Aucune de ces étapes n'a été exécutée. Elles demandent votre validation.

1. **Sauvegarde** : ~~`sh deployment/backup.sh`~~ — **faite le 10 octobre à 15:23 UTC**,
   `backups/20261010T152303Z/`, restauration vérifiée. À refaire juste avant la bascule.
2. **Preuve de restauration** : ~~`sh deployment/restore-test.sh`~~ — **fait le 10 octobre
   à 14:57 UTC, réussi** (voir section 6.3). À relancer après l'étape 1 pour tester la
   sauvegarde fraîche, et après application de la migration `backup_state` pour que le
   résultat soit enregistré et visible sur `/crm/systeme`.
3. **Préproduction** : déployer la candidate, appliquer les migrations, parcourir les six
   points avec un compte réel (ce que ni l'audit ni moi n'avons pu faire : les parcours
   authentifiés de production n'ont jamais été exercés).
4. **Production** : conserver `5sursync:suivi-roles-20261010` et son `RELEASE_TAG` comme
   point de retour arrière, appliquer **les deux nouvelles migrations seulement**
   (`crm_suivi` et `admin_roles` sont déjà appliquées depuis le 10 octobre 11:29 UTC, lot
   10 : `payload migrate` les ignorera), basculer, puis vérifier `/crm`, `/crm/suivi`,
   `/crm/rapports`, `/crm/systeme`, `/contact?service=reseaux-cloud` et les quatre pages
   services.
5. **Retour arrière** : revenir au tag précédent ; les deux migrations ont un `down()`, mais
   redescendre `crm_suivi` supprimerait les étapes commerciales saisies — à ne faire qu'avec
   la sauvegarde de l'étape 1 et une décision explicite.

## 8 bis. Journal de l'après-midi du 10 octobre

Sur accord du propriétaire, en autonomie, sans jamais toucher à la production :

| Heure UTC | Action | Résultat |
| --- | --- | --- |
| 14:57 | Test de restauration (sauvegarde du matin) | Réussi — 9 pages, 1 admin, 215 entreprises, 12 migrations |
| 15:23 | `deployment/backup.sh` corrigé puis exécuté | `backups/20261010T152303Z/`, deux bases et deux jeux de fichiers |
| 15:27 | Test de restauration (sauvegarde fraîche) | Réussi — 14 migrations, état actuel confirmé restaurable |
| 15:29 | Migrations vérifiées sur copie jetable | Appliquées puis redescendues, données intactes |
| 15:54 | Migration des besoins générée par Payload | Écart exact relevé contre la base réelle |
| 16:13 | Point 3 construit et recette complète | 73 / 196 / 61 contrôles, 0 échec |

Deux défauts de mes propres scripts ont été trouvés **avant** de les lancer, parce qu'ils
n'avaient jamais été exécutés : `restore-test.sh` ne cherchait que `database.dump` (les
sauvegardes récentes s'appellent `syncit.dump`) et triait les dossiers par nom, ce qui
l'aurait fait tomber sur un dossier sans dump. `backup.sh`, lui, faisait le `pg_dump` de la
production mais archivait les fichiers de la **préproduction**. Les trois sont corrigés.

## 9. Déploiement du 10 octobre, 18:04–18:07 UTC

Séquence exécutée, dans l'ordre proposé en section 8.

| Heure | Étape | Résultat |
| --- | --- | --- |
| 18:04 | Vérification image / arbre | Les 5 fichiers clés ont la même empreinte dans l'image et sur le disque |
| 18:04 | Sauvegarde pré-bascule | `backups/20261010T180430Z/` + copie du `compose.production.yaml` d'avant |
| 18:04 | `migrate:status` | Exactement 2 migrations en attente, aucune autre |
| 18:05 | `payload migrate` | `backup_state` 42 ms, `client_needs` 49 ms, « Done. » |
| 18:05 | Contrôle schéma et données | 16 migrations, **215 entreprises, 9 pages inchangées** ; `clients_needs`, `app_backup_events`, `tickets.priority`, `contact_requests.service` créées ; ancienne image toujours saine |
| 18:05 | Bascule `app-production` | Conteneur recréé, *healthy* |
| 18:06 | Routes internes | `/api/health` 200 ; `/crm`, `/crm/rapports`, `/crm/systeme` 307 vers connexion ; pages publiques 200 |
| 18:06 | Contenu rendu | Sujet présélectionné, champ `service` transmis, contexte rappelé, CTA contextualisés, **6 blocs de réalisations** sur `/reseaux-cloud`, CTA anglais vers `/en/contact` |
| 18:06 | HTTPS public | `/`, `/contact`, `/contact?service=…`, `/reseaux-cloud`, `/en/networks-cloud`, `/api/health` → **200** ; `/crm` → 401 (protection inchangée) |
| 18:06 | Sauvegarde post-déploiement | `backups/20261010T180614Z/`, **enregistrée** (1058 ko) |
| 18:06 | Test de restauration | **Réussi et enregistré** — 9 pages, 1 admin, 215 entreprises, 16 migrations |
| 18:07 | Journal applicatif | **0 ligne d'erreur** depuis la bascule |

`/crm/systeme` affiche désormais des faits mesurés et non plus « Jamais testée » :
`app_backup_events` contient la sauvegarde de 18:06:17 et la restauration vérifiée de
18:06:20.

**Retour arrière, si nécessaire.** Image précédente conservée :
`5sursync:suivi-roles-20261010`, sha256 `7c6f5c8f6613aa68c12a24bfb583ef8b00682a94d537318fb7eb0ac7a4bc009a`.
Composition d'avant la bascule :
`backups/20261010T180430Z/compose.production.yaml.avant-bascule`. Remettre cette image dans
`compose.production.yaml` puis `docker compose -f compose.yaml -f compose.production.yaml up -d app-production`
suffit : les deux migrations sont **additives**, l'ancienne application ignore simplement les
nouvelles colonnes. Les redescendre n'est pas nécessaire et supprimerait les besoins saisis
entre-temps ; si on y tient, `payload migrate:down` a été vérifié deux fois sur copie des
données réelles, et la sauvegarde de 18:04 précède tout changement.

## 10. Limites de ce retour

Tout a été vérifié sur bancs jetables avec des données fictives. **Aucun parcours authentifié
de production n'a été exercé**, aucune donnée réelle n'a été lue, aucun mail n'est parti.
Les captures montrent des fixtures, pas des écrans de production. Une recette indépendante
reste nécessaire, et c'est précisément ce que ce document doit permettre.
