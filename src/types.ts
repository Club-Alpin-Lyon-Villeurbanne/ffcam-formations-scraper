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

export interface Brevet {
  id: string;
  adherentId: string;  // cafnum_user dans la DB
  nom: string;         // Donnée personnelle : jamais stockée ni journalisée
  codeBrevet: string;
  intituleBrevet: string;
  dateObtention: string;
  dateRecyclage: string;
  dateEdition: string;
  dateFormationContinue: string;
  dateMigration: string;
}

export interface Competence {
  id: string;
  adherentId: string;
  nom: string;
  codeActivite: string;
  activite: string;
  intituleCompetence: string;
  niveauAssocie: string;
  dateValidation: string;
  estValide: boolean;
  validePar: string;
  commentaire: string;
}

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

export interface ApiResponse {
  page: number;
  total: number;
  records: number;
  rows: ApiRow[];
  userData?: {
    caliData?: Record<string, any>;
  };
}

export interface NiveauxMetadata {
  [id: string]: {
    _BASE_validation_qui?: string;
    _BASE_cursus_niveau_pratique_id?: string;
    [key: string]: any;
  };
}

export interface ScrapedData<T> {
  data: T[];
  metadata?: NiveauxMetadata;
}

export interface FfcamConfig {
  /** Identifiants du portail FFCAM (https://portail.ffcam.fr) */
  EMAIL: string;
  PASSWORD: string;
  /** Sous-chaîne du profil extranet à utiliser (défaut : WEBMASTER) */
  PROFILE: string;
  ROWS_PER_PAGE: number;
  API_DELAY: number;
  BASE_URL: string;
}

export interface PathsConfig {
  DATA_DIR: string;
  REPORTS_DIR: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
  connectTimeout?: number;
}

export interface DatabaseAdapter {
  connect(): Promise<void>;
  close(): Promise<void>;
  isConnected(): boolean;
  execute(sql: string, params?: any[]): Promise<[any[], any[]]>;
  getUserIdFromCafnum(cafnum: string): Promise<number | null>;
  updateLastSync(type: string, count: number): Promise<void>;
}

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
  competences: {
    total: number;
    imported: number;
    ignored: number;
    errors: number;
  };
  referentiels: {
    formations: Set<string>;
    niveaux: Set<string>;
    brevets: Set<string>;
    competences: Set<string>;
  };
}

export interface ImportReport {
  timestamp: string;
  date: string;
  mode: 'dry-run' | 'production';
  stats: {
    formations: ImportStats['formations'];
    niveaux: ImportStats['niveaux'];
    brevets: ImportStats['brevets'];
    competences: ImportStats['competences'];
    referentiels: {
      formations_count: number;
      niveaux_count: number;
      brevets_count: number;
      competences_count: number;
    };
  };
  pages_manquantes?: Record<string, number[]>;
}

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
  printCompetenceReport(dryRun?: boolean): void;
  printFinalReport(timestamp: string, dryRun?: boolean): void;
}

export interface Scraper<T> {
  scrape(): Promise<T[] | ScrapedData<T>>;
}

export interface ApiRequestParams {
  def: string;
  mode: string;
  sidx: string;
  sord: string;
  page?: number;
  rows?: number;
  [key: string]: any;
}
