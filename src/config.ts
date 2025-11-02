/**
 * Configuration globale et utilitaires
 * Fusion de config/constants.ts, config/database.ts et utils/file-manager.ts
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { FfcamConfig, PathsConfig, DatabaseConfig, ImportReport } from './types';

// Charger les variables d'environnement
dotenv.config();

// =============================================================================
// Configuration FFCAM
// =============================================================================

export const FFCAM_CONFIG: FfcamConfig = {
  SESSION_ID: process.env.FFCAM_SESSION_ID || '',
  ROWS_PER_PAGE: 150,
  API_DELAY: 300, // Délai entre les requêtes en ms
  BASE_URL: 'https://extranet-clubalpin.com/app/ActivitesFormations/jx_jqGrid.php'
};

// =============================================================================
// Configuration du club
// =============================================================================

/**
 * Préfixes des numéros CAF du club de Lyon
 * Format: 69002XXXXXXX (département 69, structure 002)
 */
export const CLUB_CAFNUM_PREFIXES = ['6900', '690'];

/**
 * Vérifie si un cafnum appartient au club de Lyon
 */
export function isClubMember(cafnum: string): boolean {
  if (!cafnum) return false;
  return CLUB_CAFNUM_PREFIXES.some(prefix => cafnum.startsWith(prefix));
}

// =============================================================================
// Chemins des dossiers
// =============================================================================

export const PATHS: PathsConfig = {
  DATA_DIR: './data',
  REPORTS_DIR: './data/reports'
};

// =============================================================================
// Configuration MySQL
// =============================================================================

export const dbConfig: DatabaseConfig = {
  host: process.env.MYSQL_ADDON_HOST!,
  port: parseInt(process.env.MYSQL_ADDON_PORT || '3306', 10),
  user: process.env.MYSQL_ADDON_USER!,
  password: process.env.MYSQL_ADDON_PASSWORD!,
  database: process.env.MYSQL_ADDON_DB!,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

export default dbConfig;

// =============================================================================
// File Manager Utilities
// =============================================================================

/**
 * S'assure que les dossiers nécessaires existent
 */
export function ensureDirectories(): void {
  Object.values(PATHS).forEach((dir: string) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

/**
 * Sauvegarde un rapport d'import
 */
export function saveImportReport(report: ImportReport, timestamp: string): string {
  const reportPath = path.join(PATHS.REPORTS_DIR, `import_${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}
