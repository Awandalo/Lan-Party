import type {AuthenticationEnvironment} from './http';
import type {MfaKeys} from './mfa-crypto';
import {mfaKeysReady} from './mfa-crypto';
import {DEV_AUTH_ORIGIN,loopback} from './environment';

// Wrangler env.dev alone supplies this build-time identity. Dashboard variables
// and request headers cannot turn the default/production bundle into a DEV build.
declare const __LAN_MFA_TARGET__:string;
export const DEV_MFA_TARGET='lan-party-dev:a3c4cea6-ceb7-43b8-b9b7-b374726b35b4';
export function mfaManagementEnvironment(request:Request,env:AuthenticationEnvironment&MfaKeys,oauthCallback=false):'local'|'dev'|null{
  const url=new URL(request.url);
  if(loopback(url)&&env.AUTH_SESSION_MODE==='local-only'&&env.AUTH_EMAIL_TRANSPORT==='local')return 'local';
  if(typeof __LAN_MFA_TARGET__==='undefined'||__LAN_MFA_TARGET__!==DEV_MFA_TARGET
    ||env.AUTH_ENVIRONMENT!=='dev'||url.origin!==DEV_AUTH_ORIGIN||url.username||url.password
    ||env.AUTH_PUBLIC_ORIGIN!==DEV_AUTH_ORIGIN||env.AUTH_SESSION_MODE!=='hosted-dev'||env.AUTH_EMAIL_TRANSPORT!=='resend'
    ||!mfaKeysReady(env))return null;
  // Never derive eligibility from proxy/forwarded headers. Reject conflicting
  // claims; Cloudflare's ordinary X-Forwarded-Proto=https remains compatible.
  // Only the validated, state/browser-bound Google callback may be a cross-site
  // top-level GET navigation. Never apply this exception to API mutations.
  const callbackNavigation=oauthCallback&&request.method==='GET'&&url.pathname==='/api/auth/google/callback'
    &&request.headers.get('Sec-Fetch-Site')==='cross-site'&&request.headers.get('Sec-Fetch-Mode')==='navigate'
    &&request.headers.get('Sec-Fetch-Dest')==='document';
  if(request.headers.has('Host')&&request.headers.get('Host')!.toLowerCase()!==url.host
    ||request.headers.has('Forwarded')||request.headers.has('X-Forwarded-Host')
    ||request.headers.has('X-Forwarded-Proto')&&request.headers.get('X-Forwarded-Proto')!=='https'
    ||request.headers.has('Origin')&&request.headers.get('Origin')!==DEV_AUTH_ORIGIN
    ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin'&&!callbackNavigation)return null;
  return 'dev';
}
