/** Le CSV du club donne directement les slugs de commission ; un GC peut relever de plusieurs commissions. */

import * as fs from 'fs';
import * as path from 'path';
import { getClubConfigDir } from '../config';

export type GcCommissionMapping = Map<string, string[]>;

/** Normalise les espaces ; garde la casse, à laquelle le CSV est sensible */
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
        // Guillemet doublé = guillemet littéral
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

/** @param csvPath par défaut config/clubs/<CLUB>/groupes-competences-commissions.csv */
export function loadGcMapping(csvPath?: string): GcCommissionMapping {
  const filePath = csvPath || path.join(getClubConfigDir(), 'groupes-competences-commissions.csv');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier de mapping GC non trouvé: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');

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

/** Tableau vide si le GC est absent du CSV */
export function getCommissionsForGc(mapping: GcCommissionMapping, intitule: string): string[] {
  const normalized = normalizeGcIntitule(intitule);
  return mapping.get(normalized) || [];
}

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
