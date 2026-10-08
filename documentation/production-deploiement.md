# Production publiée et validée — 6 octobre 2026

État : production déployée et routage HTTPS activé sur le VPS après autorisation explicite à 21 h 33. Le propriétaire a basculé le A principal vers 185.187.169.152 ; aucun changement DNS effectué par l’agent. La description initiale ci-dessous conserve le plan préparé avant cette autorisation. L’autorité choisie et confirmée par l’utilisateur est Hostinger. Dernière convergence DNS confirmée à 21:59:54 UTC : les deux dns-parking, Google et Cloudflare répondent tous 185.187.169.152 pour main et www sur deux relevés consécutifs.

## Changements préparés

`project/` est une copie sans secrets du code actuel du VPS. `baseline.json` contient ses empreintes initiales ; `source-patch.tar.gz` contient les 16 fichiers source modifiés/ajoutés, appliqués après comparaison de baseline. Ne pas copier node_modules ou .next. Le contenu éditorial, les médias et les comptes ne sont pas réinitialisés.

Le build reçoit SITE_ORIGIN=https://5sursync.com et SITE_INDEXABLE=1. Neuf pages publiques ont leur propre canonical, robots et sitemap. Support, administration et API restent hors indexation. Les builds par défaut conservent l’origine preprod et l’indexation désactivée ; l’instance préprod actuelle n’est pas reconstruite pendant la bascule.

`compose.production.yaml` ajoute seulement app-production sur 127.0.0.1:3106, limité à 2 Go/1,5 CPU, avec les secrets existants et les volumes persistants. Copier ce fichier à la racine /home/inaops/5sursync avant utilisation avec compose.yaml. APP_ORIGIN reste propre à chaque instance ; pas de CORS élargi. La production partage la base CMS et les médias existants avec la préproduction : il ne s’agit pas de deux bases isolées. Les cookies restent Secure, HttpOnly, SameSite et sans Domain ; une nouvelle connexion est nécessaire sur le nouveau domaine. Les invitations futures utilisent le domaine de l’instance qui les crée.

`production.nginx.conf` écoute seulement 127.0.0.1:9444 avec PROXY protocol, protège admin/CMS/team avec la protection existante et redirige www vers le domaine nu. Il réutilise la zone syncit_admin déjà déclarée dans la configuration préprod. `SNI-PATCH.txt` décrit les deux ajouts ciblés au relais existant, sans remplacement des routes INA, préprod ou de son rejet par défaut. Aucune ouverture de port ou règle firewall n’est prévue. Le routage HTTP port 80 éventuel doit être inspecté et validé séparément ; seul HTTPS est préparé ici.

## Dolibarr : prérequis bloquant, avant le domaine principal

Dolibarr 17.0.3 demeure sur son ancien hébergement 91.204.209.201. Aucun dump ni transfert de base n’est prévu. Le DNS gestion.5sursync.com est présent côté Hostinger, mais le serveur ancien ne présente pas encore un certificat strictement valide pour ce nom. Ne pas activer la redirection /gestion tant que ce parcours n’est pas validé.

L’utilisateur doit ouvrir le panneau de l’hébergement ancien (Simafri ; distinct du gestionnaire de domaine Hostinger), confirmer l’orthographe gestion.5sursync.com, et configurer son vhost vers le répertoire Dolibarr actuel pour servir l’application à la racine. Préserver base, documents, extensions, tâches et sauvegardes. Utiliser la fonction SSL habituelle de cet hébergeur pour gestion.5sursync.com. Si nécessaire, ajuster seulement dolibarr_main_url_root via le propriétaire ; ne jamais afficher conf.php ni ses identifiants.

Valider ensuite TLS strict, page de connexion, connexion réelle par le propriétaire, accueil, modules utilisés, documents, assets et déconnexion ; contrôler les liens d’intégration/cron. /gestion/index.php?x=1 sera redirigé vers https://gestion.5sursync.com/index.php?x=1 ; /gestion et /gestion/ vers sa racine. Ne pas héberger Dolibarr sur ce VPS.

## Certificat principal par DNS-01, après approbation groupée

Préparer sur le VPS un certificat pour 5sursync.com ET www.5sursync.com, via le certbot existant et son compte existant si applicable. Commande indicative, non exécutée : `sudo certbot certonly --manual --preferred-challenges dns --cert-name 5sursync.com -d 5sursync.com -d www.5sursync.com`. Vérifier les conditions/compte avec le propriétaire avant exécution. Ne jamais afficher ou copier les clés privées.

