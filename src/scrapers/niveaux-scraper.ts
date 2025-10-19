/**
 * Scraper pour les niveaux de pratique
 */
import { NiveauPratique, NiveauxMetadata, ApiRow, ApiResponse, ScrapedData } from '../types';
import BaseScraper from './base-scraper';

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
    
    console.log(`\n✅ ${niveaux.length} niveaux de pratique récupérés`);
    this.displayExamples(niveaux);
    
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
  private processNiveau(row: ApiRow): NiveauPratique {
    const niveau: NiveauPratique = {
      id: row.id,
      adherentId: row.cell.col_0,
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
  
  /**
   * Affiche quelques exemples de niveaux
   */
  private displayExamples(niveaux: NiveauPratique[]): void {
    console.log('\n📋 Exemples de niveaux récupérés:');
    niveaux.slice(0, 3).forEach((n, i) => {
      console.log(`\n   ${i + 1}. ${n.nom} (CAF#${n.adherentId})`);
      console.log(`      Activité: ${n.activite} (${n.codeActivite})`);
      console.log(`      Niveau: ${n.niveau}`);
      console.log(`      Date: ${n.dateValidation}`);
      if (n.validationPar) console.log(`      Validé par: ${n.validationPar}`);
    });
  }
}

export default NiveauxScraper;