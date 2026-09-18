/**
 * Tests du hook dry-run de BaseImporter : en dry-run, le mapping vers les
 * commissions doit être résolu (sans écrire en base) pour remonter les alertes.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import CompetencesImporter from './competences-importer';
import { CommissionLinker } from '../services/commission-linker';
import Logger from '../utils/logger';
import { DatabaseAdapter, Competence } from '../types';

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
