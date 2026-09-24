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
import { ensureDirectories, saveImportReport, FFCAM_CONFIG, getClubCode, getClubConfigDir } from './config';
import { getSessionId } from './auth/ffcam-sso';
import * as fs from 'fs';
import * as path from 'path';

type ImportType = 'formations' | 'brevets' | 'niveaux' | 'competences';
const ALL_TYPES: ImportType[] = ['formations', 'brevets', 'niveaux', 'competences'];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function getTypesToImport(): ImportType[] {
  const typeArg = args.find(a => a.startsWith('--type=') || a.startsWith('--only='));
  if (typeArg) {
    const types = typeArg.split('=')[1].split(',') as ImportType[];
    return types.filter(t => ALL_TYPES.includes(t));
  }

  const selectedTypes: ImportType[] = [];
  if (args.includes('--formations')) selectedTypes.push('formations');
  if (args.includes('--brevets')) selectedTypes.push('brevets');
  if (args.includes('--niveaux')) selectedTypes.push('niveaux');
  if (args.includes('--competences')) selectedTypes.push('competences');

  return selectedTypes.length > 0 ? selectedTypes : ALL_TYPES;
}

const TYPES_TO_IMPORT = getTypesToImport();

async function importFormations(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<number[]> {
  const scraper = new FormationsScraper();
  const formations: Formation[] = await scraper.scrape();

  // Connexion ouverte seulement après le scraping : ouverte plus tôt, elle expirerait pendant les minutes de scraping
  if (!DRY_RUN && !db.isConnected()) {
    await db.connect();
  }

  const importer = new FormationsImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(formations);
  return scraper.missingPages;
}

async function importBrevets(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<number[]> {
  const scraper = new BrevetsScraper();
  const brevets: Brevet[] = await scraper.scrape();

  if (!DRY_RUN && !db.isConnected()) {
    await db.connect();
  }

  const importer = new BrevetsImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(brevets);
  return scraper.missingPages;
}

async function importNiveaux(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<number[]> {
  const scraper = new NiveauxScraper();
  const { data: niveaux, metadata }: ScrapedData<NiveauPratique> = await scraper.scrape();

  if (!DRY_RUN && !db.isConnected()) {
    await db.connect();
  }

  const importer = new NiveauxImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(niveaux, metadata || {});
  return scraper.missingPages;
}

async function importCompetences(
  db: DatabaseAdapter,
  logger: LoggerType,
  commissionLinker: CommissionLinker
): Promise<number[]> {
  const scraper = new CompetencesScraper();
  const competences: Competence[] = await scraper.scrape();

  if (!DRY_RUN && !db.isConnected()) {
    await db.connect();
  }

  const importer = new CompetencesImporter(db, logger, commissionLinker, DRY_RUN);
  await importer.import(competences);
  return scraper.missingPages;
}

async function pause(seconds: number = 2): Promise<void> {
  console.log(`\n⏳ Pause de ${seconds} secondes...\n`);
  await new Promise<void>(r => setTimeout(r, seconds * 1000));
}

async function main(): Promise<void> {
  const typesLabel = TYPES_TO_IMPORT.length === ALL_TYPES.length
    ? 'COMPLET'
    : TYPES_TO_IMPORT.join(', ').toUpperCase();

  console.log(`🏔️  IMPORT FFCAM → BASE DE DONNÉES [${typesLabel}]\n`);

  // Login SSO dès le départ : échec rapide si les identifiants sont mauvais
  try {
    await getSessionId({
      email: FFCAM_CONFIG.EMAIL,
      password: FFCAM_CONFIG.PASSWORD,
      profile: FFCAM_CONFIG.PROFILE
    });
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }

  let clubCode: string;
  try { clubCode = getClubCode(); } catch (error: any) { console.error(`❌ ${error.message}`); process.exit(1); }

  try {
    const probe = await new NiveauxScraper().probe();
    if (probe.clubCode && probe.clubCode !== clubCode) {
      console.error(`❌ Le profil extranet est celui du club ${probe.clubCode}, pas ${clubCode} — vérifiez CLUB_CODE ou FFCAM_PROFILE`);
      process.exit(1);
    }
  } catch (error: any) { console.error(`❌ Extranet : ${error.message.split('\n')[0]}`); process.exit(1); }

  if (TYPES_TO_IMPORT.includes('competences')) {
    try {
      const clubDir = getClubConfigDir();
      const csvPath = path.join(clubDir, 'groupes-competences-commissions.csv');
      if (!fs.existsSync(csvPath)) {
        console.error(`❌ Fichier ${path.relative(process.cwd(), csvPath)} introuvable — copiez config/clubs/lyon/groupes-competences-commissions.csv et adaptez la colonne commission`);
        process.exit(1);
      }
    } catch (error: any) { console.error(`❌ ${error.message}`); process.exit(1); }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  console.log('Timestamp:', timestamp);
  console.log('Types:', TYPES_TO_IMPORT.join(', '));

  if (DRY_RUN) {
    console.log('🔍 MODE DRY-RUN - Aucune donnée ne sera importée');
  }
  console.log('=====================================\n');

  ensureDirectories();

  const logger: LoggerType = new Logger();
  const db: DatabaseAdapter = getDatabase();
  const commissionLinker = new CommissionLinker(db, DRY_RUN);

  try {
    let isFirst = true;
    const pagesManquantes: Partial<Record<'formations' | 'brevets' | 'niveaux' | 'competences', number[]>> = {};

    if (TYPES_TO_IMPORT.includes('formations')) {
      if (!isFirst) await pause();
      isFirst = false;
      const missing = await importFormations(db, logger, commissionLinker);
      if (missing.length > 0) pagesManquantes.formations = missing;
    }

    if (TYPES_TO_IMPORT.includes('brevets')) {
      if (!isFirst) await pause();
      isFirst = false;
      const missing = await importBrevets(db, logger, commissionLinker);
      if (missing.length > 0) pagesManquantes.brevets = missing;
    }

    if (TYPES_TO_IMPORT.includes('niveaux')) {
      if (!isFirst) await pause();
      isFirst = false;
      const missing = await importNiveaux(db, logger, commissionLinker);
      if (missing.length > 0) pagesManquantes.niveaux = missing;
    }

    if (TYPES_TO_IMPORT.includes('competences')) {
      if (!isFirst) await pause();
      isFirst = false;
      const missing = await importCompetences(db, logger, commissionLinker);
      if (missing.length > 0) pagesManquantes.competences = missing;
    }

    // Tracking de sync seulement pour un type complet : ni page manquante, ni erreur d'écriture
    if (!DRY_RUN && db.isConnected()) {
      const complet = (type: ImportType) =>
        TYPES_TO_IMPORT.includes(type) && !pagesManquantes[type] && logger.stats[type].errors === 0;
      if (complet('formations')) await db.updateLastSync('formations', logger.stats.formations.imported);
      if (complet('brevets')) await db.updateLastSync('brevets', logger.stats.brevets.imported);
      if (complet('niveaux')) await db.updateLastSync('niveaux_pratique', logger.stats.niveaux.imported);
      if (complet('competences')) await db.updateLastSync('competences', logger.stats.competences.imported);
    }

    logger.printFinalReport(timestamp, DRY_RUN);
    commissionLinker.printWarningsReport();

    const rapport: ImportReport = {
      timestamp,
      date: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'production',
      stats: {
        formations: {
          total: logger.stats.formations.total,
          imported: logger.stats.formations.imported,
          ignored: logger.stats.formations.ignored,
          errors: logger.stats.formations.errors,
          sans_numero: logger.stats.formations.sans_numero,
          sans_formateur: logger.stats.formations.sans_formateur,
          sans_lieu: logger.stats.formations.sans_lieu,
          sans_dates: logger.stats.formations.sans_dates
        },
        brevets: {
          total: logger.stats.brevets.total,
          imported: logger.stats.brevets.imported,
          ignored: logger.stats.brevets.ignored,
          errors: logger.stats.brevets.errors,
          sans_code: logger.stats.brevets.sans_code,
          sans_date_obtention: logger.stats.brevets.sans_date_obtention
        },
        niveaux: {
          total: logger.stats.niveaux.total,
          imported: logger.stats.niveaux.imported,
          ignored: logger.stats.niveaux.ignored,
          errors: logger.stats.niveaux.errors,
          sans_cursus_id: logger.stats.niveaux.sans_cursus_id
        },
        competences: {
          total: logger.stats.competences.total,
          imported: logger.stats.competences.imported,
          ignored: logger.stats.competences.ignored,
          errors: logger.stats.competences.errors
        },
        referentiels: {
          formations_count: logger.stats.referentiels.formations.size,
          brevets_count: logger.stats.referentiels.brevets.size,
          niveaux_count: logger.stats.referentiels.niveaux.size,
          competences_count: logger.stats.referentiels.competences.size
        }
      },
      ...(Object.keys(pagesManquantes).length > 0 ? { pages_manquantes: pagesManquantes } : {})
    };

    const reportPath = saveImportReport(rapport, timestamp);
    console.log(`\n📁 Rapport sauvegardé: ${reportPath}`);

    if (db.isConnected()) {
      await db.close();
    }

    const problemes: string[] = [];
    if (Object.keys(pagesManquantes).length > 0) {
      const liste = Object.entries(pagesManquantes)
        .map(([type, pages]) => `${type} ${pages!.join(', ')}`)
        .join(' ; ');
      problemes.push(`pages manquantes : ${liste}`);
    }
    const erreurs = ALL_TYPES.filter(type => logger.stats[type].errors > 0)
      .map(type => `${type} ${logger.stats[type].errors}`);
    if (erreurs.length > 0) {
      problemes.push(`erreurs d'écriture en base : ${erreurs.join(' ; ')}`);
    }

    if (problemes.length > 0) {
      console.log(`\n⚠️ IMPORT INCOMPLET — ${problemes.join(' — ')}`);
      console.log("⚠️ Voir le détail ci-dessus, corriger puis relancer l'import");
      process.exitCode = 1;
      return;
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

main().catch((error: any) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});
