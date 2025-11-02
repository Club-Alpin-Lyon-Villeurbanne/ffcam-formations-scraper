/**
 * Scraper pour les niveaux de pratique
 */
import { NiveauPratique, NiveauxMetadata, ApiRow, ApiResponse, ScrapedData } from '../types';
import BaseScraper from './base-scraper';
import { isClubMember } from '../config';

class NiveauxScraper extends BaseScraper {
  private metadata: NiveauxMetadata = {};

  constructor() {
    super();
    this.metadata = {};
  }
  
  /**
   * Récupère tous les niveaux de pratique
   */
  async scrape(): Promise<ScrapedData<NiveauPratique>> {
    console.log(`\n📂 Récupération des NIVEAUX DE PRATIQUE...\n`);
    
    const baseParams = {
      def: 'adh_niveaux_pratique',
      mode: 'liste',
      sidx: 'jqGrid_adh_niveaux_pratique_nom_complet',
      sord: 'asc'
    };
    
    // Réinitialiser les métadonnées
    this.metadata = {};
    
    const niveaux = await this.fetchAllPages(baseParams, (row: ApiRow) => this.processNiveau(row));

    console.log(`\n✅ ${niveaux.length} niveaux de pratique récupérés\n`);

    return {
      data: niveaux,
      metadata: this.metadata
    };
  }
  
  /**
   * Effectue une requête et capture les métadonnées
   */
  protected async fetchData(url: string): Promise<ApiResponse> {
    const data = await super.fetchData(url);
    
    // Capturer les métadonnées si présentes
    if (data.userData && data.userData.caliData) {
      Object.assign(this.metadata, data.userData.caliData);
    }
    
    return data;
  }
  
  /**
   * Traite une ligne de niveau
   */
  private processNiveau(row: ApiRow): NiveauPratique | null {
    const cafnum = row.cell.col_0;

    // Filtrer : ne garder que les adhérents du club
    if (!isClubMember(cafnum)) {
      return null;
    }

    const niveau: NiveauPratique = {
      id: row.id,
      adherentId: cafnum,
      nom: row.cell.col_1,
      club: row.cell.col_2,
      codeActivite: row.cell.col_4,
      activite: row.cell.col_5,
      niveau: row.cell.col_6,
      dateValidation: row.cell.col_7,
      validationPar: ''
    };

    // Enrichir avec les métadonnées si disponibles
    const userData = this.metadata[row.id];
    if (userData) {
      niveau.validationPar = userData._BASE_validation_qui || '';
    }

    return niveau;
  }
}

export default NiveauxScraper;