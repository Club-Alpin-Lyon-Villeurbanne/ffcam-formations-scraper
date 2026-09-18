import { describe, it, expect } from 'vitest';
import { getClubCode, isClubMember, getClubConfigDir } from './config';

describe('getClubCode', () => {
  it('accepte un code à 4 chiffres', () => {
    expect(getClubCode('6900')).toBe('6900');
    expect(getClubCode(' 6900 ')).toBe('6900');
  });
  it.each([undefined, '', '690', '69000', 'lyon'])('rejette %s', (value) => {
    expect(() => getClubCode(value)).toThrow('CLUB_CODE');
  });
});

describe('isClubMember', () => {
  it('filtre sur le code club (4 premiers chiffres du cafnum)', () => {
    expect(isClubMember('690020190027', '6900')).toBe(true);
    expect(isClubMember('652019850001', '6900')).toBe(false);
    expect(isClubMember('690120190027', '6900')).toBe(false); // autre club du Rhône
    expect(isClubMember('', '6900')).toBe(false);
  });
});

describe('getClubConfigDir', () => {
  it('pointe vers config/clubs/<club>', () => {
    expect(getClubConfigDir('lyon')).toMatch(/config[\\/]clubs[\\/]lyon$/);
  });
  it('lève une erreur explicite si CLUB est absent', () => {
    expect(() => getClubConfigDir(undefined)).toThrow('Variable CLUB non définie');
    expect(() => getClubConfigDir('')).toThrow('Variable CLUB non définie');
  });
});
