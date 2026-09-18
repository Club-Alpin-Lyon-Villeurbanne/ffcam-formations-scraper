# Plan d'implémentation : scraper multi-club avec import automatique

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qu'un club utilisant plateforme-club-alpin (Lyon, Chambéry, …) fasse tourner le scraper avec un `.env` et un dossier `config/clubs/<club>/`, sans toucher au code ni copier de session à la main, et que l'import tourne chaque semaine tout seul via GitHub Actions.

**Architecture:** Authentification par login SSO (identifiants dans `.env`) à la place du `sid` copié à la main. Ce qui est propre à un club vit dans `config/clubs/<club>/` (sélectionné par `CLUB`). Une commande `check` valide la configuration avant le premier import. Le mapping FFCAM → commission reste dans le code (référentiels nationaux).

**Tech Stack:** TypeScript, Node 22 (`fetch` natif), vitest, GitHub Actions. Aucune nouvelle dépendance.

**Spec:** Analyse en session le 2026-09-18. Flux SSO vérifié empiriquement le même jour (sonde exécutée avec de vrais identifiants).

## Contexte

Ce qui lie le script au club de Lyon, ou empêche l'automatisation :

1. `FFCAM_SESSION_ID` copié à la main depuis l'URL de l'extranet, expire en quelques heures → impossible à planifier, étape la plus rebutante de l'onboarding.
2. `src/config.ts:38` — `CLUB_CAFNUM_PREFIXES = ['6900', '690']` hardcodé, appliqué par `shouldFilterRow()` dans les 4 scrapers → un autre club voit toutes ses lignes filtrées. Le filtre est **nécessaire** : la grille des brevets est nationale (48 827 lignes, tous clubs, vérifié le 2026-09-18). Et `'690'` est trop large : il accepte les clubs `6901`…`6909`.
3. `data/groupes-competences-commissions.csv` : gitignoré (`/data/`, `*.csv`) **et** propre à chaque club (le rattachement d'un groupe de compétences à une commission dépend de l'organisation du club).
4. Les slugs de commission (`escalade`, `snowboard-rando`, …) doivent exister dans `caf_commission.code_commission` ; un slug absent est ignoré en silence (`getCommissionId()` → `null`, aucun log).
5. `CommissionLinker.printWarningsReport()` n'est jamais appelé dans `src/import.ts`, et n'affiche que 5 alertes par type.

Décisions :
- **Une seule authentification** : SSO. `FFCAM_SESSION_ID` disparaît.
- **Le club est identifié par son code FFCAM à 4 chiffres** (`CLUB_CODE=6900` pour Lyon). Un cafnum = `code club (4) + année (4) + n° (4)` ; les grilles compétences et niveaux exposent ce code dans chaque ligne (`col_2`), et dans `caf_user` les adhérents actifs de Lyon ont tous un cafnum en `6900…`. `CLUB_CODE` sert au filtre et permet à `check` de vérifier qu'extranet **et** base parlent du même club.
- **Pas d'alias de slugs pour l'instant** : on ne sait pas si ceux de Chambéry diffèrent. `check` listera les slugs manquants ; on ajoutera un mécanisme si le besoin est réel.

## Global Constraints

- Aucune nouvelle dépendance npm.
- Le mot de passe FFCAM n'apparaît jamais dans un log ; le `sid` est affiché tronqué.
- Commentaires, messages console et commits en français avec accents (convention du dépôt).
- Chaque tâche laisse `pnpm run type-check` et `pnpm run test` au vert.

**Ordre :** 0 → 1 → 2 → 3 → 4 → 5 → 6.

---

### Task 0 : Authentification SSO (`FFCAM_EMAIL` / `FFCAM_PASSWORD`)

Flux vérifié le 2026-09-18 :

```
POST https://api.portail.ffcam.fr/user/logged                         {email, password}
  → {success: true, sessionToken: "JWT …"}
POST https://api.portail.ffcam.fr/for-session/auth/select-app-id      {appId: "extranet.xyntxutqx1"}   Authorization: JWT …
  → {action: "selectExtranet", extranetIds: [{extranetId: "15230", profile: "CLUB - WEBMASTER"}, …]}
     (ou directement {action: "redirect", …} si le compte n'a qu'un profil)
POST https://api.portail.ffcam.fr/for-session/auth/select-extranet-id {appId, extranetId}
  → {action: "redirect", redirectUri: "https://extranet-clubalpin.com/app/login_sso.php", accessToken, refreshToken}
GET  {redirectUri}?refreshToken=…&accessToken=…
  → HTML contenant : window.location.href = 'Effectifs/accueil.php?sid=XXXX&ish=…'
```

`appId` est l'identifiant de l'application Extranet côté FFCAM, commun à tous les clubs. Pas de captcha, CSRF ni 2FA.

**Files:**
- Create: `src/auth/ffcam-sso.ts`, `src/auth/ffcam-sso.test.ts`
- Modify: `src/types.ts:135-140`, `src/config.ts:23-28`, `src/scrapers/base-scraper.ts`, `src/import.ts:157-172`
- Modify: `.env.example`, `README.md`, `docs/FFCAM-API.md`

**Interfaces:**
- `class FfcamSsoError extends Error { step: 'login' | 'select-app' | 'select-profile' | 'exchange' }`
- `extractSid(html: string): string | null`
- `pickProfile(profiles: { extranetId: string; profile: string }[], wanted: string)` — sous-chaîne insensible à la casse ; 0 ou plusieurs résultats → erreur listant les profils.
- `obtainSessionId(creds: { email; password; profile? }, fetchImpl = fetch): Promise<string>`
- `getSessionId(creds): Promise<string>` — mémoïsé par processus ; erreur claire si `FFCAM_EMAIL`/`FFCAM_PASSWORD` manquent.
- `FFCAM_CONFIG` : `SESSION_ID` remplacé par `EMAIL`, `PASSWORD`, `PROFILE` (défaut `'WEBMASTER'`).
- `BaseScraper.scrape()` appelle `await this.ensureSession()` avant la première requête.

- [ ] **Step 1 : Tests (fetch simulé)**

Créer `src/auth/ffcam-sso.test.ts` :

