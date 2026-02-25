/**
 * Utilitaire de mapping entre données FFCAM et commissions CAF
 *
 * Ce fichier définit les règles de correspondance entre :
 * - Les codes de brevets FFCAM → slugs de commissions CAF
 * - Les codes de formations FFCAM → slugs de commissions CAF
 * - Les activités FFCAM → slugs de commissions CAF
 * - Les intitulés de niveaux → slugs de commissions CAF (avec degré de certitude)
 *
 * IMPORTANT : Pour les groupes de compétences (GC), le mapping est géré par le fichier CSV
 * data/groupes-competences-commissions.csv via gc-csv-mapping.ts.
 * Ce fichier ne gère que les brevets, formations et niveaux.
 *
 * Usage :
 *   import { getCommissionForBrevet, getCommissionForActivite, getCommissionFromIntitule } from './utils/commission-mapping';
 *
 *   getCommissionForBrevet('BF1-ESC');  // → 'escalade'
 *   getCommissionForActivite('ESCALADE');  // → 'escalade'
 *   getCommissionFromIntitule('PERFECTIONNE en snowboard de randonnée', 'SPORTS DE NEIGE');
 *   // → { commission: 'snowboard-rando', certainty: 95, source: 'intitule_pattern' }
 */

// =============================================================================
// Types pour le mapping avec degré de certitude
// =============================================================================

/**
 * Résultat d'un mapping avec degré de certitude
 */
export interface MappingResult {
  /** Slug de la commission (null si non mappable ou certitude trop faible) */
  commission: string | null;
  /** Degré de certitude de 0 à 100 */
  certainty: number;
  /** Source du mapping */
  source: 'activite_directe' | 'discipline_field' | 'intitule_pattern' | 'fallback' | 'none';
  /** Pattern qui a matché (pour debug) */
  matchedPattern?: string;
  /** Alerte si certitude faible */
  warning?: string;
}

/** Seuil de certitude minimum pour valider un mapping (configurable) */
export const CERTAINTY_THRESHOLD = 70;

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
 * Utilisé quand le champ discipline est disponible dans les métadonnées
 */
const SPORTS_NEIGE_DISCIPLINE_MAP: Record<string, string> = {
  'Randonnée': 'ski-de-randonnee',
  'Raquettes': 'raquette',
  'Piste': 'ski-de-piste',
  'Fond': 'ski-de-fond',
  'Snowboard': 'snowboard-rando',
  'Nordique': 'ski-randonnee-nordique',
};

// =============================================================================
// Patterns pour extraire la discipline depuis l'intitulé (avec certitude)
// =============================================================================

/**
 * Patterns pour identifier la discipline depuis l'intitulé d'une compétence/niveau
 *
 * IMPORTANT : Les patterns sont ordonnés du plus spécifique au moins spécifique.
 * Le premier qui matche gagne, donc on met les patterns les plus précis en premier.
 *
 * Certitude :
 * - 95-100 : Pattern très spécifique, quasi certain
 * - 80-94  : Pattern fiable mais pourrait avoir des faux positifs
 * - 70-79  : Pattern acceptable, à surveiller
 * - <70    : Pattern trop vague, ne sera pas utilisé (sauf si explicitement demandé)
 */
