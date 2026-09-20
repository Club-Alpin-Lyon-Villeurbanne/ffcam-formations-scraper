/**
 * Tests de la reconnexion automatique de BaseScraper quand l'extranet rejette le sid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BaseScraper, { SessionRejectedError, ScraperConfig } from './base-scraper';
import { ApiRow, ApiResponse } from '../types';
import * as sso from '../auth/ffcam-sso';

type FetchBehavior =
  | { type: 'reject' }
  | { type: 'error'; message: string }
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
    if (behavior.type === 'reject') {
      throw new SessionRejectedError("Réponse invalide de l'API FFCAM");
    }
    if (behavior.type === 'error') {
      throw new Error(behavior.message);
    }
    return { page: 1, total: behavior.total, records: behavior.rows.length, rows: behavior.rows };
  }

  protected async delay(): Promise<void> {
    // Pas d'attente réelle dans les tests
  }
}

describe('BaseScraper - reconnexion sur session extranet refusée', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('se reconnecte une fois et rejoue la même page après un rejet de session', async () => {
    const resetSpy = vi.spyOn(sso, 'resetSessionCache');
    const scraper = new TestScraper([
      { type: 'reject' },
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

  it('échoue avec SessionRejectedError si la session est refusée deux fois de suite', async () => {
    const resetSpy = vi.spyOn(sso, 'resetSessionCache');
    const scraper = new TestScraper([{ type: 'reject' }, { type: 'reject' }]);

    await expect(scraper.scrape()).rejects.toBeInstanceOf(SessionRejectedError);
    expect(scraper.ensureSessionCalls).toBe(2);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('ignore toujours une erreur ordinaire sur une page suivante et continue les pages restantes', async () => {
    const resetSpy = vi.spyOn(sso, 'resetSessionCache');
    const scraper = new TestScraper([
      { type: 'data', rows: [row('1', 'A')], total: 3 },
      { type: 'error', message: 'Erreur temporaire' },
      { type: 'data', rows: [row('3', 'C')], total: 3 }
    ]);

    const results = await scraper.scrape();

    expect(results).toEqual(['A', 'C']);
    expect(scraper.ensureSessionCalls).toBe(1);
    expect(resetSpy).not.toHaveBeenCalled();
  });
});
