import { Formation } from '../types';
import BaseImporter from './base-importer';

class FormationsImporter extends BaseImporter<Formation> {
  /** Id référentiel par code_formation, pour n'upserter/lier qu'une fois par code */
  private referentielIds = new Map<string, number>();
  private seenReferentiels = new Set<string>();

  protected getDataKey(): 'formations' {
    return 'formations';
  }

  protected getSectionTitle(): string {
    return '📥 Import des FORMATIONS...\n';
  }

  protected getReferentielKey(formation: Formation): string {
    return formation.codeFormation;
  }

  protected printReport(dryRun: boolean): void {
    this.logger.printFormationReport(dryRun);
    this.printErrorBreakdown();
  }

  protected validateItem(formation: Formation): void {
    if (!formation.numeroFormation || formation.numeroFormation.trim() === '') {
      this.logger.logFormationIssue(formation, 'sans_numero');
    }
    
    if (!formation.formateur || formation.formateur.trim() === '' || formation.formateur.trim() === ' ') {
      this.logger.logFormationIssue(formation, 'sans_formateur');
    }
    
    if (!formation.lieuFormation || formation.lieuFormation.trim() === '') {
      this.logger.logFormationIssue(formation, 'sans_lieu');
    }
    
    // Dates souvent absentes de l'API FFCAM : comptées, non bloquantes
    if (!formation.dateDebutFormation || !formation.dateFinFormation) {
      this.logger.logFormationIssue(formation, 'sans_dates');
    }
    
    if (!formation.codeFormation) {
      throw new Error(`Formation sans code (ligne ${formation.id})`);
    }
  }

  protected async checkMappingDryRun(formation: Formation): Promise<void> {
    if (this.seenReferentiels.has(formation.codeFormation)) return;
    this.seenReferentiels.add(formation.codeFormation);
    await this.commissionLinker.linkFormation(0, formation.codeFormation);
  }

  protected async importItemToDb(formation: Formation): Promise<void> {
    try {
      let formationId = this.referentielIds.get(formation.codeFormation);

      if (formationId === undefined) {
        await this.db.execute(
          `INSERT INTO formation_referentiel_formation (code_formation, intitule)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE intitule = VALUES(intitule)`,
          [formation.codeFormation, formation.intituleFormation]
        );

        const [formationRows] = await this.db.execute(
          `SELECT id FROM formation_referentiel_formation WHERE code_formation = ? LIMIT 1`,
          [formation.codeFormation]
        );

        if (!formationRows || formationRows.length === 0) {
          throw new Error(`Impossible de récupérer l'ID de la formation ${formation.codeFormation}`);
        }

        formationId = formationRows[0].id as number;

        await this.commissionLinker.linkFormation(formationId, formation.codeFormation);

        this.referentielIds.set(formation.codeFormation, formationId);
      }

      const userId = await this.db.getUserIdFromCafnum(formation.adherentId);
      if (!userId) {
        this.logger.stats.formations.ignored++;
        return;
      }

      await this.db.execute(
        `INSERT INTO formation_validation_formation
         (user_id, formation_id, valide, date_validation, numero_formation,
          validateur, id_interne, intitule_formation, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         intitule_formation = VALUES(intitule_formation),
         date_validation = VALUES(date_validation),
         numero_formation = VALUES(numero_formation),
         validateur = VALUES(validateur),
         formation_id = VALUES(formation_id),
         updated_at = NOW()`,
        [
          userId,
          formationId,
          formation.dateValidation,
          formation.numeroFormation || null,
          formation.formateur?.trim() || null,
          formation.idInterne,
          formation.intituleFormation
        ]
      );

      this.logger.stats.formations.imported++;

    } catch (error: any) {
      this.recordError(formation.id, error);
    }
  }
}

export default FormationsImporter;