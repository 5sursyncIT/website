# Contact SMTP actif — 6 octobre 2026

Les nouvelles demandes du formulaire Contact de production sont enregistrées durablement puis notifiées à **contact@5sursync.com**, depuis **no-reply@5sursync.com**, via **mail.5sursync.com:465** avec TLS strict. Une notification indique la référence, le sujet et un lien vers l’administration protégée ; elle ne recopie pas le contenu privé du message.

Le secret saisi personnellement est monté en lecture seule uniquement dans `app-production`, sous `/run/secrets/smtp_password`, depuis le fichier privé `/home/inaops/5sursync/secrets/smtp_password` (UID/GID1001, mode0400). Sa valeur n’a pas été affichée. Préproduction : image et montages inchangés, sans secret SMTP ni notification automatique.

Périmètre activé : nouvelles soumissions Contact de `https://5sursync.com` uniquement. Invitations, tickets, réponses et réinitialisations email restent désactivés ; l’adaptateur Auth Payload reste `disabledEmail`. Aucun accusé mail au visiteur n’est ajouté. **La demande ID2 reste `not-configured` et n’a jamais été rejouée.** Les demandes antérieures à cette activation ne sont pas reprises automatiquement.

## Traitement et protection contre doublons

La demande et son identifiant de soumission sont commités dans une même transaction PostgreSQL. Le navigateur garde son identifiant en cas d’erreur réseau ; les reprises concurrentes du même identifiant ne créent qu’une demande. Les anciens clients API sans cet en-tête restent compatibles, mais ne bénéficient pas de cette déduplication de soumission.

La migration additive `20261006_223000_contact_notifications` crée seulement `app_contact_submissions` et `app_contact_mail_attempts`, privées, sans backfill. Le worker réclame chaque événement une seule fois, avec verrouillage et identifiant de message stable. Il traite seulement les demandes nouvelles de production marquées `pending`, et vérifie la file environ toutes les cinq secondes.

`sent` porte le libellé « Acceptée par SMTP (livraison non confirmée) ». Une erreur ou interruption conserve la demande et marque un échec/résultat incertain. Un résultat incertain n’est pas renvoyé automatiquement ; une reprise opérateur doit être décidée après examen pour éviter un doublon. La confirmation publique reste « Votre demande a été enregistrée. »

## Validation

- 17 tests locaux réussis avec PostgreSQL temporaire et SMTP fictif : commit/rollback, cinq reprises simultanées, worker concurrent, échec SMTP, interruption, exclusion ID2/préproduction.
- Build et types réussis ; image active `sha256:b1ba222773b035e614c2c3b7afd4be5659251d63a8b609613df8984cbcaae266`.
- Test Hotmail unique réussi lors de la tentative expressément redemandée : réception réelle confirmée dans Outlook connecté à22:41:42UTC, sujet « 5/Sync IT — test SMTP de mise en service », Message-ID `<smtp-test-d82bda23-5a82-4045-a0d8-58c2e4754081@5sursync.com>`.
- Migration effectuée ; boucle du worker observée en PostgreSQL sur le même PID avec commits espacés de cinq secondes, sans marqueur d’erreur.
- 42 contrôles publics HTTPS passent après activation ; Nginx valide, production/préproduction/PostgreSQL sains.
- Au contrôle de22:51:48UTC : zéro nouvelle soumission et zéro tentative Contact. Aucune vraie demande supplémentaire ni email Contact de test n’a été créé pour la QA. Le premier email d’alerte d’une future soumission reste donc à observer.

Preuves : `documentation/qa/contact-smtp-runtime.json`, `smtp-test-retry-20261006.json` et `verification-public-after-smtp.json`.

## Sauvegarde et retour arrière

Sauvegarde fraîche source/DB vérifiée : `backups/20261006T224716Z-contact-activation`. Image précédente conservée : `5sursync:before-smtp-20261006`.

Pour un retour de code, contrôler d’abord la concurrence, restaurer seulement le Compose production sauvegardé puis recréer uniquement `app-production` avec `docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps app-production`. L’image précédente n’a pas de montage SMTP ni worker Contact. Conserver les données et les tables ajoutées ; ne pas lancer `migrate:down`, `compose down`, restauration de DB ou arrêt de préproduction/INA. Le secret demeure privé sur le serveur, sans montage dans l’ancienne application.

Les certificats TLS du VPS restent à renouveler manuellement par DNS-01 avant leur expiration du4janvier2027. Aucun changement DNS/MX, firewall, hébergement ERP ou accès SSH n’a été effectué pour ce raccordement.
