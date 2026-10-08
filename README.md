# 5/Sync IT

Next.js / React / TypeScript, API Node intégrée, Payload CMS et PostgreSQL privée,
déployés sur le VPS Ubuntu imposé avec Docker Compose et Nginx. Neuf pages de la
maquette converties et espace Support client avec invitations/tickets/fichiers privés.

CRM clients interne sur /crm (admins) : [documentation/crm.md](documentation/crm.md).
Boîte partagée Microsoft 365 contact@ dans le CRM : [documentation/microsoft365.md](documentation/microsoft365.md).
Préproduction isolée (base, secret et volumes propres) : migrations à lancer sur les deux bases.

Documentation de reprise : [documentation/REPRISE.md](documentation/REPRISE.md).
État réel, tests et limites : [documentation/ETAT.md](documentation/ETAT.md).

`npm ci --ignore-scripts`, `npm run typecheck`, `npm test`.
Build sans secrets : `BUILD_MODE=1 npm run build`.
Ne jamais conserver BUILD_MODE au runtime. Voir documentation pour migrations,
Compose, secrets serveur et activation du premier administrateur par l’utilisateur.
