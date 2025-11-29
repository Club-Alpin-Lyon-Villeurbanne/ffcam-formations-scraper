#!/usr/bin/env node
/**
 * Script d'import FFCAM → DB
 * Scrape les données depuis l'extranet FFCAM et les importe en base
 *
 * Utilisation:
 *   npm run import                    # Import complet (tout)
 *   npm run import:formations         # Import formations uniquement
 *   npm run import:brevets            # Import brevets uniquement
 *   npm run import:niveaux            # Import niveaux uniquement
 *   npm run import:competences        # Import compétences uniquement
 *   npm run import -- --dry-run       # Mode test sans écrire en DB
 */

import { Formation, Brevet, NiveauPratique, Competence, ScrapedData, DatabaseAdapter, Logger as LoggerType, ImportReport } from './types';
import FormationsScraper from './scrapers/formations-scraper';
import BrevetsScraper from './scrapers/brevets-scraper';
import NiveauxScraper from './scrapers/niveaux-scraper';
import CompetencesScraper from './scrapers/competences-scraper';
import FormationsImporter from './importers/formations-importer';
import BrevetsImporter from './importers/brevets-importer';
import NiveauxImporter from './importers/niveaux-importer';
import CompetencesImporter from './importers/competences-importer';
import { getDatabase } from './database/db-factory';
import { CommissionLinker } from './services/commission-linker';
import Logger from './utils/logger';
import { ensureDirectories, saveImportReport, FFCAM_CONFIG } from './config';

// Types d'import disponibles
type ImportType = 'formations' | 'brevets' | 'niveaux' | 'competences';
const ALL_TYPES: ImportType[] = ['formations', 'brevets', 'niveaux', 'competences'];

// Parse les arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Déterminer quels types importer
function getTypesToImport(): ImportType[] {
  // Chercher --type=xxx ou --only=xxx
  const typeArg = args.find(a => a.startsWith('--type=') || a.startsWith('--only='));
  if (typeArg) {
    const types = typeArg.split('=')[1].split(',') as ImportType[];
    return types.filter(t => ALL_TYPES.includes(t));
  }

  // Chercher des flags individuels
  const selectedTypes: ImportType[] = [];
  if (args.includes('--formations')) selectedTypes.push('formations');
  if (args.includes('--brevets')) selectedTypes.push('brevets');
  if (args.includes('--niveaux')) selectedTypes.push('niveaux');
  if (args.includes('--competences')) selectedTypes.push('competences');

  // Si aucun type spécifié, tout importer
  return selectedTypes.length > 0 ? selectedTypes : ALL_TYPES;
}

const TYPES_TO_IMPORT = getTypesToImport();

/**
 * Import des formations
 */
