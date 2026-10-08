# Nos réalisations et projets — 6 octobre 2026

Section partagée par l'accueil et /realisations, ancre
`#nos-realisations-et-projets`. Sept cartes avec pays, mission et badge de statut.
Aucune capture ni tableau image. Hage Wi-Fi et Harmattan site vitrine conservés
séparément ; la nouvelle carte Harmattan décrit exclusivement ERP/support ERP.

## Contenu dans Payload (depuis 13:52 UTC)

Collections dédiées, plus de clés `project-*` dans Pages :
- **Réalisations — projets** (`projects`) : client/projet, pays, mission, statut
  (Réalisé, Sous contrat, En cours, Pré-lancement), logo envoyé (PNG/JPEG/WebP,
  prioritaire) ou logo fourni avec le site, ordre, publié, afficher sur l'accueil.
  Sans logo : nom affiché en texte (cas CPFA). Ajout/suppression libres.
- **Réalisations — études de cas** (`case-studies`) : client, catégorie, projet,
  description, étiquettes, visuel envoyé ou illustration de la maquette, ancre
  (`groupe-hage`, `harmattan` utilisées par l'accueil et Réseaux & cloud : ne pas
  les renommer sans adapter ces liens), ordre, publié. Alternance gauche/droite auto.
- Pages → realisations : 14 clés restantes (hero, principes, CTA, `projects-heading`).
Images envoyées servies publiquement par `/media/<fichier>` (route app, seuls
fichiers déclarés en médiathèque, types image) ; `/api/cms` reste protégé.
Toute modification rafraîchit immédiatement l'accueil et /realisations.
`scripts/seed-content.ts` crée une seule fois les 7 projets et 2 études depuis les
valeurs en base (éditions conservées) puis retire les 42 anciennes clés.
`scripts/seed-projects.ts` et `src/lib/projects.ts` supprimés (remplacés).

## Sources des logos

Assets locaux inspectés au rendu, sans retouche de marque :

- INA Guinée : https://ina.gn/images/ina-logo.png, provenance https://ina.gn/fr.
- Mairie Dakar : https://www.mairiedakar.sn/assets/images/logo.png.
- RTG : https://rtgguinee.info/wp-content/uploads/2026/06/Purple-Gradient-Modern-Laptop-Mockup-Instagram-Post-1-1-1.png.
  Original 148x82, affiché petit pour conserver sa qualité.
- ANAPI : https://anapi.cd/wp-content/uploads/2025/03/LOGO-OFFICIEL-ANAPI-RDC.svg.
  Le logo ANAPI illustre GUCE / ANAPI ; aucun logo GUCE non vérifié publié.
- L'Harmattan Sénégal : https://senharmattan.com/images/logo.png.
- CNTS transfusion : https://cnts.gouv.sn/images/logo-cnts.png ; pas le syndicat.
- CPFA : texte uniquement, pas de logo officiel vérifié ni logo inventé.

## Sauvegarde et retour arrière

Dernière version Claude synchronisée avant integration, comparaison de 89 fichiers.
Ses changements de pied de page/réseaux sociaux/bootstrap/Support restent présents.
Sauvegarde DB/fichiers : backups/20261006T131020Z.
Source avant changement : backups/source-before-projects-final-20261006.tar.gz.
Image précédente : 5sursync:before-projects-final-20261006.

Pour annuler uniquement la release : retaguer cette image en 5sursync:local puis
`docker compose up -d --no-deps app`, vérifier santé/HTTPS. Ne pas arrêter INA/DB
ni supprimer les volumes. Les nouvelles clés texte peuvent rester inutilisées
par l'ancienne image ; aucune restauration DB nécessaire pour ce retour arrière.
Toute restauration de données réelles demande examen spécifique.

## QA

Typecheck, build Next local et cinq tests unitaires passés. Inspection navigateur
ordinateur, tablette 768 px (deux colonnes) et mobile 390 px (une colonne), aucun
débordement horizontal. Six logos chargés ; navigation de l'accueil à l'ancre
Réalisations et présence Hage/Harmattan vitrine vérifiées. Publication effective sur https://preprod.5sursync.com : 29 contrôles HTTPS
réels réussis, trois redirections Support 307 et 29 clés PostgreSQL exactes
confirmées. App/DB healthy, TLS INA inchangé. Preuves publiques desktop/mobile
dans documentation/qa/projets-desktop.jpg et projets-mobile.jpg ; voir ETAT.md.
