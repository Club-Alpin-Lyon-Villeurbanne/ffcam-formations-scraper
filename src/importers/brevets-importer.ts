/**
 * Importeur pour les brevets dans la base de données
 */
import { Brevet } from '../types';
import BaseImporter from './base-importer';

class BrevetsImporter extends BaseImporter<Brevet> {
  private errorsByType = new Map<string, number>();

  protected getDataKey(): 'brevets' {
    return 'brevets';
  }

  protected getSectionTitle(): string {
    return '📥 Import des BREVETS...\n';
  }

  protected getReferentielKey(brevet: Brevet): string {
    return brevet.codeBrevet;
  }

  protected printReport(dryRun: boolean): void {
    this.logger.printBrevetReport(dryRun);

    // Afficher les types d'erreurs rencontrées (seulement si vraies erreurs SQL)
    if (this.errorsByType.size > 0) {
      console.log(`\n📊 Répartition des erreurs par type:`);
      const sortedErrors = Array.from(this.errorsByType.entries())
        .sort((a, b) => b[1] - a[1]);
      sortedErrors.forEach(([type, count]) => {
        console.log(`   - ${type}: ${count}`);
      });
    }
  }

  /**
   * Valide un brevet et log les anomalies
   */
  protected validateItem(brevet: Brevet): void {
    // Vérifier le code brevet (critique)
    if (!brevet.codeBrevet || brevet.codeBrevet.trim() === '') {
      this.logger.logBrevetIssue(brevet, 'sans_code');
      throw new Error(`Brevet sans code pour ${brevet.nom}`);
    }

    // Vérifier la date d'obtention
    if (!brevet.dateObtention || brevet.dateObtention.trim() === '') {
      this.logger.logBrevetIssue(brevet, 'sans_date_obtention');
    }
  }

  /**
   * Importe un brevet dans la base de données
   */
  protected async importItemToDb(brevet: Brevet): Promise<void> {
    try {
      // 1. Upsert dans formation_referentiel_brevet
      await this.db.execute(
        `INSERT INTO formation_referentiel_brevet (code_brevet, intitule)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE intitule = VALUES(intitule)`,
        [brevet.codeBrevet, brevet.intituleBrevet]
      );

      // 2. Récupérer l'ID du brevet depuis le référentiel
      const [brevetRows] = await this.db.execute(
        `SELECT id FROM formation_referentiel_brevet WHERE code_brevet = ? LIMIT 1`,
        [brevet.codeBrevet]
      );

      if (!brevetRows || brevetRows.length === 0) {
        throw new Error(`Impossible de récupérer l'ID du brevet ${brevet.codeBrevet}`);
      }

      const brevetId = brevetRows[0].id;

      // 2b. Lier le brevet à sa commission (si applicable)
      await this.commissionLinker.linkBrevet(brevetId, brevet.codeBrevet);

      // 3. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(brevet.adherentId);
      if (!userId) {
        this.logger.stats.brevets.ignored++;
        return;
      }

      // 4. Insert dans formation_validation_brevet
      await this.db.execute(
        `INSERT INTO formation_validation_brevet
         (user_id, brevet_id,
          date_obtention, date_recyclage, date_edition,
          date_formation_continue, date_migration,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         date_obtention = VALUES(date_obtention),
         date_recyclage = VALUES(date_recyclage),
         date_edition = VALUES(date_edition),
         date_formation_continue = VALUES(date_formation_continue),
         date_migration = VALUES(date_migration),
         updated_at = NOW()`,
        [
          userId,
          brevetId,
          brevet.dateObtention || null,
          brevet.dateRecyclage || null,
          brevet.dateEdition || null,
          brevet.dateFormationContinue || null,
          brevet.dateMigration || null
        ]
      );

      this.logger.stats.brevets.imported++;

    } catch (error: any) {
      // Catégoriser l'erreur
      const errorType = error.errno ? `SQL-${error.errno}` : error.message.substring(0, 50);
      this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);

      // Log détaillé des premières erreurs seulement
      if (this.logger.stats.brevets.errors < 3) {
        console.log(`\n   ❌ ERREUR import brevet: ${brevet.nom} (cafnum: ${brevet.adherentId})`);
        console.log(`      Code brevet: ${brevet.codeBrevet}`);
        console.log(`      Message: ${error.message}`);
        console.log(`      SQL State: ${error.sqlState || 'N/A'}`);
        console.log(`      Errno: ${error.errno || 'N/A'}\n`);
      } else if (this.logger.stats.brevets.errors === 3) {
        console.log(`\n   ... (erreurs supplémentaires masquées, voir résumé à la fin)\n`);
      }
      this.logger.stats.brevets.errors++;
    }
  }
}

export default BrevetsImporter;
