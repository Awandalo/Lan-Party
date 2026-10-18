import * as oauth from 'oauth4webapi';
import { emailAddress } from './accounts';
import { googleNameSuggestions } from './google-profile';
import type { GoogleNameSuggestions } from './google-profile';

export interface GoogleConfiguration { GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string }
export const googleIssuer = 'https://accounts.google.com';
// Fixed trusted metadata prevents discovery/endpoint injection and SSRF.
const server: oauth.AuthorizationServer = { issuer: googleIssuer,
  authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  token_endpoint: 'https://oauth2.googleapis.com/token', jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs' };
let keys: oauth.JWKSCacheInput = {};
export function googleClient(env: GoogleConfiguration): oauth.Client {
  if (!env.GOOGLE_CLIENT_ID || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID)
    || !env.GOOGLE_CLIENT_SECRET || /\s/.test(env.GOOGLE_CLIENT_SECRET)) throw new Error('Google unavailable');
  return { client_id: env.GOOGLE_CLIENT_ID, id_token_signed_response_alg: 'RS256' };
}
export async function authorizationURL(env: GoogleConfiguration, callback: string, state: string, nonce: string, verifier: string, reauth = false) {
  const client = googleClient(env), url = new URL(server.authorization_endpoint!);
  url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: 'code',
    scope: 'openid email profile', state, nonce, code_challenge_method: 'S256',
    code_challenge: await oauth.calculatePKCECodeChallenge(verifier), prompt: 'select_account' }).toString();
  if (reauth) url.searchParams.set('max_age','0');
  return url.href;
}
export interface GoogleIdentity extends GoogleNameSuggestions { subject: string; email: string; authoritative: boolean; authenticatedAt?: number }
export async function exchangeGoogle(env: GoogleConfiguration, url: URL, state: string, nonce: string, verifier: string,
  callback: string, reauth = false): Promise<GoogleIdentity> {
  const client = googleClient(env);
  const params = oauth.validateAuthResponse(server, client, url, state);
  const options = { [oauth.customFetch]: async (input: string, init: RequestInit) => {
    // Native Workers fetch is called without an incorrect receiver; reject redirects.
    const response = await fetch(input, { ...init, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Google unavailable'); }
    return response;
  } };
  const response = await oauth.authorizationCodeGrantRequest(server, client,
    oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET!), params, callback, verifier, options);
  const result = await oauth.processAuthorizationCodeResponse(server, client, response,
    { expectedNonce: nonce, requireIdToken: true, ...(reauth ? { maxAge: 300 } : {}) });
  await oauth.validateApplicationLevelSignature(server, response, { ...options, [oauth.jwksCache]: keys });
  const claims = oauth.getValidatedIdTokenClaims(result)!;
  if (!claims.sub || claims.sub.length > 255 || claims.email_verified !== true
    || (claims.azp !== undefined && claims.azp !== client.client_id)) throw new Error('Google identity unavailable');
  const email = emailAddress(claims.email).toLowerCase();
  if (reauth && (!Number.isSafeInteger(claims.auth_time) || claims.auth_time! > Math.floor(Date.now()/1000)
    || claims.auth_time! <= Math.floor(Date.now()/1000)-300)) throw new Error('Recent authentication required');
  return { subject: claims.sub, email, authoritative: email.endsWith('@gmail.com')
    || (typeof claims.hd === 'string' && claims.hd.length > 0), ...(reauth?{authenticatedAt:claims.auth_time}: {}),
    ...googleNameSuggestions(claims) };
}
