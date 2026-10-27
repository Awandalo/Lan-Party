import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router';
import {useAuth} from '../lib/auth';
import {securityRequest} from '../lib/account-security';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import MfaStepUp from './MfaStepUp';
import SecurityActionIcon from './SecurityActionIcon';
import '../CSS/AccountLifecycle_style.css';

export async function lifecycleRequest(action:string,input:object,csrf:string){
 return fetch('/api/auth/lifecycle/'+action,{method:'POST',credentials:'same-origin',redirect:'error',
 headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':csrf},
 body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
}
export function LifecycleProof({csrf,onConfirmed,onBusy,onCancel}:{csrf:string;onConfirmed:()=>Promise<void>;onBusy?:(busy:boolean)=>void;onCancel?:()=>void}){
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[siteKey,setSiteKey]=useState(''),[token,setToken]=useState<string|null>(null);
 const pending=useRef(false);
 async function confirm(event:FormEvent<HTMLFormElement>){
 event.preventDefault();if(pending.current)return;const form=event.currentTarget,pwd=String(new FormData(form).get('password')??'');form.reset();
 pending.current=true;setBusy(true);onBusy?.(true);setFeedback('');
 try{const r=await securityRequest('reauth-password',{password:pwd,...(token?{turnstileToken:token}:{})},csrf),b=await r.json();
 if(r.ok)await onConfirmed();
 else if(r.status===403&&b.siteKey){setSiteKey(b.siteKey);setFeedback('Complete the security check and confirm again.');}
 else setFeedback(b.error??'Password could not be confirmed.');
 }catch{setFeedback('Result not confirmed. No automatic retry was made.');}
 finally{pending.current=false;setBusy(false);onBusy?.(false);setToken(null);}
 }
 return <form onSubmit={confirm}><fieldset disabled={busy}><label htmlFor="lifecycle-password">Confirm your current password</label><PasswordInput id="lifecycle-password" name="password" autoComplete="current-password" autoFocus required maxLength={128}/>{siteKey&&<LoginChallenge siteKey={siteKey} onToken={setToken}/>}<div className="lifecycle-actions"><button className="button">{busy?'Checking…':'Confirm and continue'}</button>{onCancel&&<button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button>}</div></fieldset><p role="status">{feedback}</p></form>;
}
export default function AccountLifecycle({expanded,disabled=false,onToggle,onBusy}:{expanded?:boolean;disabled?:boolean;onToggle?:()=>void;onBusy?:(busy:boolean)=>void}={}){
 const {session,refresh}=useAuth(),csrf=session?.csrfToken;
 const [available,setAvailable]=useState(false),[admin,setAdmin]=useState(false),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[needsMfa,setNeedsMfa]=useState(false),[busy,setBusy]=useState(false);
 const [blocked,setBlocked]=useState(false),[localExpanded,setLocalExpanded]=useState(false);const sectionOpen=expanded??localExpanded;
 const pending=useRef(false),continuation=useRef(false),currentCsrf=useRef<string|null>(null);
 useEffect(()=>{currentCsrf.current=null;},[csrf]);
 useEffect(()=>{setOpen(false);setNeedsMfa(false);setBlocked(false);setMessage('');currentCsrf.current=null;},[session?.account.userId]);
 useEffect(()=>{setAvailable(false);setAdmin(false);if(!csrf)return;const abort=new AbortController();
 void fetch('/api/auth/lifecycle/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:abort.signal})
 .then(async r=>{if(!r.ok)return;const b=await r.json();if(!abort.signal.aborted){setAvailable(b.available===true);setAdmin(b.administrator===true);}}).catch(()=>{});
 return()=>abort.abort();},[csrf]);
 function reportBusy(value:boolean){setBusy(value);onBusy?.(value);}
 useEffect(()=>{if(!sectionOpen&&!pending.current&&!continuation.current){setOpen(false);setNeedsMfa(false);setBlocked(false);setMessage('');if(currentCsrf.current){currentCsrf.current=null;void refresh();}}},[sectionOpen,refresh]);
 if(!available||!csrf)return null;
 async function deactivate(proof=currentCsrf.current??csrf,allowMfa=true){
 if(pending.current||!proof)return false;pending.current=true;reportBusy(true);setMessage('');
 try{const r=await lifecycleRequest('deactivate',{confirm:'DEACTIVATE'},proof),b=await r.json();
 if(r.ok){window.location.assign('/login?account=deactivated');return true;}
 if(r.status===428&&b.code==='mfa_required'){setNeedsMfa(allowMfa);setMessage(allowMfa?'':'Your confirmation expired. Confirm your password to continue.');return false;}
 if(r.status===428&&b.code==='primary_required'){setNeedsMfa(false);setMessage('Your password confirmation expired. Confirm it again to continue; no deactivation was performed.');return false;}
 if(r.status>=500||r.status===401||b.code==='lifecycle_state_conflict')setBlocked(true);
 setMessage(b.error??'Deactivation could not be confirmed.');
 }catch{setBlocked(true);setMessage('Result not confirmed. Check whether you are still signed in before trying again. No automatic retry was made.');}
 finally{pending.current=false;reportBusy(false);}
 return false;
 }
 async function finishMfa(){
 if(continuation.current)return;continuation.current=true;
 try{
 // Step-up rotates the HttpOnly session. Read its CSRF token without refreshing
 // the parent first: that used to unmount/reset the pending deactivation journey.
 const r=await fetch('/api/auth/session',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:AbortSignal.timeout(15000)});
 const b=await r.json();
 if(!r.ok||b.account?.userId!==session?.account.userId||b.emailVerified!==true||typeof b.csrfToken!=='string'||!/^[0-9a-f]{64}$/.test(b.csrfToken))throw Error('Session not confirmed');
 currentCsrf.current=b.csrfToken;
 const completed=await deactivate(b.csrfToken,false);
 if(!completed){setNeedsMfa(false);await refresh();}
 }finally{continuation.current=false;}
 }
 function cancel(){
 if(busy||pending.current||continuation.current)return;
 setOpen(false);setNeedsMfa(false);setBlocked(false);setMessage(blocked?'Action closed. Check your account status before another attempt.':'Deactivation cancelled. Your account is unchanged.');
 if(currentCsrf.current){currentCsrf.current=null;void refresh();}
 }
 return <section className="account-lifecycle" aria-labelledby="lifecycle-title"><h2 id="lifecycle-title">Account lifecycle</h2>
 <dl className="connected-methods"><div><dt>Account access</dt><dd className="security-method-status"><button type="button" className="security-icon-action" aria-label="Account lifecycle options" title="Account lifecycle options" aria-expanded={sectionOpen} aria-controls="lifecycle-options" disabled={busy||disabled} onClick={()=>onToggle?onToggle():setLocalExpanded(v=>!v)}><SecurityActionIcon action="trash"/></button></dd></div></dl>
 {sectionOpen&&<div id="lifecycle-options"><div className="lifecycle-action"><div><h3>Deactivate account</h3>
 {!open&&<p>Pause access and hide your name from other participants. Your email, nickname, password, two-factor protection and registrations stay private. Your first and last names are cleared. An administrator must help you reactivate.</p>}</div>
 {!open&&<button type="button" className="button lifecycle-danger" onClick={()=>{setBlocked(false);setOpen(true);setMessage('');}}>Deactivate account</button>}</div>
 {open&&<div className="lifecycle-confirmation">{!needsMfa&&!blocked&&<><h3>Deactivate your account?</h3><p>This signs out all sessions. It does not delete your account. To return, contact an administrator and use your existing password and two-factor protection if enabled.</p></>}
 {blocked?<div role="alert"><h3>Deactivation stopped</h3><p>Check your account status or contact an administrator before starting another attempt.</p><div className="lifecycle-actions"><Link className="button button-secondary" to="/login">Sign in again</Link><button type="button" className="button button-secondary" onClick={cancel}>Close</button></div></div>:needsMfa?<MfaStepUp csrf={currentCsrf.current??csrf} onBusy={reportBusy} onCancel={cancel} onVerified={finishMfa}
 actionRow confirmationLabel="Confirm and deactivate" description="Confirm your code to deactivate this account and sign out. You will not need to select the action or enter the code again."/>:<><LifecycleProof csrf={currentCsrf.current??csrf} onCancel={cancel} onBusy={reportBusy} onConfirmed={async()=>{await deactivate();}}/></>}
 </div>}
 <p role="status" aria-live="polite">{message}</p>
 <div className="lifecycle-unavailable"><h3>Permanent deletion</h3><p>Permanent account deletion is not available yet.</p></div>
 {admin&&<Link to="/account/users">Users administration — reactivation</Link>}</div>}</section>;
}
