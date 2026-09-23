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

/** Le sid n'est plus accepté par l'extranet (réponse HTML au lieu de JSON) */
export class SessionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionRejectedError';
  }
}

/** Body de réponse illisible (ni HTML, ni JSON valide) : peut être transitoire (ex. 503) */
export class InvalidResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidResponseError';
  }
}

abstract class BaseScraper<T = any> {
  protected sessionId: string;
  protected rowsPerPage: number;
  protected apiDelay: number;
  protected baseUrl: string;
  /** Délais avant chaque réessai d'une page en erreur (ms) */
  protected retryDelays = [1000, 2000, 4000];
  /** Pages abandonnées après épuisement des réessais, réinitialisé à chaque fetchAllPages */
  public missingPages: number[] = [];
  public totalPages = 1;

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
    if (this.missingPages.length > 0) {
      console.log(`⚠️ ${this.missingPages.length} page(s) manquante(s) sur ${this.totalPages} : ${this.missingPages.join(', ')}`);
    }

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
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
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
      throw new InvalidResponseError(`Réponse invalide de l'API FFCAM`);
    }
  }

  /**
   * Attend avant la prochaine requête
   */
  protected async delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.apiDelay));
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
   * Une erreur HTTP 4xx est définitive (page inexistante, requête rejetée) : pas de réessai,
   * sauf 408 (timeout serveur) et 429 (rate limiting), pour lesquels le backoff a justement du sens.
   * Réseau, timeout (`AbortSignal.timeout`) et body illisible sont aussi considérés transitoires.
   */
  protected isRetryable(error: any): boolean {
    const httpStatus = /^Erreur HTTP: (\d+)$/.exec(error?.message ?? '');
    if (httpStatus) {
      const status = parseInt(httpStatus[1], 10);
      return status >= 500 || status === 408 || status === 429;
    }
    return true;
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
    this.totalPages = 1;
    this.missingPages = [];
    let reloginCount = 0;
    const maxRelogins = 2;
    let attempt = 0;
    const maxAttempts = this.retryDelays.length + 1; // 1 essai initial + les réessais

    while (page <= this.totalPages) {
      try {
        const url = this.buildUrl({ ...baseParams, page } as ApiRequestParams);
        const data = await this.fetchData(url);

        // Appeler le hook pour traiter les métadonnées
        this.onDataFetched(data);

        if (page === 1) {
          this.totalPages = parseInt(data.total.toString());
          console.log(`📊 ${data.records} enregistrements sur ${this.totalPages} pages\n`);
        }

        // Traiter chaque ligne dans un tableau local : si une ligne échoue, la page est
        // rejouée en entier sans que les lignes déjà traitées ne soient conservées
        const pageData: T[] = [];
        for (const row of data.rows) {
          const processedData = processRow(row);
          if (processedData) {
            pageData.push(processedData);
          }
        }
        allData.push(...pageData);

        console.log(`✓ Page ${page}/${this.totalPages} (${allData.length} enregistrements)`);
        attempt = 0;
        page++;

        // Délai entre les pages
        if (page <= this.totalPages) {
          await this.delay();
        }

      } catch (error: any) {
        const isSessionRejected = error instanceof SessionRejectedError;
        const isInvalidResponse = error instanceof InvalidResponseError;

        if ((isSessionRejected || isInvalidResponse) && reloginCount < maxRelogins) {
          // Le sid a peut-être été rejeté : on se reconnecte (jusqu'à maxRelogins fois par appel) puis on rejoue la même page
          reloginCount++;
          resetSessionCache();
          this.sessionId = '';
          await this.ensureSession();
          console.log('🔁 Session extranet refusée, reconnexion…');
          continue;
        }

        if (isSessionRejected) {
          // Le budget de reconnexions de cet appel est épuisé : le sid reste invalide, inutile de réessayer
          throw error;
        }

        const cause = error.cause?.code ?? error.message;

        if (this.isRetryable(error) && attempt < this.retryDelays.length) {
          const delai = this.retryDelays[attempt] / 1000;
          console.error(`↻ Page ${page} : essai ${attempt + 2}/${maxAttempts} dans ${delai}s (${cause})`);
          await this.sleep(this.retryDelays[attempt]);
          attempt++;
          continue;
        }

        if (page === 1) {
          // Sans la page 1, on ne connaît même pas totalPages : rien n'est récupérable pour ce type
          throw new Error(`Page 1 injoignable après ${maxAttempts} tentatives (${cause}) : ${this.getScraperConfig().entityNamePlural} non récupérés`, { cause: error });
        }

        console.error(`✗ Page ${page} abandonnée après ${maxAttempts} tentatives (${cause})`);
        this.missingPages.push(page);
        attempt = 0;
        page++;

        // Délai avant la page suivante, comme sur le chemin de succès
        if (page <= this.totalPages) {
          await this.delay();
        }
      }
    }

    return allData;
  }
}

export default BaseScraper;