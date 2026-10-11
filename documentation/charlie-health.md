# Charlie : serveur de santé déployé, connexion ChatGPT à terminer

État réel au 11 octobre 2026, 13:49 UTC. Autorisation utilisateur du 11 octobre à 13:17 UTC : identité technique, clés, stockage et routes HTTPS pour **la santé seulement**. Aucun accès aux clients, messages, brouillons ou envois n’est exposé. Le blocage sortant Microsoft n’a pas été traité ; la messagerie Simafri du CRM n’a pas été modifiée.

## Ce qui fonctionne réellement

- Endpoint MCP : `https://5sursync.com/api/charlie/mcp`.
- Issuer propre à 5/Sync IT : `https://5sursync.com/charlie-oauth`.
- Découverte OIDC réelle : `https://5sursync.com/charlie-oauth/.well-known/openid-configuration`.
- Métadonnées OAuth : `https://5sursync.com/.well-known/oauth-authorization-server/charlie-oauth`.
- Métadonnées de ressource : `https://5sursync.com/.well-known/oauth-protected-resource/api/charlie/mcp`.
- JWKS public : `https://5sursync.com/charlie-oauth/jwks` ; aucune composante privée publiée.

Ces documents sont servis en HTTPS avec S256 natif et le scope applicatif `charlie:health` ; `openid` sert uniquement au sujet opaque. Pas de UserInfo, email/profile, inscription publique, DCR/CIMD ou refresh token. Un appel anonyme MCP renvoie 401 avec le challenge de découverte ; un jeton invalide est refusé. Le **client ChatGPT n’est pas encore enregistré** : sa liste de callbacks est vide, et aucune URL n’a été supposée. Aucune connexion authentifiée du propriétaire à ChatGPT n’a encore réussi ou été tentée.

## Déploiement et limites de privilèges

Source distincte : `/home/inaops/charlie-health-20261011`, hors du dépôt CRM. Image `5sursync:charlie-health-20261011`, ID final `sha256:1c11b3fe682e9b8fd5e892ac14db16f3fc6b8331d84e6df5260ffde752ae5652`.

`charlie-health-oauth-1` et `charlie-health-oauth-db-1` sont healthy, restart `unless-stopped`. Le service tourne sous UID 1001, système de fichiers en lecture seule, capacités supprimées, limites mémoire/CPU et réseaux Docker internes. Il n’a aucun port publié. Nginx joint son adresse privée fixe `172.20.0.3:3000` ; seul le HTTPS existant reste public. Docker ne publiait pas le port de boucle locale d’un conteneur relié uniquement à des réseaux internes : l’adresse privée a permis de conserver cette isolation.

Bibliothèques exactes : `oidc-provider@9.12.2`, `express@5.2.1`, `pg@8.16.3`, plus le SDK MCP et jose déjà préparés. Aucun OAuth artisanal ni identité Microsoft simulée. Le serveur vérifie le JWT signé, issuer, audience exacte, type `at+jwt`, sujet/client autorisés et expiration maximale 15 min, puis la présence d’un grant OAuth valide en base. Le rejeu d’un code révoque le grant et le MCP refuse immédiatement le jeton associé, conformément aux tests. Le simple logout CRM ou le disconnect ChatGPT ne doit pas être assimilé sans test à cette révocation de grant ; l’arrêt du service constitue le coupe-circuit opérationnel.

Les clés de signature/cookies, secret client et deux mots de passe DB ont été générés **sur le VPS exclusivement**, en fichiers privés mode 600 dans `secrets/`. Aucun n’a été transféré au ThinkPad, dans Git, la Bibliothèque ou le chat. La base OAuth est indépendante. Le rôle runtime `charlie_oauth` est réellement non superuser, sans création de bases ou de rôles ; ses tables servent seulement aux interactions/grants/CSRF. Le rôle de bootstrap DB et son secret ne sont pas montés dans le service OAuth.

Le propriétaire est lié à l’admin existant **ID 1**, relevé par une requête limitée à cet identifiant pour l’adresse propriétaire connue. Son email, ID, collection `admins` et profil CRM sont vérifiés depuis `/api/cms/admins/me`, jamais depuis des arguments du modèle. Le code Payload réellement installé confirme que cette opération relit le compte courant, contrôle la collection et vérifie la session. L’appel privé est un GET fixé, profondeur 0 et sélection email/profil ; auto-login désactivé pour cet appel. Aucun `PAYLOAD_SECRET` ou secret CRM n’a été partagé. Le service voit toutefois la session de l’utilisateur pendant sa validation : cette frontière de confiance reste celle décrite dans le diagnostic autorisé.

## Préservation du CRM et concurrence

Avant action : dépôt propre, HEAD `84bbb4ae73a1bdef4a8e5140db4ee727303c062a`, aucun processus Claude/Codex nommé observé. Ce constat ne garantit pas l’absence d’un éditeur ou d’un autre poste.

