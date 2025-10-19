# FFCAM Formations & Adhérents Scraper

Extracteur de données TypeScript pour récupérer les formations et niveaux de pratique des adhérents depuis l'extranet de la Fédération des Clubs Alpin et de Montagne (FFCAM).

## Description

Ce scraper TypeScript permet d'extraire automatiquement :
- Les **formations validées** des adhérents (brevets, diplômes, certifications)
- Les **niveaux de pratique** validés dans différentes activités (escalade, ski, alpinisme, etc.)

Les données sont importées directement dans une base de données SQLite (local) ou MySQL (production).

## Prérequis

- Node.js (v14+)
- pnpm (v10.13.1)
- TypeScript (installé automatiquement)
- Accès à l'extranet FFCAM avec un compte valide
- Base de données MySQL (optionnel, SQLite utilisé par défaut)

## Installation

```bash
# Cloner le repository
git clone [url-du-repo]
cd ffcam-formations-adherents-scraper

# Installer les dépendances
pnpm install
```

## Configuration

### 1. Variables d'environnement

Copiez le fichier `.env.example` en `.env` et configurez-le :

```bash
cp .env.example .env
```

Puis éditez le fichier `.env` :

```env
# OBLIGATOIRE : Session FFCAM
FFCAM_SESSION_ID=votre_session_id_ici

# OPTIONNEL : MySQL (sinon SQLite par défaut)
MYSQL_ADDON_HOST=localhost
MYSQL_ADDON_PORT=3306
MYSQL_ADDON_USER=votre_user
MYSQL_ADDON_PASSWORD=votre_password
MYSQL_ADDON_DB=votre_database
```

### 2. Obtenir votre session ID

Pour obtenir votre session ID :
1. Connectez-vous à l'extranet FFCAM
2. Copiez le paramètre **`sid`** dans l'URL de votre navigateur
   - Exemple : `https://extranet-clubalpin.com/app/Effectifs/accueil.php?sid=VOTRE_SESSION_ID`
3. Collez-le dans votre fichier `.env` comme valeur de `FFCAM_SESSION_ID`

## Utilisation

### Synchronisation (scraping → base de données)

```bash
# Synchronisation complète
npm run sync

# Mode test (dry-run sans importer)
npm run sync:dry
npm run dev  # alias de sync:dry
```

**Le script `sync` effectue :**
1. Connexion à l'extranet FFCAM avec votre session ID
2. Scraping de toutes les données (formations, brevets, niveaux)
3. Import direct dans la base de données (SQLite ou MySQL)
4. Génération d'un rapport JSON dans `data/reports/`

**Détection automatique de la base de données :**
- Pas de MySQL configuré dans `.env` → **SQLite** (créé dans `data/local.db`)
- MySQL configuré → **MySQL**

## Structure du projet

### Technologies utilisées

- **TypeScript** : Typage statique pour une meilleure maintenabilité
- **SQLite** : Base de données locale par défaut (zero config)
- **MySQL** : Support optionnel pour la production
- **Native Fetch** : API HTTP native de Node.js
- **tsx** : Exécution directe du TypeScript

### Données exportées

#### Formations
- Code de formation (ex: STG-UFALA2)
- Intitulé complet
- Date de validation
- Numéro de formation
- Formateur
- Adhérent (nom et numéro FFCAM)

#### Niveaux de pratique
- Activité (escalade, alpinisme, ski...)
- Niveau (INITIE, PERFECTIONNE, AUTONOME)
- Libellé descriptif
- Date de validation
- Validateur

### Arborescence

```
ffcam-formations-adherents-scraper/
├── src/
│   ├── config.ts           # Configuration centrale
│   ├── types.ts            # Définitions TypeScript
│   ├── sync.ts             # 🌟 Script principal
│   ├── database/           # Adaptateurs DB (SQLite/MySQL)
│   ├── scrapers/           # Scrapers FFCAM API
│   ├── importers/          # Logique d'import en DB
│   └── utils/              # Logger
├── dist/                   # Code compilé (gitignored)
├── data/                   # Données (gitignored)
│   ├── local.db            # Base SQLite (auto-créée)
│   └── reports/            # Rapports d'import JSON
├── .env                    # Configuration (gitignored)
├── .env.example            # Template
└── tsconfig.json           # Config TypeScript
```

### Référentiels créés automatiquement

**Activités** (6 activités) :
- AL : ALPINISME
- CA : DESCENTE DE CANYON
- ES : ESCALADE
- RA : RANDONNEE
- SN : SPORTS DE NEIGE
- VM : VELO DE MONTAGNE

**Niveaux** (22 niveaux référencés) :
- INITIE (escalade SAE, SNE, ski de randonnée, randonnée montagne, canyonisme, raquettes)
- PERFECTIONNE (escalade SAE, SNE, randonnée montagne, ski de randonnée, alpinisme)
- SPECIALISE (randonnée alpine, alpinisme)

**Formations** (151 formations distinctes) comme :
- STG-PSC1 : Prévention et secours civiques de niveau I
- STG-UFALA2 : UF vers l'autonomie en TM et assurage en mouvement
- STG-FRD20 : INSTRUCTEUR Randonnée FFCAM
- FOR-CISL10 : Formation INITIATEUR 2ème degré Snowboard alpinisme

## Architecture simplifiée (KISS)

Le projet suit le principe KISS (Keep It Simple, Stupid) :
- **Un seul workflow** : `npm run sync` fait tout (scraping → DB)
- **TypeScript simple** : Types stricts mais pas de sur-ingénierie
- **SQLite par défaut** : Zero configuration pour développer
- **Détection automatique** : Choix intelligent de la base de données
- **Pas de frameworks** : Utilisation des API natives (fetch, better-sqlite3)
- **Structure claire** : Un fichier = une responsabilité
- **Logs dans la console** : Feedback temps réel, pas de complexité

## Notes importantes

- La session expire après un certain temps d'inactivité
- Les données sont extraites par pages de 150 enregistrements
- Un délai de 300ms est respecté entre chaque requête
- Le SESSION_ID n'est jamais commité (stocké dans .env)
- TypeScript compile automatiquement avec tsx

## Dépannage

### Session expirée
Si vous obtenez l'erreur `❌ SESSION_ID expiré ou invalide !`, votre session a expiré.

Pour la renouveler :
1. Reconnectez-vous à l'extranet FFCAM
2. Copiez le nouveau `sid` dans l'URL
3. Mettez à jour `FFCAM_SESSION_ID` dans votre `.env`

### Erreur de connexion MySQL
Vérifiez vos identifiants dans le fichier `.env` et assurez-vous que le serveur MySQL est accessible.

### Adhérents non trouvés
Si des adhérents ne sont pas trouvés lors de l'import MySQL, vérifiez que la table `caf_user` contient bien les correspondances cafnum → id_user.

### Erreur TypeScript
Si vous avez des erreurs TypeScript, vérifiez avec :
```bash
npm run type-check
```

## Licence

MIT - Voir [LICENSE](LICENSE) pour plus de détails