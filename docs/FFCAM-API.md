# Documentation de l'API FFCAM (non officielle)

> **AVERTISSEMENT** : Cette documentation a été créée par reverse-engineering de l'extranet FFCAM.
> L'API n'est pas officielle et peut changer sans préavis.

## Endpoint principal

```
https://extranet-clubalpin.com/app/ActivitesFormations/jx_jqGrid.php
```

## Authentification

L'API utilise une authentification par session. Le `SESSION_ID` doit être passé en paramètre `sid` de chaque requête.

### Obtention du SESSION_ID

1. Se connecter à l'extranet FFCAM via le navigateur
2. Copier le paramètre `sid` depuis l'URL
3. Le session ID expire après quelques heures d'inactivité

**Exemple d'URL après connexion :**
```
https://extranet-clubalpin.com/app/Effectifs/accueil.php?sid=ABC123XYZ
```

## Paramètres communs

| Paramètre | Type | Description |
|-----------|------|-------------|
| `sid` | string | Session ID (obligatoire) |
| `def` | string | Type de données à récupérer |
| `mode` | string | Toujours `liste` |
| `page` | int | Numéro de page (1-based) |
| `rows` | int | Nombre de lignes par page (max 150) |
| `sidx` | string | Colonne de tri |
| `sord` | string | Ordre de tri (`asc` ou `desc`) |
| `_search` | string | `true` ou `false` |

## Types de données (`def`)

### 1. Formations (`adh_formations`)

Récupère les formations validées des adhérents.

```
GET /jx_jqGrid.php?sid=XXX&def=adh_formations&mode=liste&page=1&rows=150
```

**Structure de réponse :**

```json
{
  "page": 1,
  "total": 25,
  "records": 3679,
  "rows": [
    {
      "id": "12345",
      "cell": {
        "col_0": "69002123456",     // cafnum adhérent
        "col_1": "DUPONT Jean",      // nom complet
        "col_2": "STG-UFALA2",       // code formation
        "col_3": "UF vers l'autonomie...", // intitulé
        "col_4": "2024-01-15",       // date validation
        "col_5": "2024-001",         // numéro formation
        "col_6": "Martin Pierre",    // formateur
        "col_7": "Lyon",             // lieu
        "col_8": "2024-01-10",       // date début
        "col_9": "2024-01-15",       // date fin
        "col_10": "12345"            // id interne
      }
    }
  ]
}
```

**Colonnes :**

| Index | Champ | Description |
|-------|-------|-------------|
| col_0 | cafnum | Numéro d'adhérent FFCAM |
| col_1 | nom | Nom complet de l'adhérent |
| col_2 | code_formation | Code unique de la formation |
| col_3 | intitule | Intitulé complet de la formation |
| col_4 | date_validation | Date de validation (YYYY-MM-DD ou DD/MM/YYYY) |
| col_5 | numero_formation | Numéro de la session de formation |
| col_6 | formateur | Nom du formateur |
| col_7 | lieu | Lieu de la formation |
| col_8 | date_debut | Date de début |
| col_9 | date_fin | Date de fin |
| col_10 | id_interne | ID interne FFCAM |

---

### 2. Brevets (`adh_brevets`)

Récupère les brevets/diplômes des adhérents.

```
GET /jx_jqGrid.php?sid=XXX&def=adh_brevets&mode=liste&page=1&rows=150
```

**Structure de réponse :**

```json
{
  "page": 1,
  "total": 10,
  "records": 1362,
  "rows": [
    {
      "id": "67890",
      "cell": {
        "col_0": "69002123456",     // cafnum
        "col_1": "DUPONT Jean",      // nom
        "col_2": "BF1-ES-SAE",       // code brevet
        "col_3": "Initiateur Escalade SAE", // intitulé
        "col_4": "2023-06-15",       // date obtention
        "col_5": "2026-06-15",       // date recyclage
        "col_6": "2023-06-20",       // date édition
        "col_7": "2024-01-10",       // date formation continue
        "col_8": ""                  // date migration
      }
    }
  ]
}
```

**Colonnes :**

| Index | Champ | Description |
|-------|-------|-------------|
| col_0 | cafnum | Numéro d'adhérent FFCAM |
| col_1 | nom | Nom complet de l'adhérent |
| col_2 | code_brevet | Code unique du brevet |
| col_3 | intitule | Intitulé du brevet |
| col_4 | date_obtention | Date d'obtention initiale |
| col_5 | date_recyclage | Date limite de recyclage |
| col_6 | date_edition | Date d'édition du diplôme |
| col_7 | date_formation_continue | Date dernière formation continue |
| col_8 | date_migration | Date de migration (si applicable) |

---

### 3. Niveaux de pratique (`adh_niveaux_pratique`)

