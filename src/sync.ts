#!/usr/bin/env node
/**
 * Script unifié de synchronisation FFCAM → DB
 * Combine scraping et import en une seule opération
 *
 * Utilisation:
 *   npm run sync                # Sync direct vers DB
 *   npm run sync --dry-run      # Test sans importer
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
import { CommissionMapper } from './services/commission-mapper';
import Logger from './utils/logger';
import { ensureDirectories, saveImportReport, FFCAM_CONFIG } from './config';

// Parse les arguments
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Fonction principale de synchronisation
 */
async function main(): Promise<void> {
  console.log('🏔️  SYNCHRONISATION FFCAM → BASE DE DONNÉES\n');

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

  if (DRY_RUN) {
    console.log('🔍 MODE DRY-RUN - Aucune donnée ne sera importée');
  }
  console.log('=====================================\n');

  // S'assurer que les dossiers existent
  ensureDirectories();

  const logger: LoggerType = new Logger();
  const db: DatabaseAdapter = getDatabase();
  const commissionMapper = new CommissionMapper(db, DRY_RUN);

  try {
    // Connexion DB (seulement si pas dry-run)
    if (!DRY_RUN) {
      await db.connect();
    }

    // ==========================================
    // 1. FORMATIONS
    // ==========================================
    const formationsScraper = new FormationsScraper();
    const formations: Formation[] = await formationsScraper.scrape();

    // Import direct en DB
    const formationsImporter = new FormationsImporter(db, logger, commissionMapper, DRY_RUN);
    await formationsImporter.import(formations);

    // Pause entre les types de données
    console.log('\n⏳ Pause de 2 secondes...\n');
    await new Promise<void>(r => setTimeout(r, 2000));

    // ==========================================
    // 2. BREVETS
    // ==========================================
    const brevetsScraper = new BrevetsScraper();
    const brevets: Brevet[] = await brevetsScraper.scrape();

    // Import direct en DB
    const brevetsImporter = new BrevetsImporter(db, logger, commissionMapper, DRY_RUN);
    await brevetsImporter.import(brevets);

    // Pause entre les types de données
    console.log('\n⏳ Pause de 2 secondes...\n');
    await new Promise<void>(r => setTimeout(r, 2000));

    // ==========================================
    // 3. NIVEAUX DE PRATIQUE
    // ==========================================
    const niveauxScraper = new NiveauxScraper();
    const { data: niveaux, metadata }: ScrapedData<NiveauPratique> = await niveauxScraper.scrape();

    // Import direct en DB
    const niveauxImporter = new NiveauxImporter(db, logger, commissionMapper, DRY_RUN);
    await niveauxImporter.import(niveaux, metadata || {});

    // ==========================================
    // 4. COMPÉTENCES
    // ==========================================
    // Pause entre les types de données
    console.log('\n⏳ Pause de 2 secondes...\n');
    await new Promise<void>(r => setTimeout(r, 2000));

    const competencesScraper = new CompetencesScraper();
    const competences: Competence[] = await competencesScraper.scrape();

    // Import direct en DB
    const competencesImporter = new CompetencesImporter(db, logger, commissionMapper, DRY_RUN);
    await competencesImporter.import(competences);

    // ==========================================
    // FINALISATION
    // ==========================================

    // Mise à jour du tracking de sync
    if (!DRY_RUN && db.isConnected()) {
      await db.updateLastSync('formations', logger.stats.formations.imported);
      await db.updateLastSync('brevets', logger.stats.brevets.imported);
      await db.updateLastSync('niveaux_pratique', logger.stats.niveaux.imported);
      await db.updateLastSync('competences', logger.stats.competences.imported);
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

    console.log('\n✅ Synchronisation terminée avec succès !');

  } catch (error: any) {
    console.error('\n❌ Erreur fatale:', error.message);
    console.error(error.stack);

    if (db.isConnected()) {
      await db.close();
    }

    process.exit(1);
  }
}

// Lancer la synchronisation
main().catch((error: any) => {
  console.error('❌ Erreur non gérée:', error);
  process.exit(1);
});

export default main;