async function importFormations(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<void> {
  const scraper = new FormationsScraper();
  const formations: Formation[] = await scraper.scrape();

  const importer = new FormationsImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(formations);
}

/**
 * Import des brevets
 */
async function importBrevets(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<void> {
  const scraper = new BrevetsScraper();
  const brevets: Brevet[] = await scraper.scrape();

  const importer = new BrevetsImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(brevets);
}

/**
 * Import des niveaux de pratique
 */
async function importNiveaux(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<void> {
  const scraper = new NiveauxScraper();
  const { data: niveaux, metadata }: ScrapedData<NiveauPratique> = await scraper.scrape();

  const importer = new NiveauxImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(niveaux, metadata || {});
}

/**
 * Import des compétences
 */
async function importCompetences(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<void> {
  const scraper = new CompetencesScraper();
  const competences: Competence[] = await scraper.scrape();

  const importer = new CompetencesImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(competences);
}

/**
 * Pause entre les imports
 */
async function pause(seconds: number = 2): Promise<void> {
  console.log(`\n⏳ Pause de ${seconds} secondes...\n`);
  await new Promise<void>(r => setTimeout(r, seconds * 1000));
}

/**
 * Fonction principale d'import
 */
async function main(): Promise<void> {
  const typesLabel = TYPES_TO_IMPORT.length === ALL_TYPES.length
    ? 'COMPLET'
    : TYPES_TO_IMPORT.join(', ').toUpperCase();

  console.log(`🏔️  IMPORT FFCAM → BASE DE DONNÉES [${typesLabel}]\n`);

  // Vérifier que le SESSION_ID est configuré
  if (!FFCAM_CONFIG.SESSION_ID) {
    console.error('❌ SESSION_ID non configuré !');
    console.error('');
    console.error('👉 Pour obtenir votre session ID :');
    console.error('   1. Connectez-vous à l\'extranet FFCAM');
    console.error('   2. Copiez le paramètre "sid" dans l\'URL');
    console.error('      Exemple: https://extranet-clubalpin.com/...?sid=VOTRE_SESSION_ID');
    console.error('');
    console.error('👉 Ajoutez-le dans votre fichier .env :');
    console.error('   FFCAM_SESSION_ID=votre_session_id');
    process.exit(1);
  }

  console.log('Session ID:', FFCAM_CONFIG.SESSION_ID);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  console.log('Timestamp:', timestamp);
  console.log('Types:', TYPES_TO_IMPORT.join(', '));

  if (DRY_RUN) {
    console.log('🔍 MODE DRY-RUN - Aucune donnée ne sera importée');
  }
  console.log('=====================================\n');

  // S'assurer que les dossiers existent
  ensureDirectories();

  const logger: LoggerType = new Logger();
  const db: DatabaseAdapter = getDatabase();
  const commissionLinker = new CommissionLinker(db, DRY_RUN);

  try {
    // Connexion DB (seulement si pas dry-run)
    if (!DRY_RUN) {
      await db.connect();
    }

    // Import selon les types sélectionnés
    let isFirst = true;

    if (TYPES_TO_IMPORT.includes('formations')) {
      if (!isFirst) await pause();
      isFirst = false;
      await importFormations(db, logger, commissionLinker);
    }

    if (TYPES_TO_IMPORT.includes('brevets')) {
      if (!isFirst) await pause();
      isFirst = false;
      await importBrevets(db, logger, commissionLinker);
    }

    if (TYPES_TO_IMPORT.includes('niveaux')) {
      if (!isFirst) await pause();
      isFirst = false;
      await importNiveaux(db, logger, commissionLinker);
    }

    if (TYPES_TO_IMPORT.includes('competences')) {
      if (!isFirst) await pause();
      isFirst = false;
      await importCompetences(db, logger, commissionLinker);
    }

    // Mise à jour du tracking de sync
    if (!DRY_RUN && db.isConnected()) {
      if (TYPES_TO_IMPORT.includes('formations')) {
        await db.updateLastSync('formations', logger.stats.formations.imported);
      }
      if (TYPES_TO_IMPORT.includes('brevets')) {
        await db.updateLastSync('brevets', logger.stats.brevets.imported);
      }
      if (TYPES_TO_IMPORT.includes('niveaux')) {
        await db.updateLastSync('niveaux_pratique', logger.stats.niveaux.imported);
      }
      if (TYPES_TO_IMPORT.includes('competences')) {
        await db.updateLastSync('competences', logger.stats.competences.imported);
      }
    }

    // Afficher le rapport final
    logger.printFinalReport(timestamp, DRY_RUN);

    // Sauvegarder le rapport
    const rapport: ImportReport = {
      timestamp,
      date: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'production',
      stats: {
        formations: {
          total: logger.stats.formations.total,
          imported: logger.stats.formations.imported,
          ignored: logger.stats.formations.ignored,
          sans_numero: logger.stats.formations.sans_numero,
          sans_formateur: logger.stats.formations.sans_formateur,
          sans_lieu: logger.stats.formations.sans_lieu,
          sans_dates: logger.stats.formations.sans_dates
        },
        brevets: {
          total: logger.stats.brevets.total,
          imported: logger.stats.brevets.imported,
          ignored: logger.stats.brevets.ignored,
          sans_code: logger.stats.brevets.sans_code,
          sans_date_obtention: logger.stats.brevets.sans_date_obtention
        },
        niveaux: {
          total: logger.stats.niveaux.total,
          imported: logger.stats.niveaux.imported,
          ignored: logger.stats.niveaux.ignored,
          sans_cursus_id: logger.stats.niveaux.sans_cursus_id
        },
        competences: {
          total: logger.stats.competences.total,
          imported: logger.stats.competences.imported,
          ignored: logger.stats.competences.ignored
        },
        referentiels: {
          formations_count: logger.stats.referentiels.formations.size,
          brevets_count: logger.stats.referentiels.brevets.size,
          niveaux_count: logger.stats.referentiels.niveaux.size,
          competences_count: logger.stats.referentiels.competences.size
        }
      }
    };

    const reportPath = saveImportReport(rapport, timestamp);
    console.log(`\n📁 Rapport sauvegardé: ${reportPath}`);

    // Fermer la connexion
    if (db.isConnected()) {
      await db.close();
    }

    console.log('\n✅ Import terminé avec succès !');

  } catch (error: any) {
    console.error('\n❌ Erreur fatale:', error.message);
    console.error(error.stack);

    if (db.isConnected()) {
      await db.close();
    }

    process.exit(1);
  }
}

// Lancer l'import
main().catch((error: any) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

export default main;
