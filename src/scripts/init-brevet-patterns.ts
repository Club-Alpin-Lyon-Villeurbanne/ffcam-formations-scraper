/**
 * Script d'initialisation des patterns de brevets pour SQLite
 *
 * En SQLite, on ne peut pas utiliser de sous-requêtes SELECT pour récupérer les commission_id
 * car la table caf_commission n'existe pas localement.
 *
 * Ce script insère des mappings avec des commission_id fictifs (1-15) pour le développement.
 * En production MySQL, les vraies commissions seront utilisées via les migrations SQL.
 */

import { getInstance as getSQLiteAdapter } from '../database/sqlite-adapter';

interface BrevetPatternMapping {
  code_pattern: string;
  exclude_pattern: string | null;
  commission_id: number;
  priorite: number;
  description: string;
}

// Mapping commission slug → ID fictif pour SQLite (dev)
const COMMISSION_IDS: Record<string, number> = {
  'escalade': 1,
  'alpinisme': 2,
  'randonnee': 3,
  'canyon': 4,
  'ski-de-randonnee': 5,
  'vtt': 6,
  'trail': 7,
  'via-ferrata': 8,
  'ski-de-piste': 9,
  'ski-de-fond': 10,
  'raquette': 11,
  'snowboard-rando': 12,
  'snowboard-alpin': 13,
  'marche-nordique': 14,
  'formation': 15
};