Le propriétaire ajoute dans la zone Hostinger uniquement les TXT temporaires indiqués par certbot pour _acme-challenge.5sursync.com et _acme-challenge.www.5sursync.com, attend leur visibilité sur les deux serveurs autoritaires puis autorise la validation. Retirer uniquement ces valeurs de challenge une fois validées ; préserver les autres TXT. DNS-01 permet ce certificat avant la bascule A et sans modifier les ports. Voir https://letsencrypt.org/docs/challenge-types/#dns-01-challenge . Le renouvellement manuel exige de futures interventions DNS ; aucun jeton DNS persistant n’est prévu ni créé.

Les divergences observées entre délégation TLD Hostinger et NS d’apex ClouDNS ne sont pas réparées dans ce périmètre. NS, MX, mail, SPF, DKIM, DMARC, autoconfig/autodiscover restent inchangés. mail possède son propre A vers l’ancien serveur ; www est un CNAME du domaine nu côté Hostinger. Obtenir l’export DNS complet avant toute future opération de zone ; ne pas deviner les sélecteurs DKIM.

## Mise en service proposée, soumise à approbation du parent/utilisateur

1. Valider l’ERP et son TLS sur gestion ; relire les ressources et l’état des services INA. Sauvegarder le code, les fichiers Nginx réellement concernés et leurs empreintes, la liste d’images, la configuration Compose et les données via la procédure existante sans afficher de secrets. Conserver l’image préprod connue et ne pas restaurer la DB pour un simple retour de code.
2. Après accord groupé, transférer uniquement le patch et le Compose additionnel. Construire une image production dédiée ; lancer seulement app-production avec les deux fichiers Compose. Ne pas lancer migrate/seed ni recréer postgres ou app préprod.
3. Tester santé DB/application, médias, formulaire avec conservation durable, authentification/protections, canoniques, sitemap et liens ; aucun message envoyé ne doit être annoncé lorsque SMTP reste désactivé.
4. Émettre le certificat DNS-01 approuvé. Installer uniquement le nouveau vhost et les ajouts SNI décrits, exécuter nginx -t puis recharger si le test passe. Aucun redémarrage global ou arrêt INA.
5. Avant DNS : tester strictement main/www avec résolution forcée vers 185.187.169.152, la redirection www, la redirection legacy ERP (chemin/query), la protection admin, le support, les médias et les routes INA/preprod. La syntaxe Nginx effective et son certificat ne peuvent être validés localement ici ; ces contrôles constituent un verrou avant bascule.
6. Le propriétaire bascule seulement A @ vers 185.187.169.152 dans Hostinger après les contrôles, puis vérifier DNS public, HTTPS et fonctionnement. Aucun changement de nameservers/MX. Annoncer déployé uniquement après ces tests.

## Retour arrière

Rétablir d’abord A @ = 91.204.209.201 dans Hostinger pour revenir au site et au chemin ERP anciens, en tenant compte des caches TTL. Supprimer/restaurer seulement les deux ajouts SNI et le nouveau vhost à partir de leurs sauvegardes ; nginx -t puis reload. Arrêter uniquement app-production : `docker compose -f compose.yaml -f compose.production.yaml stop app-production`. Ne pas utiliser compose down, supprimer de volume, restaurer la DB ou arrêter app/postgres/INA. Garder gestion sur son ancien hébergement une fois validé. Le nouveau certificat et l’image peuvent être conservés sans être servis.

## Vérification locale

Build Next production réussi avec neuf pages publiques pré-rendues, six tests existants réussis, typecheck réussi et Compose fusionné accepté par config --quiet. `verify-local.py` contrôle le HTML effectif, neuf canoniques/indexations, sitemap exact, robots, deux pages support non indexables et trois origines de formulaire avec corps invalide (aucun enregistrement). `verification.json` contient les résultats.

Le test HTTP utilise next start localement pour vérifier le build ; la future image Docker reste à construire et tester avec son serveur standalone avant bascule. Les tests ne valent pas validation du SMTP, du certificat principal, du Nginx réel ou de Dolibarr. Aucun identifiant ou secret n’est contenu dans ce dossier de préparation.

## Avancement autorisé à 21 h 33 UTC

