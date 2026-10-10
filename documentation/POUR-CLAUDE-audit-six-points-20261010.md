# Transmission à Claude — audit des six améliorations, 10 octobre 2026

Lire d'abord `audit-charlie-six-points-20261010.txt`, rapport complet de l'audit indépendant.
Ce dépôt documentaire a été demandé par le propriétaire. Il ne constitue aucune nouvelle
autorisation de déploiement, modification de droits, achat, envoi réel ou changement DNS.

## État auquel se rapporte l'audit

Audit réalisé le 10 octobre vers 10:50–10:53 UTC. Production observée :
`5sursync:mail-simafri-20261009b`, SHA256
`c3e223589f4ce4458a993ef029d30b4900514109954649edaa985cf0521acf6e`.
Candidate testée : `5sursync:suivi-preprod-20261010`, SHA256
`091a03e4481cd2bc91537d42934779de3c8c647051f4a58515d0ce795e7f05a2`.
Le suivi commercial, sa migration et le redesign des documents étaient construits mais
pas déployés. Production : `/crm/suivi` 404 et `clients.pipeline` absent.
Comparer impérativement cet état à l'état ACTUEL avant toute intervention : conserver
les travaux réalisés depuis l'audit, sans retour arrière ni écrasement de modifications.

## Attendus et matrice de constats

| Point attendu | Constat à l'audit |
| --- | --- |
| 1. Aujourd'hui : appels, relances dues, demandes site, tickets urgents, responsable/date | Partiel, testé sur candidate ; urgence/responsable Support incomplets ; non livré |
| 2. Pipeline : à contacter, échange, besoin, RDV, devis, gagné/perdu, attente budget | Implémenté et vérifié sur candidate ; absent de production |
| 3. Fiche entreprise : interlocuteurs/fonctions, appels/mails/WhatsApp, besoins, prochaine action | Partielle ; nouvelles étapes/actions non livrées ; besoins peu structurés |
| 4. Formulaire projet court lié au service, demande CRM, réalisations pertinentes, CTA | Contact et conversion manuelle fonctionnels ; contexte du service non transmis ; couverture des réalisations incomplète |
| 5. Entreprises contactées, réponses, RDV, devis, services demandés, raisons de perte | Métriques financières/étapes présentes ; métriques commerciales spécifiques et leurs définitions manquantes |
| 6. État système : sync, rejets, demandes non traitées, sauvegarde/restauration testée | Diagnostic mail présent ; supervision complète et preuves de sauvegarde/restauration absentes de l'interface |

## Priorités

1. **P1 : demandes anciennes non traitées masquées.** L'accueil prend les 30 dernières
   demandes puis retire les converties ; peut annoncer aucune demande malgré une demande
   plus ancienne en attente. Corriger comptage/filtrage avant pagination.
2. **Écart de livraison :** ne pas annoncer les six points livrés. Compléter les lacunes,
   puis proposer une séquence de recette et de mise en production dans le périmètre autorisé.
3. **P2 : prochaine action/historique limités à 50 activités récentes** sur fiche entreprise.
   Séparer requête des actions ouvertes datées et pagination de l'historique.
4. **P2 : invariant prochaine action incomplet** : formulaire suivi protégé, mais changement
   d'étape par tableau, fiche/API peut laisser une entreprise active sans action. Clarifier
   règle globale ou alerte, puis appliquer cohérence au niveau approprié.
5. **P2 : Support « sans réponse »** fondé sur `updatedAt`, pas la dernière réponse équipe ;
   manque une urgence/priorité réelle. Formulaire de ticket proposé à un admin puis POST403 :
   diriger explicitement vers l'administration.
6. **P2 :** contexte service du formulaire, réalisations pertinentes, indicateurs honnêtes
   avec période/dénominateur, état sauvegarde et dernière restauration réellement testée.
7. **P3 :** tests de frontières (>30 demandes, >50 activités), bypass tableau/API,
   contextualisation, indicateurs et vrais parcours Support.

## Preuves et limites

Rapport joint : chemins et lignes de sources, routes, empreintes, explication des cas.
Audit indépendant : **13/13 tests unitaires CRM et 172/172 contrôles navigateur** sur fixtures,
réseau interne et base jetable, sans données client et sans mail externe. Banc supprimé.
Captures et résultats conservés sur le ThinkPad sous `audit-six-points/preuves/` ; Library
du propriétaire : `libfile_d25de425d008819185719bf61525bf62`.
Ces tests ne prouvent pas les parcours authentifiés de production ; ceux-ci n'ont pas été
exercés. Les défauts de limites/pagination ont été déduits du code, pas reproduits dans les
172 tests existants. Distinguer code présent, preuve de test et disponibilité en production.

## Cadre de reprise et retour demandé

Traiter lacunes/incohérences selon le périmètre validé par l'utilisateur, en conservant
Simafri opérationnel, INA, DNS, droits, secrets et intégrité des données. Garder l'humain aux
commandes des échanges et Dolibarr comme ERP ; ne pas inventer une intégration Dolibarr.
Séparer tests synthétiques et production ; aucune campagne ou envoi réel pour corriger ces
points sans autorisation explicite. Proposer la séquence de recette avant déploiement, avec
sauvegarde et retour arrière, et signaler les modifications durables nécessaires.

Fournir un rapport de retour : modifications exactes/fichiers, tests réellement exécutés et
preuves, version déployée ou non, limitations et reste à faire. Ce retour permettra une
recette indépendante ultérieure. Ne pas traiter ce fichier comme une autorisation supplémentaire.