const INTITULE_DISCIPLINE_PATTERNS: Array<{
  pattern: RegExp;
  commission: string;
  certainty: number;
  description: string;
}> = [
  // ============================================================
  // SNOWBOARD - Patterns spécifiques (priorité haute)
  // ============================================================
  {
    pattern: /snowboard\s+de\s+randonn[ée]e/i,
    commission: 'snowboard-rando',
    certainty: 98,
    description: 'snowboard de randonnée (forme complète)'
  },
  {
    pattern: /snowboard[\s-]*rando/i,
    commission: 'snowboard-rando',
    certainty: 95,
    description: 'snowboard-rando ou snowboard rando'
  },
  {
    pattern: /\ben\s+snowboard\b/i,
    commission: 'snowboard-rando',
    certainty: 92,
    description: '"en snowboard" dans le texte'
  },
  {
    pattern: /\bsnowboard\b/i,
    commission: 'snowboard-rando',
    certainty: 88,
    description: 'mot snowboard seul'
  },

  // ============================================================
  // SKI DE RANDONNÉE - Patterns spécifiques
  // ============================================================
  {
    pattern: /ski\s+de\s+randonn[ée]e/i,
    commission: 'ski-de-randonnee',
    certainty: 98,
    description: 'ski de randonnée (forme complète)'
  },
  {
    pattern: /ski[\s-]*rando(?!nn)/i,
    commission: 'ski-de-randonnee',
    certainty: 95,
    description: 'ski-rando ou ski rando (pas suivi de nn)'
  },
  {
    pattern: /\ben\s+ski\s+de\s+randonn[ée]e\b/i,
    commission: 'ski-de-randonnee',
    certainty: 98,
    description: '"en ski de randonnée"'
  },
  {
    pattern: /ski[\s-]*alpinisme/i,
    commission: 'ski-de-randonnee',
    certainty: 95,
    description: 'ski alpinisme'
  },

  // ============================================================
  // RAQUETTES
  // ============================================================
  {
    pattern: /raquettes?\s+[àa]\s+neige/i,
    commission: 'raquette',
    certainty: 98,
    description: 'raquettes à neige'
  },
  {
    pattern: /\ben\s+raquettes?\b/i,
    commission: 'raquette',
    certainty: 95,
    description: '"en raquettes"'
  },
  {
    pattern: /\braquettes?\b(?!\s+de\s+tennis)/i,
    commission: 'raquette',
    certainty: 90,
    description: 'raquettes (hors tennis)'
  },

  // ============================================================
  // SKI DE FOND
  // ============================================================
  {
    pattern: /ski\s+de\s+fond/i,
    commission: 'ski-de-fond',
    certainty: 98,
    description: 'ski de fond'
  },
  {
    pattern: /\ben\s+ski\s+de\s+fond\b/i,
    commission: 'ski-de-fond',
    certainty: 98,
    description: '"en ski de fond"'
  },

  // ============================================================
  // SKI NORDIQUE / RANDONNÉE NORDIQUE
  // ============================================================
  {
    pattern: /ski\s+de\s+randonn[ée]e\s+nordique/i,
    commission: 'ski-randonnee-nordique',
    certainty: 98,
    description: 'ski de randonnée nordique'
  },
  {
    pattern: /randonn[ée]e\s+nordique/i,
    commission: 'ski-randonnee-nordique',
    certainty: 90,
    description: 'randonnée nordique'
  },

  // ============================================================
  // SKI DE PISTE / SKI ALPIN
  // ============================================================
  {
    pattern: /ski\s+de\s+piste/i,
    commission: 'ski-de-piste',
    certainty: 98,
    description: 'ski de piste'
  },
  {
    pattern: /ski\s+alpin/i,
    commission: 'ski-de-piste',
    certainty: 95,
    description: 'ski alpin'
  },
  {
    pattern: /hors[\s-]*piste/i,
    commission: 'ski-de-piste',
    certainty: 80,
    description: 'hors-piste (associé au ski alpin)'
  },

  // ============================================================
  // ESCALADE (hors glace/dry qui est alpinisme)
  // ============================================================
  {
    pattern: /escalade\s+(?:sur\s+)?(?:glace|dry|cascade)/i,
    commission: 'alpinisme',
    certainty: 95,
    description: 'escalade sur glace / dry tooling → alpinisme'
  },
  {
    pattern: /\bescalade\s+(?:en\s+)?(?:SAE|SNE|bloc|moulinette|tête|grandes?\s+voies?)/i,
    commission: 'escalade',
    certainty: 95,
    description: 'escalade SAE/SNE/bloc/moulinette/tête/grandes voies'
  },
  {
    pattern: /\ben\s+escalade\b/i,
    commission: 'escalade',
    certainty: 92,
    description: '"en escalade" dans le texte'
  },
  {
    pattern: /\bescalade\b(?!\s+(?:sur\s+)?(?:glace|dry|cascade))/i,
    commission: 'escalade',
    certainty: 88,
    description: 'mot escalade (hors glace/dry)'
  },

  // ============================================================
  // ALPINISME
  // ============================================================
  {
    pattern: /\balpinisme\b/i,
    commission: 'alpinisme',
    certainty: 98,
    description: 'alpinisme'
  },
  {
    pattern: /\balpi\b/i,
    commission: 'alpinisme',
    certainty: 90,
    description: 'abréviation alpi'
  },
  {
    pattern: /\bcascade\s+de\s+glace\b/i,
    commission: 'alpinisme',
    certainty: 98,
    description: 'cascade de glace'
  },
  {
    pattern: /\bdry[\s-]*tooling\b/i,
    commission: 'alpinisme',
    certainty: 98,
    description: 'dry tooling'
  },
  {
    pattern: /progression\s+sur\s+glacier/i,
    commission: 'alpinisme',
    certainty: 90,
    description: 'progression sur glacier'
  },

  // ============================================================
  // CANYON
  // ============================================================
  {
    pattern: /\bcanyon(?:ing|isme)?\b/i,
    commission: 'canyon',
    certainty: 98,
    description: 'canyon, canyoning ou canyonisme'
  },
  {
    pattern: /descente\s+de\s+canyon/i,
    commission: 'canyon',
    certainty: 98,
    description: 'descente de canyon'
  },

  // ============================================================
  // RANDONNÉE (hors ski/snow/raquette)
  // ============================================================
  {
    pattern: /randonn[ée]e\s+(?:montagne|alpine|p[ée]destre)/i,
    commission: 'randonnee',
    certainty: 95,
    description: 'randonnée montagne/alpine/pédestre'
  },
  {
    pattern: /\ben\s+randonn[ée]e\b(?!\s+(?:ski|nordique|raquette))/i,
    commission: 'randonnee',
    certainty: 88,
    description: '"en randonnée" (hors ski/nordique/raquette)'
  },

  // ============================================================
  // TRAIL
  // ============================================================
  {
    pattern: /\ben\s+trail\b/i,
    commission: 'trail',
    certainty: 95,
    description: '"en trail" dans le texte'
  },
  {
    pattern: /\btrail\b/i,
    commission: 'trail',
    certainty: 90,
    description: 'mot trail seul'
  },

  // ============================================================
  // VTT / VÉLO DE MONTAGNE
  // ============================================================
  {
    pattern: /\bvtt\b/i,
    commission: 'vtt',
    certainty: 98,
    description: 'VTT'
  },
  {
    pattern: /v[ée]lo\s+de\s+montagne/i,
    commission: 'vtt',
    certainty: 98,
    description: 'vélo de montagne'
  },
];

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
 * @deprecated Pour les SPORTS DE NEIGE, utiliser getCommissionFromIntitule qui analyse l'intitulé
 *
 * @param activite - Activité FFCAM (ex: "ESCALADE", "SPORTS DE NEIGE")
 * @param discipline - Discipline optionnelle pour SPORTS DE NEIGE (ex: "Randonnée")
 * @returns Slug de la commission ou null si non mappable
 *
 * @example
 * getCommissionForActivite('ESCALADE');                    // → 'escalade'
 * getCommissionForActivite('SPORTS DE NEIGE', 'Randonnée'); // → 'ski-de-randonnee'
 * getCommissionForActivite('SPORTS DE NEIGE');             // → null (plus de fallback !)
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
    // Plus de fallback ! Retourne null si pas de discipline identifiable
    // Utiliser getCommissionFromIntitule pour analyser l'intitulé
    return null;
  }

  return ACTIVITE_MAP[act] || null;
}

