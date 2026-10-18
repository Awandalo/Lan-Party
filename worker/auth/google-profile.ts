import { privateName } from './accounts';
import { fromHex, toHex } from './encoding';

export interface GoogleNameSuggestions { firstName?: string; lastName?: string }
// Profile names are editable hints, never identity, authorization or email proof.
export function googleNameSuggestions(claims: Record<string,unknown>): GoogleNameSuggestions {
  const names: GoogleNameSuggestions = {};
  try { names.firstName = privateName(claims.given_name); } catch { /* Missing/invalid hints leave the field blank. */ }
  try { names.lastName = privateName(claims.family_name); } catch { /* Never invent a last name. */ }
  return names;
}
async function key(secret: string) {
  const bytes=fromHex(secret,32);if(!bytes)throw new Error('Profile hints unavailable');
  return crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
const message=(payload:string)=>new TextEncoder().encode('lan-party:google-profile:v1:'+payload);
export async function encodeGoogleProfile(names: GoogleNameSuggestions, stateDigest: string, expiresAt: number, secret: string) {
  const bytes=new TextEncoder().encode(JSON.stringify({stateDigest,expiresAt,...names}));
  const payload=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const signature=toHex(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),message(payload))));
  return payload+'.'+signature;
}
export async function decodeGoogleProfile(value: string, stateDigest: string, secret: string, now: number): Promise<GoogleNameSuggestions> {
  try {
    if(value.length>2048) return {};
    const parts=value.split('.'),signature=fromHex(parts[1]??'',32);
    if(parts.length!==2 || !signature || !/^[A-Za-z0-9_-]+$/.test(parts[0])
      || !await crypto.subtle.verify('HMAC',await key(secret),signature,message(parts[0]))) return {};
    const bytes=Uint8Array.from(atob(parts[0].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const profile=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));
    if(profile.stateDigest!==stateDigest || !Number.isSafeInteger(profile.expiresAt) || profile.expiresAt<=now) return {};
    return googleNameSuggestions({given_name:profile.firstName,family_name:profile.lastName});
  } catch { return {}; }
}
