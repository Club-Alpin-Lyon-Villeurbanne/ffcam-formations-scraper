/**
 * Tests de la reconnexion automatique et des réessais de BaseScraper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BaseScraper, { SessionRejectedError, InvalidResponseError, ScraperConfig, describeInvalidBody } from './base-scraper';
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

describe('describeInvalidBody', () => {
  const describe_ = (text: string) => {
    try { JSON.parse(text); } catch (error: any) { return describeInvalidBody(text, error); }
    throw new Error('JSON valide');
  };

  it('réponse vide', () => {
    expect(describe_('  ')).toBe('réponse vide');
  });

  it('erreur PHP de limite mémoire : type, limite, fichier et ligne, sans le JSON qui suit', () => {
    const out = describe_('<br />\n<b>Fatal error</b>:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 20480 bytes) in <b>/var/www/grid.php</b> on line <b>12</b><br />{"rows":["DUPONT JEAN"]}');
    expect(out).toContain('erreur PHP « Fatal error » : Allowed memory size of 134217728 bytes exhausted (/var/www/grid.php:12)');
    expect(out).not.toContain('DUPONT');
  });

  it("exception SQL : type et emplacement seulement, jamais le message qui peut contenir un nom", () => {
    const out = describe_("<b>Fatal error</b>: Uncaught mysqli_sql_exception: Duplicate entry 'DUPONT Jean' for key 'nom' in /var/www/db.php on line 40");
    expect(out).toContain('erreur PHP « Fatal error » (/var/www/db.php:40)');
    expect(out).not.toMatch(/DUPONT|Duplicate/);
  });

  it('décrit un JSON cassé par sa position et le caractère fautif, sans son contenu', () => {
    const out = describe_('{"rows":[{"n":"DUPONT\tJEAN"}]}');
    expect(out).toMatch(/^\d+ caractères, JSON invalide \(Bad control character in string literal in JSON at position 21\b.*, caractère U\+0009\)$/);
    expect(out).not.toContain('DUPONT');
  });

  it('JSON tronqué', () => {
    const out = describe_('{"rows":[{"n":"DUPONT');
    expect(out).toContain('JSON invalide (Unterminated string');
    expect(out).not.toContain('DUPONT');
  });

  it('situe la ligne et la colonne fautives dans la page', () => {
    const out = describe_('{"rows":[{"id":"1","cell":{"col_0":"A"}},{"id":"2","cell":{"col_0":"B","col_5":"DUPONT\tJEAN"}}]}');
    expect(out).toContain('caractère U+0009, vers la ligne 2 de la page (col_5))');
    expect(out).not.toContain('DUPONT');
  });

  it("ne cite pas un texte non reconnu, qui pourrait contenir un nom", () => {
    const out = describe_('<!doctype html><body>Bonjour Jean DUPONT</body>');
    expect(out).toContain('texte non reconnu commençant par U+003C');
    expect(out).not.toMatch(/DUPONT|Bonjour/);
  });

  it('JSON complet suivi d\'un message PHP : cite le message, sans désigner de ligne', () => {
    const out = describe_('{"rows":[{"id":"1","cell":{"col_0":"DUPONT"}}]}<br /><b>Warning</b>: Undefined index col_9 in /var/www/grid.php on line 3');
    expect(out).toContain('JSON complet suivi de erreur PHP « Warning » (/var/www/grid.php:3)');
    expect(out).not.toMatch(/DUPONT|vers la ligne/);
  });

  it('erreur sans position (token inattendu) : pas de ligne devinée, pas de caractère du corps', () => {
    const out = describe_('{"rows":[{"id":"1","cell":{"col_0":NaN}},{"id":"2","cell":{"col_0":"B"}}]}');
    expect(out).toMatch(/JSON invalide \(Unexpected token\)$/);
  });

  it("erreur dans l'identifiant d'une ligne : bonne ligne, sans colonne", () => {
    const out = describe_('{"rows":[{"id":"1","cell":{"col_0":"A"}},{"id":"2\t"}]}');
    expect(out).toContain('caractère U+0009, vers la ligne 2 de la page)');
  });

  it("réponse coupée : dernière ligne commencée", () => {
    const out = describe_('{"rows":[{"id":"1","cell":{"col_0":"A"}},{"id":"2","cell":{"col_0":"DUP');
    expect(out).toContain('vers la ligne 2 de la page (col_0)');
    expect(out).not.toContain('DUP"');
  });
});

/** Grille simulée de 90 enregistrements (3 pages de 30) : toute requête couvrant un enregistrement illisible échoue. */
class GridScraper extends BaseScraper<string> {
  protected rowsPerPage = 30;
  protected retryDelays = [0, 0, 0];
  constructor(private readonly unreadable: number[], private readonly networkPages: number[] = []) { super(); }
  protected getScraperConfig(): ScraperConfig { return { entityName: 'test', entityNamePlural: 'tests', def: 'test_def' }; }
  protected processRow(r: ApiRow): string | null { return r.cell.col_1; }
  protected async ensureSession(): Promise<void> { this.sessionId = 'sid'; }
  protected async delay(): Promise<void> {}
  protected async fetchData(url: string): Promise<ApiResponse> {
    const params = new URL(url).searchParams;
    const rows = Number(params.get('rows'));
    const page = Number(params.get('page'));
    const first = (page - 1) * rows + 1;
    const last = Math.min(page * rows, 90);
    if (rows === 30 && this.networkPages.includes(page)) throw new Error('fetch failed', { cause: { code: 'ECONNRESET' } });
    if (this.unreadable.some(i => i >= first && i <= last)) {
      throw new InvalidResponseError("Réponse invalide de l'API FFCAM : 12 caractères, JSON invalide (x)");
    }
    const data = Array.from({ length: Math.max(0, last - first + 1) }, (_, k) => row(String(first + k), String(first + k)));
    return { page, total: 3, records: 90, rows: data };
  }
}

describe('BaseScraper - diagnostic des pages illisibles', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const logs = () => errorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("situe l'enregistrement illisible de la première page abandonnée, une seule fois par type", async () => {
    const scraper = new GridScraper([47, 75]);

    const results = await scraper.scrape();

    expect(results).toHaveLength(30);
    expect(scraper.missingPages).toEqual([2, 3]);
    expect(logs()).toContain('🔎 Page 2 (rangs 31-60) relue par blocs de 10 : 1/3 illisibles : 41-50');
    expect(logs()).toContain('🔎 Bloc 41-50 relu ligne à ligne : n°47 illisible (12 caractères, JSON invalide (x))');
    expect(logs()).toContain('🔎 Dernier enregistrement (n°90) : lisible');
    expect(logs().match(/🔎 Page/g)).toHaveLength(1);
  });

  it('diagnostique la première page illisible même après une page perdue sur erreur réseau', async () => {
    const scraper = new GridScraper([75], [2]);

    await scraper.scrape();

    expect(scraper.missingPages).toEqual([2, 3]);
    expect(logs()).toContain('🔎 Page 3 (rangs 61-90) relue par blocs de 10 : 1/3 illisibles : 71-80');
    expect(logs()).toContain('n°75 illisible');
  });
});

