# Les fichiers de configuration

Ce dossier contient les seuls fichiers qu'un club peut avoir à modifier. Ce sont des tableaux au format CSV : une ligne par entrée, des valeurs séparées par des virgules. Ils s'ouvrent avec un tableur ou un éditeur de texte.

```text
config/
├── groupes-competences-commissions.csv     commun à tous les clubs
└── clubs/
    ├── lyon/correspondance-commissions.csv
    ├── chambery/correspondance-commissions.csv
    └── clermont/correspondance-commissions.csv
```

Le premier dit dans quelle commission va chaque groupe de compétences. Les suivants traduisent les codes de commission pour chaque club. Pour comprendre comment ils s'enchaînent, voir [le rangement par commission](../docs/comment-ca-marche.md#le-rangement-par-commission).

## `groupes-competences-commissions.csv`

Le tableau commun qui range les groupes de compétences, avec les codes de commission de Lyon.

```csv
commission,niveau,groupe_competences
alpinisme,INI,1.1 Mon niveau de pratique en alpinisme 1
alpinisme,PER,1.2 Mon expérience en alpinisme 2
ski-de-randonnee,INI,"2.1 Progression à ski, en montée 1"
```

| Colonne | Contenu |
|---|---|
| `commission` | Le code de commission, dans les codes de Lyon |
| `niveau` | Le niveau du groupe : `INI`, `PER` ou `SPE`. Il est indicatif : le programme ne s'en sert pas pour ranger |
| `groupe_competences` | L'intitulé exact du groupe, tel qu'affiché sur l'extranet |

Les règles à connaître :

- **L'intitulé doit être recopié à l'identique**, majuscules et accents compris. Seuls les espaces en trop sont tolérés.
- **Un groupe qui concerne plusieurs commissions** prend une ligne par commission.
- **Un intitulé qui contient une virgule** se met entre guillemets, comme `"2.1 Progression à ski, en montée 1"`.
- **Un intitulé renommé par la FFCAM** : on ajoute le nouveau, avec les mêmes commissions que l'ancien, sans retirer l'ancien (voir [Suivre et dépanner](../docs/suivre-et-depanner.md#cas-1--un-groupe-de-compétences-renommé-par-la-ffcam)).

## `clubs/<club>/correspondance-commissions.csv`

Le fichier propre à chaque club, qui traduit les codes de commission de Lyon vers ceux du club. Il est obligatoire, même s'il ne contient que sa première ligne.

```csv
code,code_club
escalade,escalade-adulte
randonnee,randonnee-montagne
randonnee,randonnee-alpine
speleologie,
```

| Ligne | Effet |
|---|---|
| Aucune ligne pour un code | Le code est gardé tel quel |
| `escalade,escalade-adulte` | `escalade` est traduit en `escalade-adulte` |
| Deux lignes pour `randonnee` | `randonnee` alimente les deux commissions |
| `speleologie,` (cible vide) | `speleologie` est ignoré |

Comment le remplir pour un nouveau club, avec la liste des 19 codes à placer : voir [Ajouter un club](../docs/ajouter-un-club.md#2-écrire-la-correspondance-des-commissions). Les choix de chaque club, et leurs raisons, sont notés dans l'[ADR 0002](../docs/adr/0002-rattachement-aux-commissions-et-exploitation.md).

## Après une modification

- Séparez toujours par des **virgules**, jamais par des points-virgules (certains tableurs le font par défaut), et enregistrez en UTF-8.
- Lancez `npm run check` : il signale une ligne mal formée dans une correspondance, un code inconnu ou une commission absente de la base.
- La modification passe par une PR, comme pour le code.
