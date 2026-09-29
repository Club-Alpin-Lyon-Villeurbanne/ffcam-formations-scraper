import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadCommissionAliases, toClubCodes } from './commission-aliases';

const tmpDirs: string[] = [];
function clubDir(content?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aliases-test-'));
  tmpDirs.push(dir);
  if (content !== undefined) fs.writeFileSync(path.join(dir, 'correspondance-commissions.csv'), content);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadCommissionAliases', () => {
  it('fichier absent (CLUB erroné) : erreur', () => {
    expect(() => loadCommissionAliases(clubDir())).toThrow('Fichier absent');
  });

  it('en-tête seul : aucune correspondance', () => {
    expect(loadCommissionAliases(clubDir('code,code_club\n')).size).toBe(0);
  });

  it('plusieurs cibles pour un code, cible vide = code ignoré, BOM et fins de ligne CRLF', () => {
    const aliases = loadCommissionAliases(clubDir('\uFEFFcode,code_club\r\nski-de-randonnee,ski-alpinisme\r\nski-de-randonnee,Ski_Alpinisme_Competition\r\nvia-ferrata,\r\n'));
    expect(aliases.get('ski-de-randonnee')).toEqual(['ski-alpinisme', 'Ski_Alpinisme_Competition']);
    expect(aliases.get('via-ferrata')).toEqual([]);
  });

  it.each([
    ['en-tête manquant', 'escalade,escalade-adulte\n', 'en-tête'],
    ['séparateur ;', 'code,code_club\nescalade;escalade-adulte\n', 'ligne invalide'],
    ['colonne en trop', 'code,code_club\nescalade,escalade-adulte,x\n', 'ligne invalide'],
    ['code vide', 'code,code_club\n,escalade-adulte\n', 'ligne invalide'],
    ['fichier vide', '', 'en-tête ""'],
    ['code ignoré puis traduit', 'code,code_club\nvia-ferrata,\nvia-ferrata,alpinisme\n', 'est ignoré'],
    ['code traduit puis ignoré', 'code,code_club\nvia-ferrata,alpinisme\nvia-ferrata,\n', 'est ignoré'],
  ])('refuse un fichier mal formé : %s', (_, content, message) => {
    expect(() => loadCommissionAliases(clubDir(content))).toThrow(message);
  });

  it('les fichiers de Lyon et Chambéry se chargent', () => {
    expect(loadCommissionAliases(path.resolve(__dirname, '../../config/clubs/lyon')).get('speleologie')).toEqual([]);
    const aliases = loadCommissionAliases(path.resolve(__dirname, '../../config/clubs/chambery'));
    expect(aliases.get('escalade')).toEqual(['escalade-adulte']);
    expect(aliases.get('marche-nordique')).toEqual([]);
  });
});

describe('toClubCodes', () => {
  const aliases = new Map([['escalade', ['escalade-adulte']], ['snowboard-rando', ['ski-alpinisme']], ['ski-de-randonnee', ['ski-alpinisme', 'ski-alpinisme-competition']], ['via-ferrata', []]]);

  it('traduit, garde les codes sans correspondance, retire les ignorés et les doublons', () => {
    expect(toClubCodes(['escalade', 'canyon', 'via-ferrata', 'snowboard-rando', 'ski-de-randonnee'], aliases))
      .toEqual(['escalade-adulte', 'canyon', 'ski-alpinisme', 'ski-alpinisme-competition']);
  });
});
