/**
 * Importeur pour les niveaux de pratique dans la base de données
 */
import { NiveauPratique, NiveauxMetadata } from '../types';
import BaseImporter from './base-importer';

class NiveauxImporter extends BaseImporter<NiveauPratique> {
  private errorsByType = new Map<string, number>();

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

    // Afficher les types d'erreurs rencontrées
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

      const niveauRefId = niveauRows[0].id;

      // 2b. Lier à sa commission
      await this.commissionLinker.linkNiveau(
        niveauRefId,
        niveau.activite,
        niveau.discipline
      );

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
      // Catégoriser l'erreur
      const errorType = error.errno ? `SQL-${error.errno}` : error.message.substring(0, 50);
      this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);

      // Log détaillé des premières erreurs seulement
      if (this.logger.stats.niveaux.errors < 3) {
        console.log(`\n   ❌ ERREUR import niveau: ${niveau.adherentId}`);
        console.log(`      Activité: ${niveau.activite}`);
        console.log(`      Niveau: ${niveau.niveau}`);
        console.log(`      cursus_niveau_id: ${cursusNiveauId}`);
        console.log(`      Message: ${error.message}`);
        console.log(`      SQL State: ${error.sqlState || 'N/A'}`);
        console.log(`      Errno: ${error.errno || 'N/A'}\n`);
      } else if (this.logger.stats.niveaux.errors === 3) {
        console.log(`\n   ... (erreurs supplémentaires masquées, voir résumé à la fin)\n`);
      }
      this.logger.stats.niveaux.errors++;
    }
  }
}

export default NiveauxImporter;