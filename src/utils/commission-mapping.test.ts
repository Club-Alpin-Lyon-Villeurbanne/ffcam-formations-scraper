/**
 * Tests unitaires pour le mapping des commissions (brevets, formations, niveaux)
 *
 * Ces tests garantissent que les patterns de mapping fonctionnent correctement
 * pour les brevets, formations et niveaux de pratique.
 *
 * NOTE : Pour les tests du mapping GC → Commissions (groupes de compétences),
 * voir gc-csv-mapping.test.ts qui teste le mapping basé sur le fichier CSV.
 */
import { describe, it, expect } from 'vitest';
import {
  getCommissionsForBrevet,
  getCommissionForBrevet,
  getCommissionForActivite,
  getCommissionsForFormation,
  getCommissionFromIntitule,
  CERTAINTY_THRESHOLD,
} from './commission-mapping';

describe('commission-mapping', () => {
  // ==========================================================================
  // Tests des brevets
  // ==========================================================================
  describe('getCommissionsForBrevet', () => {
    describe('Escalade', () => {
      it.each([
        'BF1-ES-001',
        'BF2-ES-TEST',
        'bf1-es-xyz', // case insensitive
      ])('should map %s to escalade', (code) => {
        expect(getCommissionsForBrevet(code)).toContain('escalade');
      });
    });

    describe('Alpinisme', () => {
      it.each([
        'BF1-AL-001',
        'BF2-AL-TEST',
        'BF1-AL-CG', // cascade de glace
      ])('should map %s to alpinisme', (code) => {
        expect(getCommissionsForBrevet(code)).toContain('alpinisme');
      });
    });

    describe('Canyon', () => {
      it.each([
        'BF1-CA-001',
        'BF2-CA-TEST',
      ])('should map %s to canyon', (code) => {
        expect(getCommissionsForBrevet(code)).toContain('canyon');
      });
    });

    describe('Randonnée', () => {
      it.each([
        'BF1-RA-001',
        'BF2-RA-RM', // rando montagne
        'BF1-RA-RAL', // rando alpine
      ])('should map %s to randonnee', (code) => {
        expect(getCommissionsForBrevet(code)).toContain('randonnee');
      });
    });

    describe('Sports de neige', () => {
      it('should map BF1-SN-SR to ski-de-randonnee', () => {
        expect(getCommissionsForBrevet('BF1-SN-SR')).toContain('ski-de-randonnee');
      });

      it('should map BF1-SN-SA to ski-de-piste', () => {
        expect(getCommissionsForBrevet('BF1-SN-SA')).toContain('ski-de-piste');
      });

      it('should map BF1-SN-RQ to raquette', () => {
        expect(getCommissionsForBrevet('BF1-SN-RQ')).toContain('raquette');
      });

      it('should map BF1-SN-SW to snowboard-rando', () => {
        expect(getCommissionsForBrevet('BF1-SN-SW')).toContain('snowboard-rando');
      });

      it('should map BF1-SN-SWA to snowboard-alpin', () => {
        expect(getCommissionsForBrevet('BF1-SN-SWA')).toContain('snowboard-alpin');
      });

      it('should map BRV-NIVO to ski-de-randonnee', () => {
        expect(getCommissionsForBrevet('BRV-NIVO')).toContain('ski-de-randonnee');
      });
    });

    describe('VTT', () => {
      it.each([
        'BF1-VM-001',
        'BF2-VM-TEST',
      ])('should map %s to vtt', (code) => {
        expect(getCommissionsForBrevet(code)).toContain('vtt');
      });
    });

    describe('Trail', () => {
      it('should map BF1-RA-TR to both randonnee and trail', () => {
        const commissions = getCommissionsForBrevet('BF1-RA-TR');
        expect(commissions).toContain('randonnee');
        expect(commissions).toContain('trail');
      });
    });

    describe('Brevets transversaux', () => {
      it('should return empty array for PSC1', () => {
        expect(getCommissionsForBrevet('PSC1')).toEqual([]);
      });

      it('should return empty array for unknown codes', () => {
        expect(getCommissionsForBrevet('UNKNOWN-CODE')).toEqual([]);
      });

      it('should return empty array for empty string', () => {
        expect(getCommissionsForBrevet('')).toEqual([]);
      });
    });
  });

  describe('getCommissionForBrevet (deprecated)', () => {
    it('should return first commission for valid code', () => {
      expect(getCommissionForBrevet('BF1-ES-001')).toBe('escalade');
    });

    it('should return null for unknown code', () => {
      expect(getCommissionForBrevet('UNKNOWN')).toBeNull();
    });
  });

  // ==========================================================================
  // Tests des formations
  // ==========================================================================
  describe('getCommissionsForFormation', () => {
    describe('Escalade', () => {
      it.each([
        ['STG-FEA10', 'Escalade SAE'],
        ['STG-FEB10', 'Escalade Bloc'],
        ['STG-FES10', 'Escalade SNE'],
        ['STG-FES20', 'Instructeur Escalade'],
        ['STG-FES30', 'Moniteur Escalade'],
        ['STG-UFES60', 'UF Autonomie SAE'],
        ['STG-RFEA10', 'Recyclage SAE'],
        ['STG-RFES10', 'Recyclage SNE'],
        ['STG-TEST10', 'Test entrée SAE'],
        ['STG-QLGV10', 'Grandes Voies'],
        ['FOR-CIEA10', 'Formation Initiateur SAE'],
        ['FOR-CIEN10', 'Formation Initiateur SNE'],
        ['FOR-CIES30', 'Formation Grandes Voies'],
        ['FOR-CTEA10', 'Certification SAE'],
        ['FOR-CTEN10', 'Certification SNE'],
        ['FOR-IIES10', 'Instructeur Escalade'],
        ['STG-BFEA11', 'FFME SAE'],
        ['STG-BFES11', 'FFME SNE'],
      ])('should map %s (%s) to escalade', (code) => {
        expect(getCommissionsForFormation(code)).toContain('escalade');
      });
    });

    describe('Alpinisme', () => {
      it.each([
        ['STG-FAL10', 'Initiateur Alpinisme'],
        ['STG-FAL20', 'Instructeur Alpinisme'],
        ['STG-FAM10', 'Terrain Montagne'],
        ['STG-FAT10', 'Terrain Aventure'],
        ['STG-FCG10', 'Cascade de glace'],
        ['STG-UFALA1', 'UF Autonomie neige'],
        ['STG-UFALA2', 'UF Autonomie TM'],
        ['STG-UFALA3', 'UF Autonomie rocher'],
        ['STG-UFALA4', 'UF Autonomie glacier'],
        ['STG-UFALA5', 'UF Autonomie cascade'],
        ['STG-UFCG50', 'UV Cascade de glace'],
        ['STG-UFGV10', 'Grandes verticales'],
        ['STG-UFTV10', 'Techniques verticales'],
        ['STG-UVAM10', 'UV Terrain montagne'],
        ['STG-UVAT10', 'UV Terrain aventure'],
        ['STG-RFAL10', 'Recyclage Alpinisme'],
        ['STG-RFAM10', 'Recyclage TM'],
        ['STG-RFAT10', 'Recyclage TA'],
        ['FOR-CIAL10', 'Formation Initiateur'],
        ['FOR-CICG10', 'Formation Cascade glace'],
        ['FOR-CTAL10', 'Certification Alpinisme'],
        ['FOR-IIAL10', 'Instructeur Alpinisme'],
        ['FOR-ITAL10', 'Cert Instructeur'],
        ['STG-BFAL11', 'FFME Alpinisme'],
      ])('should map %s (%s) to alpinisme', (code) => {
        expect(getCommissionsForFormation(code)).toContain('alpinisme');
      });
    });

    describe('Canyon', () => {
      it.each([
        ['STG-FCA00', 'Initiateur Canyon'],
        ['STG-FCA30', 'Moniteur Canyon'],
        ['STG-UFCA10', 'UF Canyon Leader'],
        ['STG-UFPA10', 'UF Progression Autonome'],
        ['STG-RFCA10', 'Recyclage Canyon'],
        ['FOR-CICA10', 'Formation Initiateur'],
        ['FOR-CICA30', 'Formation Moniteur'],
      ])('should map %s (%s) to canyon', (code) => {
        expect(getCommissionsForFormation(code)).toContain('canyon');
      });
    });

    describe('Randonnée', () => {
      it.each([
        ['STG-FRA10', 'Randonnée Alpine'],
        ['STG-FRD10', 'Initiateur Randonnée'],
        ['STG-FRD20', 'Instructeur Randonnée'],
        ['STG-FRM10', 'Randonnée Montagne'],
        ['STG-UFRA60', 'UF Autonomie Rando'],
        ['STG-UFCO10', 'UF Cartographie'],
        ['STG-UFCO20', 'UF Carto niveau II'],
        ['STG-UFCO30', 'Instructeur CO'],
        ['STG-UFCAR1', 'UF Carto niveau I'],
        ['STG-UFGPS0', 'UF GPS'],
        ['STG-RFRA10', 'Recyclage Rando Alpine'],
        ['STG-RFRD10', 'Recyclage Randonnée'],
        ['STG-RFRM10', 'Recyclage Rando Montagne'],
        ['FOR-CIRM10', 'Formation Init RM'],
        ['FOR-CIRA50', 'Formation Rando Alpine'],
        ['FOR-CTRM10', 'Certification RM'],
        ['FOR-CTRA50', 'Certification Rando Alpine'],
        ['FOR-IICO10', 'Instructeur CO'],
        ['FOR-ITCO10', 'Cert Instructeur CO'],
        ['STG-BFRD11', 'FFME Randonnée'],
        ['STG-UFQO21', 'UV Qualification Orientation FFME'],
      ])('should map %s (%s) to randonnee', (code) => {
        expect(getCommissionsForFormation(code)).toContain('randonnee');
      });
    });

    describe('Trail', () => {
      it.each([
        ['FOR-CITR10', 'Formation Initiateur Trail'],
        ['FOR-CTTR10', 'Certification Trail'],
      ])('should map %s (%s) to trail', (code) => {
        expect(getCommissionsForFormation(code)).toContain('trail');
      });
    });

    describe('Raquette', () => {
      it.each([
        ['STG-FRQ00', 'Initiateur Raquette TN'],
        ['STG-FRQ10', 'Initiateur Raquette'],
        ['STG-UFSN90', 'UF Autonomie Raquette'],
        ['STG-RFRQ10', 'Recyclage Raquette'],
        ['STG-APTRQ', 'Test Aptitude Raquette'],
        ['FOR-CIRQ10', 'Formation Initiateur'],
        ['FOR-CIRQ20', 'Formation Init 2e degré'],
        ['FOR-CTRQ10', 'Certification Raquette'],
        ['STG-BFRQ11', 'FFME Raquette'],
      ])('should map %s (%s) to raquette', (code) => {
        expect(getCommissionsForFormation(code)).toContain('raquette');
      });
    });

    describe('Ski de randonnée', () => {
      it.each([
        ['STG-FSM10', 'Initiateur Ski Alpinisme'],
        ['STG-FSM20', 'Instructeur Ski Alpinisme'],
        ['STG-FSM40', 'Initiateur Ski Randonnée'],
        ['STG-UFNA10', 'UF Neige Avalanches 1'],
        ['STG-UFNA20', 'UF Neige Avalanches 2'],
        ['STG-UFNA30', 'Instructeur NA'],
        ['STG-UFSG10', 'UF Sécurité Glacier 1'],
        ['STG-UFSG20', 'UF Sécurité Glacier 2'],
        ['STG-UFSN60', 'UF Autonomie Ski Rando'],
        ['STG-UFSN70', 'UF Autonomie Ski Glacier'],
        ['STG-SNFST0', 'Faire sa trace'],
        ['STG-UFFST0', 'UF Faire sa trace'],
        ['STG-UFSST0', 'UF Suivre sa trace'],
        ['STG-RFSM10', 'Recyclage Ski Alpinisme'],
        ['STG-QFSN10', 'Qualification Ski Alp'],
        ['FOR-CISM10', 'Formation Ski Alp 2e degré'],
        ['FOR-CISM40', 'Formation Ski Rando'],
        ['FOR-CTSM10', 'Certification Ski Alp'],
        ['FOR-CTSM40', 'Certification Ski Rando'],
        ['FOR-IISA10', 'Instructeur Ski Alp'],
        ['FOR-ITSM10', 'Cert Instructeur Ski'],
        ['FOR-IINA10', 'Instructeur NA'],
        ['FOR-ITNA10', 'Cert Instructeur NA'],
        ['STG-BFSM11', 'FFME Ski Alpinisme'],
        ['STG-QFHM11', 'FFME Haute Montagne'],
      ])('should map %s (%s) to ski-de-randonnee', (code) => {
        expect(getCommissionsForFormation(code)).toContain('ski-de-randonnee');
      });
    });

    describe('Ski de piste', () => {
      it.each([
        ['STG-FSA10', 'Initiateur Ski Alpin'],
        ['STG-UFSN80', 'UF Autonomie Hors Piste'],
      ])('should map %s (%s) to ski-de-piste', (code) => {
        expect(getCommissionsForFormation(code)).toContain('ski-de-piste');
      });
    });

    describe('Ski de fond', () => {
      it('should map STG-FSF10 to ski-de-fond', () => {
        expect(getCommissionsForFormation('STG-FSF10')).toContain('ski-de-fond');
      });
    });

    describe('Snowboard', () => {
      it.each([
        ['STG-FSB10', 'Initiateur Snowboard Montagne'],
        ['STG-FSL10', 'Qualification Snowboard-alp'],
        ['STG-FSU10', 'Initiateur Snowboard'],
        ['STG-UFSB10', 'UF Autonomie Snowboard'],
        ['STG-UFSB20', 'UF Autonomie Snowboard-alp'],
        ['STG-RFSL10', 'Recyclage Snowboard Alp'],
        ['FOR-CISB10', 'Formation Snowboard Rando'],
        ['FOR-CISL10', 'Formation Snowboard Alp'],
        ['FOR-CTSB10', 'Certification Snowboard'],
        ['FOR-IISL10', 'Instructeur Snowboard'],
        ['FOR-ITSL10', 'Cert Instructeur Snowboard'],
      ])('should map %s (%s) to snowboard-rando', (code) => {
        expect(getCommissionsForFormation(code)).toContain('snowboard-rando');
      });
    });

    describe('VTT', () => {
      it.each([
        ['STG-FVM10', 'Initiateur VTT'],
        ['STG-FVM20', 'Instructeur VTT'],
        ['STG-RFVM10', 'Recyclage VTT'],
        ['FOR-CIVM10', 'Formation Initiateur VTT'],
        ['FOR-ITVM10', 'Cert Instructeur VTT'],
      ])('should map %s (%s) to vtt', (code) => {
        expect(getCommissionsForFormation(code)).toContain('vtt');
      });
    });

    describe('Via Ferrata', () => {
      it.each([
        ['STG-UFVF10', 'Qualification Via Ferrata'],
        ['STG-UFVF60', 'UF Autonomie Via Ferrata'],
      ])('should map %s (%s) to via-ferrata', (code) => {
        expect(getCommissionsForFormation(code)).toContain('via-ferrata');
      });
    });

    describe('Marche Nordique', () => {
      it('should map STG-QFMN10 to marche-nordique', () => {
        expect(getCommissionsForFormation('STG-QFMN10')).toContain('marche-nordique');
      });
    });

    describe('Formation / Sécurité', () => {
      it.each([
        ['STG-PSC1', 'PSC1'],
        ['STG-SNSEC0', 'Secourisme Montagne'],
        ['STG-UFSE10', 'UF Secours'],
        ['STG-UFSEC1', 'UF Secourisme Montagne'],
        ['STG-UFFG10', 'UF Commune FFCAM'],
        ['STG-FROEPI', 'Gestionnaire EPI'],
        ['STG-AFTCA0', 'Test entrée formation'],
        ['FOR-IIC10', 'Formation Commune Instructeur'],
      ])('should map %s (%s) to formation', (code) => {
        expect(getCommissionsForFormation(code)).toContain('formation');
      });
    });

    describe('Environnement', () => {
      it.each([
        ['FOR-CIFC10', 'Redirection écologique'],
        ['FOR-CIFC20', 'Préservation biodiversité'],
        ['FOR-CIFC30', 'Changement pratiques'],
        ['FOR-CIFC40', 'Communication promotion'],
      ])('should map %s (%s) to environnement', (code) => {
        expect(getCommissionsForFormation(code)).toContain('environnement');
      });
    });

    describe('Vie du club', () => {
      it.each([
        ['STG-FORDIR', 'Formation Dirigeants'],
        ['STG-FORTR', 'Formation Trésorerie'],
        ['STG_FCO', 'Formation Communication'],
      ])('should map %s (%s) to vie-du-club', (code) => {
        expect(getCommissionsForFormation(code)).toContain('vie-du-club');
      });
    });

    describe('Formations non mappées', () => {
      it('should return empty array for STG-GRAT (gratuité jeux)', () => {
        expect(getCommissionsForFormation('STG-GRAT')).toEqual([]);
      });

      it('should return empty array for unknown codes', () => {
        expect(getCommissionsForFormation('UNKNOWN-123')).toEqual([]);
      });

      it('should return empty array for empty string', () => {
        expect(getCommissionsForFormation('')).toEqual([]);
      });
    });

    describe('Case insensitivity', () => {
      it('should be case insensitive', () => {
        expect(getCommissionsForFormation('stg-fea10')).toContain('escalade');
        expect(getCommissionsForFormation('STG-FEA10')).toContain('escalade');
        expect(getCommissionsForFormation('Stg-Fea10')).toContain('escalade');
      });
    });
  });

  // ==========================================================================
  // Tests des activités
  // ==========================================================================
  describe('getCommissionForActivite', () => {
    describe('Activités simples', () => {
      it.each([
        ['ESCALADE', 'escalade'],
        ['ALPINISME', 'alpinisme'],
        ['DESCENTE DE CANYON', 'canyon'],
        ['RANDONNEE', 'randonnee'],
        ['VELO DE MONTAGNE', 'vtt'],
      ])('should map %s to %s', (activite, expected) => {
        expect(getCommissionForActivite(activite)).toBe(expected);
      });
    });

    describe('Sports de neige avec discipline', () => {
      it.each([
        ['Randonnée', 'ski-de-randonnee'],
        ['Raquettes', 'raquette'],
        ['Piste', 'ski-de-piste'],
        ['Fond', 'ski-de-fond'],
        ['Snowboard', 'snowboard-rando'],
      ])('should map SPORTS DE NEIGE + %s to %s', (discipline, expected) => {
        expect(getCommissionForActivite('SPORTS DE NEIGE', discipline)).toBe(expected);
      });

      it('should return null when no discipline (use getCommissionFromIntitule instead)', () => {
        // Plus de fallback automatique - utiliser getCommissionFromIntitule pour analyser l'intitulé
        expect(getCommissionForActivite('SPORTS DE NEIGE')).toBeNull();
      });

      it('should return null for unknown discipline', () => {
        // Plus de fallback - discipline inconnue = pas de mapping
        expect(getCommissionForActivite('SPORTS DE NEIGE', 'Unknown')).toBeNull();
      });
    });

    describe('Activités inconnues', () => {
      it('should return null for unknown activity', () => {
        expect(getCommissionForActivite('UNKNOWN')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(getCommissionForActivite('')).toBeNull();
      });
    });

    describe('Case insensitivity', () => {
      it('should be case insensitive for activities', () => {
        expect(getCommissionForActivite('escalade')).toBe('escalade');
        expect(getCommissionForActivite('Escalade')).toBe('escalade');
      });
    });
  });

  // ==========================================================================
  // Tests de getCommissionFromIntitule (nouvelle API avec certitude)
  // ==========================================================================
  describe('getCommissionFromIntitule', () => {
    describe('Activités directes (non SPORTS DE NEIGE)', () => {
      it('should return escalade with 100% certainty for ESCALADE activity', () => {
        const result = getCommissionFromIntitule('1.1 Mon niveau de pratique', 'ESCALADE');
        expect(result.commission).toBe('escalade');
        expect(result.certainty).toBe(100);
        expect(result.source).toBe('activite_directe');
      });

      it('should return alpinisme with 100% certainty for ALPINISME activity', () => {
        const result = getCommissionFromIntitule('2.1 Progression', 'ALPINISME');
        expect(result.commission).toBe('alpinisme');
        expect(result.certainty).toBe(100);
        expect(result.source).toBe('activite_directe');
      });
    });

    describe('Compétences transversales', () => {
      it('should return null for empty activity', () => {
        const result = getCommissionFromIntitule('2.1 Principes et techniques de base', '');
        expect(result.commission).toBeNull();
        expect(result.certainty).toBe(0);
        expect(result.source).toBe('none');
        expect(result.warning).toContain('transversale');
      });
    });

    describe('SPORTS DE NEIGE - Snowboard', () => {
      it.each([
        ['3.1 Mon matériel en snowboard de randonnée 2 - pratique autonome', 98],
        ['1.1 Mon niveau de pratique en snowboard de randonnée 2', 98],
        ['2.1 Progression snowboard de randonnée en montée 2', 98],
        ['Mon expérience en snowboard rando', 95],
        ['Pratique en snowboard', 88],
      ])('should map "%s" to snowboard-rando with certainty >= %d', (intitule, minCertainty) => {
        const result = getCommissionFromIntitule(intitule, 'SPORTS DE NEIGE');
        expect(result.commission).toBe('snowboard-rando');
        expect(result.certainty).toBeGreaterThanOrEqual(minCertainty);
        expect(result.source).toBe('intitule_pattern');
      });
    });

    describe('SPORTS DE NEIGE - Ski de randonnée', () => {
      it.each([
        ['1.1 Mon niveau de pratique en ski de randonnée 1', 98],
        ['2.1 Progression ski de randonnée en montée 1', 98],
        ['3.1 Mon matériel - mon équipement en ski de randonnée 1', 98],
        ['Formation ski-rando avancée', 95],
        ['Stage ski alpinisme', 95],
      ])('should map "%s" to ski-de-randonnee', (intitule) => {
        const result = getCommissionFromIntitule(intitule, 'SPORTS DE NEIGE');
        expect(result.commission).toBe('ski-de-randonnee');
        expect(result.certainty).toBeGreaterThanOrEqual(CERTAINTY_THRESHOLD);
        expect(result.source).toBe('intitule_pattern');
      });
    });

    describe('SPORTS DE NEIGE - Raquettes', () => {
      it.each([
        ['1.1 Mon niveau de pratique en raquettes à neige 1', 98],
        ['2.1 Progression et techniques de sécurité en raquettes à neige', 98],
        ['Sortie en raquettes', 95],
      ])('should map "%s" to raquette', (intitule) => {
        const result = getCommissionFromIntitule(intitule, 'SPORTS DE NEIGE');
        expect(result.commission).toBe('raquette');
        expect(result.certainty).toBeGreaterThanOrEqual(CERTAINTY_THRESHOLD);
      });
    });

    describe('SPORTS DE NEIGE - Ski de fond', () => {
      it.each([
        ['Formation ski de fond', 98],
        ['Niveau en ski de fond', 98],
      ])('should map "%s" to ski-de-fond', (intitule) => {
        const result = getCommissionFromIntitule(intitule, 'SPORTS DE NEIGE');
        expect(result.commission).toBe('ski-de-fond');
      });
    });

    describe('SPORTS DE NEIGE - Non identifiable', () => {
      it('should return null with warning for generic SN without discipline', () => {
        const result = getCommissionFromIntitule('2.2 Progression en neige dure', 'SPORTS DE NEIGE');
        expect(result.commission).toBeNull();
        expect(result.warning).toBeDefined();
        expect(result.warning).toContain('Aucune discipline identifiée');
      });
    });

    describe('Seuil de certitude', () => {
      it('should respect custom threshold', () => {
        // Ce test vérifie que si on met un seuil très haut, certains patterns ne passent plus
        const result = getCommissionFromIntitule('snowboard', 'SPORTS DE NEIGE', { threshold: 95 });
        // "snowboard" seul a une certitude de 88, donc < 95
        expect(result.commission).toBeNull();
        expect(result.certainty).toBe(88);
        expect(result.warning).toContain('Certitude trop faible');
      });
    });

    // =========================================================================
    // Tests pour activité NULL avec identification par intitulé
    // =========================================================================
    describe('Activité NULL - Escalade', () => {
      it.each([
        ['2.1 Escalade en moulinette', 'escalade', 95],
        ['2.2 Escalade en tête', 'escalade', 95],
        ['Progresser en escalade', 'escalade', 92],
        ['Compléments techniques en escalade', 'escalade', 92],
        ['Les bons comportements en escalade', 'escalade', 92],
        ['Mon matériel en escalade 1', 'escalade', 92],
      ])('should map "%s" to %s with NULL activite', (intitule, expectedCommission) => {
        const result = getCommissionFromIntitule(intitule, '');
        expect(result.commission).toBe(expectedCommission);
        expect(result.certainty).toBeGreaterThanOrEqual(CERTAINTY_THRESHOLD);
        expect(result.source).toBe('intitule_pattern');
      });

      it('should map escalade sur glace to alpinisme', () => {
        const result = getCommissionFromIntitule('1.1 Mon niveau de pratique en escalade sur glace', '');
        expect(result.commission).toBe('alpinisme');
      });
    });

    describe('Activité NULL - Alpinisme', () => {
      it.each([
        ['Formation alpinisme', 'alpinisme', 98],
        ['Cascade de glace niveau 1', 'alpinisme', 98],
        ['Techniques de dry-tooling', 'alpinisme', 98],
        ['2.2 Progression sur glacier 1', 'alpinisme', 90],
      ])('should map "%s" to %s with NULL activite', (intitule, expectedCommission) => {
        const result = getCommissionFromIntitule(intitule, '');
        expect(result.commission).toBe(expectedCommission);
        expect(result.certainty).toBeGreaterThanOrEqual(CERTAINTY_THRESHOLD);
      });
    });

    describe('Activité NULL - Canyon', () => {
      it.each([
        ['Formation canyon', 'canyon', 98],
        ['Descente de canyon', 'canyon', 98],
        ['Techniques de canyoning', 'canyon', 98],
      ])('should map "%s" to %s with NULL activite', (intitule, expectedCommission) => {
        const result = getCommissionFromIntitule(intitule, '');
        expect(result.commission).toBe(expectedCommission);
      });
    });

    describe('Activité NULL - VTT', () => {
      it.each([
        ['Formation VTT', 'vtt', 98],
        ['Vélo de montagne niveau 1', 'vtt', 98],
      ])('should map "%s" to %s with NULL activite', (intitule, expectedCommission) => {
        const result = getCommissionFromIntitule(intitule, '');
        expect(result.commission).toBe(expectedCommission);
      });
    });

    describe('Activité NULL - Compétences transversales', () => {
      it('should return null for truly transversal competences', () => {
        const result = getCommissionFromIntitule('3.3 Environnement de pratique - milieu montagne 1', '');
        expect(result.commission).toBeNull();
        expect(result.warning).toContain('transversale');
      });
    });
  });
});
