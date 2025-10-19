/**
 * Scraper pour les formations validées
 */
import { Formation, ApiRow, Scraper } from '../types';
import BaseScraper from './base-scraper';

class FormationsScraper extends BaseScraper implements Scraper<Formation> {
  /**
   * Récupère toutes les formations
   */
  async scrape(): Promise<Formation[]> {
    console.log(`\n📂 Récupération des FORMATIONS...\n`);
    
    const baseParams = {
      def: 'adh_formations',
      mode: 'liste',
      sidx: 'jqGrid_adh_formations_NOMCOMPLET',
      sord: 'asc'
    };
    
    const formations = await this.fetchAllPages(baseParams, this.processFormation.bind(this));
    
    console.log(`\n✅ ${formations.length} formations récupérées`);
    this.displayExamples(formations);
    
    return formations;
  }
  
  /**
   * Traite une ligne de formation
   */
  private processFormation(row: ApiRow): Formation {
    // Structure attendue:
    // col_7: Lieu de formation
    // col_9: Date début formation
    // col_10: Date fin formation
    return {
      id: row.id,
      adherentId: row.cell.col_0,
      nom: row.cell.col_1,
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
  
  /**
   * Affiche quelques exemples de formations
   */
  private displayExamples(formations: Formation[]): void {
    console.log('\n📋 Exemples de formations récupérées:');
    formations.slice(0, 3).forEach((f, i) => {
      console.log(`\n   ${i + 1}. ${f.nom} (CAF#${f.adherentId})`);
      console.log(`      Formation: ${f.intituleFormation}`);
      console.log(`      Code: ${f.codeFormation}`);
      console.log(`      Date validation: ${f.dateValidation}`);
      console.log(`      Date début: ${f.dateDebutFormation || 'VIDE'}`);
      console.log(`      Date fin: ${f.dateFinFormation || 'VIDE'}`);
      console.log(`      Lieu: ${f.lieuFormation || 'VIDE'}`);
    });
  }
}

export default FormationsScraper;