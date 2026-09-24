import { Logger as LoggerInterface, ImportStats, Formation, NiveauPratique, Brevet } from '../types';

class Logger implements LoggerInterface {
  public stats: ImportStats;

  constructor() {
    this.stats = {
      formations: {
        total: 0,
        imported: 0,
        ignored: 0,
        errors: 0,
        sans_numero: 0,
        sans_formateur: 0,
        sans_lieu: 0,
        sans_dates: 0
      },
      niveaux: { total: 0, imported: 0, ignored: 0, errors: 0, sans_cursus_id: 0 },
      brevets: {
        total: 0,
        imported: 0,
        ignored: 0,
        errors: 0,
        sans_code: 0,
        sans_date_obtention: 0
      },
      competences: {
        total: 0,
        imported: 0,
        ignored: 0,
        errors: 0
      },
      referentiels: {
        formations: new Set(),
        niveaux: new Set(),
        brevets: new Set(),
        competences: new Set()
      }
    };
  }

  info(message: string): void {
    console.log(message);
  }

  success(message: string): void {
    console.log(`✅ ${message}`);
  }

  error(message: string): void {
    console.log(`❌ ${message}`);
  }

  progress(current: number, total: number): void {
    if (current % 100 === 0) {
      process.stdout.write(`  ${current}/${total}\r`);
    }
  }

  section(title: string): void {
    console.log(`\n${title}`);
  }

  separator(): void {
    console.log('\n=====================================');
  }

  logFormationIssue(_formation: Formation, issue: string): void {
    switch(issue) {
      case 'sans_numero':
        this.stats.formations.sans_numero++;
        break;
      case 'sans_formateur':
        this.stats.formations.sans_formateur++;
        break;
      case 'sans_lieu':
        this.stats.formations.sans_lieu++;
        break;
      case 'sans_dates':
        this.stats.formations.sans_dates++;
        break;
    }
  }

  logNiveauIssue(_niveau: NiveauPratique, issue: string): void {
    switch(issue) {
      case 'sans_cursus_id':
        this.stats.niveaux.sans_cursus_id++;
        break;
    }
  }

  logBrevetIssue(_brevet: Brevet, issue: string): void {
    switch(issue) {
      case 'sans_code':
        this.stats.brevets.sans_code++;
        break;
      case 'sans_date_obtention':
        this.stats.brevets.sans_date_obtention++;
        break;
    }
  }


  printFormationReport(dryRun: boolean = false): void {
    const { formations } = this.stats;
    console.log(`\n✅ Formations traitées: ${formations.total}`);
    console.log(`   - ${dryRun ? 'À importer' : 'Importées'}: ${formations.imported}`);
    console.log(`   - Ignorées: ${formations.ignored}`);
    console.log(`   - Sans numéro: ${formations.sans_numero} (${Math.round(formations.sans_numero / formations.total * 100) || 0}%)`);
    console.log(`   - Sans formateur: ${formations.sans_formateur} (${Math.round(formations.sans_formateur / formations.total * 100) || 0}%)`);
    console.log(`   - Sans lieu: ${formations.sans_lieu} (${Math.round(formations.sans_lieu / formations.total * 100) || 0}%)`);
    console.log(`   - Sans dates: ${formations.sans_dates} (${Math.round(formations.sans_dates / formations.total * 100) || 0}%)`);
    console.log(`   - Erreurs: ${formations.errors}`);
  }

  printNiveauReport(dryRun: boolean = false): void {
    const { niveaux } = this.stats;
    console.log(`\n✅ Niveaux traités: ${niveaux.total}`);
    console.log(`   - ${dryRun ? 'À importer' : 'Importés'}: ${niveaux.imported}`);
    console.log(`   - Ignorés: ${niveaux.ignored}`);
    console.log(`   - Sans cursus_id: ${niveaux.sans_cursus_id}`);
    console.log(`   - Erreurs: ${niveaux.errors}`);
  }

  printBrevetReport(dryRun: boolean = false): void {
    const { brevets } = this.stats;
    console.log(`\n✅ Brevets traités: ${brevets.total}`);
    console.log(`   - ${dryRun ? 'À importer' : 'Importés'}: ${brevets.imported}`);
    console.log(`   - Ignorés: ${brevets.ignored}`);
    console.log(`   - Sans code: ${brevets.sans_code}`);
    console.log(`   - Sans date d'obtention: ${brevets.sans_date_obtention} (${Math.round(brevets.sans_date_obtention / brevets.total * 100) || 0}%)`);
    console.log(`   - Erreurs: ${brevets.errors}`);
  }

  printCompetenceReport(dryRun: boolean = false): void {
    const { competences } = this.stats;
    console.log(`\n✅ Compétences traitées: ${competences.total}`);
    console.log(`   - ${dryRun ? 'À importer' : 'Importées'}: ${competences.imported}`);
    console.log(`   - Ignorées: ${competences.ignored}`);
    console.log(`   - Erreurs: ${competences.errors}`);
  }


  printFinalReport(timestamp: string, dryRun: boolean = false): void {
    const { formations, niveaux, brevets, competences } = this.stats;

    this.separator();
    console.log('📊 RÉSUMÉ FINAL:');
    console.log(`   - Mode: ${dryRun ? 'DRY-RUN' : 'PRODUCTION'}`);
    console.log(`   - Timestamp: ${timestamp}`);
    console.log(`   - Formations: ${formations.imported}/${formations.total}`);
    console.log(`   - Niveaux: ${niveaux.imported}/${niveaux.total}`);
    console.log(`   - Brevets: ${brevets.imported}/${brevets.total}`);
    console.log(`   - Compétences: ${competences.imported}/${competences.total}`);
    console.log(`   - Total des erreurs: ${formations.errors + niveaux.errors + brevets.errors + competences.errors}`);
  }
}

export default Logger;