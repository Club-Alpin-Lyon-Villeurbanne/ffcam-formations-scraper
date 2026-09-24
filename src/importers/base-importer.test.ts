/**
 * Tests du hook dry-run de BaseImporter : en dry-run, le mapping vers les
 * commissions doit être résolu (sans écrire en base) pour remonter les alertes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import CompetencesImporter from './competences-importer';
import BrevetsImporter from './brevets-importer';
import { CommissionLinker } from '../services/commission-linker';
import Logger from '../utils/logger';
import { DatabaseAdapter, Competence, Brevet } from '../types';

const csvPath = path.resolve(__dirname, '../../config/clubs/lyon/groupes-competences-commissions.csv');

function buildCompetence(overrides: Partial<Competence>): Competence {
  return {
    id: '1',
    adherentId: '123456',
    nom: 'Test Adherent',
    codeActivite: '',
    activite: '',
    intituleCompetence: '',
    niveauAssocie: '',
    dateValidation: '',
    estValide: true,
    validePar: '',
    commentaire: '',
    ...overrides
  };
}

describe('BaseImporter - checkMappingDryRun', () => {
  // CompetencesImporter.import() charge le CSV via CLUB : ne pas dépendre du .env du développeur
  let previousClub: string | undefined;
  beforeEach(() => { previousClub = process.env.CLUB; process.env.CLUB = 'lyon'; });
  afterEach(() => { if (previousClub === undefined) delete process.env.CLUB; else process.env.CLUB = previousClub; });

  it('résout le mapping GC en dry-run sans jamais écrire en base et remonte les alertes', async () => {
    // La DB ne doit jamais être sollicitée en dry-run : execute() lève si appelée.
    const db: DatabaseAdapter = {
      connect: async () => {},
      close: async () => {},
      isConnected: () => true,
      execute: async () => {
        throw new Error('execute() ne doit jamais être appelée en dry-run');
      },
      getUserIdFromCafnum: async () => {
        throw new Error('getUserIdFromCafnum() ne doit jamais être appelée en dry-run');
      },
      updateLastSync: async () => {
        throw new Error('updateLastSync() ne doit jamais être appelée en dry-run');
      }
    };

    const linker = new CommissionLinker(db, true);
    linker.initGcMapping(csvPath);

    const logger = new Logger();
    const importer = new CompetencesImporter(db, logger, linker, true);

    const competences: Competence[] = [
      buildCompetence({ intituleCompetence: '1.1 Mon niveau de pratique en alpinisme 1' }),
      buildCompetence({ intituleCompetence: 'GC inexistant' })
    ];

    await importer.import(competences);

    const warnings = linker.getWarnings();
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warning).toContain('GC non trouvé dans le CSV: "GC inexistant"');
  });
});

/**
 * Test réel (non dry-run) : le référentiel et la liaison commission ne doivent être
 * traités qu'une fois par code_brevet, même si plusieurs adhérents valident le même brevet.
 */
