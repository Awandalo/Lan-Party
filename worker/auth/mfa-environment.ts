import type {AuthenticationEnvironment} from './http';
import type {MfaKeys} from './mfa-crypto';
import {mfaKeysReady} from './mfa-crypto';
import {hostedProd,PROD_AUTH_ORIGIN,PROD_AUTH_TARGET} from './production';
import {DEV_AUTH_ORIGIN,loopback} from './environment';

// Explicit environment profiles supply the build identity. Dashboard variables
// and request headers cannot turn default or other-environment bundles into it.
declare const __LAN_MFA_TARGET__:string;
export const DEV_MFA_TARGET='lan-party-dev:a3c4cea6-ceb7-43b8-b9b7-b374726b35b4';
export function mfaManagementEnvironment(request:Request,env:AuthenticationEnvironment&MfaKeys):'local'|'dev'|'prod'|null{
  const url=new URL(request.url);
  if(loopback(url)&&env.AUTH_SESSION_MODE==='local-only'&&env.AUTH_EMAIL_TRANSPORT==='local')return 'local';
  const production=hostedProd(request,env);
  const origin=production?PROD_AUTH_ORIGIN:DEV_AUTH_ORIGIN;
  const mode=production?'hosted-prod':'hosted-dev';
  if(typeof __LAN_MFA_TARGET__==='undefined'||__LAN_MFA_TARGET__!==(production?PROD_AUTH_TARGET:DEV_MFA_TARGET)
    ||env.AUTH_ENVIRONMENT!==(production?'prod':'dev')||url.origin!==origin||url.username||url.password
    ||env.AUTH_PUBLIC_ORIGIN!==origin||env.AUTH_SESSION_MODE!==mode||env.AUTH_EMAIL_TRANSPORT!=='resend'
    ||!mfaKeysReady(env))return null;
  // Never derive eligibility from proxy/forwarded headers. Reject conflicting
  // claims; Cloudflare's ordinary X-Forwarded-Proto=https remains compatible.
  if(request.headers.has('Host')&&request.headers.get('Host')!.toLowerCase()!==url.host
    ||request.headers.has('Forwarded')||request.headers.has('X-Forwarded-Host')
    ||request.headers.has('X-Forwarded-Proto')&&request.headers.get('X-Forwarded-Proto')!=='https'
    ||request.headers.has('Origin')&&request.headers.get('Origin')!==origin
    ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return null;
  return production?'prod':'dev';
}
