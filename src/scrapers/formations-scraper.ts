/**
 * Scraper pour les formations validées
 */
import { Formation, ApiRow, Scraper } from '../types';
import BaseScraper, { ScraperConfig } from './base-scraper';

class FormationsScraper extends BaseScraper<Formation> implements Scraper<Formation> {
  /**
   * Configuration du scraper
   */
  protected getScraperConfig(): ScraperConfig {
    return {
      entityName: 'formation',
      entityNamePlural: 'formations',
      def: 'adh_formations',
      sidx: 'jqGrid_adh_formations_NOMCOMPLET'
    };
  }

  /**
   * Traite une ligne de formation
   */
  protected processRow(row: ApiRow): Formation | null {
    if (this.shouldFilterRow(row)) {
      return null;
    }

    // Structure attendue:
    // col_7: Lieu de formation
    // col_9: Date début formation
    // col_10: Date fin formation
    return {
      ...this.extractCommonFields(row),
      codeFormation: row.cell.col_2,
      intituleFormation: row.cell.col_3,
      lieuFormation: row.cell.col_7 || '',
      dateDebutFormation: this.formatDate(row.cell.col_9),
      dateFinFormation: this.formatDate(row.cell.col_10),
      dateValidation: this.formatDate(row.cell.col_4),
      numeroFormation: row.cell.col_5,
      formateur: row.cell.col_6,
      idInterne: row.cell.col_8
    };
  }
}

export default FormationsScraper;