describe('BaseImporter - cache référentiel en import réel', () => {
  function buildBrevet(overrides: Partial<Brevet>): Brevet {
    return {
      id: '1',
      adherentId: '690020190001',
      nom: 'Test Adherent',
      codeBrevet: 'BF1-ES-SAE',
      intituleBrevet: 'Initiateur escalade SAE',
      dateObtention: '2020-01-01',
      dateRecyclage: '',
      dateEdition: '',
      dateFormationContinue: '',
      dateMigration: '',
      ...overrides
    };
  }

  it('un seul upsert/SELECT référentiel et une seule liaison commission pour 3 brevets de même code, 2 adhérents distincts', async () => {
    const users: Record<string, number> = {
      '690020190001': 11,
      '690020190002': 12
    };

    const execute = vi.fn(async (sql: string, _params: any[] = []) => {
      if (sql.includes('SELECT id FROM formation_referentiel_brevet')) {
        return [[{ id: 7 }], []] as [any[], any[]];
      }
      if (sql.includes('FROM caf_commission')) {
        return [[{ id_commission: 3 }], []] as [any[], any[]];
      }
      return [[], []] as [any[], any[]];
    });

    const db: DatabaseAdapter = {
      connect: async () => {},
      close: async () => {},
      isConnected: () => true,
      execute,
      getUserIdFromCafnum: vi.fn(async (cafnum: string) => users[cafnum] ?? null),
      updateLastSync: async () => {}
    };

    const linker = new CommissionLinker(db, false);
    const logger = new Logger();
    const importer = new BrevetsImporter(db, logger, linker, false);

    const brevets: Brevet[] = [
      buildBrevet({ adherentId: '690020190001' }),
      buildBrevet({ adherentId: '690020190002' }),
      buildBrevet({ adherentId: '690020190001' })
    ];

    await importer.import(brevets);

    const callsMatching = (pattern: string) =>
      execute.mock.calls.filter(([sql]) => (sql as string).includes(pattern));

    expect(callsMatching('INSERT INTO formation_referentiel_brevet')).toHaveLength(1);
    expect(callsMatching('SELECT id FROM formation_referentiel_brevet')).toHaveLength(1);
    expect(callsMatching('INSERT IGNORE INTO formation_commission_brevet')).toHaveLength(1);
    expect(callsMatching('INSERT INTO formation_validation_brevet')).toHaveLength(3);
    expect(logger.stats.brevets.imported).toBe(3);
  });
});

describe('BaseImporter - erreurs', () => {
  function buildBrevet(overrides: Partial<Brevet>): Brevet {
    return {
      id: '1',
      adherentId: '690020190001',
      nom: 'DUPONT Jean',
      codeBrevet: 'BF1-ES-SAE',
      intituleBrevet: 'Initiateur escalade SAE',
      dateObtention: '2020-01-01',
      dateRecyclage: '',
      dateEdition: '',
      dateFormationContinue: '',
      dateMigration: '',
      ...overrides
    };
  }

  function fakeDb(onValidationInsert: () => void = () => {}): DatabaseAdapter {
    return {
      connect: async () => {},
      close: async () => {},
      isConnected: () => true,
      execute: vi.fn(async (sql: string) => {
        if (sql.includes('SELECT id FROM formation_referentiel_brevet')) return [[{ id: 7 }], []] as [any[], any[]];
        if (sql.includes('FROM caf_commission')) return [[{ id_commission: 3 }], []] as [any[], any[]];
        if (sql.includes('INSERT INTO formation_validation_brevet')) onValidationInsert();
        return [[], []] as [any[], any[]];
      }),
      getUserIdFromCafnum: async () => 11,
      updateLastSync: async () => {}
    };
  }

  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { log.mockRestore(); });

  it("une ligne FFCAM invalide est ignorée sans interrompre l'import des suivantes", async () => {
    const db = fakeDb();
    const logger = new Logger();
    const importer = new BrevetsImporter(db, logger, new CommissionLinker(db, false), false);

    await importer.import([
      buildBrevet({ id: '1' }),
      buildBrevet({ id: '2', codeBrevet: '' }),
      buildBrevet({ id: '3' })
    ]);

    expect(logger.stats.brevets.imported).toBe(2);
    expect(logger.stats.brevets.ignored).toBe(1);
    expect(logger.stats.brevets.errors).toBe(0);
  });

  it("compte une erreur d'écriture et la journalise avec l'id de ligne, sans nom ni cafnum", async () => {
    const db = fakeDb(() => {
      throw Object.assign(new Error("Unknown column 'date_obtention' in 'field list'"), { errno: 1054, sqlState: '42S22' });
    });
    const logger = new Logger();
    const importer = new BrevetsImporter(db, logger, new CommissionLinker(db, false), false);

    await importer.import([buildBrevet({ id: '42' })]);

    const output = log.mock.calls.flat().join('\n');
    expect(logger.stats.brevets.errors).toBe(1);
    expect(logger.stats.brevets.imported).toBe(0);
    expect(output).toContain('ligne 42');
    expect(output).toContain('Unknown column');
    expect(output).toContain('SQL-1054');
    expect(output).not.toContain('DUPONT');
    expect(output).not.toContain('690020190001');
  });
});
