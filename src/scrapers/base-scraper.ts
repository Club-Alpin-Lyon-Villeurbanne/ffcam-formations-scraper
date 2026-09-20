/**
 * Classe de base pour les scrapers
 */
import { ApiRequestParams, ApiResponse, ApiRow } from '../types';
import { FFCAM_CONFIG, isClubMember } from '../config';
import { getSessionId, resetSessionCache } from '../auth/ffcam-sso';

/**
 * Configuration pour un scraper
 */
export interface ScraperConfig {
  entityName: string;        // Ex: "formation"
  entityNamePlural: string;  // Ex: "formations"
  def: string;               // Ex: "adh_formations"
  sidx?: string;             // Optionnel, auto-généré si absent
}

/** Le sid n'est plus accepté par l'extranet (réponse HTML ou body illisible) */
export class SessionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRejectedError';
  }
}

abstract class BaseScraper<T = any> {
  protected sessionId: string;
  protected rowsPerPage: number;
  protected apiDelay: number;
  protected baseUrl: string;

  constructor() {
    this.sessionId = '';
    this.rowsPerPage = FFCAM_CONFIG.ROWS_PER_PAGE;
    this.apiDelay = FFCAM_CONFIG.API_DELAY;
    this.baseUrl = FFCAM_CONFIG.BASE_URL;
  }

  /** Obtient le sid (login SSO, une seule fois par processus) */
  protected async ensureSession(): Promise<void> {
    if (!this.sessionId) {
      this.sessionId = await getSessionId({
        email: FFCAM_CONFIG.EMAIL,
        password: FFCAM_CONFIG.PASSWORD,
        profile: FFCAM_CONFIG.PROFILE
      });
    }
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
    await this.ensureSession();
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
   * Login + page 1 avec une seule ligne : valide la session.
   * `clubCode` = col_2 de la première ligne (code du club sur les grilles compétences et niveaux).
   */
  async probe(): Promise<{ records: number; clubCode: string | null }> {
    await this.ensureSession();
    const config = this.getScraperConfig();
    const url = this.buildUrl({ def: config.def, mode: 'liste', sidx: config.sidx || `jqGrid_${config.def}_NOMCOMPLET`, sord: 'asc', page: 1, rows: 1 });
    const data = await this.fetchData(url);
    return { records: parseInt(data.records.toString(), 10), clubCode: data.rows[0]?.cell?.col_2 || null };
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
      throw new SessionRejectedError(
        "❌ Session extranet refusée (réponse HTML au lieu de JSON).\n" +
        "   Le profil extranet du compte FFCAM a peut-être changé : vérifiez FFCAM_PROFILE avec \"npm run check\"."
      );
    }

    try {
      return JSON.parse(text) as ApiResponse;
    } catch (error) {
      throw new SessionRejectedError(`Réponse invalide de l'API FFCAM`);
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
    let hasReloggedThisCall = false;

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
        if (error instanceof SessionRejectedError && !hasReloggedThisCall) {
          // Le sid a été rejeté : on se reconnecte une seule fois puis on rejoue la même page
          hasReloggedThisCall = true;
          resetSessionCache();
          this.sessionId = '';
          await this.ensureSession();
          console.log('🔁 Session extranet refusée, reconnexion…');
          continue;
        }
        // Sur la première page, une erreur est fatale (session refusée)
        if (page === 1) {
          throw error;
        }
        // Une session rejetée sur une page suivante reste fatale (pas de saut silencieux)
        if (error instanceof SessionRejectedError) {
          throw error;
        }
        // Sur les pages suivantes, une autre erreur est temporaire : on continue
        console.error(`✗ Erreur page ${page}:`, error.message);
        page++;
      }
    }

    return allData;
  }
}

export default BaseScraper;