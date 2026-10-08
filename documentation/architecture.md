# Architecture et décisions

Next.js 16.3.8, React 19.3, TypeScript 5.9.3, Payload 3.90.2 intégré et PostgreSQL 17.
Dépendances verrouillées par package-lock, images Node/PostgreSQL par digest.
`src/app/(site)` et `(payload)` séparent layouts public/CMS. Pages publiques
pré-rendues, revalidation 300 secondes. `BUILD_MODE=1` utilise uniquement le contenu
par défaut au build ; cette variable ne doit jamais être configurée au runtime.
Le runtime exige les vrais secrets fichiers ; aucun mot de passe build opérationnel.

Maquette neuf pages convertie en JSX React (`src/content/*.tsx`), CSS conservé,
logo et visuels dans public/assets. Navigation responsive React et formulaires API
remplacent le JS de démonstration. Texte éditable dans collection pages sous forme
clé/valeur, React échappe le texte. Les structures visuelles ne sont pas du HTML
administrable arbitraire. L'ordre des quatre services et les deux références
Groupe Hage/Harmattan sont conservés. Adresse du kit non confirmée retirée du UI.

`src/collections/index.ts` : admins, clients, client-accounts, tickets,
ticket-replies, ticket-notes, ticket-files, pages, media, contact-requests.
`src/payload-types.ts` généré. Tickets/replies/files portent client indexé.
Clients sont organisations ; plusieurs comptes d'une organisation voient ses
mêmes tickets. Ce choix correspond à l'isolation par client, pas par personne.
Admins et client-accounts sont collections auth séparées, accès CMS admins seuls.

Fichiers tickets : métadonnées DB + volume privé hors public. Pas d'Upload Payload
pour ces fichiers. Collection media publique séparée pour l'éditorial CMS.
Le site utilise actuellement les visuels source ; la galerie média CMS est prête,
mais l'édition des visuels des neuf gabarits n'est pas encore reliée à cette galerie.

API métier : contact, santé, support login/logout/activation/tickets/réponses/
upload/download et invitations équipe. API Payload `/api/cms` uniquement privée
par Nginx, GraphQL désactivé. Auth/permissions également dans les collections pour
les appels locaux et REST, sans dépendre des protections d'interface.

Le champ éditorial est `copy` (table pages_copy), évitant le suffixe interne Payload
_texts. Migration explicite rename de pages_texts, données conservées. Publication
CMS invalide cache pages et chemin associé, avec revalidation 300 s en secours.

CRM interne (8 octobre 2026, détails documentation/crm.md) : groupe de routes
`src/app/(crm)` avec son propre layout racine, pages serveur dynamiques et actions
serveur sur `/crm`, réservées aux admins Payload (`crmContext`). Les entreprises
sont la collection `clients` existante, enrichie de champs commerciaux ;
nouvelles collections `crm-contacts`, `crm-deals` et `crm-activities`, en accès
admin uniquement. Migration additive 20261008_090825_crm.
