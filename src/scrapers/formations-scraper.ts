import { Formation, ApiRow, Scraper } from '../types';
import BaseScraper, { ScraperConfig } from './base-scraper';

class FormationsScraper extends BaseScraper<Formation> implements Scraper<Formation> {
  protected getScraperConfig(): ScraperConfig {
    return {
      entityName: 'formation',
      entityNamePlural: 'formations',
      def: 'adh_formations',
      sidx: 'jqGrid_adh_formations_NOMCOMPLET'
    };
  }

  protected processRow(row: ApiRow): Formation | null {
    if (this.shouldFilterRow(row)) {
      return null;
    }

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