// =============================================================================
// Nouvelle API avec degré de certitude
// =============================================================================

/**
 * Extrait la discipline depuis l'intitulé d'un niveau de pratique et retourne
 * la commission correspondante avec un degré de certitude.
 *
 * NOTE : Cette fonction est utilisée pour les niveaux de pratique.
 * Pour les groupes de compétences (GC), utiliser gc-csv-mapping.ts qui lit
 * le fichier CSV data/groupes-competences-commissions.csv.
 *
 * Cette fonction est conçue pour les cas où l'activité est "SPORTS DE NEIGE"
 * et qu'on doit déterminer la discipline (ski de rando, snowboard, raquette, etc.)
 * en analysant l'intitulé du niveau.
 *
 * @param intitule - Intitulé du niveau (ex: "PERFECTIONNE en snowboard de randonnée")
 * @param activite - Activité FFCAM (ex: "SPORTS DE NEIGE", "ESCALADE")
 * @param options - Options de configuration
 * @returns MappingResult avec commission, certitude et informations de debug
 *
 * @example
 * getCommissionFromIntitule('PERFECTIONNE en snowboard de randonnée', 'SPORTS DE NEIGE');
 * // → { commission: 'snowboard-rando', certainty: 98, source: 'intitule_pattern' }
 *
 * getCommissionFromIntitule('INITIE en alpinisme', 'ALPINISME');
 * // → { commission: 'alpinisme', certainty: 100, source: 'activite_directe' }
 */
