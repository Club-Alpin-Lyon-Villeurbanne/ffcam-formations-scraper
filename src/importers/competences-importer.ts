import { Competence } from '../types';
import BaseImporter from './base-importer';

class CompetencesImporter extends BaseImporter<Competence> {
  /** Id référentiel par clé (intitulé + code_activite), pour n'upserter/lier qu'une fois par GC */
  private referentielIds = new Map<string, number>();
  private seenReferentiels = new Set<string>();

  async import(items: Competence[], _metadata?: any): Promise<void> {
    this.commissionLinker.initGcMapping();

    return super.import(items, _metadata);
  }
  protected getDataKey(): 'competences' {
    return 'competences';
  }

  protected getSectionTitle(): string {
    return '📥 Import des COMPÉTENCES...\n';
  }

  protected getReferentielKey(competence: Competence): string {
    return `${competence.intituleCompetence}|${competence.codeActivite || ''}`;
  }

  protected printReport(dryRun: boolean): void {
    this.logger.printCompetenceReport(dryRun);
    this.printErrorBreakdown();
  }

  protected validateItem(competence: Competence): void {
    if (!competence.intituleCompetence || competence.intituleCompetence.trim() === '') {
      throw new Error(`Compétence sans intitulé (ligne ${competence.id})`);
    }
  }

  protected async checkMappingDryRun(competence: Competence): Promise<void> {
    const key = this.getReferentielKey(competence);
    if (this.seenReferentiels.has(key)) return;
    this.seenReferentiels.add(key);
    await this.commissionLinker.linkCompetenceFromCsv(0, competence.intituleCompetence);
  }

  protected async importItemToDb(competence: Competence): Promise<void> {
    try {
      // '' plutôt que NULL : NULL ≠ NULL dans un index unique MySQL, ce qui créerait des doublons
      const codeActivite = competence.codeActivite || '';
      const key = this.getReferentielKey(competence);
      let competenceId = this.referentielIds.get(key);

      if (competenceId === undefined) {
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

        competenceId = competenceRows[0].id as number;

        await this.commissionLinker.linkCompetenceFromCsv(
          competenceId,
          competence.intituleCompetence
        );

        this.referentielIds.set(key, competenceId);
      }

      const userId = await this.db.getUserIdFromCafnum(competence.adherentId);
      if (!userId) {
        this.logger.stats.competences.ignored++;
        return;
      }

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
      this.recordError(competence.id, error);
    }
  }
}

export default CompetencesImporter;
