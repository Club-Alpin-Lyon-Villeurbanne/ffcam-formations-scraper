/**
 * Importeur pour les formations dans la base de données
 */
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
  }

  /**
   * Valide une formation et log les anomalies
   */
  protected validateItem(formation: Formation): void {
    // Vérifier le numéro de formation
    if (!formation.numeroFormation || formation.numeroFormation.trim() === '') {
      this.logger.logFormationIssue(formation, 'sans_numero');
    }
    
    // Vérifier le formateur
    if (!formation.formateur || formation.formateur.trim() === '' || formation.formateur.trim() === ' ') {
      this.logger.logFormationIssue(formation, 'sans_formateur');
    }
    
    // Vérifier le lieu de formation
    if (!formation.lieuFormation || formation.lieuFormation.trim() === '') {
      this.logger.logFormationIssue(formation, 'sans_lieu');
    }
    
    // Note: dates début/fin souvent absentes de l'API FFCAM
    // On les log mais ce n'est pas bloquant
    if (!formation.dateDebutFormation || !formation.dateFinFormation) {
      this.logger.logFormationIssue(formation, 'sans_dates');
    }
    
    // Vérifier le code formation (critique)
    if (!formation.codeFormation) {
      this.logger.logFormationIssue(formation, 'sans_code');
      throw new Error(`Formation sans code pour ${formation.nom}`);
    }
  }

  /**
   * En dry-run : résout le mapping formation → commission sans écrire
   */
  protected async checkMappingDryRun(formation: Formation): Promise<void> {
    if (this.seenReferentiels.has(formation.codeFormation)) return;
    this.seenReferentiels.add(formation.codeFormation);
    await this.commissionLinker.linkFormation(0, formation.codeFormation);
  }

  /**
   * Importe une formation dans la base de données
   */
  protected async importItemToDb(formation: Formation): Promise<void> {
    try {
      let formationId = this.referentielIds.get(formation.codeFormation);

      if (formationId === undefined) {
        // 1. Upsert dans formation_referentiel_formation
        await this.db.execute(
          `INSERT INTO formation_referentiel_formation (code_formation, intitule)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE intitule = VALUES(intitule)`,
          [formation.codeFormation, formation.intituleFormation]
        );

        // 2. Récupérer l'ID de la formation et lier à sa commission
        const [formationRows] = await this.db.execute(
          `SELECT id FROM formation_referentiel_formation WHERE code_formation = ? LIMIT 1`,
          [formation.codeFormation]
        );

        if (!formationRows || formationRows.length === 0) {
          this.logger.stats.formations.errors++;
          return;
        }

        formationId = formationRows[0].id as number;

        await this.commissionLinker.linkFormation(formationId, formation.codeFormation);

        this.referentielIds.set(formation.codeFormation, formationId);
      }

      // 3. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(formation.adherentId);
      if (!userId) {
        this.logger.stats.formations.ignored++;
        return;
      }

      // 4. Insert dans formation_validation_formation
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
      this.logger.stats.formations.errors++;
    }
  }
}

export default FormationsImporter;