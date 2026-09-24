import { NiveauPratique, NiveauxMetadata, ApiRow, ApiResponse, ScrapedData } from '../types';
import BaseScraper, { ScraperConfig } from './base-scraper';

class NiveauxScraper extends BaseScraper<NiveauPratique> {
  private metadata: NiveauxMetadata = {};

  constructor() {
    super();
    this.metadata = {};
  }

  protected getScraperConfig(): ScraperConfig {
    return {
      entityName: 'niveau de pratique',
      entityNamePlural: 'niveaux de pratique',
      def: 'adh_niveaux_pratique',
      sidx: 'jqGrid_adh_niveaux_pratique_nom_complet'
    };
  }

  async scrape(): Promise<ScrapedData<NiveauPratique>> {
    this.metadata = {};

    const data = await super.scrape();

    return {
      data,
      metadata: this.metadata
    };
  }

  protected onDataFetched(data: ApiResponse): void {
    if (data.userData?.caliData) {
      Object.assign(this.metadata, data.userData.caliData);
    }
  }

  protected processRow(row: ApiRow): NiveauPratique | null {
    if (this.shouldFilterRow(row)) {
      return null;
    }

    const niveau: NiveauPratique = {
      ...this.extractCommonFields(row),
      club: row.cell.col_2,
      codeActivite: row.cell.col_4,
      activite: row.cell.col_5,
      niveau: row.cell.col_6,
      dateValidation: row.cell.col_7,
      validationPar: ''
    };

    const userData = this.metadata[row.id];
    if (userData) {
      niveau.validationPar = userData._BASE_validation_qui || '';
    }

    return niveau;
  }
}

export default NiveauxScraper;