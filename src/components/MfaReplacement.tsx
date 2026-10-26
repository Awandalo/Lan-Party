import {useRef,useState,useEffect} from 'react';
import type {FormEvent} from 'react';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import {securityRequest} from '../lib/account-security';
export default function MfaReplacement({csrf,open,disabled,methods,onOpen,onBusy,onActive}:{csrf:string;open:boolean;disabled:boolean;methods:{password:boolean};onOpen:()=>void;onBusy:(v:boolean)=>void;onActive:(v:boolean)=>void}){
 const [active,setActive]=useState(false),[primary,setPrimary]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[mfaExpired,setMfaExpired]=useState(false);
 const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const lock=useRef(false);
 function close(){setActive(false);setPrimary(false);setUncertain(false);setMfaExpired(false);setMessage('');onActive(false);}
 useEffect(()=>{if(!open&&!lock.current)close();},[open]);
 async function start(){
  if(lock.current||uncertain||mfaExpired)return;lock.current=true;setBusy(true);onBusy(true);setMessage('');
  try{
   const r=await fetch('/api/auth/mfa/recovery/from-session',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'X-LAN-Request':'1','X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});
   const b=await r.json();
   if(r.ok&&b.next==='/account/security?recovery=1'){window.location.assign(b.next);return;}
   if(r.status>=500)setUncertain(true);
   if(r.status===428&&b.code==='reauth_required')setPrimary(true);
   if(r.status===428&&b.code==='mfa_required'){setMfaExpired(true);setPrimary(false);setMessage('Your recent authenticator or recovery-login proof expired. Password confirmation does not refresh MFA. Sign in again with your authenticator or an unused recovery code, then return here promptly. If no usable method remains, contact an administrator; spent codes cannot be reused.');return;}
   setMessage(b.error??'Replacement could not be started.');
  }catch{setUncertain(true);setMessage('The handoff is uncertain. Do not submit again. Check restricted recovery status; if unavailable and no usable method remains, contact an administrator.');}
  finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function confirm(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current)return;const form=event.currentTarget,password=String(new FormData(form).get('password')??'');form.reset();lock.current=true;setBusy(true);onBusy(true);let confirmed=false;
  try{const r=await securityRequest('reauth-password',{password,...(proof?{turnstileToken:proof}:{})},csrf),b=await r.json();confirmed=r.ok;if(r.status===403&&b.siteKey)setSiteKey(b.siteKey);if(!r.ok)setMessage(b.error??'Identity confirmation unavailable.');}
  catch{setMessage('Identity confirmation is uncertain. No handoff was retried.');}
  finally{lock.current=false;setBusy(false);onBusy(false);setProof(null);setAttempt(n=>n+1);}
  if(confirmed){setPrimary(false);await start();}
 }
 async function signInAgain(){
  if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);
  try{const response=await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':csrf},body:'{}'});
   if(response.ok||response.status===401){window.location.assign('/login');return;}
   setMessage('Sign-out could not be confirmed. Use the Account menu to sign out, then sign in with fresh MFA. No replacement was retried.');
  }catch{setMessage('Sign-out could not be confirmed. Use the Account menu to sign out, then sign in with fresh MFA. No replacement was retried.');}
  finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <div className="mfa-replacement">
  {!active&&<button className="button button-secondary" disabled={disabled} onClick={()=>{onOpen();setActive(true);onActive(true);}}>Replace authenticator</button>}
  {active&&<section className="account-confirmation mfa-regeneration-panel" aria-label="Replace authenticator"><h3>Replace authenticator</h3>
   <p>This uses fresh sign-in proof once and signs this session out into restricted replacement. Spent recovery codes are never reused. Cancellation or expiry may require administrator assistance if no usable method remains.</p>
   {mfaExpired?<button className="button" disabled={busy} onClick={()=>void signInAgain()}>Sign out and sign in again</button>:primary?<><p>Confirm your sign-in method. Fresh MFA proof from your current session is also required.</p>
    {methods.password&&<form onSubmit={confirm}><fieldset disabled={busy||uncertain}><label htmlFor="replacement-password">Current password</label><PasswordInput id="replacement-password" name="password" required autoComplete="current-password"/>
     {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}<button className="button" disabled={!!siteKey&&!proof}>Confirm</button></fieldset></form>}
    </>:
    <button className="button" disabled={busy||uncertain} onClick={()=>void start()}>{busy?'Starting…':'Start replacement'}</button>}
   {uncertain&&<a className="button button-secondary" href="/account/security?recovery=1">Check restricted recovery</a>}
   <p role="status">{message}</p><button className="button button-secondary" disabled={busy} onClick={close}>Cancel</button>
  </section>}
 </div>;
}
