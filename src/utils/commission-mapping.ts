/**
 * Utilitaire de mapping hardcodé entre données FFCAM et commissions CAF
 *
 * Ce fichier définit les règles de correspondance entre :
 * - Les codes de brevets FFCAM → slugs de commissions CAF
 * - Les activités FFCAM → slugs de commissions CAF
 *
 * Usage :
 *   import { getCommissionForBrevet, getCommissionForActivite } from './utils/commission-mapping';
 *
 *   getCommissionForBrevet('BF1-ESC');  // → 'escalade'
 *   getCommissionForActivite('ESCALADE');  // → 'escalade'
 */

/**
 * Patterns de codes brevets → commission (slug)
 * Les patterns sont évalués dans l'ordre, le premier qui matche gagne
 */
const BREVET_PATTERNS: Array<{ pattern: RegExp; commission: string }> = [
  // Escalade : BF1-ES-*, BF2-ES-*
  { pattern: /^BF\d?-ES-/i, commission: 'escalade' },

  // Alpinisme : BF1-AL-*, BF2-AL-* (inclut cascade de glace CG, alpinisme AL, grande voie GV)
  { pattern: /^BF\d?-AL-/i, commission: 'alpinisme' },

  // Canyon : BF1-CA-*, BF2-CA-*
  { pattern: /^BF\d?-CA-/i, commission: 'canyon' },

  // Randonnée : BF1-RA-*, BF2-RA-* (RM=rando montagne, RAL=rando alpine, TR=trail)
  { pattern: /^BF\d?-RA-/i, commission: 'randonnee' },

  // Sports de Neige : BF1-SN-*, BF2-SN-*
  // SR=Ski Rando, SA=Ski Alpin, RQ=Raquette, SW=Snowboard, SWA=Snowboard Alpin
  { pattern: /^BF\d?-SN-SR/i, commission: 'ski-de-randonnee' },
  { pattern: /^BF\d?-SN-SA/i, commission: 'ski-de-piste' },
  { pattern: /^BF\d?-SN-RQ/i, commission: 'raquette' },
  { pattern: /^BF\d?-SN-SW$/i, commission: 'snowboard-rando' },
  { pattern: /^BF\d?-SN-SWA/i, commission: 'snowboard-alpin' },
  { pattern: /^BRV-NIVO/i, commission: 'ski-de-randonnee' },
  { pattern: /^BRV-UFNA/i, commission: 'ski-de-randonnee' },

  // VTT / Vélo de Montagne : BF1-VM-*, BF2-VM-*
  { pattern: /^BF\d?-VM-/i, commission: 'vtt' },

  // Trail : souvent dans RA (BF1-RA-TR) - déjà couvert par randonnée
  // Mais on peut aussi l'associer explicitement à trail
  { pattern: /^BF\d?-RA-TR/i, commission: 'trail' },
];

/**
 * Mapping des activités FFCAM → commission (slug)
 */
const ACTIVITE_MAP: Record<string, string> = {
  'ESCALADE': 'escalade',
  'ALPINISME': 'alpinisme',
  'DESCENTE DE CANYON': 'canyon',
  'RANDONNEE': 'randonnee',
  'VELO DE MONTAGNE': 'vtt',
  // SPORTS DE NEIGE → dépend de la discipline (voir getCommissionForActivite)
};

/**
 * Mapping des disciplines "SPORTS DE NEIGE" → commission (slug)
 */
const SPORTS_NEIGE_DISCIPLINE_MAP: Record<string, string> = {
  'Randonnée': 'ski-de-randonnee',
  'Raquettes': 'raquette',
  'Piste': 'ski-de-piste',
  'Fond': 'ski-de-fond',
  'Snowboard': 'snowboard-rando',
  'Nordique': 'ski-randonnee-nordique',
};

/**
 * Trouve TOUTES les commissions correspondant à un code brevet
 *
 * Un brevet peut appartenir à plusieurs commissions (ex: BF3-FC-CO pourrait
 * être lié à course d'orientation ET randonnée).
 *
 * @param codeBrevet - Code du brevet (ex: "BF1-ESC", "PSC1")
 * @returns Tableau des slugs de commissions (peut être vide)
 *
 * @example
 * getCommissionsForBrevet('BF1-ESC');     // → ['escalade']
 * getCommissionsForBrevet('BF2-ALP');     // → ['alpinisme']
 * getCommissionsForBrevet('PSC1');        // → [] (brevet transversal)
 */
export function getCommissionsForBrevet(codeBrevet: string): string[] {
  if (!codeBrevet) return [];

  const code = codeBrevet.toUpperCase().trim();
  const commissions: string[] = [];

  for (const { pattern, commission } of BREVET_PATTERNS) {
    if (pattern.test(code) && !commissions.includes(commission)) {
      commissions.push(commission);
    }
  }

  return commissions;
}

/**
 * Trouve la commission correspondant à un code brevet (première correspondance)
 *
 * @deprecated Utiliser getCommissionsForBrevet pour supporter le many-to-many
 *
 * @param codeBrevet - Code du brevet (ex: "BF1-ESC", "PSC1")
 * @returns Slug de la commission ou null si non mappable
 *
 * @example
 * getCommissionForBrevet('BF1-ESC');     // → 'escalade'
 * getCommissionForBrevet('BF2-ALP');     // → 'alpinisme'
 * getCommissionForBrevet('PSC1');        // → null (brevet transversal)
 */