export function getCommissionFromIntitule(
  intitule: string,
  activite: string,
  options: { threshold?: number } = {}
): MappingResult {
  const threshold = options.threshold ?? CERTAINTY_THRESHOLD;

  // Cas 1: Pas d'intitulé
  if (!intitule || intitule.trim() === '') {
    return {
      commission: null,
      certainty: 0,
      source: 'none',
      warning: 'Intitulé vide ou manquant'
    };
  }

  const text = intitule.trim();
  const act = activite?.toUpperCase().trim() || '';

  // Cas 2: Activité directe connue (pas SPORTS DE NEIGE, pas vide)
  if (act && act !== 'SPORTS DE NEIGE') {
    const directCommission = ACTIVITE_MAP[act];
    if (directCommission) {
      return {
        commission: directCommission,
        certainty: 100,
        source: 'activite_directe',
        matchedPattern: act
      };
    }
    // Activité non reconnue - on continue pour essayer l'analyse par intitulé
  }

  // Cas 3: Analyser l'intitulé pour déterminer la commission
  // (pour SPORTS DE NEIGE ou activité NULL/non reconnue)
  for (const { pattern, commission, certainty, description } of INTITULE_DISCIPLINE_PATTERNS) {
    if (pattern.test(text)) {
      // Vérifier si la certitude est suffisante
      if (certainty >= threshold) {
        return {
          commission,
          certainty,
          source: 'intitule_pattern',
          matchedPattern: description
        };
      } else {
        // Certitude trop faible
        return {
          commission: null,
          certainty,
          source: 'intitule_pattern',
          matchedPattern: description,
          warning: `Certitude trop faible (${certainty}% < ${threshold}%) pour "${description}"`
        };
      }
    }
  }

  // Cas 4: Aucun pattern ne matche
  if (!act) {
    return {
      commission: null,
      certainty: 0,
      source: 'none',
      warning: `Compétence transversale - aucune discipline identifiée: "${text}"`
    };
  }

  if (act === 'SPORTS DE NEIGE') {
    return {
      commission: null,
      certainty: 0,
      source: 'none',
      warning: `Aucune discipline identifiée dans l'intitulé SPORTS DE NEIGE: "${text}"`
    };
  }

  return {
    commission: null,
    certainty: 0,
    source: 'none',
    warning: `Activité non reconnue et aucun pattern dans l'intitulé: ${activite}`
  };
}

/**
 * Version simplifiée qui retourne juste la commission ou null
 * Utile pour les cas où on veut juste le résultat sans les détails
 */
export function getCommissionFromIntituleSimple(
  intitule: string,
  activite: string
): string | null {
  const result = getCommissionFromIntitule(intitule, activite);
  return result.commission;
}

/**
 * Patterns de codes formations → commission (slug)
 * Basé sur les codes réels de la FFCAM
 * Les patterns sont évalués dans l'ordre, le premier qui matche gagne
 */
