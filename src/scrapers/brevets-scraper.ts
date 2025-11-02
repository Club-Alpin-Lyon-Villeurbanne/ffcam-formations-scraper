/**
 * Scraper pour les brevets des adhérents
 */
import { Brevet, ApiRow, Scraper } from '../types';
import BaseScraper, { ScraperConfig } from './base-scraper';

class BrevetsScraper extends BaseScraper<Brevet> implements Scraper<Brevet> {
  /**
   * Configuration du scraper
   */
  protected getScraperConfig(): ScraperConfig {
    return {
      entityName: 'brevet',
      entityNamePlural: 'brevets',
      def: 'adh_brevets',
      sidx: 'jqGrid_adh_brevets_NOMCOMPLET'
    };
  }

  /**
   * Traite une ligne de brevet
   */
  protected processRow(row: ApiRow): Brevet | null {
    if (this.shouldFilterRow(row)) {
      return null;
    }

    // Structure attendue (mapping FFCAM → DB):
    // col_0: Numéro adhérent (ADHERENT_ID) → cafnum_user
    // col_1: Nom complet (NOMCOMPLET) → utilisé pour affichage uniquement
    // col_2: Code du brevet (FOR_TBREVET_CODE) → code_brevet
    // col_3: Intitulé du brevet (LIBELLE) → intitule_brevet
    // col_4: Date d'obtention (DATEOBTENTION) → date_obtention
    // col_5: Date de recyclage (DATERECYCLAGE) → date_recyclage
    // col_6: Date d'édition (DATEEDITION) → date_edition
    // col_7: ID interne (ID) → supprimé (non stocké en DB)
    // col_8: Commentaires (COMMENTAIRE) → supprimé (non stocké en DB)
    // col_9: Date de formation continue (DATERECYCLAGE2) → date_formation_continue
    // col_10: Date de migration (DATE_MIGRATION) → date_migration
    // col_11: Autre → non utilisé
    return {
      ...this.extractCommonFields(row),
      codeBrevet: row.cell.col_2,
      intituleBrevet: row.cell.col_3,
      dateObtention: this.formatDate(row.cell.col_4),
      dateRecyclage: this.formatDate(row.cell.col_5),
      dateEdition: this.formatDate(row.cell.col_6),
      dateFormationContinue: this.formatDate(row.cell.col_9),
      dateMigration: this.formatDate(row.cell.col_10)
    };
  }
}

export default BrevetsScraper;
