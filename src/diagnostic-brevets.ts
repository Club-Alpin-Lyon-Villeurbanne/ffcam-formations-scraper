#!/usr/bin/env node
/**
 * Diagnostic des brevets non rattachés à une commission
 *
 * Liste les brevets présents dans `formation_referentiel_brevet` qui n'ont
 * aucune liaison dans `formation_commission_brevet`, et les classe en :
 *
 *   - RE-SYNCHRONISABLES : un pattern de `BREVET_PATTERNS` les reconnaît
 *     désormais → un simple `npm run import:brevets` créera la liaison
 *     manquante (INSERT IGNORE, idempotent).
 *
 *   - NON MAPPÉS : aucun pattern ne les reconnaît → soit un brevet
 *     transversal volontairement ignoré (PSC1…), soit un nouveau code à
 *     ajouter dans `BREVET_PATTERNS` (src/utils/commission-mapping.ts).
 *
 * Aucune écriture en base : ce script est en lecture seule.
 *
 * Utilisation:
 *   npm run diagnostic:brevets              # auto-détecte SQLite/MySQL
 *   npm run diagnostic:brevets -- --mysql   # force MySQL (production)
 */

import './config'; // effet de bord : charge les variables d'environnement (.env selon NODE_ENV)
import { DatabaseAdapter } from './types';
import { getDatabase } from './database/db-factory';
import { getCommissionsForBrevet } from './utils/commission-mapping';

interface BrevetRow {
  id: number;
  code_brevet: string;
  intitule: string | null;
}

async function main(): Promise<void> {
  console.log('🔎 DIAGNOSTIC BREVETS SANS COMMISSION\n');

  const db: DatabaseAdapter = getDatabase();

  try {
    if (!db.isConnected()) {
      await db.connect();
    }

    // Brevets du référentiel sans aucune liaison commission
    const [rows] = await db.execute(
      `SELECT b.id, b.code_brevet, b.intitule
       FROM formation_referentiel_brevet b
       LEFT JOIN formation_commission_brevet cb ON cb.brevet_id = b.id
       WHERE cb.brevet_id IS NULL
       ORDER BY b.code_brevet`
    );
    const unlinked = rows as BrevetRow[];

    // Total du référentiel (pour le contexte)
    const [totalRows] = await db.execute(
      `SELECT COUNT(*) AS total FROM formation_referentiel_brevet`
    );
    const total = (totalRows as any[])[0]?.total ?? 0;

    // Classement des brevets non liés
    const resyncables: Array<{ row: BrevetRow; commissions: string[] }> = [];
    const nonMappes: BrevetRow[] = [];

    for (const row of unlinked) {
      const commissions = getCommissionsForBrevet(row.code_brevet);
      if (commissions.length > 0) {
        resyncables.push({ row, commissions });
      } else {
        nonMappes.push(row);
      }
    }

    // ---- Rapport ----
    console.log(`📊 Référentiel : ${total} brevets`);
    console.log(`   Liés à une commission : ${total - unlinked.length}`);
    console.log(`   Sans commission       : ${unlinked.length}\n`);

    if (resyncables.length > 0) {
      console.log(`🔁 RE-SYNCHRONISABLES (${resyncables.length}) — un pattern les reconnaît désormais`);
      console.log(`   → Lancer "npm run import:brevets" pour créer les liaisons.\n`);
      for (const { row, commissions } of resyncables) {
        console.log(`   • ${row.code_brevet.padEnd(14)} → ${commissions.join(', ').padEnd(20)} ${row.intitule ?? ''}`);
      }
      console.log('');
    }

    if (nonMappes.length > 0) {
      console.log(`❓ NON MAPPÉS (${nonMappes.length}) — aucun pattern ne les reconnaît`);
      console.log(`   → Brevet transversal (PSC1…) OU nouveau code à ajouter dans BREVET_PATTERNS.\n`);
      for (const row of nonMappes) {
        console.log(`   • ${row.code_brevet.padEnd(14)} ${row.intitule ?? ''}`);
      }
      console.log('');
    }

    if (unlinked.length === 0) {
      console.log('✅ Tous les brevets du référentiel sont rattachés à une commission.');
    }
  } catch (error: any) {
    console.error('\n❌ Erreur:', error.message);
    if (db.isConnected()) await db.close();
    process.exit(1);
  }

  if (db.isConnected()) {
    await db.close();
  }
}

main().catch((error: any) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

export default main;
