/**
 * Classe de base pour les scrapers
 */
import { ApiRequestParams, ApiResponse, ApiRow } from '../types';
import { FFCAM_CONFIG, isClubMember } from '../config';

/**
 * Configuration pour un scraper
 */
export interface ScraperConfig {
  entityName: string;        // Ex: "formation"
  entityNamePlural: string;  // Ex: "formations"
  def: string;               // Ex: "adh_formations"
  sidx?: string;             // Optionnel, auto-généré si absent
}

abstract class BaseScraper<T = any> {
  protected sessionId: string;
  protected rowsPerPage: number;
  protected apiDelay: number;
  protected baseUrl: string;

  constructor() {
    this.sessionId = FFCAM_CONFIG.SESSION_ID;
    this.rowsPerPage = FFCAM_CONFIG.ROWS_PER_PAGE;
    this.apiDelay = FFCAM_CONFIG.API_DELAY;
    this.baseUrl = FFCAM_CONFIG.BASE_URL;
  }

  /**
   * Configuration du scraper (à implémenter dans chaque sous-classe)
   */
  protected abstract getScraperConfig(): ScraperConfig;

  /**
   * Traite une ligne de l'API (à implémenter dans chaque sous-classe)
   */
  protected abstract processRow(row: ApiRow): T | null;

  /**
   * Méthode principale de scraping (template method)
   * Peut être surchargée par les sous-classes pour retourner des données enrichies
   */
  async scrape(): Promise<T[] | any> {
    const config = this.getScraperConfig();
    console.log(`\n📂 Récupération des ${config.entityNamePlural.toUpperCase()}...\n`);

    const baseParams = {
      def: config.def,
      mode: 'liste',
      sidx: config.sidx || `jqGrid_${config.def}_NOMCOMPLET`,
      sord: 'asc'
    };

    const results = await this.fetchAllPages(baseParams, this.processRow.bind(this));

    console.log(`\n✅ ${results.length} ${config.entityName} récupérés\n`);

    return results;
  }

  /**
   * Construit l'URL avec les paramètres
   */
  protected buildUrl(params: ApiRequestParams): string {
    const allParams: Record<string, string> = {
      sid: this.sessionId,
      _search: 'false',
      rows: this.rowsPerPage.toString(),
      ...Object.fromEntries(
        Object.entries(params).map(([key, value]) => [key, value.toString()])
      )
    };
    const searchParams = new URLSearchParams(allParams);
    return `${this.baseUrl}?${searchParams}`;
  }

  /**
   * Effectue une requête HTTP
   */
  protected async fetchData(url: string): Promise<ApiResponse> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    // Vérifier si la réponse est bien du JSON
    const text = await response.text();
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(
        '❌ SESSION_ID expiré ou invalide !\n\n' +
        '👉 Pour renouveler votre session :\n' +
        '   1. Connectez-vous à l\'extranet FFCAM\n' +
        '   2. Copiez le paramètre "sid" dans l\'URL\n' +
        '      Exemple: https://extranet-clubalpin.com/...?sid=VOTRE_SESSION_ID\n' +
        '   3. Mettez à jour FFCAM_SESSION_ID dans votre .env'
      );
    }

    try {
      return JSON.parse(text) as ApiResponse;
    } catch (error) {
      throw new Error(`Réponse invalide de l'API FFCAM`);
    }
  }

  /**
   * Attend avant la prochaine requête
   */
  protected async delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.apiDelay));
  }

  /**
   * Formate une date au format YYYY-MM-DD
   * Gère les formats DD/MM/YYYY et YYYY-MM-DD
   */
  protected formatDate(dateStr: string): string {
    if (!dateStr) return '';

    // Ignorer les dates invalides
    if (dateStr === '0000-00-00') return '';

    // Si déjà au bon format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return dateStr;
    }

    // Format DD/MM/YYYY vers YYYY-MM-DD
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    return dateStr;
  }

  /**
   * Extrait les champs communs à tous les types d'entités
   */
  protected extractCommonFields(row: ApiRow): {
    id: string;
    adherentId: string;
    nom: string;
  } {
    return {
      id: row.id,
      adherentId: row.cell.col_0,
      nom: row.cell.col_1
    };
  }

  /**
   * Vérifie si une ligne doit être filtrée (adhérent hors club)
   */
  protected shouldFilterRow(row: ApiRow): boolean {
    const cafnum = row.cell.col_0;
    return !isClubMember(cafnum);
  }

  /**
   * Hook appelé après chaque récupération de données
   * Peut être surchargé par les sous-classes pour traiter les métadonnées
   */
  protected onDataFetched(_data: ApiResponse): void {
    // Default: do nothing
  }

  /**
   * Récupère toutes les pages de données
   */
  protected async fetchAllPages<T>(
    baseParams: Omit<ApiRequestParams, 'page'>,
    processRow: (row: ApiRow) => T | null
  ): Promise<T[]> {
    const allData: T[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      try {
        const url = this.buildUrl({ ...baseParams, page } as ApiRequestParams);
        const data = await this.fetchData(url);

        // Appeler le hook pour traiter les métadonnées
        this.onDataFetched(data);

        if (page === 1) {
          totalPages = parseInt(data.total.toString());
          console.log(`📊 ${data.records} enregistrements sur ${totalPages} pages\n`);
        }
        
        // Traiter chaque ligne
        for (const row of data.rows) {
          const processedData = processRow(row);
          if (processedData) {
            allData.push(processedData);
          }
        }
        
        console.log(`✓ Page ${page}/${totalPages} (${allData.length} enregistrements)`);
        page++;
        
        // Délai entre les pages
        if (page <= totalPages) {
          await this.delay();
        }
        
      } catch (error: any) {
        // Sur la première page, une erreur est fatale (SESSION_ID expiré)
        if (page === 1) {
          throw error;
        }
        // Sur les pages suivantes, on continue (erreur temporaire possible)
        console.error(`✗ Erreur page ${page}:`, error.message);
        page++;
      }
    }
    
    return allData;
  }
}

export default BaseScraper;