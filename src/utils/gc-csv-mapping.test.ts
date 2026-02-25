/**
 * Tests unitaires pour le mapping GC → Commissions depuis CSV
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import {
  loadGcMapping,
  getCommissionsForGc,
  hasGcInMapping,
  normalizeGcIntitule,
  getMappingStats,
  GcCommissionMapping,
} from './gc-csv-mapping';

describe('gc-csv-mapping', () => {
  let mapping: GcCommissionMapping;

  beforeAll(() => {
    // Charger le mapping depuis le fichier CSV réel
    const csvPath = path.resolve(__dirname, '../../data/groupes-competences-commissions.csv');
    mapping = loadGcMapping(csvPath);
  });

  describe('loadGcMapping', () => {
    it('should load mapping from CSV file', () => {
      expect(mapping).toBeDefined();
      expect(mapping.size).toBeGreaterThan(0);
    });

    it('should throw error for non-existent file', () => {
      expect(() => loadGcMapping('/nonexistent/path.csv')).toThrow('Fichier de mapping GC non trouvé');
    });
  });

  describe('normalizeGcIntitule', () => {
    it('should trim whitespace', () => {
      expect(normalizeGcIntitule('  test  ')).toBe('test');
    });

    it('should normalize multiple spaces', () => {
      expect(normalizeGcIntitule('test   with   spaces')).toBe('test with spaces');
    });

    it('should handle empty string', () => {
      expect(normalizeGcIntitule('')).toBe('');
    });
  });

  describe('getCommissionsForGc - Alpinisme', () => {
    it.each([
      ['1.1 Mon niveau de pratique en alpinisme 1', ['alpinisme']],
      ['1.2 Mon expérience en alpinisme 1', ['alpinisme']],
      ['2.2 Progression sur glacier 1', ['alpinisme', 'ski-de-randonnee']],
      ['3.2 Les bons comportements en alpinisme', ['alpinisme']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Ski de randonnée', () => {
    it.each([
      ['1.1 Mon niveau de pratique en ski de randonnée 1', ['ski-de-randonnee']],
      ['2.1 Progression ski de randonnée en montée 1', ['ski-de-randonnee']],
      ['3.1 Mon matériel - mon équipement en ski de randonnée 1', ['ski-de-randonnee']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Snowboard de randonnée', () => {
    it.each([
      ['1.1 Mon niveau de pratique en snowboard de randonnée 1', ['snowboard-rando']],
      ['2.1 Progression snowboard de randonnée en montée 1', ['snowboard-rando']],
      ['3.1 Mon matériel en snowboard de randonnée 2 - pratique autonome', ['snowboard-rando']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Raquettes', () => {
    it.each([
      ['1.1 Mon niveau de pratique en raquettes à neige 1', ['raquette']],
      ['2.1 Progression et techniques de sécurité en raquettes à neige', ['raquette']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Escalade', () => {
    it.each([
      ['1.1 Mon niveau de pratique en escalade SAE 1', ['escalade']],
      ['2.1 Escalade en moulinette', ['escalade']],
      ['3.2 Les bons comportements en escalade', ['escalade']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Canyon', () => {
    it.each([
      ['1.1 Mon niveau de pratique en canyonisme 1', ['canyon']],
      ['2.1 Progression aquatique 1', ['canyon']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - VTT', () => {
    it.each([
      ['1.1 Mon niveau de pratique en vélo de montagne', ['vtt']],
      ['3.2 Les bons comportements en vélo de montagne', ['vtt']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Randonnée', () => {
    it.each([
      ['1.1 Mon niveau de pratique en randonnée montagne 1', ['randonnee']],
      ['3.2 Les bons comportements en randonnée montagne', ['randonnee']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - Trail', () => {
    it.each([
      ['1.1 Niveau de pratique en trail', ['trail']],
      ['3.2 Les bons comportements en trail de montagne', ['trail']],
    ])('should map "%s" to %j', (intitule, expectedCommissions) => {
      const commissions = getCommissionsForGc(mapping, intitule);
      expect(commissions.sort()).toEqual(expectedCommissions.sort());
    });
  });

  describe('getCommissionsForGc - GC multi-commissions', () => {
    it('should return multiple commissions for shared GC', () => {
      // Les GC environnement de pratique sont partagés entre plusieurs activités
      const commissions = getCommissionsForGc(mapping, '3.3 Environnement de pratique - milieu montagne 1 (CO1)');
      expect(commissions.length).toBeGreaterThan(1);
      expect(commissions).toContain('alpinisme');
    });

    it('should return multiple commissions for sports de neige shared GC', () => {
      const commissions = getCommissionsForGc(mapping, '3.2 Les bons comportements en sports de neige');
      expect(commissions.length).toBeGreaterThan(1);
    });
  });

  describe('getCommissionsForGc - Non-existent GC', () => {
    it('should return empty array for unknown GC', () => {
      expect(getCommissionsForGc(mapping, 'Unknown GC title')).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      expect(getCommissionsForGc(mapping, '')).toEqual([]);
    });
  });

  describe('hasGcInMapping', () => {
    it('should return true for existing GC', () => {
      expect(hasGcInMapping(mapping, '1.1 Mon niveau de pratique en alpinisme 1')).toBe(true);
    });

    it('should return false for non-existing GC', () => {
      expect(hasGcInMapping(mapping, 'Unknown GC')).toBe(false);
    });
  });

  describe('getMappingStats', () => {
    it('should return valid statistics', () => {
      const stats = getMappingStats(mapping);

      expect(stats.totalGc).toBeGreaterThan(0);
      expect(stats.uniqueCommissions.size).toBeGreaterThan(0);
      expect(stats.gcWithMultipleCommissions).toBeGreaterThanOrEqual(0);

      // Vérifier que les commissions attendues sont présentes
      expect(stats.uniqueCommissions.has('alpinisme')).toBe(true);
      expect(stats.uniqueCommissions.has('escalade')).toBe(true);
      expect(stats.uniqueCommissions.has('ski-de-randonnee')).toBe(true);
    });
  });
});
