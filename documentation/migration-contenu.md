# Reprise du contenu historique — 6 octobre 2026

Publication de cette reprise : https://preprod.5sursync.com uniquement. Le domaine principal reste inchangé.

## Sources et arbitrages

Inventaire du site précédent lu par le parent : accueil, Nos Services, nos produits, nos-realisations, support et Contact sur https://5sursync.com/. Les coordonnées et statuts explicitement confirmés le 6 octobre prennent priorité sur les anciennes valeurs.

| Source | Contenu repris | Destination |
| --- | --- | --- |
| Accueil / Nos Services | Conseil SI, projets, intégration, formation ; câblage, réseau Wi-Fi, PTP/PTMP/VPN, NAS/datacenter/virtualisation, cloud, sauvegarde, sécurité ; web/mobile/API ; maintenance préventive/corrective | Services, quatre expertises, À propos |
| nos produits | 5-Docs GED/SAE ; 5-Gestion ERP modulaire ; 5-Secu sûreté physique ; 5-Cyber diagnostic/incidents ; 5-Com ToIP/IVR/SMS ; 5-Sign files, temps de travail et affichage | Six cartes Solutions métier ; aperçu partagé sur accueil |
| nos-realisations | Hage juin 2024 Diamniadio, Wi-Fi salon 8 000 m² et interconnexion stands ; Afribone Conakry 2023 ; LPG Expo juillet 2024 ; interconnexions multi-sites 2022–2024 ; INA archives/site/SAE/VMware ; Mismo Equip ; contexte Mairie 2022 | Études de cas administrables, six références historiques textuelles |
| support | Intervention distante/sur site, préventive/corrective, suivi selon contrat et accès espace client | Maintenance et support |
| Contact + confirmation utilisateur | +221 33 805 79 09, +221 76 881 30 39, +221 77 097 29 08 ; contact@5sursync.com ; Almadie 2, Résidence El'hadji Oumar Dieng, 4ème A, Sénégal | Contact et pied de page partagé |
| Confirmation WhatsApp | https://wa.me/221770972908 | Global existant Réseaux sociaux ; aucun bouton supplémentaire |

Les sept missions récemment approuvées et les médias/collections Showcase de Claude sont conservés sans écriture. Hage et Harmattan restent les deux études illustrées ; les illustrations sont signalées comme telles. Le chiffre Hage 8 000 m² est une surface publiée dans la référence historique, sans résultat de performance déduit.

Non repris : tarifs anciens, support 24/7 ou illimité, statistiques clients/projets/satisfaction non validées, promesses de conformité/certification, logos de partenaires assimilés à des projets, adresse personnelle, point Sonatel 2, IP/anciens liens non vérifiés. Youmann attend une confirmation de statut. Les mentions légales ne sont pas créées dans cette reprise. 5-Sign ne désigne pas la signature électronique. Les noms de technologies dans les missions n’impliquent aucun partenariat certifié.

## Administration

Dans Pages > Contact : `text-8` email, `text-9` adresse, `phone`, `phone-landline`, `phone-mobile` ; libellés de carte `map-label`, `map-title`, `map-directions`, `map-note`, `map-search`. Les trois téléphones, mailto, carte et liens d’itinéraire sont dérivés de ces champs. Le pied de page utilise la même source.

Dans Pages > Solutions métier : `catalogue-heading`, `catalogue-intro`, puis `product-5-docs-name/category/summary` et les mêmes trois clés pour 5-gestion, 5-secu, 5-cyber, 5-com, 5-sign. Ces champs alimentent aussi l’aperçu d’accueil.

Les références sont dans Réalisations — études de cas. Les entrées sans image/illustration sont affichées en cartes textuelles ; ajouter une image les déplace dans les études illustrées. Les sept projets restent dans Réalisations — projets. WhatsApp reste éditable dans Réseaux sociaux.

## Carte et contact

La carte effectue une recherche de l’adresse complète, sans coordonnées GPS ni précision artificielle. Google ne confirme pas la résidence exacte et peut afficher plusieurs résultats régionaux. Mention affichée : confirmer la résidence avant déplacement. Les liens Google Maps utilisent cette même adresse, avec `api=1` pour recherche et itinéraire. Aucun compte Maps, clé API, suivi WhatsApp ou transport SMTP ajouté. Le formulaire garde le stockage durable avant notification ; sans SMTP, aucune promesse d’envoi de mail.

