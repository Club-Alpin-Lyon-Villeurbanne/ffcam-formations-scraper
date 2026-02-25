/**
 * Importeur pour les compétences dans la base de données
 *
 * Utilise le fichier CSV data/groupes-competences-commissions.csv comme
 * source de vérité pour le mapping GC → Commissions.
 */
import { Competence } from '../types';
import BaseImporter from './base-importer';

class CompetencesImporter extends BaseImporter<Competence> {
  /**
   * Override de la méthode import pour initialiser le mapping GC depuis le CSV
   */
  async import(items: Competence[], _metadata?: any): Promise<void> {
    // Initialiser le mapping GC depuis le CSV avant l'import
    this.commissionLinker.initGcMapping();

    // Appeler la méthode parente
    return super.import(items, _metadata);
  }
  protected getDataKey(): 'competences' {
    return 'competences';
  }

  protected getSectionTitle(): string {
    return '📥 Import des COMPÉTENCES...\n';
  }

  protected getReferentielKey(competence: Competence): string {
    // Clé unique : intitulé + activité
    return `${competence.intituleCompetence}|${competence.codeActivite || ''}`;
  }

  protected printReport(dryRun: boolean): void {
    this.logger.printCompetenceReport(dryRun);
  }

  /**
   * Valide une compétence et log les anomalies
   */
  protected validateItem(competence: Competence): void {
    // Vérifier l'intitulé (critique)
    if (!competence.intituleCompetence || competence.intituleCompetence.trim() === '') {
      throw new Error(`Compétence sans intitulé pour ${competence.nom}`);
    }
  }

  /**
   * Importe une compétence dans la base de données
   */
  protected async importItemToDb(competence: Competence): Promise<void> {
    try {
      // 1. Upsert dans formation_referentiel_groupe_competence
      // Note: On utilise '' au lieu de NULL pour code_activite car MySQL ne considère pas
      // NULL = NULL dans les index uniques, ce qui causerait des doublons
      const codeActivite = competence.codeActivite || '';
      await this.db.execute(
        `INSERT INTO formation_referentiel_groupe_competence
         (intitule, code_activite, activite, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         activite = VALUES(activite),
         updated_at = NOW()`,
        [
          competence.intituleCompetence,
          codeActivite,
          competence.activite || null
        ]
      );

      // 2. Récupérer l'ID de la compétence depuis le référentiel
      const [competenceRows] = await this.db.execute(
        `SELECT id FROM formation_referentiel_groupe_competence
         WHERE intitule = ? AND code_activite = ?
         LIMIT 1`,
        [
          competence.intituleCompetence,
          codeActivite
        ]
      );

      if (!competenceRows || competenceRows.length === 0) {
        throw new Error(`Impossible de récupérer l'ID de la compétence ${competence.intituleCompetence}`);
      }

      const competenceId = competenceRows[0].id;

      // 2b. Lier la compétence à ses commissions depuis le CSV (many-to-many)
      // Le CSV est la source de vérité pour le mapping GC → Commissions
      await this.commissionLinker.linkCompetenceFromCsv(
        competenceId,
        competence.intituleCompetence
      );

      // 3. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(competence.adherentId);
      if (!userId) {
        this.logger.stats.competences.ignored++;
        return;
      }

      // 4. Insert dans formation_validation_groupe_competence
      await this.db.execute(
        `INSERT INTO formation_validation_groupe_competence
         (user_id, competence_id, niveau_associe, date_validation,
          est_valide, valide_par, commentaire, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         niveau_associe = VALUES(niveau_associe),
         date_validation = VALUES(date_validation),
         est_valide = VALUES(est_valide),
         valide_par = VALUES(valide_par),
         commentaire = VALUES(commentaire),
         updated_at = NOW()`,
        [
          userId,
          competenceId,
          competence.niveauAssocie || null,
          competence.dateValidation || null,
          competence.estValide ? 1 : 0,
          competence.validePar || null,
          competence.commentaire || null
        ]
      );

      this.logger.stats.competences.imported++;

    } catch (error: any) {
      this.logger.stats.competences.errors++;
    }
  }
}

export default CompetencesImporter;
