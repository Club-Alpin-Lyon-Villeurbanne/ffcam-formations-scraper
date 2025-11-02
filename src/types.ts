/**
 * Type definitions for the FFCAM formations scraper
 * Following KISS principle - simple, clear interfaces
 */

// =============================================================================
// Core Data Structures
// =============================================================================

/**
 * Formation (training) record from FFCAM
 */
export interface Formation {
  id: string;
  adherentId: string;
  nom: string;
  codeFormation: string;
  intituleFormation: string;
  lieuFormation: string;
  dateDebutFormation: string;
  dateFinFormation: string;
  dateValidation: string;
  numeroFormation: string;
  formateur: string;
  idInterne: string;
}

/**
 * Niveau de pratique (skill level) record from FFCAM
 */
export interface NiveauPratique {
  id: string;
  adherentId: string;
  nom: string;
  club: string;
  codeActivite: string;
  activite: string;
  niveau: string;
  dateValidation: string;
  validationPar: string;
  discipline?: string;
}

/**
 * Brevet record from FFCAM
 */
export interface Brevet {
  id: string;
  adherentId: string;  // cafnum_user dans la DB
  nom: string;         // Utilisé seulement pour l'affichage, pas stocké en DB
  codeBrevet: string;
  intituleBrevet: string;
  dateObtention: string;
  dateRecyclage: string;
  dateEdition: string;
  dateFormationContinue: string;
  dateMigration: string;
}

// Types de compétences supprimés (non utilisés dans le nouveau schéma)

/**
 * Raw row from FFCAM API response
 */
export interface ApiRow {
  id: string;
  cell: {
    col_0: string;
    col_1: string;
    col_2: string;
    col_3: string;
    col_4: string;
    col_5: string;
    col_6: string;
    col_7: string;
    col_8: string;
    [key: string]: string;
  };
}

/**
 * FFCAM API response structure
 */
export interface ApiResponse {
  page: number;
  total: number;
  records: number;
  rows: ApiRow[];
  userData?: {
    caliData?: Record<string, any>;
  };
}

/**
 * Metadata for niveaux de pratique
 */
export interface NiveauxMetadata {
  [id: string]: {
    _BASE_validation_qui?: string;
    _BASE_cursus_niveau_pratique_id?: string;
    [key: string]: any;
  };
}

/**
 * Scraper result with data and optional metadata
 */
export interface ScrapedData<T> {
  data: T[];
  metadata?: NiveauxMetadata;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * FFCAM configuration
 */
export interface FfcamConfig {
  SESSION_ID: string;
  ROWS_PER_PAGE: number;
  API_DELAY: number;
  BASE_URL: string;
}

/**
 * Application paths configuration
 */
export interface PathsConfig {
  DATA_DIR: string;
  REPORTS_DIR: string;
}

/**
 * Database configuration for MySQL
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
}

// =============================================================================
// Database Adapter Interface
// =============================================================================

/**
 * Database query result (matches mysql2 format)
 */
export interface QueryResult {
  affectedRows?: number;
  insertId?: number;
  [key: string]: any;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
  execute(sql: string, params?: any[]): Promise<[any[], any[]]>;
  getUserIdFromCafnum(cafnum: string): Promise<number | null>;
  updateLastSync(type: string, count: number): Promise<void>;
}

// =============================================================================
// Import/Export Types
// =============================================================================

/**
 * Import statistics
 */
export interface ImportStats {
  formations: {
    total: number;
    imported: number;
    ignored: number;
    errors: number;
    sans_numero: number;
    sans_formateur: number;
    sans_lieu: number;
    sans_dates: number;
  };
  niveaux: {
    total: number;
    imported: number;
    ignored: number;
    errors: number;
    sans_cursus_id: number;
  };
  brevets: {
    total: number;
    imported: number;
    ignored: number;
    errors: number;
    sans_code: number;
    sans_date_obtention: number;
  };
  referentiels: {
    formations: Set<string>;
    niveaux: Set<string>;
    brevets: Set<string>;
  };
}

/**
 * Import report structure
 */
export interface ImportReport {
  timestamp: string;
  date: string;
  mode: 'dry-run' | 'production';
  stats: {
    formations: Omit<ImportStats['formations'], 'errors'>;
    niveaux: Omit<ImportStats['niveaux'], 'errors'>;
    brevets: Omit<ImportStats['brevets'], 'errors'>;
    referentiels: {
      formations_count: number;
      niveaux_count: number;
      brevets_count: number;
    };
  };
}

/**
 * Logger interface for tracking import progress
 */
export interface Logger {
  stats: ImportStats;
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
  progress(current: number, total: number): void;
  section(title: string): void;
  separator(): void;
  logFormationIssue(formation: Formation, issue: string): void;
  logNiveauIssue(niveau: NiveauPratique, issue: string): void;
  logBrevetIssue(brevet: Brevet, issue: string): void;
  printFormationReport(dryRun?: boolean): void;
  printNiveauReport(dryRun?: boolean): void;
  printBrevetReport(dryRun?: boolean): void;
  printFinalReport(timestamp: string, dryRun?: boolean): void;
}

// =============================================================================
// Scraper Types
// =============================================================================

/**
 * Base scraper interface
 */
export interface Scraper<T> {
  scrape(): Promise<T[] | ScrapedData<T>>;
}

/**
 * Request parameters for FFCAM API
 */
export interface ApiRequestParams {
  def: string;
  mode: string;
  sidx: string;
  sord: string;
  page?: number;
  rows?: number;
  [key: string]: any;
}

// =============================================================================
// File Manager Types
// =============================================================================

/**
 * File save options
 */
export interface SaveDataOptions {
  type: 'formations' | 'niveaux_pratique' | 'brevets';
  data: Formation[] | NiveauPratique[] | Brevet[];
  metadata?: NiveauxMetadata;
}

/**
 * Data loading result
 */
export type LoadedData = Formation[] | NiveauPratique[] | Brevet[] | NiveauxMetadata;

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Promise-based timeout function
 */
export type DelayFunction = (ms: number) => Promise<void>;

/**
 * Environment variables type
 */
export interface EnvironmentVariables {
  MYSQL_ADDON_HOST?: string;
  MYSQL_ADDON_PORT?: string;
  MYSQL_ADDON_USER?: string;
  MYSQL_ADDON_PASSWORD?: string;
  MYSQL_ADDON_DB?: string;
  [key: string]: string | undefined;
}

/**
 * Command line argument parsing result
 */
export interface ParsedArgs {
  dryRun: boolean;
  forceSqlite: boolean;
  forceMySQL: boolean;
}