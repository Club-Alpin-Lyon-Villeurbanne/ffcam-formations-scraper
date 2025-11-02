/**
 * Importeur pour les compétences dans la base de données
 */
import { Competence } from '../types';
import BaseImporter from './base-importer';

class CompetencesImporter extends BaseImporter<Competence> {
  private missingCafnums = new Set<string>();

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
      // 1. Upsert dans formation_competence_referentiel
      // La contrainte UNIQUE sera sur (intitule, code_activite)
      await this.db.execute(
        `INSERT INTO formation_competence_referentiel
         (intitule, code_activite, activite, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         activite = VALUES(activite),
         updated_at = NOW()`,
        [
          competence.intituleCompetence,
          competence.codeActivite || null,
          competence.activite || null
        ]
      );

      // 2. Récupérer l'ID de la compétence depuis le référentiel
      const [competenceRows] = await this.db.execute(
        `SELECT id FROM formation_competence_referentiel
         WHERE intitule = ? AND (code_activite = ? OR (code_activite IS NULL AND ? IS NULL))
         LIMIT 1`,
        [
          competence.intituleCompetence,
          competence.codeActivite || null,
          competence.codeActivite || null
        ]
      );

      if (!competenceRows || competenceRows.length === 0) {
        throw new Error(`Impossible de récupérer l'ID de la compétence ${competence.intituleCompetence}`);
      }

      const competenceId = competenceRows[0].id;

      // 3. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(competence.adherentId);
      if (!userId) {
        this.missingCafnums.add(competence.adherentId);
        this.logger.stats.competences.ignored++;
        return;
      }

      // 4. Insert dans formation_competence_validation
      // ON DUPLICATE KEY UPDATE fonctionnera une fois la contrainte UNIQUE (user_id, competence_id) ajoutée
      await this.db.execute(
        `INSERT INTO formation_competence_validation
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
