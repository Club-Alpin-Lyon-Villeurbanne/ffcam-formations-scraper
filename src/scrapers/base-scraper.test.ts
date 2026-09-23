/**
 * Tests de la reconnexion automatique et des réessais de BaseScraper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BaseScraper, { SessionRejectedError, InvalidResponseError, ScraperConfig } from './base-scraper';
import { ApiRow, ApiResponse } from '../types';
import * as sso from '../auth/ffcam-sso';

type FetchBehavior =
  | { type: 'html' }
  | { type: 'invalid' }
  | { type: 'error'; message: string; cause?: { code: string } }
  | { type: 'http'; status: number }
  | { type: 'data'; rows: ApiRow[]; total: number };

function row(id: string, col1: string): ApiRow {
  return {
    id,
    cell: { col_0: '69000001', col_1: col1, col_2: '', col_3: '', col_4: '', col_5: '', col_6: '', col_7: '', col_8: '' }
  };
}

/** Scraper de test : sessions et réponses simulées, sans réseau ni délai. */
class TestScraper extends BaseScraper<string> {
  ensureSessionCalls = 0;
  fetchCalls: Array<{ sid: string }> = [];
  protected retryDelays = [0, 0, 0];
  private behaviorIndex = 0;

  constructor(private readonly behaviors: FetchBehavior[]) {
    super();
  }

  protected getScraperConfig(): ScraperConfig {
    return { entityName: 'test', entityNamePlural: 'tests', def: 'test_def' };
  }

  protected processRow(row: ApiRow): string | null {
    return row.cell.col_1;
  }

  protected async ensureSession(): Promise<void> {
    this.ensureSessionCalls++;
    this.sessionId = `sid-${this.ensureSessionCalls}`;
  }

  protected async fetchData(url: string): Promise<ApiResponse> {
    const sid = new URL(url).searchParams.get('sid') ?? '';
    this.fetchCalls.push({ sid });

    const behavior = this.behaviors[this.behaviorIndex++];
    if (!behavior) throw new Error('Pas de comportement simulé pour cet appel de fetchData');
    if (behavior.type === 'html') {
      throw new SessionRejectedError('❌ Session extranet refusée (réponse HTML au lieu de JSON).');
    }
    if (behavior.type === 'invalid') {
      throw new InvalidResponseError("Réponse invalide de l'API FFCAM");
    }
    if (behavior.type === 'error') {
      const error: any = new Error(behavior.message);
      if (behavior.cause) error.cause = behavior.cause;
      throw error;
    }
    if (behavior.type === 'http') {
      throw new Error(`Erreur HTTP: ${behavior.status}`);
    }
    return { page: 1, total: behavior.total, records: behavior.rows.length, rows: behavior.rows };
  }

  protected async delay(): Promise<void> {
    // Pas d'attente réelle dans les tests
  }
}

/** Scraper de test : la 3e ligne de la page 1 échoue une seule fois, puis réussit au rejeu de la page. */
class RowFailureScraper extends BaseScraper<string> {
  protected retryDelays = [0, 0, 0];
  private rowFailed = false;

  protected getScraperConfig(): ScraperConfig {
    return { entityName: 'test', entityNamePlural: 'tests', def: 'test_def' };
  }

  protected processRow(row: ApiRow): string | null {
    if (row.cell.col_1 === 'C' && !this.rowFailed) {
      this.rowFailed = true;
      throw new Error('échec simulé sur la 3e ligne');
    }
    return row.cell.col_1;
  }

  protected async ensureSession(): Promise<void> {
    this.sessionId = 'sid';
  }

  protected async fetchData(): Promise<ApiResponse> {
    const rows = [row('1', 'A'), row('2', 'B'), row('3', 'C')];
    return { page: 1, total: 1, records: rows.length, rows };
  }

  protected async delay(): Promise<void> {
    // Pas d'attente réelle dans les tests
  }
}

