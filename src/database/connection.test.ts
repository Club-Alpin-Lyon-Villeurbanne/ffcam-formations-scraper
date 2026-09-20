/**
 * Test du cache adhérents (par préfixe de cafnum) de DatabaseConnection.
 * La connexion MySQL réelle n'est pas disponible en test : on injecte execute()
 * comme suggéré dans le brief (Object.assign sur l'instance).
 */
import { describe, it, expect, vi } from 'vitest';
import { getInstance } from './connection';

describe('DatabaseConnection - cache des adhérents par préfixe de cafnum', () => {
  it('un seul SELECT pour plusieurs cafnums du même préfixe, cafnum inconnu → null sans requête supplémentaire', async () => {
    const rows = [
      { id_user: 11, cafnum_user: '690020190001' },
      { id_user: 12, cafnum_user: '690020190002' }
    ];
    const execute = vi.fn(async (sql: string, _params: any[] = []) => {
      if (sql.includes('LIKE')) {
        return [rows, []] as [any[], any[]];
      }
      return [[], []] as [any[], any[]];
    });

    const adapter = getInstance();
    Object.assign(adapter, { execute, connection: {} });

    expect(await adapter.getUserIdFromCafnum('690020190001')).toBe(11);
    expect(await adapter.getUserIdFromCafnum('690020190002')).toBe(12);
    expect(await adapter.getUserIdFromCafnum('690099999999')).toBeNull();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('LIKE'), ['6900%']);
  });

  it('cafnum vide ou trop court → null sans requête', async () => {
    const execute = vi.fn(async () => [[], []] as [any[], any[]]);

    const adapter = getInstance();
    Object.assign(adapter, { execute, connection: {} });

    expect(await adapter.getUserIdFromCafnum('')).toBeNull();
    expect(await adapter.getUserIdFromCafnum('690')).toBeNull();

    expect(execute).not.toHaveBeenCalled();
  });

  it('trouve un cafnum malgré un espace de fin renvoyé par MySQL (LIKE ignore les espaces, Map.get non)', async () => {
    const rows = [{ id_user: 5, cafnum_user: '690020190005 ' }];
    const execute = vi.fn(async (sql: string, _params: any[] = []) => {
      if (sql.includes('LIKE')) {
        return [rows, []] as [any[], any[]];
      }
      return [[], []] as [any[], any[]];
    });

    const adapter = getInstance();
    // Cache vidé pour ne pas dépendre du préfixe déjà rempli par les tests précédents
    Object.assign(adapter, { execute, connection: {}, usersByCafnum: new Map() });

    expect(await adapter.getUserIdFromCafnum('690020190005')).toBe(5);
    expect(await adapter.getUserIdFromCafnum(' 690020190005 ')).toBe(5);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
