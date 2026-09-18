/**
 * Tests de `npm run check` avec des dépendances injectées (aucun réseau, aucune base réelle).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runCheck, CheckDeps } from './check';
import { FfcamSsoError } from './auth/ffcam-sso';
import { getAllMappedCommissionSlugs } from './utils/commission-mapping';
import { DatabaseAdapter } from './types';

const tmpDirs: string[] = [];
function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function deps(over: Partial<CheckDeps> & { commissions?: string[]; members?: number; dbThrows?: string } = {}) {
  const lines: string[] = [];
  const commissions = over.commissions ?? getAllMappedCommissionSlugs(); // par défaut : toutes présentes
  const execute = vi.fn(async (sql: string) => {
    if (over.dbThrows) throw new Error(over.dbThrows);
    if (sql.includes('FROM caf_commission')) return [commissions.map(c => ({ code_commission: c })), []];
    if (sql.includes('FROM caf_user')) return [[{ total: over.members ?? 3027 }], []];
    return [[], []];
  });
  const db = { connect: vi.fn(async () => {}), isConnected: () => true, close: vi.fn(async () => {}), execute } as unknown as DatabaseAdapter;
  const base: CheckDeps = {
    config: { EMAIL: 'x@y.z', PASSWORD: 'secret', PROFILE: 'WEBMASTER' },
    getClubCode: vi.fn(() => '6900'),
    getClubConfigDir: vi.fn(() => path.resolve(__dirname, '../config/clubs/lyon')),
    probe: vi.fn(async () => ({ records: 1412, clubCode: '6900' })),
    determineAdapter: vi.fn(() => 'mysql' as const),
    getDatabase: vi.fn(() => db),
    log: line => lines.push(line),
    ...over,
  };
  return { base, lines, execute, db };
}
const output = (lines: string[]) => lines.join('\n');

describe('runCheck', () => {
  it('1. configuration complète : tout est vert, 0 échec', async () => {
    const { base, lines } = deps();
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(0);
    expect(out).toContain('Le profil extranet est bien celui du club 6900');
    expect(out).toContain('Toutes les commissions attendues');
    expect(out).toContain('3027 adhérents du club 6900');
    expect(out).toContain('Configuration prête');
    expect(out).not.toContain('secret');
  });

  it('2. mauvais CLUB_CODE : profil extranet différent et aucun adhérent', async () => {
    const { base, lines } = deps({
      getClubCode: () => '7300',
      probe: async () => ({ records: 1412, clubCode: '6900' }),
      members: 0,
    });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(2);
    expect(out).toContain('club 6900, pas 7300');
    expect(out).toContain('Aucun adhérent avec un cafnum en 7300');
  });

  it('3. identifiants FFCAM absents : probe non appelé', async () => {
    const probe = vi.fn(async () => ({ records: 0, clubCode: null as string | null }));
    const { base, lines } = deps({ config: { EMAIL: '', PASSWORD: '', PROFILE: 'WEBMASTER' }, probe });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('FFCAM_EMAIL / FFCAM_PASSWORD manquants');
    expect(probe).not.toHaveBeenCalled();
  });

  it('4. login SSO refusé', async () => {
    const probe = vi.fn(async () => { throw new FfcamSsoError('login', 'Identifiants FFCAM refusés'); });
    const { base, lines } = deps({ probe });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('Login SSO échoué (login) : Identifiants FFCAM refusés');
  });

  it('5. profil sans niveaux de pratique : avertissement seulement', async () => {
    const { base, lines } = deps({ probe: vi.fn(async () => ({ records: 5, clubCode: null })) });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(0);
    expect(out).toContain('Impossible de lire le code club');
  });

  it('6. CLUB_CODE invalide : pas de "pas null", caf_user non interrogée', async () => {
    const { base, lines, execute } = deps({
      getClubCode: () => { throw new Error('Variable CLUB_CODE non définie ou invalide'); },
    });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).not.toContain('pas null');
    expect(execute.mock.calls.some(([sql]) => (sql as string).includes('FROM caf_user'))).toBe(false);
  });

  it('7. CLUB absent : section 2 ne mentionne pas de fichier', async () => {
    const { base, lines } = deps({
      getClubConfigDir: () => { throw new Error('Variable CLUB non définie'); },
    });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).not.toContain('Fichier');
  });

  it('8. CSV absent : fichier absent', async () => {
    const dir = tmpDir();
    const { base, lines } = deps({ getClubConfigDir: () => dir });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('Fichier absent');
  });

  it('9. CSV illisible (EISDIR)', async () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'groupes-competences-commissions.csv'));
    const { base, lines } = deps({ getClubConfigDir: () => dir });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('Fichier GC illisible');
  });

  it('10. commission manquante en base', async () => {
    const commissions = getAllMappedCommissionSlugs().filter(c => c !== 'escalade');
    const { base, lines } = deps({ commissions });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('absente(s) de caf_commission : escalade');
  });

  it('11. adaptateur SQLite sélectionné : getDatabase non appelé', async () => {
    const { base, lines } = deps({ determineAdapter: () => 'sqlite' as const });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('Base SQLite locale sélectionnée');
    expect(base.getDatabase).not.toHaveBeenCalled();
  });

  it('12. connexion MySQL en échec : close non appelé', async () => {
    const close = vi.fn(async () => {});
    const db = {
      connect: vi.fn(async () => { throw new Error('ECONNREFUSED'); }),
      isConnected: () => false,
      close,
      execute: vi.fn(async () => [[], []] as [any[], any[]]),
    } as unknown as DatabaseAdapter;
    const { base, lines } = deps({ getDatabase: () => db });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('Base de données : ECONNREFUSED');
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    "Table 'caf_commission' doesn't exist",
    "SELECT command denied to user for table 'caf_commission'",
  ])('13. caf_commission illisible bloque le contrôle : %s', async (message) => {
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes('FROM caf_commission')) throw new Error(message);
      if (sql.includes('FROM caf_user')) return [[{ total: 3027 }], []];
      return [[], []];
    });
    const db = { connect: vi.fn(async () => {}), isConnected: () => true, close: vi.fn(async () => {}), execute } as unknown as DatabaseAdapter;
    const { base, lines } = deps({ getDatabase: () => db });
    const failures = await runCheck(base);
    const out = output(lines);
    expect(failures).toBe(1);
    expect(out).toContain('❌ caf_commission illisible');
    expect(out).not.toContain('Configuration prête');
    expect(db.close).toHaveBeenCalledOnce();
  });
});
