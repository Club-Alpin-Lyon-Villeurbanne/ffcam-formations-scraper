/**
 * Importeur pour les formations dans la base de données
 */
import { Formation } from '../types';
import BaseImporter from './base-importer';

class FormationsImporter extends BaseImporter<Formation> {
  private missingCafnums = new Set<string>();

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
   * Importe une formation dans la base de données
   */
  protected async importItemToDb(formation: Formation): Promise<void> {
    try {
      // 1. Upsert dans formation_referentiel
      await this.db.execute(
        `INSERT INTO formation_referentiel (code_formation, intitule) 
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE intitule = VALUES(intitule)`,
        [formation.codeFormation, formation.intituleFormation]
      );
      
      // 2. Chercher l'user_id
      const userId = await this.db.getUserIdFromCafnum(formation.adherentId);
      if (!userId) {
        this.missingCafnums.add(formation.adherentId);
        this.logger.stats.formations.ignored++;
        return;
      }
      
      // 3. Insert dans formation_validation
      // ON DUPLICATE KEY UPDATE fonctionnera une fois la contrainte UNIQUE (user_id, id_interne) ajoutée
      await this.db.execute(
        `INSERT INTO formation_validation
         (user_id, code_formation, valide, date_validation, numero_formation,
          validateur, id_interne, intitule_formation, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
         intitule_formation = VALUES(intitule_formation),
         date_validation = VALUES(date_validation),
         numero_formation = VALUES(numero_formation),
         validateur = VALUES(validateur),
         code_formation = VALUES(code_formation),
         updated_at = NOW()`,
        [
          userId,
          formation.codeFormation,
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