L’image et le processus CRM de production n’ont pas été remplacés ou redémarrés. Seule une liaison Docker privée a été ajoutée pour l’identité. `compose.production.yaml` déclare maintenant ce réseau/alias pour le conserver lors d’une future recréation du CRM ; son image, variables MAIL/SMTP, secrets et volumes sont inchangés. Le patch de configuration est de 7 lignes ajoutées / 1 retirée. La déclaration a été validée par Compose sans recréer l’application. Aucun client, mail, migration CRM, compte utilisateur ou permission Graph n’a été modifié. Préproduction, SmartQueue et remplacement des couvertures Harmattan sont hors changement.

Nginx : include limité au vhost `5sursync.com`, emplacements OAuth/MCP/métadonnées, limite de corps 16 KiB et rate limit existant. Le contrôle CAS a refusé tout remplacement si le vhost avait changé ; `nginx -t` a réussi avant reload. Basic Auth de `/admin`, `/api/cms` et `/crm` conservée. Aucun DNS, certificat, pare-feu, route stream INA ou port Internet modifié. Les empreintes TLS des trois noms INA sont identiques avant/après.

## Preuves et tests

- `test-results.txt` : **31 tests unitaires du connecteur**, aucun échec ; typecheck sans erreur.
- `oauth-e2e-results.txt` : **10 scénarios OAuth réels** avec la bibliothèque, PostgreSQL et comptes fictifs (11 entrées Node en comptant le groupe), aucun échec. Découverte, demandes hors politique, consentement/refus, CSRF, session absente, flux code/S256, JWT réellement émis accepté par le SDK et santé, mail refusé, rejeu/révocation, consommation concurrente atomique et persistance entre instances d’adaptateur. Les clés et tokens de ces fixtures étaient éphémères et n’ont jamais été des accès utilisateur.
- `public-checks-results.txt` : **12 contrôles HTTPS réels**, tous réussis ; discovery/JWKS, health-only, refus anonyme/faux jeton, callback non deviné, taille excessive, santé CRM et Basic Auth préservées.
- `audit-results.json` : audit runtime, **0 vulnérabilité signalée**.
- Rôle SQL runtime restreint vérifié ; magasin OAuth réel : **0 enregistrement** avant raccordement utilisateur. Base `charlie_oauth_fixture` supprimée après les tests.

Non validés encore : callback réel du client, saisie privée de ses identifiants, parcours navigateur Basic Auth + session CRM du propriétaire, consentement ChatGPT puis premier `charlie_health` dans ChatGPT. Les tests de fixtures ne prouvent pas ces étapes humaines.

## Sauvegarde et retour arrière

Sauvegardes privées VPS dans `backups/` : vhost et nginx.conf antérieurs, Compose antérieur au réseau, image CRM antérieure, dump de la base OAuth neuve avant publication et empreintes INA. Les fichiers originaux de clés/secrets sont persistants et doivent être conservés : le rollback ne les supprime ni ne les régénère. Pas de copie de clé TLS, dump CRM ou sauvegarde de données client nécessaire pour cette modification sans migration.

Coupe-circuit immédiat : arrêter **uniquement** le service OAuth de ce Compose. Retour arrière complet préparé : `sudo python3 /home/inaops/charlie-health-20261011/oauth/rollback.py`. Il contrôle les hashes du vhost et de Compose avant restauration, vérifie Nginx puis reload, arrête seulement notre service et détache notre réseau de l’app. En cas de changement concurrent, il s’arrête pour préserver le travail intervenu. Base et clés OAuth sont conservées. Le script est préparé/contrôlé syntaxiquement ; le rollback effectif n’a pas été exécuté sur le service publié.

Le serveur autonome et son stockage fonctionnent sans ordinateur personnel allumé. La connexion ChatGPT reste à finaliser ; ce lot ne crée ni automatisation de tâches ni accès persistant de messagerie.

## Étape nécessaire dans le formulaire ChatGPT

1. Renseigner le serveur MCP ci-dessus et OAuth. Relever **le callback exact présenté par le client** et le transmettre ; ce n’est pas un secret. Une demande de ce callback a été présentée.
2. Récupérer le `client_id` préparé et saisir le secret client **dans un parcours privé** entre le propriétaire, le VPS et le formulaire ChatGPT, sans les envoyer dans le chat. La méthode de token configurée est `client_secret_basic`, Authorization Code + S256.
3. Après vérification du callback, `oauth/set-callback.mjs` peut enregistrer cette seule URL et conserver les autres éléments privés. Il est préparé mais **non exécuté** ; il faut le monter comme script opérateur sur le VPS puis recréer uniquement `oauth` pour appliquer la configuration. Ne pas fournir une URL basée sur un exemple documentaire.
4. Le propriétaire valide le login CRM protégé et le consentement limité à la santé. Recette finale : appel `charlie_health` dans ChatGPT, expiration/refus et révocation. Aucune approbation d’envoi de mail n’est demandée dans ce lot.

**Blocage automatique rencontré** : le contrôle a refusé d’ouvrir `runtime.json` uniquement pour projeter le `client_id`, car ce fichier contient aussi secret client et clés ; cette lecture n’était pas considérée nécessaire. Aucun secret n’a été affiché et l’action n’a pas été contournée. Une autorisation explicite de cette lecture précise serait nécessaire si l’on souhaite automatiser cette extraction ; la récupération/saisie privée par le propriétaire permet de continuer sans cette lecture par l’agent.
