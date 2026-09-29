/**
 * Codes de commission propres à un club, dans config/clubs/<club>/correspondance-commissions.csv (facultatif).
 * Une ligne par cible : un code peut alimenter plusieurs commissions du club ; une cible vide ignore le code.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getClubConfigDir } from '../config';

export type CommissionAliases = Map<string, string[]>;

export const ALIASES_FILE = 'correspondance-commissions.csv';
const HEADER = 'code,code_club';
const CODE = /^[a-z0-9-]+$/;

export function loadCommissionAliases(clubDir: string = getClubConfigDir()): CommissionAliases {
  const aliases: CommissionAliases = new Map();
  const filePath = path.join(clubDir, ALIASES_FILE);
  if (!fs.existsSync(filePath)) return aliases;

  const [header, ...lines] = fs.readFileSync(filePath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
  if (header !== HEADER) throw new Error(`${ALIASES_FILE} : en-tête "${header}" au lieu de "${HEADER}"`);

  for (const line of lines) {
    const fields = line.split(',').map(f => f.trim());
    const [code, codeClub] = fields;
    if (fields.length !== 2 || !CODE.test(code) || (codeClub && !CODE.test(codeClub))) {
      throw new Error(`${ALIASES_FILE} : ligne invalide "${line}" (attendu : code,code_club)`);
    }
    const targets = aliases.get(code) ?? [];
    if (codeClub && !targets.includes(codeClub)) targets.push(codeClub);
    aliases.set(code, targets);
  }
  return aliases;
}

export function toClubCodes(codes: string[], aliases: CommissionAliases): string[] {
  return [...new Set(codes.flatMap(code => aliases.get(code) ?? [code]))];
}
