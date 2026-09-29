/**
 * Codes de commission du club, dans config/clubs/<club>/correspondance-commissions.csv
 * (obligatoire ; en-tête seul si ce sont ceux de Lyon, utilisés par le mapping).
 * Une ligne par cible : un code peut alimenter plusieurs commissions du club ; une cible vide ignore le code.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getClubConfigDir } from '../config';

export type CommissionAliases = Map<string, string[]>;

export const ALIASES_FILE = 'correspondance-commissions.csv';
const HEADER = 'code,code_club';
const CODE = /^[\w-]+$/;

export function loadCommissionAliases(clubDir: string = getClubConfigDir()): CommissionAliases {
  const filePath = path.join(clubDir, ALIASES_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier absent : ${path.relative(process.cwd(), filePath)} (vérifiez CLUB, ou créez-le avec l'en-tête ${HEADER})`);
  }

  const content = fs.readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const [header = '', ...lines] = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (header !== HEADER) throw new Error(`${ALIASES_FILE} : en-tête "${header}" au lieu de "${HEADER}"`);

  const aliases: CommissionAliases = new Map();
  for (const line of lines) {
    const fields = line.split(',').map(f => f.trim());
    const [code, codeClub] = fields;
    if (fields.length !== 2 || !CODE.test(code) || (codeClub && !CODE.test(codeClub))) {
      throw new Error(`${ALIASES_FILE} : ligne invalide "${line}" (attendu : code,code_club)`);
    }
    const targets = aliases.get(code);
    if (targets && (!codeClub || targets.length === 0)) {
      throw new Error(`${ALIASES_FILE} : "${code}" est ignoré (cible vide) mais a d'autres lignes`);
    }
    aliases.set(code, codeClub ? [...(targets ?? []), codeClub] : []);
  }
  return aliases;
}

export function toClubCodes(codes: string[], aliases: CommissionAliases): string[] {
  return [...new Set(codes.flatMap(code => aliases.get(code) ?? [code]))];
}
