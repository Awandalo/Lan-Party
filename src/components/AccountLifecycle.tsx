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
 const [available,setAvailable]=useState(false),[admin,setAdmin]=useState(false),[canDelete,setCanDelete]=useState(false);
 const [open,setOpen]=useState(false),[mode,setMode]=useState<'deactivate'|'delete'>('deactivate'),[finalWarning,setFinalWarning]=useState(false);
 const [message,setMessage]=useState(''),[needsMfa,setNeedsMfa]=useState(false),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[localExpanded,setLocalExpanded]=useState(false);
 const sectionOpen=expanded??localExpanded,deleting=mode==='delete',actionName=deleting?'Deletion':'Deactivation';
 const pending=useRef(false),continuation=useRef(false),currentCsrf=useRef<string|null>(null);
 function clear(){setOpen(false);setNeedsMfa(false);setFinalWarning(false);setBlocked(false);setMessage('');}
 useEffect(()=>{currentCsrf.current=null;},[csrf]);
 useEffect(()=>{clear();currentCsrf.current=null;},[session?.account.userId]);
 useEffect(()=>{setAvailable(false);setAdmin(false);setCanDelete(false);if(!csrf)return;const abort=new AbortController();
 void fetch('/api/auth/lifecycle/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:abort.signal})
 .then(async r=>{if(!r.ok)return;const b=await r.json();if(!abort.signal.aborted){setAvailable(b.available===true);setAdmin(b.administrator===true);setCanDelete(b.deletionAvailable===true);}}).catch(()=>{});
 return()=>abort.abort();},[csrf]);
 function reportBusy(value:boolean){setBusy(value);onBusy?.(value);}
 useEffect(()=>{if(!sectionOpen&&!pending.current&&!continuation.current){clear();if(currentCsrf.current){currentCsrf.current=null;void refresh();}}},[sectionOpen,refresh]);
 if(!available||!csrf)return null;
 async function submit(proof=currentCsrf.current??csrf,allowMfa=true,final=false){
 if(pending.current||!proof)return false;pending.current=true;reportBusy(true);setMessage('');
 const action=deleting?(final?'delete':'delete/prepare'):'deactivate';
 const input=deleting?(final?{confirm:'DELETE',acknowledged:true}:{confirm:'PREPARE_DELETE'}):{confirm:'DEACTIVATE'};
 try{const r=await lifecycleRequest(action,input,proof),b=await r.json();
 if(r.ok){
 if(deleting&&!final){if(b.ready!==true)throw Error('Preparation not confirmed');setNeedsMfa(false);setFinalWarning(true);return true;}
 window.location.assign(deleting?'/login?account=deleted':'/login?account=deactivated');return true;
 }
 if(r.status===428){setFinalWarning(false);setNeedsMfa(!final&&allowMfa&&b.code==='mfa_required');setMessage(b.code==='mfa_required'&&!final&&allowMfa?'':'Your confirmation expired. Confirm your password again to continue; no account change was performed.');return false;}
 if(r.status>=500||r.status===401||b.code==='lifecycle_state_conflict')setBlocked(true);
 setMessage(b.error??actionName+' could not be confirmed.');
 }catch{setBlocked(true);setMessage('Result not confirmed. Check your account status before another attempt. No automatic retry was made.');}
 finally{pending.current=false;reportBusy(false);}
 return false;
 }
 async function finishMfa(){
 if(continuation.current)return;continuation.current=true;
 try{
 // Step-up rotates the session. Preserve the selected action while reading its
 // new CSRF token; never substitute another account or automatically delete.
 const r=await fetch('/api/auth/session',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:AbortSignal.timeout(15000)}),b=await r.json();
 if(!r.ok||b.account?.userId!==session?.account.userId||b.emailVerified!==true||typeof b.csrfToken!=='string'||!/^[0-9a-f]{64}$/.test(b.csrfToken))throw Error('Session not confirmed');
 currentCsrf.current=b.csrfToken;
 if(!await submit(b.csrfToken,false)){setNeedsMfa(false);await refresh();}
 }finally{continuation.current=false;}
 }
 function cancel(){
 if(busy||pending.current||continuation.current)return;
 clear();setMessage(blocked?'Action closed. Check your account status before another attempt.':actionName+' cancelled. Your account is unchanged.');
 if(currentCsrf.current){currentCsrf.current=null;void refresh();}
 }
 function start(selected:'deactivate'|'delete'){if(busy||disabled)return;clear();setMode(selected);setOpen(true);}
 return <section className="account-lifecycle" aria-labelledby="lifecycle-title"><h2 id="lifecycle-title">Account lifecycle</h2>
 <dl className="connected-methods"><div><dt>Account access</dt><dd className="security-method-status"><button type="button" className="security-icon-action" aria-label="Account lifecycle options" title="Account lifecycle options" aria-expanded={sectionOpen} aria-controls="lifecycle-options" disabled={busy||disabled} onClick={()=>onToggle?onToggle():setLocalExpanded(v=>!v)}><SecurityActionIcon action="trash"/></button></dd></div></dl>
 {sectionOpen&&<div id="lifecycle-options">
 {!open&&<><div className="lifecycle-action"><h3>Deactivate account</h3><p>Pause access and hide your name from other participants. Your email, nickname, password, two-factor protection and registrations stay private. Your first and last names are cleared. An administrator must help you reactivate.</p><button type="button" className="button lifecycle-danger" disabled={disabled} onClick={()=>start('deactivate')}>Deactivate account</button></div>
 <div className="lifecycle-action"><h3>Delete account</h3><p>Permanently remove your account, password, MFA and roles. Anonymous completed-event registration totals and non-identifying number reservations remain. Older backups may retain account data; see our <Link to="/privacy">Privacy Policy</Link>.</p>
 {canDelete?<button type="button" className="button lifecycle-danger" disabled={disabled} onClick={()=>start('delete')}>Delete account</button>:<p>Permanent account deletion is not available yet.</p>}</div></>}
 {open&&<><h3>{deleting?'Delete account':'Deactivate account'}</h3><div className="lifecycle-confirmation">
 {blocked?<div role="alert"><h3>{actionName} stopped</h3><p>Check your account status or contact an administrator before another attempt.</p><div className="lifecycle-actions"><Link className="button button-secondary" to="/login">Sign in again</Link><button type="button" className="button button-secondary" onClick={cancel}>Close</button></div></div>:
 finalWarning?<div role="alert"><h3>Permanently delete your account?</h3><p>This cannot be undone through LAN Party. Your account, password, MFA, recovery codes and roles will be removed and you will be signed out. Are you sure?</p><p>An older backup restoration can bring back deleted data. See our <Link to="/privacy">Privacy Policy</Link>.</p><div className="lifecycle-actions"><button type="button" className="button lifecycle-danger" disabled={busy||disabled} onClick={()=>void submit(currentCsrf.current??csrf,true,true)}>{busy?'Deleting…':'Yes, delete my account'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={cancel}>Cancel</button></div></div>:
 needsMfa?<MfaStepUp csrf={currentCsrf.current??csrf} onBusy={reportBusy} onCancel={cancel} onVerified={finishMfa} actionRow confirmationLabel={deleting?'Confirm and continue':'Confirm and deactivate'} description={deleting?'Confirm your code, then review the final deletion warning. Your account is not deleted by this verification.':'Confirm your code to deactivate this account and sign out.'}/>:
 <>{!deleting&&<p>This signs out all sessions. It does not delete your account. An administrator must help you reactivate.</p>}<LifecycleProof csrf={currentCsrf.current??csrf} onCancel={cancel} onBusy={reportBusy} onConfirmed={async()=>{await submit();}}/></>}
 </div></>}
 <p role="status" aria-live="polite">{message}</p>
 {admin&&<Link to="/account/users">Users administration — reactivation</Link>}</div>}</section>;
}
