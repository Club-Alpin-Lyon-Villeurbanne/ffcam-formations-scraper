# Migrations Base de Données - Mapping Commissions

Ce dossier contient les migrations SQL pour le mapping automatique entre les activités FFCAM et les commissions du CAF Lyon.

## Vue d'ensemble

Le système permet de lier automatiquement:
- **Niveaux de pratique** → Commissions CAF
- **Compétences** → Commissions CAF
- **Brevets** → Commissions CAF

Basé sur l'activité FFCAM, le code activité et la discipline.

## Fichiers de migration

### 001_add_commission_mapping.sql

Crée les tables nécessaires:

1. **`formation_activite_commission_mapping`**
   - Table de configuration du mapping
   - Définit les règles: activité FFCAM → commission CAF
   - Supporte plusieurs commissions par activité (ex: "SPORTS DE NEIGE" → ski-rando, raquette, ski-piste)

2. **Tables de liaison Many-to-Many:**
   - `formation_niveau_commission`
   - `formation_competence_commission`
   - `formation_brevet_commission`

### 002_populate_commission_mapping.sql

Remplit la table de mapping avec les règles initiales:

- **Mappings directs:** ESCALADE → escalade, ALPINISME → alpinisme, etc.
- **Mappings avec discipline:** SPORTS DE NEIGE + Randonnée → ski-de-randonnee
- **Fallbacks:** SPORTS DE NEIGE (sans précision) → ski-de-randonnee par défaut
- **Priorités:** Gère l'ambiguïté via un système de priorité (0-10)

## Application des migrations

### Sur MySQL (Production)

```bash
# Se connecter à MySQL
mysql -u user -p database_name

# Appliquer les migrations dans l'ordre
source migrations/001_add_commission_mapping.sql
source migrations/002_populate_commission_mapping.sql
```

Ou via phpMyAdmin:
1. Importer `001_add_commission_mapping.sql`
2. Importer `002_populate_commission_mapping.sql`

### Sur SQLite (Développement)

Les tables sont automatiquement créées au démarrage de l'application.

**⚠️ Important:** La table de mapping sera vide initialement. Pour la populer:

```bash
# Conversion manuelle SQLite du fichier 002
# Remplacer les sous-requêtes par les IDs directs des commissions
sqlite3 data/local.db < migrations/002_populate_commission_mapping_sqlite.sql
```

*Note: Un fichier `002_populate_commission_mapping_sqlite.sql` devra être créé avec les IDs en dur.*

## Fonctionnement du mapping

### Logique de correspondance

Le `CommissionMapper` recherche dans cet ordre:

1. **Match exact:** `activite_ffcam` + `code_activite` + `discipline`
2. **Match partiel:** `activite_ffcam` + `code_activite`
3. **Match discipline:** `activite_ffcam` + `discipline`
4. **Fallback:** `activite_ffcam` seul

### Système de priorité

- **10:** Mapping précis et sans ambiguïté
- **8:** Mapping avec discipline mais sans code
- **5:** Mapping avec code mais générique
- **3:** Fallback générique

### Exemples

```sql
-- ESCALADE → toujours commission "escalade"
activite_ffcam='ESCALADE' → commission_id=17 (priorite=10)

-- SPORTS DE NEIGE + SKI + Randonnée → ski-de-randonnee
activite_ffcam='SPORTS DE NEIGE', code='SKI', discipline='Randonnée'
  → commission_id=20 (priorite=10)

-- SPORTS DE NEIGE (sans précision) → ski-de-randonnee par défaut
activite_ffcam='SPORTS DE NEIGE', code=NULL, discipline=NULL
  → commission_id=20 (priorite=3)
```

## Modification du mapping

Pour ajouter ou modifier des règles:

```sql
-- Exemple: ajouter un mapping pour une nouvelle activité
INSERT INTO formation_activite_commission_mapping
(activite_ffcam, code_activite, discipline, commission_id, priorite, actif)
VALUES
('NOUVELLE ACTIVITE', NULL, NULL,
 (SELECT id_commission FROM caf_commission WHERE slug = 'commission-slug'),
 10, 1);
```

Pour désactiver un mapping sans le supprimer:

```sql
UPDATE formation_activite_commission_mapping
SET actif = 0
WHERE activite_ffcam = 'ACTIVITE' AND ...;
```

## Vérification du mapping

### Voir tous les mappings actifs

```sql
SELECT
  m.activite_ffcam,
  m.code_activite,
  m.discipline,
  c.name AS commission,
  m.priorite
FROM formation_activite_commission_mapping m
JOIN caf_commission c ON m.commission_id = c.id_commission
WHERE m.actif = 1
ORDER BY m.activite_ffcam, m.priorite DESC;
```

### Voir les niveaux liés à une commission

```sql
SELECT
  nr.activite,
  nr.niveau,
  nr.discipline,
  c.name AS commission
FROM formation_niveau_referentiel nr
JOIN formation_niveau_commission nc ON nr.id = nc.niveau_id
JOIN caf_commission c ON nc.commission_id = c.id_commission
WHERE c.slug = 'escalade';
```

### Trouver les activités non mappées

```sql
-- Après avoir exécuté un sync
SELECT DISTINCT activite, code_activite
FROM formation_niveau_referentiel
WHERE id NOT IN (
  SELECT niveau_id FROM formation_niveau_commission
);
```

## Logs et debugging

Lors du sync, le `CommissionMapper` affiche:

```
⚠️  Activité non mappée: "NOUVELLE_ACTIVITE" (code: N/A, discipline: N/A)
```

Ces warnings indiquent les activités FFCAM qui n'ont pas de correspondance dans la table de mapping.

## Maintenance

### Ajout d'une nouvelle commission CAF

1. Créer la commission dans `caf_commission`
2. Ajouter les règles de mapping correspondantes
3. Re-synchroniser les données pour créer les liaisons

### Modification d'une activité FFCAM

Si la FFCAM change le nom d'une activité:

```sql
UPDATE formation_activite_commission_mapping
SET activite_ffcam = 'NOUVEAU_NOM'
WHERE activite_ffcam = 'ANCIEN_NOM';
```

Puis re-synchroniser.

## Support

Pour toute question sur le mapping des commissions:
- Consulter `src/services/commission-mapper.ts`
- Vérifier les logs lors du sync
- Contacter l'équipe technique du CAF Lyon
