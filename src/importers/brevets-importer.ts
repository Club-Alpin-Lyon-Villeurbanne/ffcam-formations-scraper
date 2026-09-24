import { Brevet } from '../types';
import BaseImporter from './base-importer';

class BrevetsImporter extends BaseImporter<Brevet> {
  /** Id référentiel par code_brevet, pour n'upserter/lier qu'une fois par code */
  private referentielIds = new Map<string, number>();
  private seenReferentiels = new Set<string>();

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
    this.printErrorBreakdown();
  }

  protected validateItem(brevet: Brevet): void {
    if (!brevet.codeBrevet || brevet.codeBrevet.trim() === '') {
      this.logger.logBrevetIssue(brevet, 'sans_code');
      throw new Error(`Brevet sans code (ligne ${brevet.id})`);
    }

    if (!brevet.dateObtention || brevet.dateObtention.trim() === '') {
      this.logger.logBrevetIssue(brevet, 'sans_date_obtention');
    }
  }

  protected async checkMappingDryRun(brevet: Brevet): Promise<void> {
    if (this.seenReferentiels.has(brevet.codeBrevet)) return;
    this.seenReferentiels.add(brevet.codeBrevet);
    await this.commissionLinker.linkBrevet(0, brevet.codeBrevet);
  }

  protected async importItemToDb(brevet: Brevet): Promise<void> {
    try {
      let brevetId = this.referentielIds.get(brevet.codeBrevet);

      if (brevetId === undefined) {
        await this.db.execute(
          `INSERT INTO formation_referentiel_brevet (code_brevet, intitule)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE intitule = VALUES(intitule)`,
          [brevet.codeBrevet, brevet.intituleBrevet]
        );

        const [brevetRows] = await this.db.execute(
          `SELECT id FROM formation_referentiel_brevet WHERE code_brevet = ? LIMIT 1`,
          [brevet.codeBrevet]
        );

        if (!brevetRows || brevetRows.length === 0) {
          throw new Error(`Impossible de récupérer l'ID du brevet ${brevet.codeBrevet}`);
        }

        brevetId = brevetRows[0].id as number;

        await this.commissionLinker.linkBrevet(brevetId, brevet.codeBrevet);

        this.referentielIds.set(brevet.codeBrevet, brevetId);
      }

      const userId = await this.db.getUserIdFromCafnum(brevet.adherentId);
      if (!userId) {
        this.logger.stats.brevets.ignored++;
        return;
      }

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
      this.recordError(brevet.id, error);
    }
  }
}

export default BrevetsImporter;