export function getCommissionForBrevet(codeBrevet: string): string | null {
  const commissions = getCommissionsForBrevet(codeBrevet);
  return commissions.length > 0 ? commissions[0] : null;
}

/**
 * Trouve la commission correspondant à une activité FFCAM
 *
 * @param activite - Activité FFCAM (ex: "ESCALADE", "SPORTS DE NEIGE")
 * @param discipline - Discipline optionnelle pour SPORTS DE NEIGE (ex: "Randonnée")
 * @returns Slug de la commission ou null si non mappable
 *
 * @example
 * getCommissionForActivite('ESCALADE');                    // → 'escalade'
 * getCommissionForActivite('SPORTS DE NEIGE', 'Randonnée'); // → 'ski-de-randonnee'
 * getCommissionForActivite('SPORTS DE NEIGE');             // → 'ski-de-randonnee' (fallback)
 */
export function getCommissionForActivite(
  activite: string,
  discipline?: string | null
): string | null {
  if (!activite) return null;

  const act = activite.toUpperCase().trim();

  // Cas spécial : SPORTS DE NEIGE dépend de la discipline
  if (act === 'SPORTS DE NEIGE') {
    if (discipline) {
      const disc = discipline.trim();
      // Chercher une correspondance exacte ou partielle
      for (const [key, commission] of Object.entries(SPORTS_NEIGE_DISCIPLINE_MAP)) {
        if (disc.toLowerCase().includes(key.toLowerCase())) {
          return commission;
        }
      }
    }
    // Fallback : ski de randonnée (le plus courant)
    return 'ski-de-randonnee';
  }

  return ACTIVITE_MAP[act] || null;
}

/**
 * Patterns de codes formations → commission (slug)
 * Similaire aux brevets mais pour les stages/formations
 * Les patterns sont évalués dans l'ordre, le premier qui matche gagne
 */
const FORMATION_PATTERNS: Array<{ pattern: RegExp; commission: string }> = [
  // Escalade : STG-ES-*, FOR-ES-*
  { pattern: /^STG-ES/i, commission: 'escalade' },
  { pattern: /^FOR-ES/i, commission: 'escalade' },

  // Alpinisme : STG-AL-*, FOR-AL-*
  { pattern: /^STG-AL/i, commission: 'alpinisme' },
  { pattern: /^FOR-AL/i, commission: 'alpinisme' },

  // Canyon : STG-CA-*, FOR-CA-*
  { pattern: /^STG-CA/i, commission: 'canyon' },
  { pattern: /^FOR-CA/i, commission: 'canyon' },

  // Randonnée : STG-RA-*, FOR-RA-*
  { pattern: /^STG-RA/i, commission: 'randonnee' },
  { pattern: /^FOR-RA/i, commission: 'randonnee' },

  // Sports de Neige
  { pattern: /^STG-SN-SR/i, commission: 'ski-de-randonnee' },
  { pattern: /^FOR-SN-SR/i, commission: 'ski-de-randonnee' },
  { pattern: /^STG-SN-SA/i, commission: 'ski-de-piste' },
  { pattern: /^FOR-SN-SA/i, commission: 'ski-de-piste' },
  { pattern: /^STG-SN-RQ/i, commission: 'raquette' },
  { pattern: /^FOR-SN-RQ/i, commission: 'raquette' },
  { pattern: /^STG-SN-SW/i, commission: 'snowboard-rando' },
  { pattern: /^FOR-SN-SW/i, commission: 'snowboard-rando' },
  { pattern: /^STG-SN/i, commission: 'ski-de-randonnee' }, // fallback sports de neige

  // VTT : STG-VM-*, FOR-VM-*
  { pattern: /^STG-VM/i, commission: 'vtt' },
  { pattern: /^FOR-VM/i, commission: 'vtt' },

  // Trail (souvent sous randonnée)
  { pattern: /^STG-RA-TR/i, commission: 'trail' },
  { pattern: /^FOR-RA-TR/i, commission: 'trail' },
];

/**
 * Trouve TOUTES les commissions correspondant à un code formation
 *
 * @param codeFormation - Code de la formation (ex: "STG-ES-001")
 * @returns Tableau des slugs de commissions (peut être vide)
 *
 * @example
 * getCommissionsForFormation('STG-ES-001');  // → ['escalade']
 * getCommissionsForFormation('FOR-AL-002');  // → ['alpinisme']
 * getCommissionsForFormation('AUTRE-123');   // → [] (formation transversale)
 */
export function getCommissionsForFormation(codeFormation: string): string[] {
  if (!codeFormation) return [];

  const code = codeFormation.toUpperCase().trim();
  const commissions: string[] = [];

  for (const { pattern, commission } of FORMATION_PATTERNS) {
    if (pattern.test(code) && !commissions.includes(commission)) {
      commissions.push(commission);
    }
  }

  return commissions;
}

/**
 * Liste des commissions supportées
 */
export const COMMISSIONS = [
  'escalade',
  'alpinisme',
  'canyon',
  'randonnee',
  'ski-de-randonnee',
  'raquette',
  'ski-de-piste',
  'ski-de-fond',
  'vtt',
  'via-ferrata',
  'trail',
  'snowboard-rando',
  'snowboard-alpin',
  'marche-nordique',
  'ski-randonnee-nordique',
] as const;

export type Commission = typeof COMMISSIONS[number];
