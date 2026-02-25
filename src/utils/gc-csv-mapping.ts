/**
 * Utilitaire pour charger le mapping GC → Commissions depuis le fichier CSV
 *
 * Le fichier CSV contient directement les slugs de commission, pas de mapping dans le code.
 * Un même GC peut appartenir à plusieurs commissions (relation many-to-many).
 */

import * as fs from 'fs';
import * as path from 'path';

/** Type pour le mapping GC → commissions */
export type GcCommissionMapping = Map<string, string[]>;

/**
 * Normalise un intitulé de groupe de compétences pour la recherche
 * - Supprime les espaces en début/fin
 * - Normalise les espaces multiples
 * - Garde la casse originale (le CSV est sensible à la casse)
 */
export function normalizeGcIntitule(intitule: string): string {
  return intitule
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parse une ligne CSV qui peut contenir des champs entre guillemets
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

/**
 * Charge le mapping GC → Commissions depuis le fichier CSV
 *
 * @param csvPath - Chemin vers le fichier CSV (par défaut: data/groupes-competences-commissions.csv)
 * @returns Map avec intitulé GC → liste de slugs commission
 *
 * @example
 * const mapping = loadGcMapping();
 * const commissions = mapping.get('1.1 Mon niveau de pratique en alpinisme 1');
 * // → ['alpinisme']
 *
 * const multiCommissions = mapping.get('3.3 Environnement de pratique - milieu montagne 1 (CO1)');
 * // → ['alpinisme', 'ski-randonnee-nordique', 'raquette', 'ski-de-randonnee', 'snowboard-rando', ...]
 */
export function loadGcMapping(csvPath?: string): GcCommissionMapping {
  const defaultPath = path.resolve(__dirname, '../../data/groupes-competences-commissions.csv');
  const filePath = csvPath || defaultPath;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier de mapping GC non trouvé: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');

  // Skip header line
  const dataLines = lines.slice(1);

  const mapping: GcCommissionMapping = new Map();

  for (const line of dataLines) {
    const fields = parseCsvLine(line);

    if (fields.length < 3) {
      console.warn(`Ligne CSV invalide (moins de 3 champs): ${line}`);
      continue;
    }

    const [commission, , groupeCompetences] = fields;
    const normalizedGc = normalizeGcIntitule(groupeCompetences);

    if (!normalizedGc) {
      continue;
    }

    const existingCommissions = mapping.get(normalizedGc) || [];
    if (!existingCommissions.includes(commission)) {
      existingCommissions.push(commission);
    }
    mapping.set(normalizedGc, existingCommissions);
  }

  return mapping;
}

/**
 * Recherche les commissions pour un intitulé de groupe de compétences
 *
 * @param mapping - Le mapping chargé avec loadGcMapping()
 * @param intitule - L'intitulé du groupe de compétences à rechercher
 * @returns Liste des slugs de commission (peut être vide si GC non trouvé)
 */
export function getCommissionsForGc(mapping: GcCommissionMapping, intitule: string): string[] {
  const normalized = normalizeGcIntitule(intitule);
  return mapping.get(normalized) || [];
}

/**
 * Vérifie si un intitulé de GC existe dans le mapping
 */
export function hasGcInMapping(mapping: GcCommissionMapping, intitule: string): boolean {
  const normalized = normalizeGcIntitule(intitule);
  return mapping.has(normalized);
}

/**
 * Retourne des statistiques sur le mapping
 */
export function getMappingStats(mapping: GcCommissionMapping): {
  totalGc: number;
  uniqueCommissions: Set<string>;
  gcWithMultipleCommissions: number;
} {
  const uniqueCommissions = new Set<string>();
  let gcWithMultipleCommissions = 0;

  for (const [, commissions] of mapping) {
    for (const c of commissions) {
      uniqueCommissions.add(c);
    }
    if (commissions.length > 1) {
      gcWithMultipleCommissions++;
    }
  }

  return {
    totalGc: mapping.size,
    uniqueCommissions,
    gcWithMultipleCommissions,
  };
}
