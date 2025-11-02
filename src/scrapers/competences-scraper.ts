/**
 * Scraper pour les compétences (groupes de compétences)
 */
import { Competence, ApiRow, Scraper } from '../types';
import BaseScraper, { ScraperConfig } from './base-scraper';

class CompetencesScraper extends BaseScraper<Competence> implements Scraper<Competence> {
  /**
   * Configuration du scraper
   */
  protected getScraperConfig(): ScraperConfig {
    return {
      entityName: 'compétence',
      entityNamePlural: 'compétences',
      def: 'adh_groupe_competence',
      sidx: 'jqGrid_adh_groupe_competence_nom_complet'
    };
  }

  /**
   * Traite une ligne de compétence
   */
  protected processRow(row: ApiRow): Competence | null {
    if (this.shouldFilterRow(row)) {
      return null;
    }

    // Structure attendue:
    // col_0: Numéro adhérent (cafnum)
    // col_1: Nom complet
    // col_2: Code structure (6900)
    // col_3: ? (vide)
    // col_4: Code activité (ES, AL, etc.)
    // col_5: Nom activité (ESCALADE, etc.)
    // col_6: Intitulé de la compétence
    // col_7: Niveau associé (ex: "INITIE en escalade sur SAE")
    // col_8: Date de validation
    // col_9: Statut HTML (à parser)
    // col_10: Validé par
    // col_11: Commentaire
    // col_12: ? (souvent vide)

    return {
      ...this.extractCommonFields(row),
      codeActivite: row.cell.col_4 || '',
      activite: row.cell.col_5 || '',
      intituleCompetence: row.cell.col_6,
      niveauAssocie: row.cell.col_7 || '',
      dateValidation: this.formatDate(row.cell.col_8),
      estValide: this.parseValidationStatus(row.cell.col_9),
      validePar: row.cell.col_10,
      commentaire: row.cell.col_11 || ''
    };
  }

  /**
   * Parse le statut de validation depuis le HTML
   * text-vert + fa-circle = validé (true)
   * text-rouge + fa-square = non validé (false)
   */
  private parseValidationStatus(html: string): boolean {
    if (!html) return false;
    return html.includes('text-vert') && html.includes('fa-circle');
  }
}

export default CompetencesScraper;
