/**
 * Importeur pour les niveaux de pratique dans la base de données
 */
import { NiveauPratique, NiveauxMetadata } from '../types';
import BaseImporter from './base-importer';

class NiveauxImporter extends BaseImporter<NiveauPratique> {
  /** Id référentiel par cursus_niveau_id, pour n'upserter/lier qu'une fois par niveau */
  private referentielIds = new Map<string, number>();
  private seenReferentiels = new Set<string>();

  protected getDataKey(): 'niveaux' {
    return 'niveaux';
  }

  protected getSectionTitle(): string {
    return '📥 Import des NIVEAUX DE PRATIQUE...\n';
  }

  protected getReferentielKey(_niveau: NiveauPratique): string {
    // Cette méthode n'est pas utilisée car on override import()
    // mais on doit l'implémenter pour satisfaire l'interface
    return '';
  }

  protected validateItem(_niveau: NiveauPratique): void {
    // Validation déléguée à extractNiveauCourt
  }

  protected async importItemToDb(_niveau: NiveauPratique): Promise<void> {
    // Non utilisée car on override import() pour gérer les métadonnées
    throw new Error('Use import() with metadata instead');
  }

  /**
   * En dry-run : résout le mapping niveau → commission sans écrire
   */
  protected async checkMappingDryRun(niveau: NiveauPratique, cursusNiveauId?: string): Promise<void> {
    if (cursusNiveauId) {
      if (this.seenReferentiels.has(cursusNiveauId)) return;
      this.seenReferentiels.add(cursusNiveauId);
    }
    await this.commissionLinker.linkNiveau(0, niveau.activite, niveau.discipline, niveau.niveau);
  }

  protected printReport(dryRun: boolean): void {
    this.logger.printNiveauReport(dryRun);
    this.printErrorBreakdown();
  }

  /**
   * Importe tous les niveaux de pratique
   * Override de la méthode de base pour gérer les métadonnées
   */
  async import(niveaux: NiveauPratique[], metadata: NiveauxMetadata): Promise<void> {
    this.logger.section(this.getSectionTitle());
    
    for (const niveau of niveaux) {
      this.logger.stats.niveaux.total++;
      
      // Récupérer le cursus_niveau_id depuis les métadonnées
      const meta = metadata[niveau.id];
      const cursusNiveauId = meta?._BASE_cursus_niveau_pratique_id;
      
      if (!cursusNiveauId) {
        this.logger.logNiveauIssue(niveau, 'sans_cursus_id');
        continue;
      }
      
      // Valider et extraire le niveau court
      const niveauCourt = this.extractNiveauCourt(niveau);
      
      // Alimenter les référentiels
      this.logger.stats.referentiels.niveaux.add(cursusNiveauId);
      
      if (!this.dryRun) {
        await this.importNiveau(niveau, cursusNiveauId, niveauCourt);
      } else {
        await this.checkMappingDryRun(niveau, cursusNiveauId);
        this.logger.stats.niveaux.imported++;
      }
      
      // Afficher la progression
      this.logger.progress(
        this.logger.stats.niveaux.imported,
        this.logger.stats.niveaux.total
      );
    }
    
    this.printReport(this.dryRun);
  }

  /**
   * Extrait le niveau court (INITIE, PERFECTIONNE, SPECIALISE)
   */
  private extractNiveauCourt(niveau: NiveauPratique): string | null {
    const match = niveau.niveau.match(/^(INITIE|PERFECTIONNE|SPECIALISE)/);
    const niveauCourt = match ? match[1] : null;
    
    if (!niveauCourt) {
      this.logger.logNiveauIssue(niveau, 'format_non_standard');
    }
    
    return niveauCourt;
  }

  /**
   * Importe un niveau dans la base de données
   */
  private async importNiveau(niveau: NiveauPratique, cursusNiveauId: string, niveauCourt: string | null): Promise<void> {
    try {
      let niveauRefId = this.referentielIds.get(cursusNiveauId);

      if (niveauRefId === undefined) {
        // 1. Upsert dans formation_referentiel_niveau_pratique
        await this.db.execute(
          `INSERT INTO formation_referentiel_niveau_pratique
           (cursus_niveau_id, code_activite, activite, niveau, libelle, niveau_court, discipline)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           libelle = VALUES(libelle),
           niveau_court = VALUES(niveau_court),
           discipline = VALUES(discipline)`,
          [
            parseInt(cursusNiveauId),
            niveau.codeActivite,
            niveau.activite,
            niveau.niveau,
            niveau.niveau,
            niveauCourt,
            niveau.discipline || null
          ]
        );

        // 2. Récupérer l'ID du niveau depuis le référentiel
        const [niveauRows] = await this.db.execute(
          `SELECT id FROM formation_referentiel_niveau_pratique WHERE cursus_niveau_id = ? LIMIT 1`,
          [parseInt(cursusNiveauId)]
        );

        if (!niveauRows || niveauRows.length === 0) {
          throw new Error(`Impossible de récupérer l'ID du niveau pour cursus_niveau_id ${cursusNiveauId}`);
        }

        niveauRefId = niveauRows[0].id as number;

        // 2b. Lier à sa commission
        // Utilise le niveau complet (ex: "PERFECTIONNE en snowboard de randonnée")
        // pour déterminer la discipline si non disponible dans les métadonnées
        await this.commissionLinker.linkNiveau(
          niveauRefId,
          niveau.activite,
          niveau.discipline,
          niveau.niveau  // Intitulé complet du niveau pour analyse
        );

        this.referentielIds.set(cursusNiveauId, niveauRefId);
      }

      // 3. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(niveau.adherentId);
      if (!userId) {
        this.logger.stats.niveaux.ignored++;
        return;
      }

      // 4. Insert dans formation_validation_niveau_pratique
      // Note: cursus_niveau_id référence formation_referentiel_niveau_pratique.id (pas le cursus_niveau_id FFCAM)
      await this.db.execute(
        `INSERT INTO formation_validation_niveau_pratique
         (user_id, cursus_niveau_id, date_validation, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         date_validation = VALUES(date_validation),
         updated_at = NOW()`,
        [
          userId,
          niveauRefId,
          niveau.dateValidation
        ]
      );

      this.logger.stats.niveaux.imported++;

    } catch (error: any) {
      this.recordError(niveau.id, error);
    }
  }
}

export default NiveauxImporter;