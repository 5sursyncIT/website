# Installation, migrations et tests

Node 22.19+ ; production image Node 22 LTS. Local Ubuntu testé Node 25.9.
`npm ci --ignore-scripts`, `npm run typecheck`, `npm test`.
`BUILD_MODE=1 npm run generate:types`, `BUILD_MODE=1 npm run build` ne nécessitent
pas de secrets réels ni DB. Ne pas conserver BUILD_MODE au lancement.

Runtime local : définir DATABASE_URI/PAYLOAD_SECRET (fixtures jetables uniquement)
et APP_ORIGIN=http://127.0.0.1:3106 ; `npx next start --hostname 127.0.0.1 --port 3106`
(ajouter espaces aux options : `--hostname 127.0.0.1 --port 3106`). La production
utilise `node server.js` dans image standalone. Pas de DB de production en local.

Schéma : migrations versionnées src/migrations, générées via Payload avec
push:false et disableCreateDatabase:true. `npm run migrate` applique migrations ;
`npm run seed:content` ajoute uniquement les neuf pages absentes, ne crée aucun
admin/client. Une migration supplémentaire crée app_rate_limits (clé hachée,
compteur, expiration), mises à jour atomiques PostgreSQL pour limiter abus.

Tests réels : `tests/integration.ts` avec DB temporaire dédiée syncit_test,
exécutée avec BOOTSTRAP_ADMIN_EMAIL=admin@example.test (email fixture).
fixtures admins/clients A/B. 17 assertions Payload/PostgreSQL : tenant forcé,
statut/auteur non forgeables, lecture tiers/anonyme refusée, update client refusé,
réponse sur ticket tiers refusée, notes internes 403, fichiers tiers refusés et
storageKey caché, création compte/fichier via client refusée, compte désactivé.

`tests/http-security.ts` après intégration, application locale sur 3106 :
19 assertions directes HTTP/API : IDOR tickets/fichiers, notes et rôles, MIME,
upload/download privé no-store, invitation admin-only, activation unique, contact
persisté et réponse sans simulation mail. Fixtures jetables uniquement, aucune
identité réelle. Ne pas lancer ces scripts sur production : `tests/guard.ts` les
arrête (code 2) si le nom de la base ne finit pas par `_test`. Cinq tests unitaires.

Audit npm production : zéro vulnérabilité après overrides undici 7.30,
sass 1.105.1, DOMPurify 3.4.16, esbuild 0.28.2. Vérifier à nouveau à chaque mise à jour.
Build Next local passé, toutes neuf routes pré-rendues. Rendu accueil ordinateur
et mobile 390 px et navigation vers connexion Support inspectés dans navigateur.
Restauration pg_dump vers deuxième DB locale syncit_restore testée : ticket revenu.

Corrections finales vérifiées :19 assertions Payload incluant refus first-register
client à collection vide ;21 HTTP incluant logout et rejeu session refusé 401.
Neuf tests proxy public en conteneur local avec les vrais blocs location Nginx,
POST bootstrap avec email exact propriétaire et chemins normalisés/encodés→404.
Ce test valide routage d'accès, pas encore le certificat TLS public.
Test CMS NODE_ENV=production : neuf pages et tous leurs textes corrects en DB après
migration content_copy, collision suffixe interne _texts évitée sans patch upstream.

Review Claude du 6 octobre (12:03 UTC), image corrigée, environnement jetable
(réseau Docker interne, PostgreSQL éphémère syncit_test, rien sur la production) :
garde-fou base refusée code 2, typecheck OK, 5/5 unitaires, 3 migrations,
20 assertions Payload (+ bootstrap admin refusé avec X-Real-IP), 26 HTTP
(+ réinvitation compte actif 409, réinvitation compte en attente : ancien jeton 401
et nouveau 200, /support/nouveau et /support/tickets/[id] anonymes 307 vers
connexion, /team/invitations client 404). Bootstrap HTTP vérifié séparément :
X-Real-IP 403, tunnel sans en-tête 200, deuxième création 403.
Attendre « PostgreSQL init process complete » avant migrate dans un conteneur neuf,
sinon la migration échoue silencieusement (course au redémarrage d'initialisation).

`tests/social-links.ts` (après integration.ts, base *_test) : adresses non https
refusées, modification client refusée, enregistrement admin relu.

`tests/showcase-http.ts` (après integration.ts et seed-content.ts, app sur 3106) :
gestion admin des projets/études, upload logo, route /media, publication.
