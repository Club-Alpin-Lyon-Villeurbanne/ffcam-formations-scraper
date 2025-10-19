/**
 * Importeur pour les brevets dans la base de données
 */
import { Brevet } from '../types';
import BaseImporter from './base-importer';

class BrevetsImporter extends BaseImporter<Brevet> {
  private missingCafnums = new Set<string>();

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

    if (this.missingCafnums.size > 0) {
      console.log(`\n⚠️  ${this.missingCafnums.size} adhérents uniques non trouvés dans caf_user`);
      console.log(`   Brevets ignorés: ${this.logger.stats.brevets.errors}`);
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
      // 1. Upsert dans formation_brevet_referentiel
      await this.db.execute(
        `INSERT INTO formation_brevet_referentiel (code_brevet, intitule)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE intitule = VALUES(intitule)`,
        [brevet.codeBrevet, brevet.intituleBrevet]
      );

      // 2. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(brevet.adherentId);
      if (!userId) {
        if (this.missingCafnums.size < 5) {
          console.log(`   ⚠️  Adhérent non trouvé: ${brevet.nom} (cafnum: ${brevet.adherentId})`);
        }
        this.missingCafnums.add(brevet.adherentId);
        this.logger.stats.brevets.errors++;
        return;
      }

      // 3. Insert dans formation_brevet (sans intitule_brevet, il est dans le référentiel)
      // Note: Pas de contrainte UNIQUE, donc pas de ON DUPLICATE KEY UPDATE
      await this.db.execute(
        `INSERT INTO formation_brevet
         (user_id, cafnum_user, code_brevet,
          date_obtention, date_recyclage, date_edition,
          date_formation_continue, date_migration,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          brevet.adherentId,
          brevet.codeBrevet,
          brevet.dateObtention || null,
          brevet.dateRecyclage || null,
          brevet.dateEdition || null,
          brevet.dateFormationContinue || null,
          brevet.dateMigration || null
        ]
      );

      this.logger.stats.brevets.imported++;

    } catch (error: any) {
      this.logger.stats.brevets.errors++;
    }
  }
}

export default BrevetsImporter;
