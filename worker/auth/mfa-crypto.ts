import { verify } from '@otplib/totp';
import { crypto as otpCrypto } from '@otplib/plugin-crypto-web';
import { base32 } from '@otplib/plugin-base32-scure';
import { accountId, serverTime } from './database';
import { fromHex, toHex } from './encoding';

export interface MfaKeys { MFA_ENCRYPTION_KEYS?: string; MFA_ACTIVE_KEY_ID?: string }
export interface MfaContext { environment:'local'|'dev'; userId:string; id:string; purpose:'pending'|'active' }
export interface EncryptedMfaSecret { ciphertext:string; nonce:string; keyId:string }
const encoder=new TextEncoder();
export function randomMfaToken(){return toHex(crypto.getRandomValues(new Uint8Array(32)));}
export async function mfaDigest(purpose:string,value:string){
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(['lan-party:mfa:v1',purpose,value])))));
}
function aad(context:MfaContext){
  accountId(context.userId);accountId(context.id);
  if(!['local','dev'].includes(context.environment)||!['pending','active'].includes(context.purpose))throw Error('MFA context unavailable');
  return encoder.encode(JSON.stringify(['lan-party:totp:v1',context.environment,context.userId,context.id,context.purpose]));
}
function keys(config:MfaKeys){
  try{
    const ring:unknown=JSON.parse(config.MFA_ENCRYPTION_KEYS??'');
    if(!ring||typeof ring!=='object'||Array.isArray(ring))throw Error();
    const entries=Object.entries(ring);
    if(entries.length<1||entries.length>4||entries.some(([id,key])=>!/^[-\w]{1,32}$/.test(id)||typeof key!=='string'||!fromHex(key,32)))throw Error();
    if(new Set(entries.map(([,key])=>key)).size!==entries.length)throw Error();
    if(!config.MFA_ACTIVE_KEY_ID||!entries.some(([id])=>id===config.MFA_ACTIVE_KEY_ID))throw Error();
    return ring as Record<string,string>;
  }catch{throw Error('MFA key configuration unavailable');}
}
export function generateTotpSecret(){return base32.encode(crypto.getRandomValues(new Uint8Array(20))).replace(/=+$/,'');}
function secretBytes(secret:string){
  if(!/^[A-Z2-7]{32}$/.test(secret))throw Error('MFA secret unavailable');
  const bytes=base32.decode(secret);if(bytes.length!==20)throw Error('MFA secret unavailable');return bytes;
}
export async function encryptTotpSecret(secret:string,config:MfaKeys,context:MfaContext):Promise<EncryptedMfaSecret>{
  const ring=keys(config),keyId=config.MFA_ACTIVE_KEY_ID!,nonce=crypto.getRandomValues(new Uint8Array(12));
  const key=await crypto.subtle.importKey('raw',fromHex(ring[keyId],32)!,{name:'AES-GCM'},false,['encrypt']);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:aad(context),tagLength:128},key,secretBytes(secret));
  return {ciphertext:toHex(new Uint8Array(ciphertext)),nonce:toHex(nonce),keyId};
}
export async function decryptTotpSecret(sealed:EncryptedMfaSecret,config:MfaKeys,context:MfaContext){
  try{
    const ring=keys(config),bytes=fromHex(sealed.ciphertext,36),nonce=fromHex(sealed.nonce,12),raw=Object.hasOwn(ring,sealed.keyId)?ring[sealed.keyId]:null;
    if(!bytes||!nonce||!raw)throw Error();
    const key=await crypto.subtle.importKey('raw',fromHex(raw,32)!,{name:'AES-GCM'},false,['decrypt']);
    const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce,additionalData:aad(context),tagLength:128},key,bytes);
    if(decoded.byteLength!==20)throw Error();return base32.encode(new Uint8Array(decoded)).replace(/=+$/,'');
  }catch{throw Error('MFA secret unavailable');}
}
export async function verifyTotp(secret:string,token:string,now:number,afterStep=-1):Promise<number|null>{
  serverTime(now);if(!Number.isSafeInteger(afterStep)||afterStep< -1)throw Error('MFA step unavailable');
  if(!/^\d{6}$/.test(token))return null;
  const result=await verify({secret:secretBytes(secret),token,crypto:otpCrypto,algorithm:'sha1',digits:6,period:30,
    epoch:now,epochTolerance:30,...(afterStep>=0?{afterTimeStep:afterStep}:{})});
  return result.valid?result.timeStep:null;
}
export function provisioningUri(secret:string,label:string){
  secretBytes(secret);
  if(!label||label.length>80||/[\u0000-\u001f\u007f]/.test(label))throw Error('MFA label unavailable');
  return `otpauth://totp/${encodeURIComponent('LAN Party:'+label)}?`+new URLSearchParams({secret,issuer:'LAN Party',algorithm:'SHA1',digits:'6',period:'30'});
}
export async function recoveryVerifier(userId:string,setId:string,code:string){
  accountId(userId);accountId(setId);
  const normalized=code.toUpperCase().replace(/[ -]/g,'');
  if(!/^[A-Z2-7]{26}$/.test(normalized))return null;
  return mfaDigest('recovery',JSON.stringify([userId,setId,normalized]));
}
export async function generateRecoveryCodes(userId:string,setId:string){
  const codes=Array.from({length:10},()=>base32.encode(crypto.getRandomValues(new Uint8Array(16))).replace(/=+$/,'').match(/.{1,4}/g)!.join('-'));
  const verifiers=await Promise.all(codes.map(code=>recoveryVerifier(userId,setId,code)));
  if(new Set(verifiers).size!==10)throw Error('Recovery codes unavailable');
  return {codes,verifiers:verifiers as string[]};
}
