# Reprise Claude / autre agent

Projet VPS `/home/inaops/5sursync`, Ubuntu `ina-relay-direction`, alias SSH
`ina-relay` (185.187.169.152:2022, inaops). Utiliser strictement la confiance hôte
existante. Ne jamais lire/afficher/transférer clé privée ou secrets. Ne pas revenir
à Windows, ne pas utiliser Sites. Domaine préproduction validé :
`preprod.5sursync.com`, A=185.187.169.152. Domaine principal inchangé.

## Lire d'abord

- `architecture.md` : composants et données.
- `installation-tests.md` : installation locale, migrations et preuves.
- `support-securite.md` : authentification, invitations, isolation et fichiers.
- `deploiement.md` : Compose, Nginx, secrets, TLS et activation admin.
- `sauvegarde-restauration.md` : sauvegarde et retour arrière.
- `ETAT.md` : état effectivement obtenu, limites et prochaine action.

Les anciens `.txt` dans documentation/preparation sont historiques, écrits avant
implémentation. Le code et ces Markdown font désormais référence. Mettre ETAT.md
à jour après chaque changement. Aucun secret ou donnée client dans ces documents.
Aucun compte réel n'a été créé par l'agent : le premier admin doit saisir son mot
de passe lui-même via un parcours privé ; les fixtures test sont locales seulement.
