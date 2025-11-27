/**
 * Script de test pour vérifier le mapping des brevets vers les commissions
 *
 * Teste le pattern matching SQL LIKE avec différents codes de brevets
 */

import { getInstance as getSQLiteAdapter } from '../database/sqlite-adapter';

// Codes de brevets à tester (exemples réels issus de la FFCAM)
const TEST_BREVETS = [
  // Escalade
  { code: 'BF1-ESC', expected: 'escalade' },
  { code: 'BF2-ESC', expected: 'escalade' },
  { code: 'BFM-ESC', expected: 'escalade' },

  // Alpinisme
  { code: 'BF1-ALP', expected: 'alpinisme' },
  { code: 'BF2-ALP', expected: 'alpinisme' },
  { code: 'BF-CASCADE', expected: 'alpinisme' },

  // Ski
  { code: 'BF1-SKI', expected: 'ski-de-randonnee' },
  { code: 'BF2-SKI', expected: 'ski-de-randonnee' },
  { code: 'BRV-NIVO1', expected: 'ski-de-randonnee' },

  // Randonnée
  { code: 'BF1-RAND', expected: 'randonnee' },
  { code: 'BF2-RAND', expected: 'randonnee' },

  // Canyon
  { code: 'BF1-CANYON', expected: 'canyon' },
  { code: 'BF-CANYON', expected: 'canyon' },

  // VTT
  { code: 'BF1-VTT', expected: 'vtt' },

  // Via ferrata
  { code: 'BF1-VIA', expected: 'via-ferrata' },

  // Brevets transversaux (ne doivent PAS être mappés)
  { code: 'PSC1', expected: null },
  { code: 'PSE1', expected: null },
  { code: 'PSE2', expected: null },
  { code: 'BRV-JEUNE', expected: null },
  { code: 'BRV-SECU', expected: null }
];

// Mapping commission_id → slug (pour les tests)
const COMMISSION_NAMES: Record<number, string> = {
  1: 'escalade',
  2: 'alpinisme',
  3: 'randonnee',
  4: 'canyon',
  5: 'ski-de-randonnee',
  6: 'vtt',
  7: 'trail',
  8: 'via-ferrata',
  9: 'ski-de-piste',
  10: 'ski-de-fond',
  11: 'raquette',
  12: 'snowboard-rando',
  13: 'snowboard-alpin',
  14: 'marche-nordique',
  15: 'formation'
};

async function testBrevetMapping(): Promise<void> {
  const db = getSQLiteAdapter();

  try {
    await db.connect();
    console.log('🧪 TEST DU MAPPING BREVETS → COMMISSIONS\n');
    console.log('=========================================\n');

    let successCount = 0;
    let failureCount = 0;

    for (const test of TEST_BREVETS) {
      // Requête directe SQL (même logique que CommissionMapper)
      const [rows] = await db.execute(
        `SELECT DISTINCT commission_id, priorite, code_pattern
         FROM formation_brevet_pattern_commission_mapping
         WHERE actif = 1
           AND ? LIKE code_pattern
           AND (
             exclude_pattern IS NULL
             OR ? NOT LIKE exclude_pattern
           )
         ORDER BY priorite DESC, commission_id ASC
         LIMIT 1`,
        [test.code, test.code]
      );

      const foundCommission = rows.length > 0 ? COMMISSION_NAMES[rows[0].commission_id] : null;
      const isMatch = foundCommission === test.expected;

      if (isMatch) {
        successCount++;
        const icon = foundCommission ? '✅' : '⚪';
        const detail = foundCommission
          ? `→ ${foundCommission} (pattern: ${rows[0].code_pattern}, priorité: ${rows[0].priorite})`
          : '→ Aucune commission (transversal)';
        console.log(`${icon} ${test.code.padEnd(15)} ${detail}`);
      } else {
        failureCount++;
        console.log(`❌ ${test.code.padEnd(15)} → Attendu: ${test.expected || 'null'}, Obtenu: ${foundCommission || 'null'}`);
      }
    }

    console.log('\n=========================================');
    console.log(`\n📊 Résultats: ${successCount}/${TEST_BREVETS.length} tests réussis`);

    if (failureCount > 0) {
      console.log(`❌ ${failureCount} échec(s)\n`);
      process.exit(1);
    } else {
      console.log(`✅ Tous les tests sont passés !\n`);
    }

    await db.close();

  } catch (error: any) {
    console.error('❌ Erreur lors du test:', error.message);
    process.exit(1);
  }
}

// Exécuter si appelé directement
if (require.main === module) {
  testBrevetMapping();
}

export default testBrevetMapping;