Récupère les niveaux de pratique validés.

```
GET /jx_jqGrid.php?sid=XXX&def=adh_niveaux_pratique&mode=liste&page=1&rows=150
```

**Structure de réponse :**

```json
{
  "page": 1,
  "total": 8,
  "records": 1055,
  "userData": {
    "caliData": {
      "123": {
        "cursus_niveau_id": "123",
        "code_activite": "ES",
        "activite": "ESCALADE",
        "niveau": "INITIE",
        "libelle": "Initié escalade SAE",
        "niveau_court": "N1",
        "discipline": null,
        "_BASE_validation_qui": "Martin Pierre"
      }
    }
  },
  "rows": [
    {
      "id": "11111",
      "cell": {
        "col_0": "69002123456",
        "col_1": "DUPONT Jean",
        "col_2": "ES",               // code activité
        "col_3": "ESCALADE",         // activité
        "col_4": "INITIE",           // niveau
        "col_5": "Initié escalade...", // libellé
        "col_6": "2023-03-20",       // date validation
        "col_7": "Martin Pierre",    // validateur
        "col_8": "123"               // cursus_niveau_id
      }
    }
  ]
}
```

**Colonnes :**

| Index | Champ | Description |
|-------|-------|-------------|
| col_0 | cafnum | Numéro d'adhérent FFCAM |
| col_1 | nom | Nom complet de l'adhérent |
| col_2 | code_activite | Code de l'activité (ES, AL, SN...) |
| col_3 | activite | Nom de l'activité |
| col_4 | niveau | Niveau (INITIE, PERFECTIONNE, AUTONOME) |
| col_5 | libelle | Description du niveau |
| col_6 | date_validation | Date de validation |
| col_7 | validateur | Nom du validateur |
| col_8 | cursus_niveau_id | ID du niveau dans le référentiel |

**Métadonnées (`userData.caliData`) :**

Le champ `userData.caliData` contient le référentiel complet des niveaux avec leurs métadonnées (discipline, niveau_court, validateur, etc.).

---

### 4. Compétences (`adh_competences`)

Récupère les groupes de compétences validés.

```
GET /jx_jqGrid.php?sid=XXX&def=adh_competences&mode=liste&page=1&rows=150
```

**Structure de réponse :**

```json
{
  "rows": [
    {
      "id": "22222",
      "cell": {
        "col_0": "69002123456",
        "col_1": "DUPONT Jean",
        "col_2": "Technique d'assurage", // intitulé compétence
        "col_3": "ES",                    // code activité
        "col_4": "ESCALADE",              // activité
        "col_5": "Niveau 2",              // niveau associé
        "col_6": "2023-05-10",            // date validation
        "col_7": "1",                     // est_valide (booléen)
        "col_8": "Martin Pierre",         // validé par
        "col_9": ""                       // commentaire
      }
    }
  ]
}
```

---

## Codes d'activités

| Code | Activité |
|------|----------|
| AL | ALPINISME |
| CA | DESCENTE DE CANYON |
| ES | ESCALADE |
| RA | RANDONNEE |
| SN | SPORTS DE NEIGE |
| VM | VELO DE MONTAGNE |

## Disciplines Sports de Neige

| Discipline | Description |
|------------|-------------|
| Randonnée | Ski de randonnée |
| Piste | Ski alpin |
| Fond | Ski de fond |
| Raquettes | Raquette à neige |
| Snowboard | Snowboard |
| Nordique | Ski nordique / marche nordique |

## Gestion des erreurs

### Session expirée

Si la session est expirée, l'API retourne une page HTML au lieu de JSON.
Détection : vérifier si la réponse commence par `<!DOCTYPE` ou `<html`.

### Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succès |
| 302 | Redirection (session expirée) |
| 500 | Erreur serveur |

## Limites et bonnes pratiques

1. **Rate limiting** : Respecter un délai de 300ms minimum entre les requêtes
2. **Pagination** : Maximum 150 lignes par page
3. **Session** : La session expire après ~2-4h d'inactivité
4. **Filtrage** : Filtrer les adhérents par préfixe cafnum pour ne garder que son club

## Exemple de requête complète

```bash
curl "https://extranet-clubalpin.com/app/ActivitesFormations/jx_jqGrid.php?\
sid=ABC123XYZ&\
def=adh_formations&\
mode=liste&\
page=1&\
rows=150&\
sidx=jqGrid_adh_formations_NOMCOMPLET&\
sord=asc&\
_search=false"
```

---

## Changelog de l'API (observé)

| Date | Changement observé |
|------|-------------------|
| 2025-10 | Première documentation |
| - | Aucun changement majeur observé depuis |

---

*Dernière mise à jour : Décembre 2025*
