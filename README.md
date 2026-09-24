# FFCAM Formations & Adhérents Scraper

[![CI](https://github.com/Club-Alpin-Lyon-Villeurbanne/ffcam-formations-scraper/actions/workflows/ci.yml/badge.svg)](https://github.com/Club-Alpin-Lyon-Villeurbanne/ffcam-formations-scraper/actions/workflows/ci.yml)

Importe chaque semaine, depuis l'extranet de la FFCAM, les **formations**, **brevets**, **niveaux de pratique** et **groupes de compétences** validés des adhérents d'un club, dans la base MySQL de sa plateforme (plateforme-club-alpin), avec leur rattachement aux commissions du club. Utilisable par plusieurs clubs.

## Prérequis

- Node.js (v22+)
- pnpm (v10.13.1)
- TypeScript (installé automatiquement)
- Accès à l'extranet FFCAM avec un compte valide
- Base de données MySQL de la plateforme (`caf_commission`, `caf_user`) pour un import club ; SQLite n'est utilisé que pour développer le scraper en local

## Installation

```bash
# Cloner le repository
git clone https://github.com/Club-Alpin-Lyon-Villeurbanne/ffcam-formations-scraper.git
cd ffcam-formations-scraper

# Installer les dépendances
pnpm install
```

## Onboarding d'un nouveau club

Rien à modifier dans le code : un `.env` et un dossier `config/clubs/<club>/`.

1. **`.env`** (depuis `.env.example`) : `FFCAM_EMAIL` / `FFCAM_PASSWORD` (compte du portail FFCAM avec un profil extranet du club, ex. « CLUB - WEBMASTER » ; `FFCAM_PROFILE` si le compte en a plusieurs — accepte un bout du libellé ou l'identifiant du profil affiché dans le message d'erreur), `MYSQL_ADDON_*` de votre plateforme, `CLUB=chambery` (nom du dossier `config/clubs/`), `CLUB_CODE` (4 premiers chiffres de vos numéros d'adhérent).
2. **`npm run check`** : chaque ❌ dit quoi corriger. Il vérifie notamment que le profil extranet du compte et la base MySQL correspondent bien au même club (`CLUB_CODE`). Au premier lancement il signale aussi le fichier GC manquant et, éventuellement, des commissions absentes de `caf_commission`.
3. **Commissions** : le code utilise les slugs `escalade`, `alpinisme`, `ski-de-randonnee`, `snowboard-rando`, … Créez dans la plateforme celles qui vous manquent avec ce `code_commission` (ou dites-le nous si vos slugs diffèrent : on ajoutera une table de correspondance).
4. **Groupes de compétences** : copiez `config/clubs/lyon/groupes-competences-commissions.csv` dans `config/clubs/chambery/` et adaptez la colonne `commission` (un GC peut être sur plusieurs lignes). Versionnez ce fichier.
5. **`npm run check`** jusqu'à « Configuration prête », puis **`npm run import:dry`** : les alertes en fin de rapport listent les GC absents de votre CSV et les mappings à faible certitude (les commissions absentes de `caf_commission`, elles, sont détectées par `npm run check`, pas par le dry-run qui ne consulte jamais la base).
6. **`npm run import`**. Pour automatiser, voir « Import automatique ».

## Import automatique (GitHub Actions)

[`import.yml`](.github/workflows/import.yml) lance `check` puis `import` **tous les lundis à 03:17 UTC** pour chaque environment de la matrice (`lyon-staging`, `lyon-prod`), un seul à la fois (~1 h 30 au total). L'ordre entre les environments n'est pas garanti.

Lancement manuel : onglet Actions → Import FFCAM → Run workflow. ⚠️ Il enchaîne **tous** les environments, **production comprise** : cochez « Import à blanc » pour vérifier sans rien écrire.

**Ajouter un club ou une base** : un mainteneur crée l'environment GitHub (ex. `chambery`, ou `lyon-staging` pour une base de test), le club y saisit ses secrets (`FFCAM_EMAIL`, `FFCAM_PASSWORD`, `MYSQL_ADDON_*`) et les variables `CLUB`, `CLUB_CODE` (et `FFCAM_PROFILE` si besoin) dans Settings → Environments, et on ajoute le nom de l'environment dans `matrix.environment`.

**En cas d'échec** : GitHub envoie un e-mail. Le step « Vérification de la configuration puis import » du run dit quoi corriger : mot de passe FFCAM changé, profil retiré, commission manquante, base injoignable, ou `⚠️ IMPORT INCOMPLET` (pages manquantes, erreurs d'écriture). Les rapports JSON sont conservés 90 jours en artifacts. Le job `keepalive` contourne la désactivation automatique des crons après 60 jours sans commit.

## Configuration

### 1. Variables d'environnement

Copiez le fichier `.env.example` en `.env` et configurez-le :

```bash
cp .env.example .env
```

Le fichier `.env` chargé dépend de `NODE_ENV` :

| `NODE_ENV`   | Fichier chargé      |
|--------------|---------------------|
| _(non défini)_ | `.env`            |
| `staging`    | `.env.staging`      |
| `production` | `.env.production`   |

Exemple de contenu :

```env
# OBLIGATOIRE : Identifiants du portail FFCAM
FFCAM_EMAIL=votre_email
FFCAM_PASSWORD=votre_mot_de_passe

# OBLIGATOIRE : Code du club (4 chiffres)
CLUB_CODE=6900

# OBLIGATOIRE : Identifiant du club, sélectionne config/clubs/<club>/
CLUB=lyon

# OBLIGATOIRE pour un import club (SQLite ne sert qu'au développement local du scraper)
MYSQL_ADDON_HOST=localhost
MYSQL_ADDON_PORT=3306
MYSQL_ADDON_USER=votre_user
MYSQL_ADDON_PASSWORD=votre_password
MYSQL_ADDON_DB=votre_database
```

### 2. Authentification FFCAM

Le scraper se connecte automatiquement au portail FFCAM (https://portail.ffcam.fr)
avec les identifiants `FFCAM_EMAIL` / `FFCAM_PASSWORD` d'un compte ayant un profil
extranet du club (typiquement « CLUB - WEBMASTER »). Si le compte a plusieurs
profils extranet, précisez celui à utiliser avec `FFCAM_PROFILE` (sous-chaîne
insensible à la casse, défaut : `WEBMASTER`). `FFCAM_PROFILE` accepte aussi un
bout du libellé ou l'identifiant du profil affiché dans le message d'erreur.

### 3. Mapping groupes de compétences → commissions

Le mapping des groupes de compétences (GC) vers les commissions est propre à
chaque club : il vit dans `config/clubs/<club>/groupes-competences-commissions.csv`
et le club actif est sélectionné par la variable `CLUB` (ex. `CLUB=lyon`).

## Utilisation

### Import (scraping → base de données)

```bash
# Vérifie la configuration avant le premier import
npm run check

# Import complet (base de .env)
npm run import

# Import en staging ou production
NODE_ENV=staging npm run import
NODE_ENV=production npm run import

# Mode test (dry-run sans importer)
npm run import:dry
npm run dev  # alias de import:dry

# Brevets en base sans commission rattachée (base MySQL)
npm run diagnostic:brevets -- --mysql
```

### Tests

```bash
# Lancer les tests
npm run test

# Tests en mode watch
npm run test:watch

# Tests avec couverture
npm run test:coverage
```

## Workflow détaillé

### Vue d'ensemble

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Extranet FFCAM │ ───► │    Scraper      │ ───► │   Base MySQL    │
│  (API JSON)     │      │  (Node.js/TS)   │      │ (plateforme)    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

### Étapes du sync

**1. Authentification**
- Le scraper se connecte automatiquement au portail FFCAM avec `FFCAM_EMAIL` / `FFCAM_PASSWORD` (SSO)
- Le `sid` extranet obtenu est passé en paramètre de chaque requête (`?sid=XXX`)

**2. Scraping des 4 types de données**

```
Pour chaque type (formations, brevets, niveaux, compétences) :
│
├── Requête page 1 → Parse JSON → Récupère total de pages
├── Requête page 2 → Parse JSON
├── ...
└── Requête page N → Parse JSON
```

Les données viennent de l'API jqGrid de l'extranet (150 lignes par page, 300 ms entre deux pages, 3 réessais par page en erreur) :
```
https://extranet-clubalpin.com/app/ActivitesFormations/jx_jqGrid.php?sid=...&def=adh_brevets&page=1
```
Les grilles brevets et formations sont nationales : seules les lignes dont le cafnum commence par `CLUB_CODE` sont gardées.

**3. Import en base de données**

Pour chaque élément scrapé (exemple des brevets) :

1. **Référentiel** : upsert dans `formation_referentiel_brevet` puis liaison aux commissions dans `formation_commission_brevet` — une seule fois par code distinct.
2. **Adhérent** : cafnum → `caf_user.id_user` (les adhérents du club sont chargés en mémoire en une requête). Un cafnum absent de `caf_user` est compté « ignoré ».
3. **Validation** : upsert dans `formation_validation_brevet`.

### Tables utilisées

| Type | Référentiel | Liaison adhérent | Liaison commission |
|------|-------------|------------------|-------------------|
| Formations | `formation_referentiel_formation` | `formation_validation_formation` | `formation_commission_formation` |
| Brevets | `formation_referentiel_brevet` | `formation_validation_brevet` | `formation_commission_brevet` |
| Niveaux | `formation_referentiel_niveau_pratique` | `formation_validation_niveau_pratique` | `formation_commission_niveau_pratique` |
| Compétences | `formation_referentiel_groupe_competence` | `formation_validation_groupe_competence` | `formation_commission_groupe_competence` |

Le suivi des synchronisations est dans `formation_last_sync`, mis à jour seulement pour un type importé sans page manquante ni erreur.

### Mapping des commissions

Brevets, formations et niveaux sont rattachés aux commissions par des **patterns dans le code** (référentiels nationaux, communs à tous les clubs). Les **groupes de compétences** le sont par le CSV du club (`config/clubs/<club>/`), car ce rattachement dépend de l'organisation de chaque club.

**A. Par pattern de code brevet** (regex)
```typescript
// Exemples de patterns (src/utils/commission-mapping.ts)
'BF1-ES-*'   → 'escalade'
'BF1-AL-*'   → 'alpinisme'
'BF1-SN-SR'  → 'ski-de-randonnee'
'BF1-CA-*'   → 'canyon'
```

**B. Par activité FFCAM**
```typescript
'ESCALADE'          → 'escalade'
'ALPINISME'         → 'alpinisme'
'SPORTS DE NEIGE'   → dépend de la discipline (Randonnée → 'ski-de-randonnee', etc.)
'VELO DE MONTAGNE'  → 'vtt'
```

Le mapping utilise le **slug** de la commission pour trouver l'ID dans `caf_commission`. Les liaisons ne sont jamais supprimées : corriger un rattachement dans le CSV ajoute la nouvelle liaison sans retirer l'ancienne.

### Idempotence

Le script peut être relancé sans créer de doublons grâce aux UPSERT (`ON DUPLICATE KEY UPDATE`). Il n'efface jamais rien : une validation disparue de l'extranet reste en base.

Sans variables `MYSQL_ADDON_*`, le scraper bascule sur une base SQLite locale (`data/local.db`), utile seulement pour développer le scraper : elle n'a ni `caf_user` ni `caf_commission`, et `npm run check` la refuse.

## Structure du projet

### Technologies utilisées

- **TypeScript** (strict), exécuté directement avec **tsx**
- **MySQL** (`mysql2`) : base de la plateforme
- **fetch** natif de Node.js, sans framework
- **vitest** pour les tests, **GitHub Actions** pour la CI et l'import planifié

### Arborescence

```
ffcam-formations-adherents-scraper/
├── src/
│   ├── import.ts           # 🌟 Script principal
│   ├── check.ts            # npm run check
│   ├── diagnostic-brevets.ts
│   ├── config.ts           # Configuration centrale
│   ├── types.ts            # Définitions TypeScript
│   ├── auth/               # Login SSO FFCAM → sid extranet
│   ├── database/           # Adaptateurs DB (MySQL, SQLite de dev)
│   ├── scrapers/           # Scrapers FFCAM API
│   ├── importers/          # Logique d'import en DB
│   ├── services/           # CommissionLinker (liaison référentiels → commissions)
│   └── utils/              # Logger, commission-mapping (patterns hardcodés)
├── config/
│   └── clubs/
│       └── lyon/
│           └── groupes-competences-commissions.csv  # Mapping GC → commissions, propre à Lyon
├── docs/                   # API FFCAM, décisions d'architecture (adr/)
├── .github/workflows/      # CI et import planifié
├── dist/                   # Code compilé (gitignored)
├── data/                   # Données (gitignored)
│   └── reports/            # Rapports d'import JSON
├── .env                    # Config locale (gitignored)
├── .env.staging            # Config staging (gitignored)
├── .env.production         # Config production (gitignored)
├── .env.example            # Template
└── tsconfig.json           # Config TypeScript
```

## Architecture simplifiée (KISS)

Le projet suit le principe KISS (Keep It Simple, Stupid) :
- **Un seul workflow** : `npm run import` fait tout (scraping → DB)
- **TypeScript simple** : Types stricts mais pas de sur-ingénierie
- **Pas de frameworks** : API natives (fetch)
- **Structure claire** : Un fichier = une responsabilité
- **Logs dans la console** : Feedback temps réel, pas de complexité

## Documentation technique

- **[docs/FFCAM-API.md](docs/FFCAM-API.md)** : Documentation reverse-engineered de l'API FFCAM Extranet
- **[docs/adr/](docs/adr/)** : décisions d'architecture (multi-club, import automatique)

## Notes importantes

- Le `sid` extranet est obtenu automatiquement (SSO) au début de chaque import ; s'il est rejeté en cours de route (inactivité), le scraper se reconnecte
- Ne lancez pas d'import local avec le compte FFCAM pendant un run GitHub : deux sessions du même compte se volent le `sid`
- `FFCAM_EMAIL` / `FFCAM_PASSWORD` ne sont jamais commités (stockés dans .env ou dans les secrets GitHub)
- Une page injoignable après 4 tentatives est signalée dans le rapport (« pages manquantes ») et l'import se termine en erreur (code 1) ; les données des autres pages sont conservées, relancer l'import
- Une erreur d'écriture en base (colonne renommée, droits…) fait aussi terminer l'import en erreur (code 1), avec le détail des premières erreurs ; une ligne FFCAM invalide (sans code) est seulement ignorée
- Les logs ne contiennent ni nom ni numéro d'adhérent (seulement l'id de ligne) : les logs GitHub Actions d'un dépôt public sont publics

## Dépannage

### Identifiants refusés / profil introuvable
Si vous obtenez l'erreur `❌ Identifiants FFCAM refusés`, vérifiez `FFCAM_EMAIL` / `FFCAM_PASSWORD` dans votre `.env`.

Si l'erreur mentionne un profil introuvable ou plusieurs profils correspondants, ajustez `FFCAM_PROFILE`. Pour diagnostiquer : `npm run check`

### Erreur de connexion MySQL
Vérifiez vos identifiants dans le fichier `.env` et assurez-vous que le serveur MySQL est accessible.

### Adhérents non trouvés (« Ignorés »)
Un cafnum absent de `caf_user` (ancien adhérent, adhésion non renouvelée) est ignoré. Si la proportion paraît anormale, vérifiez `CLUB_CODE` et que `caf_user.cafnum_user` est renseigné.

### « GC non trouvé dans le CSV »
La FFCAM renomme parfois des groupes de compétences. Cherchez d'abord en base un ancien intitulé proche, déjà présent dans le CSV, et ajoutez le nouvel intitulé avec les mêmes commissions.

### Erreur TypeScript
Si vous avez des erreurs TypeScript, vérifiez avec :
```bash
npm run type-check
```

## Licence

MIT - Voir [LICENSE](LICENSE) pour plus de détails