describe('BaseScraper - reconnexion et réessais', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function errorLogs(): string {
    return errorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
  }

  it('se reconnecte une fois et rejoue la même page après un rejet de session', async () => {
    const resetSpy = vi.spyOn(sso, 'resetSessionCache');
    const scraper = new TestScraper([
      { type: 'html' },
      { type: 'data', rows: [row('1', 'A')], total: 1 }
    ]);

    const results = await scraper.scrape();

    expect(results).toEqual(['A']);
    expect(scraper.ensureSessionCalls).toBe(2);
    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(scraper.fetchCalls).toHaveLength(2);
    expect(scraper.fetchCalls[0].sid).toBe('sid-1');
    expect(scraper.fetchCalls[1].sid).toBe('sid-2');
    expect(scraper.fetchCalls[1].sid).not.toBe(scraper.fetchCalls[0].sid);
  });

  it('session (HTML) refusée trois fois de suite : 2 re-logins puis échec fatal, sans réessai', async () => {
    const resetSpy = vi.spyOn(sso, 'resetSessionCache');
    const scraper = new TestScraper([
      { type: 'html' },
      { type: 'html' },
      { type: 'html' }
    ]);

    await expect(scraper.scrape()).rejects.toBeInstanceOf(SessionRejectedError);
    expect(scraper.ensureSessionCalls).toBe(3);
    expect(resetSpy).toHaveBeenCalledTimes(2);
    expect(errorLogs()).not.toContain('↻');
  });

  it('ne duplique pas les lignes déjà traitées quand une ligne échoue en cours de page', async () => {
    const scraper = new RowFailureScraper();

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'B', 'C']);
  });

  it('page 2 en erreur réseau 2 fois puis réussie : toutes les pages, aucune page manquante', async () => {
    const scraper = new TestScraper([
      { type: 'data', rows: [row('1', 'A')], total: 2 },
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } },
      { type: 'data', rows: [row('2', 'B')], total: 2 }
    ]);

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'B']);
    expect(scraper.missingPages).toEqual([]);
    const retryLogs = errorSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes('ECONNRESET'));
    expect(retryLogs).toHaveLength(2);
  });

  it('page 2 en erreur réseau 4 fois : abandon de la page 2, les autres pages sont récupérées', async () => {
    const scraper = new TestScraper([
      { type: 'data', rows: [row('1', 'A')], total: 3 },
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } },
      { type: 'data', rows: [row('3', 'C')], total: 3 }
    ]);
    const delaySpy = vi.spyOn(scraper as any, 'delay');

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'C']);
    expect(scraper.missingPages).toEqual([2]);
    expect(errorLogs()).toContain('✗ Page 2 abandonnée');
    // Délai après la page 1 (succès) et après l'abandon de la page 2, avant la page 3
    expect(delaySpy).toHaveBeenCalledTimes(2);
  });

  it('page 1 en erreur réseau 4 fois : rejet nommant la page 1, rien de récupérable pour ce type', async () => {
    const scraper = new TestScraper([
      { type: 'error', message: 'fetch failed', cause: { code: 'ETIMEDOUT' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ETIMEDOUT' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ETIMEDOUT' } },
      { type: 'error', message: 'fetch failed', cause: { code: 'ETIMEDOUT' } }
    ]);

    await expect(scraper.scrape()).rejects.toThrow(/Page 1/);
  });

  it('HTTP 404 sur la page 2 : abandon direct sans réessai', async () => {
    const scraper = new TestScraper([
      { type: 'data', rows: [row('1', 'A')], total: 3 },
      { type: 'http', status: 404 },
      { type: 'data', rows: [row('3', 'C')], total: 3 }
    ]);

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'C']);
    expect(scraper.missingPages).toEqual([2]);
    expect(errorLogs()).not.toContain('↻');
    expect(errorLogs()).toContain('✗ Page 2 abandonnée');
  });

  it('HTTP 429 sur la page 2 puis réussite : réessayée comme une erreur transitoire', async () => {
    const scraper = new TestScraper([
      { type: 'data', rows: [row('1', 'A')], total: 2 },
      { type: 'http', status: 429 },
      { type: 'data', rows: [row('2', 'B')], total: 2 }
    ]);

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'B']);
    expect(scraper.missingPages).toEqual([]);
    expect(errorLogs()).toContain('↻ Page 2');
  });

  it('session rejetée en page 1 (re-login) puis erreur réseau en page 2 (réessai) : tout est récupéré', async () => {
    const resetSpy = vi.spyOn(sso, 'resetSessionCache');
    const scraper = new TestScraper([
      { type: 'html' },                                                          // page 1 : session rejetée → reconnexion
      { type: 'data', rows: [row('1', 'A')], total: 2 },                         // page 1 rejouée après reconnexion
      { type: 'error', message: 'fetch failed', cause: { code: 'ECONNRESET' } }, // page 2 : erreur réseau
      { type: 'data', rows: [row('2', 'B')], total: 2 }                          // page 2 réessayée
    ]);

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'B']);
    expect(scraper.missingPages).toEqual([]);
    expect(scraper.ensureSessionCalls).toBe(2);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });
});
