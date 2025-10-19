/**
 * Importeur pour les niveaux de pratique dans la base de données
 */
import { NiveauPratique, NiveauxMetadata } from '../types';
import BaseImporter from './base-importer';

class NiveauxImporter extends BaseImporter<NiveauPratique> {
  private missingCafnums = new Set<string>();

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

  protected printReport(dryRun: boolean): void {
    this.logger.printNiveauReport(dryRun);

    if (this.missingCafnums.size > 0) {
      console.log(`\n⚠️  ${this.missingCafnums.size} adhérents uniques non trouvés dans caf_user`);
      console.log(`   Niveaux ignorés: ${this.logger.stats.niveaux.errors}`);
    }
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
        // En mode dry-run, simuler l'import
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
      // Table formation_activite_referentiel supprimée dans le nouveau schéma
      
      // 2. Upsert dans formation_niveau_referentiel
      await this.db.execute(
        `INSERT INTO formation_niveau_referentiel 
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
      
      // 3. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(niveau.adherentId);
      if (!userId) {
        if (this.missingCafnums.size < 5) {
          console.log(`   ⚠️  Adhérent non trouvé: ${niveau.nom} (cafnum: ${niveau.adherentId})`);
        }
        this.missingCafnums.add(niveau.adherentId);
        this.logger.stats.niveaux.errors++;
        return;
      }
      
      // 4. Insert dans formation_niveau_validation (simplifié sans compétences ni validation_par)
      await this.db.execute(
        `INSERT INTO formation_niveau_validation
         (user_id, cursus_niveau_id, date_validation, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         date_validation = VALUES(date_validation),
         updated_at = NOW()`,
        [
          userId, 
          parseInt(cursusNiveauId), // Utiliser directement le cursus_niveau_id FFCAM
          niveau.dateValidation
        ]
      );
      
      this.logger.stats.niveaux.imported++;
      
    } catch (error: any) {
      this.logger.stats.niveaux.errors++;
    }
  }
}

export default NiveauxImporter;