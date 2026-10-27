import MfaReplacement from './MfaReplacement';
import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import MfaRegeneration from './MfaRegeneration';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import SecurityActionIcon from './SecurityActionIcon';
import {securityRequest} from '../lib/account-security';
import '../CSS/MfaEnrollment_style.css';

type Purpose='disable'|'regenerate';
type Pending={token:string;expiresAt:number;acknowledgment?:string;codes?:string[]};
export default function MfaManagement({csrf,open,disabled,onOpen,onBusy,onActivated,methods,onToggle}:{csrf:string;open:boolean;disabled:boolean;onOpen:()=>void;onToggle?:()=>void;onBusy:(busy:boolean)=>void;onActivated:()=>Promise<unknown>;methods:{password:boolean}}){
 const [expanded,setExpanded]=useState(open);
 const [regenerationActive,setRegenerationActive]=useState(false),[replacementActive,setReplacementActive]=useState(false);
 const [purpose,setPurpose]=useState<Purpose|null>(null),[transaction,setTransaction]=useState<Pending|null>(null);
 const [feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[method,setMethod]=useState<'totp'|'recovery'>('totp'),[saved,setSaved]=useState(false),[reauth,setReauth]=useState(false);
 const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const pending=useRef(false),panel=useRef<HTMLDivElement>(null),field=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null),mounted=useRef(true);
 useEffect(()=>{setExpanded(open);},[open]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(open&&!transaction&&!regenerationActive)requestAnimationFrame(()=>trigger.current?.focus());},[open]);
 function clear(){setTransaction(null);setPurpose(null);setSaved(false);setReauth(false);setProof(null);setSiteKey('');if(field.current)field.current.value='';}
 async function request(action:string,input:object){
  const response=await fetch('/api/auth/mfa/manage/'+action,{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'X-LAN-Request':'1','Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(input)});
  const body=await response.json();return {response,body};
 }
 useEffect(()=>{
  if(open||pending.current)return;
  if(transaction)void request('cancel',{token:transaction.token}).catch(()=>{});clear();setFeedback('');
 },[open]);
 useEffect(()=>{if(!transaction)return;const timer=setTimeout(()=>{clear();setFeedback(pending.current?'This action expired while a request was in progress. The result is uncertain; sign in again and check your settings.':'This action expired. Your previous MFA settings remain unchanged.');},Math.max(0,transaction.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[transaction]);
 async function run(action:'start'|'verify'|'finish'|'cancel',selected=purpose,code?:string){
  if(action==='cancel'&&!transaction){clear();setFeedback('Changes cancelled. Previous MFA settings remain unchanged.');requestAnimationFrame(()=>trigger.current?.focus());return;}
  if(pending.current||action==='start'&&disabled)return;pending.current=true;setBusy(true);onBusy(true);setFeedback('');
  const current=transaction;
  if(action==='cancel')clear();
  try{
   const {response,body}=await request(action,action==='start'?{purpose:selected}:action==='verify'?{token:current?.token,method,code,...(proof?{turnstileToken:proof}:{})}:action==='finish'?{token:current?.token,acknowledgment:current?.acknowledgment,confirmed:true}:{token:current?.token});
   if(!mounted.current)return;
   if(response.status===428){setReauth(true);setFeedback('Confirm your sign-in method below, then select the action again.');return;}
   if(response.status===403&&typeof body.siteKey==='string'){setSiteKey(body.siteKey);setFeedback('Complete the security check, then try again.');return;}
   if(!response.ok){setFeedback(response.status===429?`Please wait ${response.headers.get('Retry-After')??''} seconds before trying again.`:body.error??'Action unavailable.');return;}
   if(action==='start'){
    if(!/^[a-f0-9]{64}$/.test(body.token)||!Number.isSafeInteger(body.expiresAt)||body.expiresAt<=Date.now()/1000||body.expiresAt>Date.now()/1000+120)throw Error();
    setTransaction(body);setReauth(false);requestAnimationFrame(()=>field.current?.focus());
   }else if(action==='verify'){
    if(!/^[a-f0-9]{64}$/.test(body.acknowledgment))throw Error();
    if(selected==='regenerate'&&(!Array.isArray(body.codes)||body.codes.length!==10||new Set(body.codes).size!==10||body.codes.some((v:unknown)=>typeof v!=='string'||!/^[A-Z2-7]{26}$/.test(v.replaceAll('-','')))))throw Error();
    setTransaction(current?{...current,...body}:null);setSaved(false);requestAnimationFrame(()=>panel.current?.focus());
   }else if(action==='finish'){
    clear();await onActivated();if(mounted.current)setFeedback('Security settings updated.'+(body.notification==='unconfirmed'?' Notification delivery could not be confirmed.':''));
   }else{setFeedback('Changes cancelled. Previous MFA settings remain unchanged.');requestAnimationFrame(()=>trigger.current?.focus());}
  }catch{if(mounted.current)setFeedback(action==='finish'?'The result could not be confirmed. No automatic retry was made. Sign in again and check your settings.':'The action could not be confirmed. No automatic retry was made. Cancel and start again if needed.');}
  finally{pending.current=false;onBusy(false);if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
 }
 async function select(value:Purpose){
  if(pending.current||disabled)return;onOpen();const previous=transaction;clear();
  if(previous){pending.current=true;setBusy(true);onBusy(true);
   try{const {response}=await request('cancel',{token:previous.token});if(!response.ok)throw Error();}
   catch{setFeedback('The previous action could not be cancelled. Reload before starting another.');return;}
   finally{pending.current=false;setBusy(false);onBusy(false);}
  }
  setPurpose(value);void run('start',value);
 }
 function verify(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,code=String(new FormData(form).get('code')??'');form.reset();void run('verify',purpose,code);}
 async function primary(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;const form=event.currentTarget,password=String(new FormData(form).get('password')??'');form.reset();pending.current=true;setBusy(true);onBusy(true);
  try{const response=await securityRequest('reauth-password',{password,...(proof?{turnstileToken:proof}:{})},csrf),body=await response.json();
   if(response.ok){setReauth(false);setPurpose(null);setFeedback('Identity confirmed. Select Disable MFA or Regenerate recovery codes to continue.');}
   else if(response.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check, then confirm your password again.');}
   else setFeedback('Your identity could not be confirmed. Try again later.');
  }catch{setFeedback('Confirmation unavailable. No automatic retry was made.');}finally{pending.current=false;setBusy(false);onBusy(false);setProof(null);setAttempt(n=>n+1);}
 }
 return <section className="mfa-enrollment security-mfa-section" aria-labelledby="mfa-management-heading"><h2 id="mfa-management-heading">Two-factor authentication</h2>
  <dl className="connected-methods"><div><dt>Authenticator app</dt><dd className="security-method-status">Enabled <button type="button" className="security-icon-action" aria-label="Manage MFA" title="Manage MFA" aria-expanded={expanded} aria-controls="mfa-options" disabled={disabled||busy} onClick={()=>onToggle?onToggle():setExpanded(value=>!value)}><SecurityActionIcon action="shield"/></button></dd></div></dl>
  <div id="mfa-options" hidden={!expanded}><div className="mfa-enabled-description"><p>Your authenticator or a recovery code protects your sign-in.</p>
   {!(open&&transaction&&purpose==='disable')&&<button ref={trigger} className="security-icon-action" aria-label="Disable MFA" title="Disable MFA" disabled={disabled||busy||regenerationActive||replacementActive} onClick={()=>void select('disable')}><SecurityActionIcon action="unlink"/></button>}
</div>
  <div className="mfa-action-row">
  <MfaRegeneration csrf={csrf} open={open} disabled={disabled||busy||!!transaction||replacementActive} methods={methods} onOpen={()=>{clear();setFeedback('');onOpen();}} onBusy={onBusy} onActivated={onActivated} onActive={setRegenerationActive}/>
  <MfaReplacement csrf={csrf} open={open} disabled={disabled||busy||regenerationActive||!!transaction} methods={methods} onOpen={()=>{clear();setFeedback('');onOpen();}} onBusy={onBusy} onActive={setReplacementActive}/>
  </div>
  {open&&!regenerationActive&&!replacementActive&&(transaction||reauth)&&<div ref={panel} tabIndex={-1} className="account-confirmation">
   {reauth?<><p>Confirm your identity. No MFA setting has been changed.</p>{methods.password&&<form onSubmit={primary}><fieldset disabled={busy}><label htmlFor="mfa-primary-password">Current password</label><PasswordInput id="mfa-primary-password" name="password" autoComplete="current-password" required autoFocus/>
    {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}<button className="button">Confirm password</button></fieldset></form>}
    </>:
    transaction&&!transaction.acknowledgment?<><p>{purpose==='disable'?'Disabling removes the extra sign-in check. Your account, sign-in methods and history stay intact.':'You will receive ten new recovery codes. Your remaining old codes work until you save and confirm the new set.'}</p>
     <form onSubmit={verify}><fieldset disabled={busy}><label htmlFor="mfa-management-code">{method==='totp'?'Six-digit authenticator code':'Unused recovery code'}</label>
      <input ref={field} id="mfa-management-code" name="code" autoComplete="one-time-code" inputMode={method==='totp'?'numeric':'text'} maxLength={method==='totp'?6:40} pattern={method==='totp'?'[0-9]{6}':undefined} required/>
      {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}<button className="button" disabled={!!siteKey&&!proof}>{busy?'Checking…':'Confirm authenticator'}</button></fieldset></form>
     <button className="button button-secondary" disabled={busy} onClick={()=>{if(field.current)field.current.value='';setMethod(method==='totp'?'recovery':'totp');requestAnimationFrame(()=>field.current?.focus());}}>{method==='totp'?'Use a recovery code':'Use authenticator'}</button></>:
    <>{purpose==='regenerate'?<><p>Save these new codes privately. Each works once; they cannot be displayed again.</p><ul aria-label="New recovery codes">{transaction?.codes?.map(code=><li key={code}><code>{code}</code></li>)}</ul>
     <p>Select and copy the codes, or save them in your password manager.</p><label className="mfa-saved"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I have saved the new recovery codes</label></>:
     <><p>Disable two-factor authentication? Your old authenticator and recovery codes will stop working. Your account and connected sign-in methods will be preserved.</p><label className="mfa-saved"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>Yes, disable two-factor authentication</label></>}
     <button className="button" disabled={!saved||busy} onClick={()=>void run('finish')}>{busy?'Saving…':purpose==='disable'?'Confirm disable MFA':'Activate new recovery codes'}</button></>}
   <button className="button button-secondary" disabled={busy} onClick={()=>void run('cancel')}>Cancel</button>
  </div>}
  <p role="status" aria-live="polite">{feedback}</p></div>
 </section>;
}
