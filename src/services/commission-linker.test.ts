/**
 * Tests du CommissionLinker avec une DB factice (caf_commission simulée).
 */
import { describe, it, expect, vi } from 'vitest';
import { CommissionLinker } from './commission-linker';
import { DatabaseAdapter } from '../types';

function fakeDb(commissions: Record<string, number>) {
  const execute = vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('FROM caf_commission')) {
      const id = commissions[params[0]];
      return [id ? [{ id_commission: id }] : [], []] as [any[], any[]];
    }
    return [[], []] as [any[], any[]];
  });
  return { db: { execute } as unknown as DatabaseAdapter, execute };
}

describe('CommissionLinker', () => {
  it('lie un brevet à la commission trouvée en base', async () => {
    const { db, execute } = fakeDb({ escalade: 7 });
    expect(await new CommissionLinker(db).linkBrevet(42, 'BF1-ES-SAE')).toBe(1);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT IGNORE INTO formation_commission_brevet'), [42, 7]);
  });

  it('mémorise les commissions introuvables sans relancer la requête', async () => {
    const { db, execute } = fakeDb({});
    const linker = new CommissionLinker(db);
    await linker.linkBrevet(1, 'BF1-ES-SAE');
    await linker.linkBrevet(2, 'BF1-ES-BLOC');
    expect(linker.getMissingCommissions()).toEqual(['escalade']);
    expect(execute.mock.calls.filter(([sql]) => sql.includes('FROM caf_commission'))).toHaveLength(1);
  });

  it('affiche les commissions introuvables dans le rapport', async () => {
    const { db } = fakeDb({});
    const linker = new CommissionLinker(db);
    await linker.linkBrevet(1, 'BF1-ES-SAE');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    linker.printWarningsReport();
    expect(log.mock.calls.flat().join('\n')).toContain('escalade');
    log.mockRestore();
  });
});