const FORMATION_PATTERNS: Array<{ pattern: RegExp; commission: string }> = [
  // ============================================================
  // ESCALADE (SAE, Bloc, Sites Naturels, Grandes Voies)
  // ============================================================
  { pattern: /^STG-FEA/i, commission: 'escalade' },    // Escalade SAE
  { pattern: /^STG-FEB/i, commission: 'escalade' },    // Escalade Bloc
  { pattern: /^STG-FES/i, commission: 'escalade' },    // Escalade SNE, Instructeur, Moniteur
  { pattern: /^STG-UFES/i, commission: 'escalade' },   // UF Escalade
  { pattern: /^STG-RFEA/i, commission: 'escalade' },   // Recyclage SAE
  { pattern: /^STG-RFES/i, commission: 'escalade' },   // Recyclage SNE
  { pattern: /^STG-TEST/i, commission: 'escalade' },   // Tests d'entrée escalade
  { pattern: /^STG-QLGV/i, commission: 'escalade' },   // Monitorat Grandes Voies
  { pattern: /^FOR-CIEA/i, commission: 'escalade' },   // Formation Initiateur SAE
  { pattern: /^FOR-CIEN/i, commission: 'escalade' },   // Formation Initiateur SNE
  { pattern: /^FOR-CIES/i, commission: 'escalade' },   // Formation Grandes Voies
  { pattern: /^FOR-CIEG/i, commission: 'escalade' },   // Escalade sur glace - dry tooling
  { pattern: /^FOR-CTEA/i, commission: 'escalade' },   // Certification Escalade SAE
  { pattern: /^FOR-CTEN/i, commission: 'escalade' },   // Certification Escalade SNE
  { pattern: /^FOR-IIES/i, commission: 'escalade' },   // Instructeur Escalade
  { pattern: /^STG-BFEA/i, commission: 'escalade' },   // FFME Escalade SAE
  { pattern: /^STG-BFES/i, commission: 'escalade' },   // FFME Escalade SNE

  // ============================================================
  // ALPINISME (inclut Cascade de glace, Terrain Montagne/Aventure)
  // ============================================================
  { pattern: /^STG-FAL/i, commission: 'alpinisme' },   // Alpinisme FFCAM
  { pattern: /^STG-FAM/i, commission: 'alpinisme' },   // Terrain Montagne
  { pattern: /^STG-FAT/i, commission: 'alpinisme' },   // Terrain d'Aventure
  { pattern: /^STG-FCG/i, commission: 'alpinisme' },   // Cascade de glace
  { pattern: /^STG-UFALA/i, commission: 'alpinisme' }, // UF vers l'autonomie (neige, rocher, glacier, cascade)
  { pattern: /^STG-UFCG/i, commission: 'alpinisme' },  // UV Cascade de glace
  { pattern: /^STG-UFGV/i, commission: 'alpinisme' },  // UF Grandes verticales
  { pattern: /^STG-UFTV/i, commission: 'alpinisme' },  // UF Techniques verticales
  { pattern: /^STG-UVAM/i, commission: 'alpinisme' },  // Alpinisme UV1 Terrain montagne
  { pattern: /^STG-UVAT/i, commission: 'alpinisme' },  // Alpinisme UV1 Terrain d'aventure
  { pattern: /^STG-UVCG/i, commission: 'alpinisme' },  // UV Cascade de glace
  { pattern: /^STG-RFAL/i, commission: 'alpinisme' },  // Recyclage Alpinisme
  { pattern: /^STG-RFAM/i, commission: 'alpinisme' },  // Recyclage Terrain Montagne
  { pattern: /^STG-RFAT/i, commission: 'alpinisme' },  // Recyclage Terrain d'Aventure
  { pattern: /^FOR-CIAL/i, commission: 'alpinisme' },  // Formation Initiateur Alpinisme
  { pattern: /^FOR-CICG/i, commission: 'alpinisme' },  // Formation Cascade de glace
  { pattern: /^FOR-CTAL/i, commission: 'alpinisme' },  // Certification Alpinisme
  { pattern: /^FOR-IIAL/i, commission: 'alpinisme' },  // Instructeur Alpinisme
  { pattern: /^FOR-ITAL/i, commission: 'alpinisme' },  // Certification Instructeur Alpinisme
  { pattern: /^STG-BFAL/i, commission: 'alpinisme' },  // FFME Alpinisme

  // ============================================================
  // CANYON
  // ============================================================
  { pattern: /^STG-FCA/i, commission: 'canyon' },      // Canyon FFCAM
  { pattern: /^STG-UFCA/i, commission: 'canyon' },     // UF Canyon
  { pattern: /^STG-UFPA/i, commission: 'canyon' },     // UF Progression Autonome Canyon
  { pattern: /^STG-RFCA/i, commission: 'canyon' },     // Recyclage Canyon
  { pattern: /^FOR-CICA/i, commission: 'canyon' },     // Formation Initiateur Canyon

  // ============================================================
  // RANDONNÉE (Montagne, Alpine, Trail)
  // ============================================================
  { pattern: /^STG-FRA/i, commission: 'randonnee' },   // Randonnée Alpine
  { pattern: /^STG-FRD/i, commission: 'randonnee' },   // Randonnée
  { pattern: /^STG-FRM/i, commission: 'randonnee' },   // Randonnée Montagne
  { pattern: /^STG-UFRA/i, commission: 'randonnee' },  // UF vers l'autonomie randonnée
  { pattern: /^STG-UFCO/i, commission: 'randonnee' },  // UF Cartographie Orientation
  { pattern: /^STG-UFCAR/i, commission: 'randonnee' }, // UF Cartographie niveau I
  { pattern: /^STG-UFGPS/i, commission: 'randonnee' }, // UF GPS
  { pattern: /^STG-RFRA/i, commission: 'randonnee' },  // Recyclage Randonnée Alpine
  { pattern: /^STG-RFRD/i, commission: 'randonnee' },  // Recyclage Randonnée
  { pattern: /^STG-RFRM/i, commission: 'randonnee' },  // Recyclage Randonnée Montagne
  { pattern: /^FOR-CIRM/i, commission: 'randonnee' },  // Formation Initiateur Randonnée Montagne
  { pattern: /^FOR-CIRA/i, commission: 'randonnee' },  // Formation Randonnée Alpine
  { pattern: /^FOR-CTRM/i, commission: 'randonnee' },  // Certification Randonnée Montagne
  { pattern: /^FOR-CTRA/i, commission: 'randonnee' },  // Certification Randonnée Alpine
  { pattern: /^FOR-IICO/i, commission: 'randonnee' },  // Instructeur Cartographie Orientation
  { pattern: /^FOR-ITCO/i, commission: 'randonnee' },  // Certification Instructeur CO
  { pattern: /^STG-BFRD/i, commission: 'randonnee' },  // FFME Randonnée
  { pattern: /^STG-UFQO/i, commission: 'randonnee' },  // UV Qualification Orientation FFME

  // ============================================================
  // TRAIL
  // ============================================================
  { pattern: /^FOR-CITR/i, commission: 'trail' },      // Formation Initiateur Trail
  { pattern: /^FOR-CTTR/i, commission: 'trail' },      // Certification Trail

  // ============================================================
  // RAQUETTE
  // ============================================================
  { pattern: /^STG-FRQ/i, commission: 'raquette' },    // Raquettes FFCAM
  { pattern: /^STG-UFSN90/i, commission: 'raquette' }, // UF autonomie raquette
  { pattern: /^STG-RFRQ/i, commission: 'raquette' },   // Recyclage Raquette
  { pattern: /^STG-APTRQ/i, commission: 'raquette' },  // Test aptitude Raquette
  { pattern: /^FOR-CIRQ/i, commission: 'raquette' },   // Formation Initiateur Raquette
  { pattern: /^FOR-CTRQ/i, commission: 'raquette' },   // Certification Raquette
  { pattern: /^STG-BFRQ/i, commission: 'raquette' },   // FFME Raquette

  // ============================================================
  // SKI DE RANDONNÉE / SKI ALPINISME
  // ============================================================
  { pattern: /^STG-FSM/i, commission: 'ski-de-randonnee' },  // Ski Alpinisme, Ski Randonnée
  { pattern: /^STG-UFNA/i, commission: 'ski-de-randonnee' }, // UF Neige et avalanches
  { pattern: /^STG-UFNS/i, commission: 'ski-de-randonnee' }, // UV Neige et sécurité
  { pattern: /^STG-UFSG/i, commission: 'ski-de-randonnee' }, // UF Sécurité Glacier en ski
  { pattern: /^STG-UFSN60/i, commission: 'ski-de-randonnee' }, // UF autonomie ski randonnée
  { pattern: /^STG-UFSN70/i, commission: 'ski-de-randonnee' }, // UF autonomie ski glacier
  { pattern: /^STG-SNFST/i, commission: 'ski-de-randonnee' },  // Faire sa trace en hiver
  { pattern: /^STG-UFFST/i, commission: 'ski-de-randonnee' },  // UF Faire sa trace
  { pattern: /^STG-UFSST/i, commission: 'ski-de-randonnee' },  // UF Suivre sa trace
  { pattern: /^STG-RFSM/i, commission: 'ski-de-randonnee' },   // Recyclage Ski Alpinisme
  { pattern: /^STG-QFSN/i, commission: 'ski-de-randonnee' },   // Qualification ski alpinisme
  { pattern: /^FOR-CISM/i, commission: 'ski-de-randonnee' },   // Formation Ski Alpinisme
  { pattern: /^FOR-CTSM/i, commission: 'ski-de-randonnee' },   // Certification Ski Alpinisme
  { pattern: /^FOR-IISA/i, commission: 'ski-de-randonnee' },   // Instructeur Ski Alpinisme
  { pattern: /^FOR-ITSM/i, commission: 'ski-de-randonnee' },   // Certification Instructeur Ski
  { pattern: /^FOR-IINA/i, commission: 'ski-de-randonnee' },   // Instructeur Neige et Avalanche
  { pattern: /^FOR-ITNA/i, commission: 'ski-de-randonnee' },   // Certification Instructeur NA
  { pattern: /^STG-BFSM/i, commission: 'ski-de-randonnee' },   // FFME Ski Alpinisme
  { pattern: /^STG-QFHM/i, commission: 'ski-de-randonnee' },   // FFME Haute Montagne Randonnée

  // ============================================================
  // SKI DE PISTE / SKI ALPIN
  // ============================================================
  { pattern: /^STG-FSA/i, commission: 'ski-de-piste' },  // Ski Alpin
  { pattern: /^STG-UFSN80/i, commission: 'ski-de-piste' }, // UF autonomie ski hors piste

  // ============================================================
  // SKI DE FOND
  // ============================================================
  { pattern: /^STG-FSF/i, commission: 'ski-de-fond' },   // Ski de Fond

  // ============================================================
  // SNOWBOARD
  // ============================================================
  { pattern: /^STG-FSB/i, commission: 'snowboard-rando' }, // Snowboard de montagne
  { pattern: /^STG-FSL/i, commission: 'snowboard-rando' }, // Snowboard-alpinisme qualification
  { pattern: /^STG-FSU/i, commission: 'snowboard-rando' }, // Snowboard FFCAM
  { pattern: /^STG-UFSB/i, commission: 'snowboard-rando' }, // UF autonomie snowboard
  { pattern: /^STG-RFSL/i, commission: 'snowboard-rando' }, // Recyclage Snowboard Alpinisme
  { pattern: /^FOR-CISB/i, commission: 'snowboard-rando' }, // Formation Snowboard Randonnée
  { pattern: /^FOR-CISL/i, commission: 'snowboard-rando' }, // Formation Snowboard Alpinisme
  { pattern: /^FOR-CTSB/i, commission: 'snowboard-rando' }, // Certification Snowboard
  { pattern: /^FOR-IISL/i, commission: 'snowboard-rando' }, // Instructeur Snowboard Alpinisme
  { pattern: /^FOR-ITSL/i, commission: 'snowboard-rando' }, // Certification Instructeur Snowboard

  // ============================================================
  // VTT / VÉLO DE MONTAGNE
  // ============================================================
  { pattern: /^STG-FVM/i, commission: 'vtt' },         // VTT FFCAM
  { pattern: /^STG-RFVM/i, commission: 'vtt' },        // Recyclage VTT
  { pattern: /^FOR-CIVM/i, commission: 'vtt' },        // Formation Initiateur VTT
  { pattern: /^FOR-ITVM/i, commission: 'vtt' },        // Certification Instructeur VTT

  // ============================================================
  // VIA FERRATA
  // ============================================================
  { pattern: /^STG-UFVF/i, commission: 'via-ferrata' }, // UF Via Ferrata

  // ============================================================
  // MARCHE NORDIQUE
  // ============================================================
  { pattern: /^STG-QFMN/i, commission: 'marche-nordique' }, // Qualification Marche Nordique

  // ============================================================
  // SECOURISME / FORMATION TRANSVERSALE → commission Formation
  // ============================================================
  { pattern: /^STG-PSC1/i, commission: 'formation' },     // PSC1
  { pattern: /^STG-SNSEC/i, commission: 'formation' },    // Secourisme en montagne
  { pattern: /^STG-UFSE/i, commission: 'formation' },     // UF Secours
  { pattern: /^STG-UFSEC/i, commission: 'formation' },    // UF Secourisme en montagne
  { pattern: /^STG-UFFG/i, commission: 'formation' },     // UF Commune aux activités FFCAM
  { pattern: /^STG-FROEPI/i, commission: 'formation' },   // Gestionnaire EPI
  { pattern: /^STG-AFTCA/i, commission: 'formation' },    // Test d'entrée en formation
  { pattern: /^FOR-IIC/i, commission: 'formation' },      // Formation Commune Instructeur

  // ============================================================
  // ENVIRONNEMENT
  // ============================================================
  { pattern: /^FOR-CIFC/i, commission: 'environnement' }, // Formation écologique

  // ============================================================
  // VIE DU CLUB / DIRIGEANTS
  // ============================================================
  { pattern: /^STG-FORDIR/i, commission: 'vie-du-club' }, // Formation dirigeants
  { pattern: /^STG-FORTR/i, commission: 'vie-du-club' },  // Formation trésorerie
  { pattern: /^STG_FCO/i, commission: 'vie-du-club' },    // Formation communication
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
