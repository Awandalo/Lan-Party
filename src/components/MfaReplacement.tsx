import {useRef,useState,useEffect} from 'react';
import type {FormEvent} from 'react';
import MfaStepUp from './MfaStepUp';
import {useAuth} from '../lib/auth';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import {securityRequest} from '../lib/account-security';
export default function MfaReplacement({csrf,open,disabled,methods,onOpen,onBusy,onActive}:{csrf:string;open:boolean;disabled:boolean;methods:{password:boolean};onOpen:()=>void;onBusy:(v:boolean)=>void;onActive:(v:boolean)=>void}){
 const [active,setActive]=useState(false),[primary,setPrimary]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[mfaExpired,setMfaExpired]=useState(false);
 const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const lock=useRef(false),currentCsrf=useRef(csrf);
 useEffect(()=>{currentCsrf.current=csrf;},[csrf]);
 function close(){if(currentCsrf.current!==csrf){window.location.assign('/account/security#mfa');return;}setActive(false);setPrimary(false);setUncertain(false);setMfaExpired(false);setMessage('Replacement cancelled. Spent recovery codes remain spent.');onActive(false);}
 useEffect(()=>{if(!open&&!lock.current&&active)close();},[open]);
 async function start(proofCsrf=currentCsrf.current,renewed=false){
  if(lock.current||uncertain||mfaExpired&&!renewed)return;lock.current=true;setBusy(true);onBusy(true);setMessage('');
  try{
   const r=await fetch('/api/auth/mfa/recovery/from-session',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'X-LAN-Request':'1','X-CSRF-Token':proofCsrf,'Content-Type':'application/json'},body:JSON.stringify({confirmed:true})});
   const b=await r.json();
   if(r.ok&&b.next==='/account/security?recovery=1'){window.location.assign(b.next);return;}
   if(r.status>=500)setUncertain(true);
   if(r.status===428&&b.code==='reauth_required')setPrimary(true);
   if(r.status===428&&b.code==='mfa_required'){setMfaExpired(true);setPrimary(false);setMessage('Confirm a fresh authenticator or unused recovery code below. If no working method remains, contact an administrator. Spent codes cannot be reused.');return;}
   setMessage(b.error??'Replacement could not be started.');
  }catch{setUncertain(true);setMessage('The handoff is uncertain. Do not submit again. Check restricted recovery status; if unavailable and no usable method remains, contact an administrator.');}
  finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 async function confirm(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(lock.current)return;const form=event.currentTarget,password=String(new FormData(form).get('password')??'');form.reset();lock.current=true;setBusy(true);onBusy(true);let confirmed=false;
  try{const r=await securityRequest('reauth-password',{password,...(proof?{turnstileToken:proof}:{})},currentCsrf.current),b=await r.json();confirmed=r.ok;if(r.status===403&&b.siteKey)setSiteKey(b.siteKey);if(!r.ok)setMessage(b.error??'Identity confirmation unavailable.');}
  catch{setMessage('Identity confirmation is uncertain. No handoff was retried.');}
  finally{lock.current=false;setBusy(false);onBusy(false);setProof(null);setAttempt(n=>n+1);}
  if(confirmed){setPrimary(false);await start();}
 }
 return <div className="mfa-replacement">
  {!active&&<button className="button button-secondary" disabled={disabled} onClick={()=>{onOpen();setMessage('');setActive(true);onActive(true);}}>Replace authenticator</button>}
  {active&&<section className="account-confirmation mfa-regeneration-panel mfa-replacement-stage" aria-label="Replace authenticator"><h3>Replace authenticator</h3>
   <p>This uses fresh sign-in proof once and signs this session out into restricted replacement. Spent recovery codes are never reused. Cancellation or expiry may require administrator assistance if no usable method remains.</p>
   {mfaExpired?<ReplacementProof csrf={currentCsrf.current} onBusy={v=>{setBusy(v);onBusy(v);}} onCancel={close} onConfirmed={async next=>{currentCsrf.current=next;setMfaExpired(false);await start(next,true);}}/>:primary?<><p>Confirm your sign-in method. Fresh MFA proof from your current session is also required.</p>
    {methods.password&&<form onSubmit={confirm}><fieldset disabled={busy||uncertain}><label htmlFor="replacement-password">Current password</label><PasswordInput id="replacement-password" name="password" required autoComplete="current-password"/>
     {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}<button className="button" disabled={!!siteKey&&!proof}>Confirm</button></fieldset></form>}
    </>:
    <button className="button" disabled={busy||uncertain} onClick={()=>void start()}>{busy?'Starting…':'Start replacement'}</button>}
   {uncertain&&<a className="button button-secondary" href="/account/security?recovery=1">Check restricted recovery</a>}
   <p className="mfa-latest-action" role="status">{message}</p><button className="button button-secondary" disabled={busy} onClick={close}>Cancel</button>
  </section>}
  {!active&&message&&<p className="mfa-latest-action" role="status">{message}</p>}
 </div>;
}

function ReplacementProof({csrf,onBusy,onCancel,onConfirmed}:{csrf:string;onBusy:(busy:boolean)=>void;onCancel:()=>void;onConfirmed:(csrf:string)=>Promise<void>}){
 const {session}=useAuth();
 return <MfaStepUp hideCancel csrf={csrf} onBusy={onBusy} onCancel={onCancel} description="Confirm fresh MFA to continue replacement. An unused recovery code is consumed once." confirmationLabel="Confirm and continue" onVerified={async()=>{
 const r=await fetch('/api/auth/session',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:AbortSignal.timeout(15000)}),b=await r.json();
 if(!r.ok||!session||b.account?.userId!==session.account.userId||b.emailVerified!==true||typeof b.csrfToken!=='string'||!/^[a-f0-9]{64}$/.test(b.csrfToken))throw Error('Session not confirmed');
 await onConfirmed(b.csrfToken);
 }}/>;
}
