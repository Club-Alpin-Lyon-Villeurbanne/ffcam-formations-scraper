/**
 * Scraper pour les brevets des adhérents
 */
import { Brevet, ApiRow, Scraper } from '../types';
import BaseScraper from './base-scraper';

class BrevetsScraper extends BaseScraper implements Scraper<Brevet> {
  /**
   * Récupère tous les brevets
   */
  async scrape(): Promise<Brevet[]> {
    console.log(`\n📂 Récupération des BREVETS...\n`);

    const baseParams = {
      def: 'adh_brevets',
      mode: 'liste',
      sidx: 'jqGrid_adh_brevets_NOMCOMPLET',
      sord: 'asc'
    };

    const brevets = await this.fetchAllPages(baseParams, this.processBrevet.bind(this));

    console.log(`\n✅ ${brevets.length} brevets récupérés`);
    this.displayExamples(brevets);

    return brevets;
  }

  /**
   * Traite une ligne de brevet
   */
  private processBrevet(row: ApiRow): Brevet {
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
      id: row.id,
      adherentId: row.cell.col_0,
      nom: row.cell.col_1,
      codeBrevet: row.cell.col_2,
      intituleBrevet: row.cell.col_3,
      dateObtention: this.formatDate(row.cell.col_4),
      dateRecyclage: this.formatDate(row.cell.col_5),
      dateEdition: this.formatDate(row.cell.col_6),
      dateFormationContinue: this.formatDate(row.cell.col_9),
      dateMigration: this.formatDate(row.cell.col_10)
    };
  }

  /**
   * Affiche quelques exemples de brevets
   */
  private displayExamples(brevets: Brevet[]): void {
    console.log('\n📋 Exemples de brevets récupérés:');
    brevets.slice(0, 3).forEach((b, i) => {
      console.log(`\n   ${i + 1}. ${b.nom} (CAF#${b.adherentId})`);
      console.log(`      Brevet: ${b.intituleBrevet}`);
      console.log(`      Code: ${b.codeBrevet}`);
      console.log(`      Date obtention: ${b.dateObtention}`);
    });
  }
}

export default BrevetsScraper;
