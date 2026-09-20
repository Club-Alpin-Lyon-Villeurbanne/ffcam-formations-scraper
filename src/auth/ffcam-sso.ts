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
  const match = html.match(/accueil\.php\?sid=([^&'"]+)/);
  return match ? match[1] : null;
}

/**
 * Choisit un profil parmi ceux du compte. `wanted` est d'abord comparé exactement à
 * l'`extranetId` d'un profil (utile quand deux clubs ont le même libellé) ; à défaut,
 * on cherche un profil dont le libellé contient `wanted` (insensible à la casse).
 * Erreur si 0 ou plusieurs correspondances.
 */
export function pickProfile(profiles: SsoProfile[], wanted: string): SsoProfile {
  const trimmed = wanted.trim();
  const byId = profiles.find(p => p.extranetId === trimmed);
  if (byId) return byId;

  const needle = trimmed.toUpperCase();
  const matches = profiles.filter(p => p.profile.toUpperCase().includes(needle));
  const list = profiles.map(p => `"${p.profile}" (id ${p.extranetId})`).join(', ') || '(aucun)';
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new FfcamSsoError('select-profile', `Aucun profil extranet ne contient "${wanted}". Profils disponibles : ${list}. Ajustez FFCAM_PROFILE.`);
  }
  throw new FfcamSsoError('select-profile', `Plusieurs profils contiennent "${wanted}" : ${matches.map(p => `"${p.profile}" (id ${p.extranetId})`).join(', ')}. Précisez FFCAM_PROFILE (libellé plus précis ou id).`);
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
  // Le login refusé renvoie du 400 ({ code: "authenticationFailed" }) plutôt que du 401/403
  if (step === 'login' && (response.status === 400 || response.status === 401 || response.status === 403)) {
    throw new FfcamSsoError(step, 'Identifiants FFCAM refusés (vérifiez FFCAM_EMAIL / FFCAM_PASSWORD)');
  }
  if (response.status === 401 || response.status === 403) {
    throw new FfcamSsoError(step, `Accès refusé par le portail FFCAM (étape ${step}, HTTP ${response.status})`);
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

/** Force une nouvelle authentification au prochain appel de `getSessionId` */
export function resetSessionCache(): void {
  cached = null;
}
