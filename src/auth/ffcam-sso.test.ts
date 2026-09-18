/**
 * Tests du flux SSO FFCAM avec un fetch simulé (réponses observées le 2026-09-18).
 */
import { describe, it, expect, vi } from 'vitest';
import { obtainSessionId, extractSid, pickProfile } from './ffcam-sso';

const LOGIN_SSO_HTML = `<html><script>
window.onload = function () {
    window.location.href = 'Effectifs/accueil.php?sid=lZnpAbC123&ish=' + height + '&isw=' + width;
}</script></html>`;

const PROFILES = [
  { extranetId: '15230', profile: 'CLUB - WEBMASTER' },
  { extranetId: '21465', profile: 'SIEGE - CONSULTATION' },
];

function fakeFetch(overrides: Record<string, () => Response> = {}) {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const routes: Record<string, () => Response> = {
    'user/logged': () => json({ success: true, sessionToken: 'JWT session.token.x' }),
    'select-app-id': () => json({ action: 'selectExtranet', extranetIds: PROFILES }),
    'select-extranet-id': () => json({ action: 'redirect', redirectUri: 'https://extranet-clubalpin.com/app/login_sso.php', accessToken: 'JWT a', refreshToken: 'JWT b' }),
    'login_sso.php': () => new Response(LOGIN_SSO_HTML, { status: 200 }),
    ...overrides,
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = Object.keys(routes).find(k => url.includes(k));
    if (!route) throw new Error(`Route non simulée : ${url}`);
    return routes[route]();
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('extractSid', () => {
  it('extrait le sid du HTML de login_sso.php', () => {
    expect(extractSid(LOGIN_SSO_HTML)).toBe('lZnpAbC123');
  });
  it('retourne null si absent', () => {
    expect(extractSid('<html>Session expirée</html>')).toBeNull();
  });
});

describe('pickProfile', () => {
  it('trouve un profil par sous-chaîne insensible à la casse', () => {
    expect(pickProfile(PROFILES, 'webmaster').extranetId).toBe('15230');
  });
  it('liste les profils disponibles si aucun ne correspond', () => {
    expect(() => pickProfile(PROFILES, 'PRESIDENT')).toThrow('CLUB - WEBMASTER');
  });
  it('échoue si plusieurs profils correspondent', () => {
    expect(() => pickProfile(PROFILES, 'C')).toThrow(/plusieurs profils/i);
  });
});

describe('obtainSessionId', () => {
  const creds = { email: 'x@y.z', password: 'secret' };

  it('enchaîne les 4 requêtes et retourne le sid', async () => {
    const { impl, calls } = fakeFetch();
    expect(await obtainSessionId(creds, impl)).toBe('lZnpAbC123');
    expect(calls.map(c => c.url.split('?')[0])).toEqual([
      'https://api.portail.ffcam.fr/user/logged',
      'https://api.portail.ffcam.fr/for-session/auth/select-app-id',
      'https://api.portail.ffcam.fr/for-session/auth/select-extranet-id',
      'https://extranet-clubalpin.com/app/login_sso.php',
    ]);
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('JWT session.token.x');
    expect(JSON.stringify(calls.slice(1))).not.toContain('secret');
  });

  it('gère un compte à profil unique (redirect direct)', async () => {
    const { impl, calls } = fakeFetch({
      'select-app-id': () => new Response(JSON.stringify({ action: 'redirect', redirectUri: 'https://extranet-clubalpin.com/app/login_sso.php', accessToken: 'JWT a', refreshToken: 'JWT b' })),
    });
    expect(await obtainSessionId(creds, impl)).toBe('lZnpAbC123');
    expect(calls.some(c => c.url.includes('select-extranet-id'))).toBe(false);
  });

  it('signale des identifiants refusés sans réessayer', async () => {
    const { impl, calls } = fakeFetch({ 'user/logged': () => new Response('{}', { status: 401 }) });
    await expect(obtainSessionId(creds, impl)).rejects.toMatchObject({ step: 'login' });
    expect(calls).toHaveLength(1);
  });

  it('signale des identifiants refusés même en HTTP 400 (comportement réel du portail)', async () => {
    const { impl } = fakeFetch({
      'user/logged': () => new Response(JSON.stringify({ namespace: 'user', status: 400, code: 'authenticationFailed', data: {} }), { status: 400 }),
    });
    await expect(obtainSessionId(creds, impl)).rejects.toMatchObject({ step: 'login' });
  });

  it("signale une action inattendue de l'API", async () => {
    const { impl } = fakeFetch({ 'select-app-id': () => new Response('{"action":"selectClub"}') });
    await expect(obtainSessionId(creds, impl)).rejects.toMatchObject({ step: 'select-app' });
  });

  it('signale un sid introuvable', async () => {
    const { impl } = fakeFetch({ 'login_sso.php': () => new Response('<html>Token invalide</html>') });
    await expect(obtainSessionId(creds, impl)).rejects.toMatchObject({ step: 'exchange' });
  });
});
