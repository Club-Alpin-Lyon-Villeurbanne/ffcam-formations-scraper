# Mapping Brevets → Commissions

Ce document décrit le système de mapping automatique entre les brevets FFCAM et les commissions du club.

## Vue d'ensemble

Lors de la synchronisation, les brevets sont automatiquement associés aux commissions du club en fonction de patterns de code. Cette logique a été inspirée de la [PR #1471](https://github.com/Club-Alpin-Lyon-Villeurbanne/plateforme-club-alpin/pull/1471) du projet plateforme-club-alpin.

## Architecture

### Tables de base de données

#### `formation_brevet_pattern_commission_mapping`

Table de configuration qui définit les patterns de code brevet et leur association aux commissions.

**Colonnes :**
- `code_pattern` : Pattern SQL LIKE pour matcher les codes de brevet (ex: `BF%-ESC%`)
- `exclude_pattern` : Pattern d'exclusion optionnel (ex: `BFM-%`)
- `commission_id` : ID de la commission CAF cible
- `priorite` : Priorité du mapping (20 = très spécifique, 10 = standard)
- `actif` : Permet de désactiver un mapping sans le supprimer

#### `formation_brevet_commission`

Table de liaison Many-to-Many entre `formation_brevet_referentiel` et `caf_commission`.

### Logique de matching

Le système utilise des patterns SQL `LIKE` pour associer les codes de brevets aux commissions :

1. Recherche tous les patterns actifs qui matchent le code brevet
2. Applique les patterns d'exclusion si définis
3. Trie par priorité décroissante
4. Associe le brevet à toutes les commissions correspondantes

**Exemple :**

```sql
-- Code brevet : "BF1-ESC"

-- Matche le pattern "BF%-ESC%" avec exclude "BFM-%" → Commission Escalade (priorité 20)
-- Matche aussi le pattern "BF%-ESC%" sans exclusion → Commission Escalade (priorité 10)
-- Résultat : Commission Escalade (prend la priorité la plus haute)
```

## Patterns définis

### Escalade
- `BF%-ESC%` (excluant `BFM-%`) → Escalade

### Alpinisme
- `BF%-ALP%` (excluant `BFM-%`) → Alpinisme
- `BF%-CASCADE%` → Alpinisme (cascade de glace)

### Randonnée
- `BF%-RAND%` (excluant `BFM-%`) → Randonnée

### Canyon
- `BF%-CANYON%` (excluant `BFM-%`) → Canyon

### Ski de randonnée
- `BF%-SKI%` (excluant `BFM-%`) → Ski de randonnée
- `BF%-NIVO%` → Ski de randonnée (nivologie)
- `BRV-NIVO%` → Ski de randonnée

### VTT
- `BF%-VTT%` (excluant `BFM-%`) → VTT

### Trail
- `BF%-TRAIL%` (excluant `BFM-%`) → Trail

### Via Ferrata
- `BF%-VIA%` (excluant `BFM-%`) → Via Ferrata

### Autres activités
- Ski de piste : `BF%-PISTE%`
- Ski de fond : `BF%-FOND%`
- Raquette : `BF%-RAQUETTE%` ou `BF%-RAQ%`
- Snowboard : `BF%-SNOW%`
- Marche nordique : `BF%-NORDIC%` ou `BF%-MARCHE%`

## Brevets transversaux

Les brevets transversaux (non spécifiques à une activité) ne sont **PAS** mappés à une commission :

- `PSC1`, `PSE1`, `PSE2` (premiers secours)
- `BRV-JEUNE` (jeunes)
- `BRV-SECU` (sécurité)
- etc.

## Utilisation

### Initialisation (SQLite uniquement)

Pour le développement local avec SQLite, il faut initialiser les patterns :

```bash
npm run init:brevet-patterns
```

Cela créera des associations avec des IDs de commission fictifs pour les tests.

### Tests

Pour vérifier que le mapping fonctionne correctement :

```bash
npm run test:brevet-mapping
```

Ce script teste une vingtaine de codes de brevets et vérifie qu'ils sont bien associés aux bonnes commissions.

### En production (MySQL)

Les patterns sont automatiquement créés lors de l'exécution des migrations SQL :

1. `migrations/003_add_brevet_pattern_mapping.sql` - Crée la table
2. `migrations/004_populate_brevet_pattern_mapping.sql` - Peuple les patterns

Les vraies commissions (depuis `caf_commission`) sont utilisées automatiquement via des sous-requêtes :

```sql
INSERT INTO formation_brevet_pattern_commission_mapping
(code_pattern, exclude_pattern, commission_id, priorite, actif)
VALUES
('BF%-ESC%', 'BFM-%',
  (SELECT id_commission FROM caf_commission WHERE slug = 'escalade' LIMIT 1),
  20, 1);
```

## Code source

### Service de mapping

Le service `CommissionMapper` (`src/services/commission-mapper.ts`) gère l'association automatique :

```typescript
async linkBrevetToCommissions(
  brevetId: number,
  codeBrevet: string
): Promise<number>
```

Cette méthode est automatiquement appelée lors de l'import des brevets dans `BrevetsImporter`.

### Import des brevets

Dans `src/importers/brevets-importer.ts`, ligne 78-82 :

```typescript
// 2b. Mapper vers les commissions CAF
await this.commissionMapper.linkBrevetToCommissions(
  brevetId,
  brevet.codeBrevet
);
```

## Modification des patterns

Pour ajouter ou modifier un pattern :

1. **SQLite (dev)** : Modifier `src/scripts/init-brevet-patterns.ts`
2. **MySQL (prod)** : Modifier `migrations/004_populate_brevet_pattern_mapping.sql`
3. Relancer les tests : `npm run test:brevet-mapping`

## Avantages de cette approche

✅ **Flexible** : Les patterns peuvent être modifiés sans toucher au code
✅ **Priorité** : Gestion fine des cas d'exclusion et de priorité
✅ **Traçable** : Toutes les associations sont stockées en base
✅ **Testable** : Tests automatisés pour vérifier les associations
✅ **Aligné** : Utilise la même logique que la plateforme-club-alpin

## Migration depuis l'ancienne approche

L'ancienne méthode `extractActiviteFromBrevetCode()` a été supprimée. Elle utilisait du code en dur pour extraire l'activité depuis le code brevet. La nouvelle approche utilise des patterns configurables en base de données, ce qui est plus maintenable.
