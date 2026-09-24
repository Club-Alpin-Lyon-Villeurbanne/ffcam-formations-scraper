import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { FfcamConfig, PathsConfig, DatabaseConfig, ImportReport } from './types';

const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : process.env.NODE_ENV === 'staging'
    ? '.env.staging'
    : '.env';
dotenv.config({ path: envFile });

export const FFCAM_CONFIG: FfcamConfig = {
  EMAIL: process.env.FFCAM_EMAIL || '',
  PASSWORD: process.env.FFCAM_PASSWORD || '',
  PROFILE: process.env.FFCAM_PROFILE || 'WEBMASTER',
  ROWS_PER_PAGE: 150,
  API_DELAY: 300, // Délai entre les requêtes en ms
  BASE_URL: 'https://extranet-clubalpin.com/app/ActivitesFormations/jx_jqGrid.php'
};

/**
 * Code FFCAM du club (4 chiffres), ex. 6900 pour Lyon-Villeurbanne.
 * Un cafnum = code club (4) + année (4) + numéro (4) : le code sert à ne garder
 * que les adhérents du club dans les grilles nationales (brevets, formations).
 * Lu à l'appel (et non à l'import) pour rester testable.
 */
export function getClubCode(code: string | undefined = process.env.CLUB_CODE): string {
  const trimmed = (code || '').trim();
  if (!/^\d{4}$/.test(trimmed)) {
    throw new Error(`Variable CLUB_CODE non définie ou invalide ("${trimmed}") : 4 chiffres attendus, ex. CLUB_CODE=6900`);
  }
  return trimmed;
}

export function isClubMember(cafnum: string, clubCode: string = getClubCode()): boolean {
  return Boolean(cafnum) && cafnum.startsWith(clubCode);
}

/**
 * Dossier config/clubs/<club> ; l'identifiant vient de la variable CLUB
 * (ex. "lyon", "chambery"), lue à l'appel pour rester testable.
 * Pas de valeur par défaut : on refuse de charger le mapping d'un autre club.
 */
export function getClubConfigDir(club: string | undefined = process.env.CLUB?.trim()): string {
  if (!club) {
    throw new Error('Variable CLUB non définie (ex. CLUB=lyon dans .env) : elle sélectionne config/clubs/<club>/');
  }
  return path.resolve(__dirname, '../config/clubs', club);
}

export const PATHS: PathsConfig = {
  DATA_DIR: './data',
  REPORTS_DIR: './data/reports'
};

export const dbConfig: DatabaseConfig = {
  host: process.env.MYSQL_ADDON_HOST!,
  port: parseInt(process.env.MYSQL_ADDON_PORT || '3306', 10),
  user: process.env.MYSQL_ADDON_USER!,
  password: process.env.MYSQL_ADDON_PASSWORD!,
  database: process.env.MYSQL_ADDON_DB!,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000,
};


export function ensureDirectories(): void {
  Object.values(PATHS).forEach((dir: string) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function saveImportReport(report: ImportReport, timestamp: string): string {
  const reportPath = path.join(PATHS.REPORTS_DIR, `import_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}