## Migration ciblée et sécurité

`scripts/seed-enrichment.ts` ajoute uniquement les clés absentes et remplace les valeurs encore égales aux anciennes valeurs du gabarit (ou vides). Les autres modifications CMS sont conservées. Seul l’ancien numéro explicitement révoqué est remplacé dans tous les textes de Pages. Hage est enrichi uniquement si sa description est encore celle du gabarit ; les références historiques sont créées seulement si leur ancre est absente. Ne pas relancer les anciens `seed-content` / `seed-projects` pour cette reprise.

`scripts/configure-whatsapp.ts` fusionne l’entrée dans le global existant, supprime uniquement les doublons WhatsApp et conserve les autres réseaux ; aucun message envoyé. Les deux scripts sont idempotents et s’exécutent sur VPS, secrets chargés depuis les fichiers runtime sans affichage/transfert.

Tests locaux : build Next, TypeScript, cinq tests unitaires, migrations dans une base temporaire dédiée et 14 assertions de reprise/préservation/idempotence/WhatsApp. Les deux bases temporaires de cette reprise ont ensuite été supprimées ; les autres conteneurs locaux sont conservés. Contrôle navigateur des neuf pages à 390 px et desktop : aucun débordement ni image cassée. Captures dans `documentation/qa/`.

## Sauvegarde et retour arrière

Avant reprise : `backups/20261006T135958Z` et archive `backups/source-before-contact-final-20261006.tar.gz`. Sauvegarde fraîche immédiatement avant données : `backups/20261006T142658Z` (dump PostgreSQL, fichiers persistants, Compose, lockfile). Image précédente conservée : `5sursync:before-contact-final-20261006`, SHA256 a07d1f70699e33fecbd02c2fbc0c17ba450f53f91e5d86ab90050f429440f2c7.

Retour application : retaguer cette image en `5sursync:local`, puis `docker compose up -d --no-deps app`. Aucun changement de schéma dans cette release ; ne pas arrêter PostgreSQL ou les services INA. Les données enrichies restent alors dans le CMS et peuvent être ajustées, notamment dépublier les six références sans image si l’ancien rendu convient moins bien. Une restauration complète du dump remplacerait aussi des modifications utilisateurs plus récentes : sauvegarder l’état courant, tester dans une base distincte et obtenir validation explicite avant remplacement. Ne jamais `down -v` ou purger Docker globalement.

## Favicon

Référence validée Library : `libfile_46c5a87652ac8191b0fa995f14a73171`, 5Sync-IT-logo-reference-amelioree.png. Favicon `public/favicon-5.png` obtenu par extraction imagegen du monogramme supérieur, sans wordmark, fond transparent ; aucun 5 typographique générique, logo horizontal inchangé. Métadonnées Next public/Support : icon, shortcut et apple, URL versionnée `?v=20261006`. `/favicon.ico` redirige 308 vers ce PNG ; le format annoncé est image/png. Image source conservée dans preparation/favicon ; sortie originale dans generated_images.

Prompt built-in : extraire uniquement le grand monogramme supérieur marine/turquoise, préserver formes/vides/couleurs/proportions, supprimer wordmark et fond blanc, carré transparent centré, sans nouveau dessin ni texte.

Migration réelle : 31 clés de Pages ajoutées, 23 valeurs approuvées mises à jour, zéro valeur personnalisée à écraser, six études historiques créées. Deuxième exécution : zéro ajout/mise à jour/création. WhatsApp : une entrée globale, deuxième exécution sans changement. Base après reprise : sept projets aux noms/missions/statuts inchangés, huit études de cas, un administrateur existant, zéro client. Aucune migration de schéma, compte ou secret créé pendant cette reprise.

Publication finale vérifiée : image/tag `5sursync:content-final-20261006`, SHA256 d9210d03308ca5b9e78c97b6e1aecdd02e8699cc048389ac2f1bd19fd29d9ba7 ; 31 contrôles HTTPS réels réussis. App/DB healthy, nginx -t OK, trois empreintes TLS INA inchangées. Après renouvellement du cache de pré-rendu (5 minutes), une icône WhatsApp avec URL exacte apparaît sur chaque page. Le navigateur de contrôle public final était déconnecté ; captures disponibles correspondent au code testé localement avant bascule, pas à une nouvelle capture publique.