const PATTERN_MAPPINGS: BrevetPatternMapping[] = [
  // ESCALADE
  { code_pattern: 'BF%-ESC%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['escalade'], priorite: 20, description: 'Brevets escalade (excluant BFM)' },
  { code_pattern: 'BF%-ESC%', exclude_pattern: null, commission_id: COMMISSION_IDS['escalade'], priorite: 10, description: 'Brevets escalade' },

  // ALPINISME
  { code_pattern: 'BF%-ALP%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['alpinisme'], priorite: 20, description: 'Brevets alpinisme (excluant BFM)' },
  { code_pattern: 'BF%-ALP%', exclude_pattern: null, commission_id: COMMISSION_IDS['alpinisme'], priorite: 10, description: 'Brevets alpinisme' },
  { code_pattern: 'BF-CASCADE%', exclude_pattern: null, commission_id: COMMISSION_IDS['alpinisme'], priorite: 10, description: 'Brevets cascade de glace' },
  { code_pattern: 'BF%-CASCADE%', exclude_pattern: null, commission_id: COMMISSION_IDS['alpinisme'], priorite: 10, description: 'Brevets cascade de glace' },

  // RANDONNEE
  { code_pattern: 'BF%-RAND%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['randonnee'], priorite: 20, description: 'Brevets randonnée (excluant BFM)' },
  { code_pattern: 'BF%-RAND%', exclude_pattern: null, commission_id: COMMISSION_IDS['randonnee'], priorite: 10, description: 'Brevets randonnée' },

  // CANYON
  { code_pattern: 'BF%-CANYON%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['canyon'], priorite: 20, description: 'Brevets canyon (excluant BFM)' },
  { code_pattern: 'BF%-CANYON%', exclude_pattern: null, commission_id: COMMISSION_IDS['canyon'], priorite: 10, description: 'Brevets canyon' },

  // SKI DE RANDONNEE
  { code_pattern: 'BF%-SKI%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['ski-de-randonnee'], priorite: 20, description: 'Brevets ski de randonnée (excluant BFM)' },
  { code_pattern: 'BF%-SKI%', exclude_pattern: null, commission_id: COMMISSION_IDS['ski-de-randonnee'], priorite: 10, description: 'Brevets ski de randonnée' },
  { code_pattern: 'BF%-NIVO%', exclude_pattern: null, commission_id: COMMISSION_IDS['ski-de-randonnee'], priorite: 10, description: 'Brevets nivologie' },
  { code_pattern: 'BRV-NIVO%', exclude_pattern: null, commission_id: COMMISSION_IDS['ski-de-randonnee'], priorite: 10, description: 'Brevets nivologie (BRV)' },

  // VTT
  { code_pattern: 'BF%-VTT%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['vtt'], priorite: 20, description: 'Brevets VTT (excluant BFM)' },
  { code_pattern: 'BF%-VTT%', exclude_pattern: null, commission_id: COMMISSION_IDS['vtt'], priorite: 10, description: 'Brevets VTT' },

  // TRAIL
  { code_pattern: 'BF%-TRAIL%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['trail'], priorite: 20, description: 'Brevets trail (excluant BFM)' },
  { code_pattern: 'BF%-TRAIL%', exclude_pattern: null, commission_id: COMMISSION_IDS['trail'], priorite: 10, description: 'Brevets trail' },

  // VIA FERRATA
  { code_pattern: 'BF%-VIA%', exclude_pattern: 'BFM-%', commission_id: COMMISSION_IDS['via-ferrata'], priorite: 20, description: 'Brevets via ferrata (excluant BFM)' },
  { code_pattern: 'BF%-VIA%', exclude_pattern: null, commission_id: COMMISSION_IDS['via-ferrata'], priorite: 10, description: 'Brevets via ferrata' },

  // SKI DE PISTE
  { code_pattern: 'BF%-PISTE%', exclude_pattern: null, commission_id: COMMISSION_IDS['ski-de-piste'], priorite: 10, description: 'Brevets ski de piste' },

  // SKI DE FOND
  { code_pattern: 'BF%-FOND%', exclude_pattern: null, commission_id: COMMISSION_IDS['ski-de-fond'], priorite: 10, description: 'Brevets ski de fond' },

  // RAQUETTE
  { code_pattern: 'BF%-RAQUETTE%', exclude_pattern: null, commission_id: COMMISSION_IDS['raquette'], priorite: 10, description: 'Brevets raquette' },
  { code_pattern: 'BF%-RAQ%', exclude_pattern: null, commission_id: COMMISSION_IDS['raquette'], priorite: 10, description: 'Brevets raquette (code court)' },

  // SNOWBOARD
  { code_pattern: 'BF%-SNOW%', exclude_pattern: null, commission_id: COMMISSION_IDS['snowboard-rando'], priorite: 10, description: 'Brevets snowboard' },

  // MARCHE NORDIQUE
  { code_pattern: 'BF%-NORDIC%', exclude_pattern: null, commission_id: COMMISSION_IDS['marche-nordique'], priorite: 10, description: 'Brevets marche nordique' },
  { code_pattern: 'BF%-MARCHE%', exclude_pattern: null, commission_id: COMMISSION_IDS['marche-nordique'], priorite: 10, description: 'Brevets marche nordique' }
];

async function initBrevetPatterns(): Promise<void> {
  const db = getSQLiteAdapter();

  try {
    await db.connect();
    console.log('🔧 Initialisation des patterns de brevets...\n');

    // Vider la table avant de la repeupler
    await db.execute('DELETE FROM formation_brevet_pattern_commission_mapping');
    console.log('   ✅ Table vidée\n');

    let insertedCount = 0;
    for (const mapping of PATTERN_MAPPINGS) {
      try {
        await db.execute(
          `INSERT INTO formation_brevet_pattern_commission_mapping
           (code_pattern, exclude_pattern, commission_id, priorite, actif, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            mapping.code_pattern,
            mapping.exclude_pattern,
            mapping.commission_id,
            mapping.priorite
          ]
        );
        insertedCount++;
        console.log(`   ✓ ${mapping.description} (pattern: ${mapping.code_pattern})`);
      } catch (error: any) {
        console.error(`   ✗ Erreur pour ${mapping.description}:`, error.message);
      }
    }

    console.log(`\n✅ ${insertedCount}/${PATTERN_MAPPINGS.length} patterns insérés\n`);

    // Afficher quelques exemples de matching
    console.log('🧪 Test de quelques exemples de brevets:\n');
    const testCodes = ['BF1-ESC', 'BF2-ALP', 'BF1-SKI', 'BF-CANYON', 'PSC1', 'BFM-ESC'];

    for (const testCode of testCodes) {
      const [rows] = await db.execute(
        `SELECT commission_id, code_pattern, priorite
         FROM formation_brevet_pattern_commission_mapping
         WHERE actif = 1
           AND ? LIKE code_pattern
           AND (exclude_pattern IS NULL OR ? NOT LIKE exclude_pattern)
         ORDER BY priorite DESC
         LIMIT 1`,
        [testCode, testCode]
      );

      if (rows.length > 0) {
        const commName = Object.entries(COMMISSION_IDS).find(([_, id]) => id === rows[0].commission_id)?.[0] || 'unknown';
        console.log(`   ${testCode} → Commission ${commName} (pattern: ${rows[0].code_pattern}, priorité: ${rows[0].priorite})`);
      } else {
        console.log(`   ${testCode} → Aucune commission (transversal)`);
      }
    }

    await db.close();
    console.log('\n✅ Initialisation terminée\n');

  } catch (error: any) {
    console.error('❌ Erreur lors de l\'initialisation:', error.message);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  initBrevetPatterns();
}

export default initBrevetPatterns;