```ts
/**
 * Tests du flux SSO FFCAM avec un fetch simulé (réponses observées le 2026-09-18).
 */
import { describe, it, expect, vi } from 'vitest';
import { obtainSessionId, extractSid, pickProfile, FfcamSsoError } from './ffcam-sso';

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

  it("signale une action inattendue de l'API", async () => {
    const { impl } = fakeFetch({ 'select-app-id': () => new Response('{"action":"selectClub"}') });
    await expect(obtainSessionId(creds, impl)).rejects.toMatchObject({ step: 'select-app' });
  });

  it('signale un sid introuvable', async () => {
    const { impl } = fakeFetch({ 'login_sso.php': () => new Response('<html>Token invalide</html>') });
    await expect(obtainSessionId(creds, impl)).rejects.toMatchObject({ step: 'exchange' });
  });
});
```

- [ ] **Step 2 : Vérifier l'échec**

Run: `pnpm vitest run src/auth/ffcam-sso.test.ts`
Expected: FAIL — module `./ffcam-sso` introuvable.

- [ ] **Step 3 : Créer `src/auth/ffcam-sso.ts`**

```ts
/**
 * Authentification SSO FFCAM → sid extranet
 *
 * Reproduit le parcours du portail (portail.ffcam.fr) : login, application
 * Extranet, profil, puis échange des tokens contre un `sid`. API non
 * officielle : chaque étape vérifie la réponse et échoue en nommant l'étape.
 * Aucun token ni mot de passe n'est journalisé.
 */

const PORTAL_API = 'https://api.portail.ffcam.fr';
/** Identifiant de l'application Extranet côté FFCAM (commun à tous les clubs) */
const EXTRANET_APP_ID = 'extranet.xyntxutqx1';
const TIMEOUT_MS = 30_000;

export type SsoStep = 'login' | 'select-app' | 'select-profile' | 'exchange';

export interface SsoProfile {
  extranetId: string;
  profile: string;
}

export class FfcamSsoError extends Error {
  constructor(public readonly step: SsoStep, message: string) {
    super(message);
    this.name = 'FfcamSsoError';
  }
}

/** Extrait le sid de : window.location.href = 'Effectifs/accueil.php?sid=XXX&ish=…' */
export function extractSid(html: string): string | null {
  const match = html.match(/accueil\.php\?sid=([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

/** Choisit le profil contenant `wanted` (insensible à la casse) ; erreur si 0 ou plusieurs */
export function pickProfile(profiles: SsoProfile[], wanted: string): SsoProfile {
  const needle = wanted.trim().toUpperCase();
  const matches = profiles.filter(p => p.profile.toUpperCase().includes(needle));
  const list = profiles.map(p => `"${p.profile}"`).join(', ') || '(aucun)';
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new FfcamSsoError('select-profile', `Aucun profil extranet ne contient "${wanted}". Profils disponibles : ${list}. Ajustez FFCAM_PROFILE.`);
  }
  throw new FfcamSsoError('select-profile', `Plusieurs profils contiennent "${wanted}" : ${matches.map(p => `"${p.profile}"`).join(', ')}. Précisez FFCAM_PROFILE.`);
}

interface AuthorizeResponse {
  action?: string;
  extranetIds?: SsoProfile[];
  redirectUri?: string;
  accessToken?: string;
  refreshToken?: string;
}

async function postJson<T>(fetchImpl: typeof fetch, step: SsoStep, path: string, body: unknown, authorization?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(`${PORTAL_API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error: any) {
    throw new FfcamSsoError(step, `Portail FFCAM injoignable (${path}) : ${error.message}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new FfcamSsoError(step, step === 'login'
      ? 'Identifiants FFCAM refusés (vérifiez FFCAM_EMAIL / FFCAM_PASSWORD)'
      : `Accès refusé par le portail FFCAM (étape ${step}, HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new FfcamSsoError(step, `Portail FFCAM : HTTP ${response.status} sur ${path}`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new FfcamSsoError(step, `Réponse non JSON du portail FFCAM sur ${path}`);
  }
}

/** Obtient un sid extranet à partir des identifiants du portail FFCAM (4 requêtes) */
export async function obtainSessionId(
  creds: { email: string; password: string; profile?: string },
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  // 1. Login → token de session (déjà préfixé "JWT ")
  const login = await postJson<{ sessionToken?: string }>(fetchImpl, 'login', 'user/logged', { email: creds.email, password: creds.password });
  if (!login.sessionToken) {
    throw new FfcamSsoError('login', 'Réponse de login sans sessionToken (API du portail modifiée ?)');
  }
  const authorization = login.sessionToken.startsWith('JWT ') ? login.sessionToken : `JWT ${login.sessionToken}`;

  // 2. Application Extranet → profils (ou redirect direct si un seul profil)
  let authz = await postJson<AuthorizeResponse>(fetchImpl, 'select-app', 'for-session/auth/select-app-id', { appId: EXTRANET_APP_ID }, authorization);
  let step: SsoStep = 'select-app';

  if (authz.action === 'selectExtranet') {
    // 3. Profil → tokens
    const profile = pickProfile(authz.extranetIds ?? [], creds.profile || 'WEBMASTER');
    step = 'select-profile';
    authz = await postJson<AuthorizeResponse>(fetchImpl, step, 'for-session/auth/select-extranet-id', { appId: EXTRANET_APP_ID, extranetId: profile.extranetId }, authorization);
  }

  if (authz.action !== 'redirect' || !authz.redirectUri || !authz.accessToken || !authz.refreshToken) {
    throw new FfcamSsoError(step, `Action inattendue du portail FFCAM : "${authz.action}" (attendu : redirect)`);
  }

  // 4. Échange des tokens contre un sid (HTML avec redirection JS)
  const params = new URLSearchParams({ refreshToken: authz.refreshToken, accessToken: authz.accessToken });
  const redirectUri = /^https?:/.test(authz.redirectUri) ? authz.redirectUri : `https://${authz.redirectUri}`;
  let html: string;
  try {
    html = await (await fetchImpl(`${redirectUri}?${params}`, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })).text();
  } catch (error: any) {
    throw new FfcamSsoError('exchange', `Extranet injoignable (login_sso.php) : ${error.message}`);
  }
  const sid = extractSid(html);
  if (!sid) {
    throw new FfcamSsoError('exchange', "login_sso.php n'a pas renvoyé de sid (tokens refusés ou page modifiée)");
  }
  return sid;
}

// =============================================================================
// Session du processus courant
// =============================================================================

let cached: Promise<string> | null = null;

/**
 * sid pour ce processus, obtenu une seule fois (les 4 scrapers le partagent).
 * @param creds - identifiants (FFCAM_CONFIG, passé par l'appelant)
 */
export function getSessionId(creds: { email: string; password: string; profile?: string }): Promise<string> {
  if (!creds.email || !creds.password) {
    return Promise.reject(new Error(
      'FFCAM_EMAIL et FFCAM_PASSWORD manquants dans .env\n' +
      '   → identifiants du portail FFCAM (https://portail.ffcam.fr) d\'un compte ayant un profil extranet du club'
    ));
  }
  if (!cached) {
    console.log('🔐 Authentification SSO FFCAM…');
    cached = obtainSessionId(creds)
      .then(sid => { console.log(`   Session obtenue : ${sid.slice(0, 4)}****`); return sid; })
      .catch(error => { cached = null; throw error; });
  }
  return cached;
}
```

- [ ] **Step 4 : Vérifier**

Run: `pnpm vitest run src/auth/ffcam-sso.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5 : Remplacer `SESSION_ID` dans la config**

`src/types.ts`, `FfcamConfig` :

```ts
export interface FfcamConfig {
  /** Identifiants du portail FFCAM (https://portail.ffcam.fr) */
  EMAIL: string;
  PASSWORD: string;
  /** Sous-chaîne du profil extranet à utiliser (défaut : WEBMASTER) */
  PROFILE: string;
  ROWS_PER_PAGE: number;
  API_DELAY: number;
  BASE_URL: string;
}
```

`src/config.ts`, `FFCAM_CONFIG` :

```ts
export const FFCAM_CONFIG: FfcamConfig = {
  EMAIL: process.env.FFCAM_EMAIL || '',
  PASSWORD: process.env.FFCAM_PASSWORD || '',
  PROFILE: process.env.FFCAM_PROFILE || 'WEBMASTER',
  ROWS_PER_PAGE: 150,
  API_DELAY: 300, // Délai entre les requêtes en ms
  BASE_URL: 'https://extranet-clubalpin.com/app/ActivitesFormations/jx_jqGrid.php'
};
```

- [ ] **Step 6 : Brancher les scrapers et `import.ts`**

`src/scrapers/base-scraper.ts` :
- ajouter `import { getSessionId } from '../auth/ffcam-sso';`
- constructeur : `this.sessionId = '';` à la place de `FFCAM_CONFIG.SESSION_ID`
- ajouter après le constructeur :

```ts
  /** Obtient le sid (login SSO, une seule fois par processus) */
  protected async ensureSession(): Promise<void> {
    if (!this.sessionId) {
      this.sessionId = await getSessionId(FFCAM_CONFIG);
    }
  }
```

- `scrape()` : `await this.ensureSession();` en première instruction.
- `fetchData()` : remplacer le message d'erreur « SESSION_ID expiré ou invalide … » par :

```ts
      throw new Error(
        "❌ Session extranet refusée (réponse HTML au lieu de JSON).\n" +
        "   Le profil extranet du compte FFCAM a peut-être changé : vérifiez FFCAM_PROFILE avec \"npm run check\"."
      );
```

`src/import.ts` : remplacer le bloc `if (!FFCAM_CONFIG.SESSION_ID) { … }` et les deux lignes `maskedSessionId` par :

```ts
  // Login SSO dès le départ : échec rapide si les identifiants sont mauvais
  try {
    await getSessionId(FFCAM_CONFIG);
  } catch (error: any) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
```

avec `import { getSessionId } from './auth/ffcam-sso';`.

- [ ] **Step 7 : Vérifier**

Run: `pnpm run type-check && pnpm run test`
Expected: PASS. `grep -rn SESSION_ID src` → aucun résultat.

Run: `pnpm run import:dry --brevets` (avec `FFCAM_EMAIL`/`FFCAM_PASSWORD` dans `.env`)
Expected: « 🔐 Authentification SSO FFCAM… », « Session obtenue : XXXX**** », puis le scraping démarre.

Run: `FFCAM_PASSWORD=faux pnpm run import:dry --brevets`
Expected: sortie immédiate « Identifiants FFCAM refusés ».

- [ ] **Step 8 : Documenter**

`.env.example`, remplacer le bloc `FFCAM_SESSION_ID` par :

```env
# Authentification FFCAM - OBLIGATOIRE
# Identifiants du portail FFCAM (https://portail.ffcam.fr) d'un compte ayant
# un profil extranet du club (typiquement "CLUB - WEBMASTER").
FFCAM_EMAIL=
FFCAM_PASSWORD=
# Sous-chaîne du profil à utiliser si le compte en a plusieurs (défaut : WEBMASTER)
# FFCAM_PROFILE=WEBMASTER
```

`README.md` : remplacer la sous-section « 2. Obtenir votre session ID » par « 2. Authentification FFCAM » (même contenu en prose), retirer toute mention de `FFCAM_SESSION_ID` (`grep -n SESSION_ID README.md`), y compris dans « Dépannage → Session expirée » (remplacer par « Identifiants refusés / profil introuvable → `npm run check` »).

`docs/FFCAM-API.md` : remplacer la section « Authentification » par le flux SSO en 4 requêtes ci-dessus (durées de vie : session 100 j, refresh 30 j, access 5 min ; `appId` commun à tous les clubs).

Retirer `FFCAM_SESSION_ID` de `.env`, `.env.staging`, `.env.production` (non versionnés) et y mettre `FFCAM_EMAIL` / `FFCAM_PASSWORD`.

- [ ] **Step 9 : Commit**

```bash
git add src/auth src/types.ts src/config.ts src/scrapers/base-scraper.ts src/import.ts .env.example README.md docs/FFCAM-API.md
git commit -m "feat: authentification SSO FFCAM à la place du sid copié à la main

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1 : Filtre par code club (`CLUB_CODE`)

**Files:**
- Modify: `src/config.ts:31-46`
- Create: `src/config.test.ts`
- Modify: `src/import.ts` (échec rapide), `.env.example`, `README.md`

**Interfaces:**
- `getClubCode(code = process.env.CLUB_CODE): string` — 4 chiffres ; erreur « Variable CLUB_CODE non définie ou invalide » sinon. Lit l'env à l'appel (testable).
- `isClubMember(cafnum: string, clubCode = getClubCode()): boolean` — `cafnum.startsWith(clubCode)`. `shouldFilterRow()` et les 4 scrapers ne changent pas.

- [ ] **Step 1 : Tests**

Créer `src/config.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { getClubCode, isClubMember } from './config';

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
```

Run: `pnpm vitest run src/config.test.ts` → FAIL (`getClubCode` absent).

- [ ] **Step 2 : Implémenter dans `src/config.ts`**

Remplacer le bloc « Configuration du club » (lignes 31-46) par :

```ts
// =============================================================================
// Configuration du club
// =============================================================================

/**
 * Code FFCAM du club (4 chiffres), ex. 6900 pour Lyon-Villeurbanne.
 * Un cafnum = code club (4) + année (4) + numéro (4) : le code sert à ne garder
 * que les adhérents du club dans les grilles nationales (brevets, formations).
 * Lu à l'appel (et non à l'import) pour rester testable.
 */
export function getClubCode(code: string | undefined = process.env.CLUB_CODE): string {
  const trimmed = (code || '').trim();
  if (!/^\d{4}$/.test(trimmed)) {
    throw new Error(`Variable CLUB_CODE non définie ou invalide ("${trimmed}") : 4 chiffres attendus, ex. CLUB_CODE=6900`);
  }
  return trimmed;
}

/** Vérifie qu'un cafnum appartient au club */
export function isClubMember(cafnum: string, clubCode: string = getClubCode()): boolean {
  return Boolean(cafnum) && cafnum.startsWith(clubCode);
}
```

Supprimer `CLUB_CAFNUM_PREFIXES`. `src/scrapers/base-scraper.ts` continue d'appeler `isClubMember(cafnum)` sans changement.

Dans `src/import.ts`, juste après le login SSO (Task 0), échec rapide :

```ts
  try { getClubCode(); } catch (error: any) { console.error(`❌ ${error.message}`); process.exit(1); }
```

- [ ] **Step 3 : Vérifier**

Run: `pnpm run type-check && pnpm run test` → PASS.
Run: `CLUB_CODE=6900 pnpm run import:dry --brevets` → même nombre de brevets récupérés qu'avant (ou légèrement moins si des cafnum `6901…` passaient avec l'ancien préfixe `690`, ce qui est une correction).
Run: `env -u CLUB_CODE pnpm run import:dry --brevets` → sortie immédiate « Variable CLUB_CODE non définie ».

- [ ] **Step 4 : Documenter et commit**

`.env.example` :

```env
# Code FFCAM du club (4 chiffres, = 4 premiers chiffres de vos numéros d'adhérent) - OBLIGATOIRE
CLUB_CODE=6900
```

Ajouter `CLUB_CODE=6900` dans les `.env.*` locaux. README : remplacer la mention des préfixes hardcodés par `CLUB_CODE`.

```bash
git add src/config.ts src/config.test.ts src/import.ts .env.example README.md
git commit -m "feat: filtre des adhérents par CLUB_CODE au lieu des préfixes hardcodés de Lyon

Corrige au passage le préfixe 690 qui acceptait les clubs 6901 à 6909.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2 : Mapping GC → commissions par club (`config/clubs/<club>/`)

**Files:**
- Move: `data/groupes-competences-commissions.csv` → `config/clubs/lyon/groupes-competences-commissions.csv`
- Modify: `.gitignore`, `src/config.ts`, `src/config.test.ts`, `src/utils/gc-csv-mapping.ts:70-73`, `src/utils/gc-csv-mapping.test.ts:1-40`, `src/import.ts`
- Modify: commentaires citant `data/groupes-competences-commissions.csv` dans `src/utils/commission-mapping.ts`, `src/importers/competences-importer.ts`, `src/services/commission-linker.ts`
- Modify: `.env.example`, `README.md`

**Interfaces:**
- `getClubConfigDir(club = process.env.CLUB): string` — `config/clubs/<club>` ; erreur « Variable CLUB non définie » si vide. Lit l'env à l'appel (testable).
- `loadGcMapping(csvPath?)` : sans argument, charge `getClubConfigDir()/groupes-competences-commissions.csv`.

- [ ] **Step 1 : Déplacer et versionner**

```bash
mkdir -p config/clubs/lyon
mv data/groupes-competences-commissions.csv config/clubs/lyon/groupes-competences-commissions.csv
```

`.gitignore` : sous `*.csv`, ajouter `!config/clubs/**/*.csv`. Vérifier : `git check-ignore config/clubs/lyon/groupes-competences-commissions.csv` ne renvoie rien.

- [ ] **Step 2 : Tests**

Ajouter dans `src/config.test.ts` (compléter l'import avec `getClubConfigDir`) :

```ts
describe('getClubConfigDir', () => {
  it('pointe vers config/clubs/<club>', () => {
    expect(getClubConfigDir('lyon')).toMatch(/config[\\/]clubs[\\/]lyon$/);
  });
  it('lève une erreur explicite si CLUB est absent', () => {
    expect(() => getClubConfigDir(undefined)).toThrow('Variable CLUB non définie');
    expect(() => getClubConfigDir('')).toThrow('Variable CLUB non définie');
  });
});
```

`src/utils/gc-csv-mapping.test.ts` : remplacer l'en-tête (lignes 1-22) par un import direct sans `describe.skip` :

```ts
/**
 * Tests du mapping GC → Commissions depuis le CSV versionné de Lyon.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { loadGcMapping, getCommissionsForGc, hasGcInMapping, normalizeGcIntitule, getMappingStats, GcCommissionMapping } from './gc-csv-mapping';

const csvPath = path.resolve(__dirname, '../../config/clubs/lyon/groupes-competences-commissions.csv');

describe('gc-csv-mapping', () => {
```

(supprimer `csvExists`, `describeWithCsv` et l'import `fs` s'il ne sert plus). Ajouter dans `describe('loadGcMapping')` :

```ts
    it('charge config/clubs/<CLUB>/… sans argument', () => {
      const previous = process.env.CLUB;
      process.env.CLUB = 'lyon';
      try {
        expect(loadGcMapping().size).toBe(mapping.size);
      } finally {
        if (previous === undefined) delete process.env.CLUB; else process.env.CLUB = previous;
      }
    });
    it('lève une erreur explicite sans CLUB', () => {
      const previous = process.env.CLUB;
      delete process.env.CLUB;
      try {
        expect(() => loadGcMapping()).toThrow('Variable CLUB non définie');
      } finally {
        if (previous !== undefined) process.env.CLUB = previous;
      }
    });
```

Run: `pnpm run test` → FAIL (`getClubConfigDir` absent, chemin par défaut vers `data/`).

- [ ] **Step 3 : Implémenter**

`src/config.ts`, à la suite de `isClubMember` :

```ts
/**
 * Dossier config/clubs/<club> ; l'identifiant vient de la variable CLUB
 * (ex. "lyon", "chambery"), lue à l'appel pour rester testable.
 * Pas de valeur par défaut : on refuse de charger le mapping d'un autre club.
 */
export function getClubConfigDir(club: string | undefined = process.env.CLUB?.trim()): string {
  if (!club) {
    throw new Error('Variable CLUB non définie (ex. CLUB=lyon dans .env) : elle sélectionne config/clubs/<club>/');
  }
  return path.resolve(__dirname, '../config/clubs', club);
}
```

`src/utils/gc-csv-mapping.ts` : `import { getClubConfigDir } from '../config';` et

```ts
export function loadGcMapping(csvPath?: string): GcCommissionMapping {
  const filePath = csvPath || path.join(getClubConfigDir(), 'groupes-competences-commissions.csv');
```

Mettre à jour les commentaires (`grep -rn "data/groupes-competences" src` → aucun résultat).

`src/import.ts`, à côté du contrôle `getClubCode()` (Task 1), échec rapide si `CLUB` manque :

```ts
  if (TYPES_TO_IMPORT.includes('competences')) {
    try { getClubConfigDir(); } catch (error: any) { console.error(`❌ ${error.message}`); process.exit(1); }
  }
```

- [ ] **Step 4 : Vérifier**

Run: `pnpm run test && pnpm run type-check`
Expected: PASS, suite `gc-csv-mapping` plus jamais « skipped ».

- [ ] **Step 5 : Documenter et commit**

`.env.example` :

```env
# Identifiant du club - OBLIGATOIRE
# Sélectionne config/clubs/<club>/groupes-competences-commissions.csv
CLUB=lyon
```

Ajouter `CLUB=lyon` dans les `.env.*` locaux. README : remplacer `data/groupes-competences-commissions.csv` par `config/clubs/<club>/groupes-competences-commissions.csv`, préciser que ce mapping est propre à chaque club, mettre à jour l'arborescence.

```bash
git add .gitignore config/clubs src/config.ts src/config.test.ts src/import.ts src/utils src/importers src/services .env.example README.md
git commit -m "feat: mapping GC → commissions par club dans config/clubs/<club>/

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3 : Afficher toutes les alertes, dont les commissions introuvables

**Files:**
- Modify: `src/services/commission-linker.ts` (cache, `getCommissionId`, `printWarningsReport`, nouveau `getMissingCommissions`)
- Create: `src/services/commission-linker.test.ts`
- Modify: `src/import.ts:237`

**Interfaces:**
- `CommissionLinker.getMissingCommissions(): string[]` — slugs demandés mais absents de `caf_commission`, triés.
- `printWarningsReport()` affiche ces slugs et **toutes** les alertes (plus de limite à 5) : un nouveau club s'en sert pour compléter son CSV.

- [ ] **Step 1 : Tests**

Créer `src/services/commission-linker.test.ts` :

```ts
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
```

Run: `pnpm vitest run src/services/commission-linker.test.ts` → 1er PASS, 2 FAIL.

- [ ] **Step 2 : Implémenter**

`src/services/commission-linker.ts` :
- `private commissionCache: Map<string, number | null> = new Map();` (le `null` mémorise une absence)
- dans `getCommissionId`, après le `if (rows && rows.length > 0) {…}` : `this.commissionCache.set(code, null);` — le `has()` en tête retourne alors `null` sans requête.
- ajouter :

```ts
  /** Slugs demandés par les mappings mais absents de caf_commission */
  getMissingCommissions(): string[] {
    return [...this.commissionCache.entries()].filter(([, id]) => id === null).map(([slug]) => slug).sort();
  }
```

- `printWarningsReport()` : en tête, afficher les commissions manquantes ; retirer la limite `slice(0, 5)` / « … et N autres » :

```ts
  printWarningsReport(): void {
    const missing = this.getMissingCommissions();
    if (missing.length > 0) {
      console.log(`\n⚠️  ${missing.length} COMMISSION(S) ABSENTE(S) de caf_commission : ${missing.join(', ')}`);
      console.log('   👉 Créez-les dans la plateforme avec ce code_commission (les liaisons correspondantes ont été ignorées).');
    }
    if (this.warnings.length === 0) {
      console.log('\n✅ Aucune alerte de mapping');
      return;
    }
    // … suite inchangée, mais `for (const w of warnings)` sans slice
```

`src/import.ts`, après `logger.printFinalReport(timestamp, DRY_RUN);` : `commissionLinker.printWarningsReport();`

- [ ] **Step 3 : Vérifier et commit**

Run: `pnpm run test && pnpm run type-check` → PASS.

```bash
git add src/services src/import.ts
git commit -m "feat: afficher toutes les alertes de mapping et les commissions absentes de caf_commission

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4 : `npm run check` — valider la configuration avant le premier import

Lecture seule ; checklist ✅/❌ avec l'action à faire pour chaque ❌ ; code de sortie 1 s'il y en a.

**Files:**
- Modify: `src/utils/commission-mapping.ts` (export `getAllMappedCommissionSlugs()`), `src/utils/commission-mapping.test.ts`
- Modify: `src/scrapers/base-scraper.ts` (méthode `probe()`)
- Create: `src/check.ts`
- Modify: `package.json`

**Interfaces:**
- `getAllMappedCommissionSlugs(): string[]` — union triée des slugs de `BREVET_PATTERNS`, `FORMATION_PATTERNS`, `ACTIVITE_MAP`, `SPORTS_NEIGE_DISCIPLINE_MAP`, `INTITULE_DISCIPLINE_PATTERNS`.
- `BaseScraper.probe(): Promise<{ records: number; clubCode: string | null }>` — login SSO + page 1 avec 1 ligne ; `clubCode` = `col_2` de la première ligne (renseigné pour les grilles compétences et niveaux, où c'est le code du club).

- [ ] **Step 1 : `getAllMappedCommissionSlugs`**

Test dans `src/utils/commission-mapping.test.ts` :

```ts
  describe('getAllMappedCommissionSlugs', () => {
    it('liste tous les slugs des mappings, triés, sans doublon', () => {
      const slugs = getAllMappedCommissionSlugs();
      expect(slugs).toContain('escalade');
      expect(slugs).toContain('ski-de-fond');   // SPORTS_NEIGE_DISCIPLINE_MAP uniquement
      expect(slugs).toContain('vie-du-club');   // FORMATION_PATTERNS uniquement
      expect(slugs).toEqual([...new Set(slugs)].sort());
    });
  });
```

Run → FAIL. Implémenter en fin de `src/utils/commission-mapping.ts` :

```ts
/** Tous les slugs de commission référencés par les mappings (pour `npm run check`) */
export function getAllMappedCommissionSlugs(): string[] {
  const slugs = new Set<string>();
  for (const { commission } of BREVET_PATTERNS) slugs.add(commission);
  for (const { commission } of FORMATION_PATTERNS) slugs.add(commission);
  for (const commission of Object.values(ACTIVITE_MAP)) slugs.add(commission);
  for (const commission of Object.values(SPORTS_NEIGE_DISCIPLINE_MAP)) slugs.add(commission);
  for (const { commission } of INTITULE_DISCIPLINE_PATTERNS) slugs.add(commission);
  return [...slugs].sort();
}
```

Run → PASS.

- [ ] **Step 2 : `probe()` dans `base-scraper.ts`**

```ts
  /**
   * Login + page 1 avec une seule ligne : valide la session.
   * `clubCode` = col_2 de la première ligne (code du club sur les grilles compétences et niveaux).
   */
  async probe(): Promise<{ records: number; clubCode: string | null }> {
    await this.ensureSession();
    const config = this.getScraperConfig();
    const url = this.buildUrl({ def: config.def, mode: 'liste', sidx: config.sidx || `jqGrid_${config.def}_NOMCOMPLET`, sord: 'asc', page: 1, rows: 1 });
    const data = await this.fetchData(url);
    return { records: parseInt(data.records.toString(), 10), clubCode: data.rows[0]?.cell?.col_2 || null };
  }
```

(`buildUrl` pose `rows` avant le spread des params, donc `rows: 1` l'emporte.)

- [ ] **Step 3 : Créer `src/check.ts`**

```ts
#!/usr/bin/env node
/**
 * Vérification de la configuration d'un club avant le premier import (lecture seule)
 *   1. variables d'environnement   2. fichier GC du club
 *   3. login SSO + accès extranet  4. base : commissions attendues vs caf_commission
 *
 * Utilisation : npm run check   (NODE_ENV=production npm run check)
 */
import * as fs from 'fs';
import * as path from 'path';
import { FFCAM_CONFIG, getClubCode, getClubConfigDir } from './config';
import { FfcamSsoError } from './auth/ffcam-sso';
import { loadGcMapping, getMappingStats } from './utils/gc-csv-mapping';
import { getAllMappedCommissionSlugs } from './utils/commission-mapping';
import { getDatabase } from './database/db-factory';
import NiveauxScraper from './scrapers/niveaux-scraper';

let failures = 0;
const ok = (m: string) => console.log(`  ✅ ${m}`);
const warn = (m: string, hint?: string) => { console.log(`  ⚠️  ${m}`); if (hint) console.log(`     👉 ${hint}`); };
const ko = (m: string, hint?: string) => { failures++; console.log(`  ❌ ${m}`); if (hint) console.log(`     👉 ${hint}`); };

async function main(): Promise<void> {
  console.log('🩺 VÉRIFICATION DE LA CONFIGURATION CLUB\n');

  console.log("1. Variables d'environnement");
  if (FFCAM_CONFIG.EMAIL && FFCAM_CONFIG.PASSWORD) ok(`FFCAM_EMAIL / FFCAM_PASSWORD définis (profil : "${FFCAM_CONFIG.PROFILE}")`);
  else ko('FFCAM_EMAIL / FFCAM_PASSWORD manquants', "Identifiants du portail FFCAM d'un compte ayant un profil extranet du club");
  let clubCode: string | null = null;
  try { clubCode = getClubCode(); ok(`CLUB_CODE=${clubCode}`); }
  catch (error: any) { ko(error.message, "4 premiers chiffres de vos numéros d'adhérent"); }
  let clubDir: string | null = null;
  try { clubDir = getClubConfigDir(); ok(`CLUB=${process.env.CLUB} → ${path.relative(process.cwd(), clubDir)}/`); }
  catch (error: any) { ko(error.message, 'Ajoutez CLUB=<identifiant> dans .env (ex. CLUB=chambery)'); }

  console.log('\n2. Mapping groupes de compétences → commissions');
  let gcCommissions = new Set<string>();
  if (clubDir) {
    const csvPath = path.join(clubDir, 'groupes-competences-commissions.csv');
    if (!fs.existsSync(csvPath)) ko(`Fichier absent : ${path.relative(process.cwd(), csvPath)}`, 'Copiez config/clubs/lyon/groupes-competences-commissions.csv et adaptez la colonne commission');
    else { const stats = getMappingStats(loadGcMapping(csvPath)); gcCommissions = stats.uniqueCommissions; ok(`${stats.totalGc} groupes de compétences, ${gcCommissions.size} commissions référencées`); }
  }

  console.log("\n3. Accès à l'extranet FFCAM");
  if (FFCAM_CONFIG.EMAIL && FFCAM_CONFIG.PASSWORD) {
    try {
      const probe = await new NiveauxScraper().probe();
      ok(`Login SSO et extranet OK : ${probe.records} niveaux de pratique visibles`);
      if (!probe.clubCode) warn("Impossible de lire le code club sur l'extranet (aucun niveau de pratique saisi ?)");
      else if (probe.clubCode === clubCode) ok(`Le profil extranet est bien celui du club ${clubCode}`);
      else ko(`Le profil extranet est celui du club ${probe.clubCode}, pas ${clubCode}`, 'Vérifiez CLUB_CODE, ou FFCAM_PROFILE si le compte a plusieurs profils');
    } catch (error: any) {
      if (error instanceof FfcamSsoError) ko(`Login SSO échoué (${error.step}) : ${error.message}`);
      else ko(`Extranet : ${error.message.split('\n')[0]}`);
    }
  }

  console.log('\n4. Base de données');
  const db = getDatabase();
  try {
    await db.connect();
    ok('Connexion établie');
    try {
      const [rows] = await db.execute('SELECT code_commission FROM caf_commission');
      const inDb = new Set((rows as Array<{ code_commission: string }>).map(r => r.code_commission));
      const needed = [...new Set([...getAllMappedCommissionSlugs(), ...gcCommissions])].sort();
      const missing = needed.filter(slug => !inDb.has(slug));
      ok(`${inDb.size} commissions en base`);
      if (missing.length === 0) ok('Toutes les commissions attendues par le mapping existent');
      else ko(`${missing.length} commission(s) absente(s) de caf_commission : ${missing.join(', ')}`, 'Créez-les dans la plateforme avec ce code_commission, sinon les liaisons correspondantes seront ignorées');
    } catch (error: any) {
      warn(`caf_commission illisible (${error.message.split('\n')[0]})`, 'Ce contrôle nécessite la base MySQL de la plateforme (MYSQL_ADDON_*)');
    }
    if (clubCode) {
      const [countRows] = await db.execute('SELECT COUNT(*) AS total FROM caf_user WHERE cafnum_user LIKE ?', [`${clubCode}%`]);
      const total = (countRows as any[])[0]?.total ?? 0;
      if (total > 0) ok(`${total} adhérents du club ${clubCode} dans caf_user`);
      else ko(`Aucun adhérent avec un cafnum en ${clubCode}… dans caf_user`, "Vérifiez CLUB_CODE, et que les adhérents sont importés dans la plateforme");
    }
  } catch (error: any) {
    ko(`Base de données : ${error.message.split('\n')[0]}`, 'Vérifiez les variables MYSQL_ADDON_* dans .env');
  } finally {
    if (db.isConnected()) await db.close();
  }

  console.log(failures === 0 ? '\n✅ Configuration prête. Étape suivante : npm run import:dry' : `\n❌ ${failures} problème(s) à corriger`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(error => { console.error('❌ Erreur inattendue :', error.message); process.exit(1); });
```

`package.json` : `"check": "tsx src/check.ts",`

- [ ] **Step 4 : Vérifier et commit**

Run: `pnpm run type-check && pnpm run test` → PASS.
Run: `NODE_ENV=staging pnpm run check` → tout ✅ pour Lyon, dont « Le profil extranet est bien celui du club 6900 » et « 3027 adhérents du club 6900 dans caf_user ».
Run: `CLUB_CODE=7300 NODE_ENV=staging pnpm run check` → ❌ « Le profil extranet est celui du club 6900, pas 7300 » et ❌ « Aucun adhérent avec un cafnum en 7300… ».
Run: `FFCAM_PASSWORD=faux pnpm run check` → ❌ « Login SSO échoué (login) : Identifiants FFCAM refusés », code de sortie 1.

```bash
git add src/check.ts src/scrapers/base-scraper.ts src/utils/commission-mapping.ts src/utils/commission-mapping.test.ts package.json
git commit -m "feat: npm run check pour valider la configuration d'un club

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5 : README — onboarding d'un club

**Files:**
- Modify: `README.md` (section après « Installation »), `package.json:20` (`author`)

- [ ] **Step 1 : Rédiger**

```markdown
## Onboarding d'un nouveau club

Rien à modifier dans le code : un `.env` et un dossier `config/clubs/<club>/`.

1. **`.env`** (depuis `.env.example`) : `FFCAM_EMAIL` / `FFCAM_PASSWORD` (compte du portail FFCAM avec un profil extranet du club, ex. « CLUB - WEBMASTER » ; `FFCAM_PROFILE` si le compte en a plusieurs), `MYSQL_ADDON_*` de votre plateforme, `CLUB=chambery` (nom du dossier `config/clubs/`), `CLUB_CODE` (4 premiers chiffres de vos numéros d'adhérent).
2. **`npm run check`** : chaque ❌ dit quoi corriger. Il vérifie notamment que le profil extranet du compte et la base MySQL correspondent bien au même club (`CLUB_CODE`). Au premier lancement il signale aussi le fichier GC manquant et, éventuellement, des commissions absentes de `caf_commission`.
3. **Commissions** : le code utilise les slugs `escalade`, `alpinisme`, `ski-de-randonnee`, `snowboard-rando`, … Créez dans la plateforme celles qui vous manquent avec ce `code_commission` (ou dites-le nous si vos slugs diffèrent : on ajoutera une table de correspondance).
4. **Groupes de compétences** : copiez `config/clubs/lyon/groupes-competences-commissions.csv` dans `config/clubs/chambery/` et adaptez la colonne `commission` (un GC peut être sur plusieurs lignes). Versionnez ce fichier.
5. **`npm run check`** jusqu'à « Configuration prête », puis **`npm run import:dry`** : les alertes en fin de rapport listent les GC absents de votre CSV.
6. **`npm run import`**. Pour automatiser, voir « Import automatique ».
```

`package.json` : `"author": "Club Alpin Lyon-Villeurbanne et clubs contributeurs"`.

- [ ] **Step 2 : Commit**

```bash
git add README.md package.json
git commit -m "docs: onboarding d'un nouveau club

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6 : Import hebdomadaire par GitHub Actions

Un *environment* GitHub par club (secrets isolés). `check` avant `import`. Dépôt public : environments et minutes gratuits.

**Files:**
- Create: `.github/workflows/import.yml`
- Modify: `README.md`

- [ ] **Step 1 : Workflow**

```yaml
name: Import FFCAM

on:
  schedule:
    - cron: '17 3 * * 1'   # lundi 03:17 UTC (minute non ronde : moins de retard côté GitHub)
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Import à blanc (aucune écriture en base)'
        type: boolean
        default: false

permissions:
  contents: read
  actions: write   # keepalive : GitHub désactive les crons après 60 jours sans commit

jobs:
  import:
    name: Import ${{ matrix.club }}
    runs-on: ubuntu-latest
    timeout-minutes: 60
    environment: ${{ matrix.club }}
    concurrency:
      group: import-${{ matrix.club }}
      cancel-in-progress: false
    strategy:
      fail-fast: false
      max-parallel: 1       # un seul scraping à la fois sur l'extranet FFCAM
      matrix:
        club: [lyon, chambery]
    env:
      NODE_ENV: production
      CLUB: ${{ matrix.club }}
      CLUB_CODE: ${{ vars.CLUB_CODE }}
      FFCAM_EMAIL: ${{ secrets.FFCAM_EMAIL }}
      FFCAM_PASSWORD: ${{ secrets.FFCAM_PASSWORD }}
      FFCAM_PROFILE: ${{ vars.FFCAM_PROFILE }}
      MYSQL_ADDON_HOST: ${{ secrets.MYSQL_ADDON_HOST }}
      MYSQL_ADDON_PORT: ${{ secrets.MYSQL_ADDON_PORT }}
      MYSQL_ADDON_USER: ${{ secrets.MYSQL_ADDON_USER }}
      MYSQL_ADDON_PASSWORD: ${{ secrets.MYSQL_ADDON_PASSWORD }}
      MYSQL_ADDON_DB: ${{ secrets.MYSQL_ADDON_DB }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Vérification de la configuration
        run: pnpm run check
      - name: Import
        run: pnpm run ${{ inputs.dry_run && 'import:dry' || 'import' }}
      - name: Rapport
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: rapport-${{ matrix.club }}-${{ github.run_id }}
          path: data/reports/*.json
          if-no-files-found: ignore
          retention-days: 90

  keepalive:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - run: gh api -X PUT "repos/${{ github.repository }}/actions/workflows/import.yml/enable"
        env:
          GH_TOKEN: ${{ github.token }}
```

- [ ] **Step 2 : Environments et secrets**

```bash
gh api -X PUT repos/Club-Alpin-Lyon-Villeurbanne/ffcam-formations-scraper/environments/lyon
gh api -X PUT repos/Club-Alpin-Lyon-Villeurbanne/ffcam-formations-scraper/environments/chambery
for k in FFCAM_EMAIL FFCAM_PASSWORD MYSQL_ADDON_HOST MYSQL_ADDON_PORT MYSQL_ADDON_USER MYSQL_ADDON_PASSWORD MYSQL_ADDON_DB; do
  gh secret set "$k" --env lyon    # saisie au clavier, rien dans l'historique
done
```

```bash
gh variable set CLUB_CODE --env lyon --body 6900
```

Chambéry fait de même sur `chambery` (droit d'écriture sur le dépôt, ou un mainteneur saisit les valeurs reçues par un canal sûr). `FFCAM_PROFILE` en variable d'environment seulement si nécessaire.

- [ ] **Step 3 : Valider**

```bash
gh workflow run import.yml -f dry_run=true && gh run watch
```

Expected: « Import lyon » vert avec la vérification entièrement ✅ ; « Import chambery » échoue proprement tant que ses secrets ne sont pas saisis (sans empêcher Lyon). Vérifier qu'aucun secret ni sid complet n'apparaît dans les logs. Puis un run réel et comparaison des compteurs avec le dernier import local.

Notification d'échec : GitHub envoie un e-mail à l'auteur du dernier commit du workflow. Suffisant pour démarrer.

- [ ] **Step 4 : README et commit**

```markdown
## Import automatique (GitHub Actions)

[`import.yml`](.github/workflows/import.yml) lance `check` puis `import` **tous les lundis à 03:17 UTC** pour chaque club de la matrice. Lancement manuel : onglet Actions → Import FFCAM → Run workflow (cochez « Import à blanc » pour tester).

**Ajouter un club** : un mainteneur crée l'environment (`gh api -X PUT repos/<owner>/<repo>/environments/<club>`), le club y saisit ses secrets (`FFCAM_EMAIL`, `FFCAM_PASSWORD`, `MYSQL_ADDON_*`) et la variable `CLUB_CODE` dans Settings → Environments, et on ajoute son identifiant dans `matrix.club`.

**En cas d'échec** : GitHub envoie un e-mail ; le step « Vérification de la configuration » du run dit quoi corriger (mot de passe FFCAM changé, profil retiré, commission manquante, base injoignable). Le job `keepalive` contourne la désactivation automatique des crons après 60 jours sans commit.
```

```bash
git add .github/workflows/import.yml README.md
git commit -m "ci: import FFCAM hebdomadaire par club via GitHub Actions

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Volontairement écarté (à faire seulement si le besoin apparaît)

- **Alias de slugs de commission** (`COMMISSION_ALIASES`) : si `check` montre que les slugs de Chambéry diffèrent et qu'ils ne veulent pas renommer.
- **`diagnostic:competences`** (génération de lignes CSV avec commission suggérée) : si l'adaptation du CSV de Lyon s'avère pénible.
- **Issue GitHub automatique en cas d'échec** : si l'e-mail à l'auteur du workflow ne suffit pas.
- **Filtrage côté serveur** : la grille des brevets fait 48 827 lignes (327 pages à 300 ms) pour n'en garder que celles du club. jqGrid accepte `_search=true&searchField=…` ; si le temps de scraping devient gênant, chercher le champ filtrable par code club.
- `config/formation-patterns.json` n'est pas lu par le code (patterns hardcodés dans `commission-mapping.ts:613`) : à supprimer ou brancher, sans lien avec le multi-club.

## Auto-revue

- Points du contexte : 1 → Task 0 ; 2 → Task 1 (`CLUB_CODE`, vérifié des deux côtés par `check` en Task 4) ; 3 → Task 2 ; 4 et 5 → Task 3 (+ `check` en Task 4) ; automatisation → Task 6 ; onboarding → Tasks 4-5.
- Noms cohérents entre tâches : `getSessionId(FFCAM_CONFIG)` (Task 0, utilisé par `ensureSession()` en Tasks 0 et 4), `getClubCode()` / `isClubMember()` (Task 1), `getClubConfigDir()` (Task 2), tous utilisés en Task 4 ; `probe()` retourne `{ records, clubCode }` (Task 4), `getMissingCommissions()` (Task 3), `getAllMappedCommissionSlugs()` / `probe()` (Task 4), `FfcamSsoError.step` (Tasks 0 et 4).
- Plus de `SESSION_ID` nulle part après Task 0 (`grep -rn SESSION_ID src README.md .env.example docs` → vide).