Le propriétaire a validé factures/devis Dolibarr, puis autorisé explicitement HTTPS/routage production par « go ». Sauvegarde réalisée et vérifiée : backups/20261006T2138Z-production (source, dump CMS, volumes médias/fichiers, configurations Nginx). Source distante conforme à baseline avant transfert. Image production construite : sha256:d70a1cf5e04daa100ffebdbf31ffa0bc68ee0b6c541118e4195d0cd5635743ec. Service app-production lancé seul sur 127.0.0.1:3106 et sain ; préprod/PostgreSQL non recréés. Serveur standalone testé avec les mêmes contrôles que verify-local.py. Pas de tâches planifiées ou notifications automatiques ; SMTP désactivé. Les caches des deux instances peuvent différer cinq minutes après une modification CMS.

## Contrôles finaux avant bascule

Certificat principal/www émis via le compte ACME existant, TLS strict 1.3, expiration 4 janvier 2027 à 20:46:18 UTC. Aucun jeton DNS ni nouvel accès créé. Nginx -t réussi avant reload et après activation ; seules deux lignes de map et un upstream ajouté au relais. Vhost préprod SHA256 identique, certificats INA et préprod inchangés. App production et préprod ainsi que PostgreSQL sains ; DB et services applicatifs toujours privés sur loopback/réseau Docker.

42 contrôles HTTPS avec résolution forcée vers 185.187.169.152 réussis : neuf pages/canoniques/indexation, sitemap exact, robots, santé DB, www, legacy /gestion avec suffixes/paramètres, Basic Auth y compris variantes encodées/doubles slash, support anonyme, formulaires invalides/antispam/origines et préprod non indexable. 19 assets identiques aux fichiers locaux ; neuf films en HTTP206. Neuf pages ont le même texte CMS que préprod et un seul lien WhatsApp validé. Test valide de formulaire : HTTP201 et ligne PostgreSQL id1 avec notification=not-configured ; seule cette ligne QA supprimée après preuve. Comptes inchangés : admin1/client0 ; demandes revenues à0. Aucune connexion tentée.

Signal de bascule envoyé à 21 h 50 ; le propriétaire a confirmé à 21 h 51 avoir changé uniquement A @ vers 185.187.169.152 dans Hostinger. www reste le CNAME du domaine principal. gestion et mail restent sur 91.204.209.201 ; MX, NS et SMTP inchangés. Après sa confirmation, vérifier encore le DNS public et HTTPS sans résolution forcée avant annoncer la bascule effective. HTTPS seulement : aucune ouverture de port80 ni redirection HTTP ajoutée.

Les deux valeurs TXT de challenge émises aujourd’hui peuvent être retirées après succès du certificat ; conserver tous les autres TXT. Ce certificat DNS-01 manuel ne se renouvelle pas automatiquement : répéter la validation avant expiration, avec reload Nginx après renouvellement. Ne pas confondre avec le renouvellement automatique du certificat Dolibarr chez Simafri.

## Validation publique finale

Bascule effective : https://5sursync.com/ ; www redirige en308 vers le domaine principal. 42 contrôles publics complets réussis depuis Ubuntu et depuis le VPS, sans --resolve : toutes les connexions sont arrivées à 185.187.169.152 avec TLS strict. DNS confirmé sur main ET www par ns1/ns2.dns-parking.com, Google8.8.8.8 et Cloudflare1.1.1.1 sur deux relevés consécutifs à21:59:34 et21:59:54 UTC. L’historique constate les réponses mixtes de propagation avant convergence, sans changement de serveur nécessaire.

Les trois redirections publiques /gestion, /gestion/index.php?mainmenu=home et /gestion/compta/facture/card.php?id=42&mode=show ont conservé suffixes/paramètres et atteint en200 la page de connexion de gestion.5sursync.com ; aucun login tenté. ERP reste à91.204.209.201 avec TLS strict. Douze contrôles DNS après bascule confirment A gestion/mail et MX inchangés sur les deux autorités et deux résolveurs publics. INA/préprod passent les contrôles TLS publics.

Preuves : verification-public-production.json (Ubuntu), verification-public-from-vps.json, dns-switch-history.json, verification-public-legacy-erp.json et dns-mail-erp-after-switch.json. Pas de blocage de publication restant. Limites : SMTP désactivé, renouvellement du certificat VPS manuel avant le4janvier2027, CMS/médias partagés et caches distincts de cinq minutes, HTTPS uniquement sans ouverture du port80.
