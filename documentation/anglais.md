# Version anglaise du site public

Pour les partenaires anglophones. Pages sous `/en`, slugs anglais :

| Français | Anglais |
|---|---|
| / | /en |
| /services | /en/services |
| /reseaux-cloud | /en/networks-cloud |
| /solutions-metier | /en/business-solutions |
| /developpement-api | /en/development-api |
| /maintenance-support | /en/maintenance-support |
| /realisations | /en/projects |
| /a-propos | /en/about |
| /contact | /en/contact |
| /mentions-legales | /en/legal-notice |
| /politique-de-confidentialite | /en/privacy-policy |

## Fonctionnement

- `src/app/(site-en)` : layout racine propre (`<html lang="en">`), mêmes composants que le français avec `locale="en"`.
- `src/lib/locale.ts` : correspondance des chemins, lien de bascule FR/EN de l'en-tête (rechargement complet).
- `src/content/en.json` : dictionnaire **texte français → anglais** (anglais britannique). `src/lib/i18n.ts` traduit à l'affichage les textes CMS, les projets, études de cas et gammes. Espaces insécables et apostrophes droites/courbes sont ignorés à la comparaison.
- Un texte modifié ou ajouté dans le CMS sans entrée dans le dictionnaire s'affiche **en français** sur la page anglaise (jamais une traduction périmée). Pour le traduire : ajouter la ligne dans `en.json`, reconstruire l'image.
- Pages légales anglaises écrites dans le code, avec mention « la version française prévaut ».
- Métadonnées : descriptions anglaises, canonical, `hreflang` fr/en/x-default sur toutes les pages publiques ; sitemap bilingue.
- Formulaire de contact anglais : l'API (inchangée) répond en français ; le message affiché est choisi selon le code HTTP. Succès = « Your request has been recorded. » (enregistrée, pas « envoyée »).
- Non traduits : espace client Support, CRM, administration (liens libellés « in French »).

## Tests

- Unitaires : `tests/i18n.test.ts` (couverture de tous les textes livrés, espaces, chemins réversibles).
- Navigateur, banc jetable : `tests/i18n-run.sh <image> <suffixe> [script]` (PostgreSQL *_test, réseau interne). `i18n-e2e.py` contrôle les 11 pages EN à 1440 et 390 px ; `i18n-fr-text.py` sauvegarde le texte des pages FR pour comparer deux images.

## Mise en ligne (à lancer par le propriétaire)

Aucune migration. Préproduction :
`sudo docker tag 5sursync:local 5sursync:pre-i18n-preprod && sudo docker tag 5sursync:i18n-preprod-20261009 5sursync:local && sudo docker compose up -d --no-deps app`

Production (après vérification de la préproduction et succès du build `5sursync:i18n-20261009`) :
La ligne doit être exactement `    image: 5sursync:i18n-20261009` (préfixe `5sursync:` obligatoire : sans lui, Compose ne trouve pas l'image et en construit une depuis l'arbre courant, messagerie comprise). Toujours `--no-build` :
`sudo docker compose -f compose.yaml -f compose.production.yaml up -d --no-deps --no-build app-production`.

Retour arrière : préproduction `sudo docker tag 5sursync:pre-i18n-preprod 5sursync:local && sudo docker compose up -d --no-deps app` ; production : remettre `5sursync:about-founder-20261009` dans compose.production.yaml et relancer la même commande.
