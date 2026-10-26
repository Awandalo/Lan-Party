import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router';
import {useAuth} from '../lib/auth';
import {securityRequest} from '../lib/account-security';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import MfaStepUp from './MfaStepUp';
import '../CSS/AccountLifecycle_style.css';

export async function lifecycleRequest(action:string,input:object,csrf:string){
 return fetch('/api/auth/lifecycle/'+action,{method:'POST',credentials:'same-origin',redirect:'error',
 headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':csrf},
 body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
}
export function LifecycleProof({csrf,onConfirmed}:{csrf:string;onConfirmed:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[siteKey,setSiteKey]=useState(''),[token,setToken]=useState<string|null>(null);
 const pending=useRef(false);
 async function confirm(event:FormEvent<HTMLFormElement>){
 event.preventDefault();if(pending.current)return;const form=event.currentTarget,pwd=String(new FormData(form).get('password')??'');form.reset();
 pending.current=true;setBusy(true);setFeedback('');
 try{const r=await securityRequest('reauth-password',{password:pwd,...(token?{turnstileToken:token}:{})},csrf),b=await r.json();
 if(r.ok)await onConfirmed();
 else if(r.status===403&&b.siteKey){setSiteKey(b.siteKey);setFeedback('Complete the security check and confirm again.');}
 else setFeedback(b.error??'Password could not be confirmed.');
 }catch{setFeedback('Result not confirmed. No automatic retry was made.');}
 finally{pending.current=false;setBusy(false);setToken(null);}
 }
 return <form onSubmit={confirm}><fieldset disabled={busy}><label htmlFor="lifecycle-password">Confirm your current password</label><PasswordInput id="lifecycle-password" name="password" autoComplete="current-password" autoFocus required maxLength={128}/>{siteKey&&<LoginChallenge siteKey={siteKey} onToken={setToken}/>}<button className="button">{busy?'Checking…':'Confirm and continue'}</button></fieldset><p role="status">{feedback}</p></form>;
}
export default function AccountLifecycle(){
 const {session,refresh}=useAuth(),csrf=session?.csrfToken;
 const [available,setAvailable]=useState(false),[admin,setAdmin]=useState(false),[open,setOpen]=useState(false),[message,setMessage]=useState(''),[needsMfa,setNeedsMfa]=useState(false),[busy,setBusy]=useState(false);
 const pending=useRef(false);
 useEffect(()=>{setAvailable(false);setAdmin(false);if(!csrf)return;const abort=new AbortController();
 void fetch('/api/auth/lifecycle/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:abort.signal})
 .then(async r=>{if(!r.ok)return;const b=await r.json();if(!abort.signal.aborted){setAvailable(b.available===true);setAdmin(b.administrator===true);}}).catch(()=>{});
 return()=>abort.abort();},[csrf]);
 if(!available||!csrf)return null;
 async function deactivate(){
 if(pending.current||!csrf)return;pending.current=true;setBusy(true);setMessage('');
 try{const r=await lifecycleRequest('deactivate',{confirm:'DEACTIVATE'},csrf),b=await r.json();
 if(r.ok){window.location.assign('/login?account=deactivated');return;}
 if(r.status===428&&b.code==='mfa_required')setNeedsMfa(true);
 setMessage(b.error??'Deactivation could not be confirmed.');
 }catch{setMessage('Result not confirmed. Check whether you are still signed in before trying again. No automatic retry was made.');}
 finally{pending.current=false;setBusy(false);}
 }
 return <section className="account-lifecycle" aria-labelledby="lifecycle-title"><h2 id="lifecycle-title">Account lifecycle</h2>
 <p>Deactivation hides your name from other participants and signs out your sessions. Your email, nickname, password, two-factor protection and registrations are kept privately. Your private first and last names are cleared. Contact an administrator to reactivate.</p>
 {!open&&<button className="button button-secondary" onClick={()=>{setOpen(true);setMessage('');}}>Deactivate account</button>}
 {open&&<div className="lifecycle-confirmation"><h3>Deactivate your account?</h3><p>This ends access immediately. It does not delete your account. You will need an administrator, your existing password and two-factor authentication if enabled to return.</p>
 {needsMfa?<MfaStepUp csrf={csrf} onBusy={setBusy} onCancel={()=>setNeedsMfa(false)} onVerified={async()=>{await refresh();setNeedsMfa(false);setMessage('Two-factor authentication confirmed. Confirm your password to continue deactivation.');}}/>:<LifecycleProof csrf={csrf} onConfirmed={deactivate}/>}
 <button type="button" className="button button-secondary" disabled={busy} onClick={()=>{setOpen(false);setNeedsMfa(false);setMessage('Deactivation cancelled. Your account is unchanged.');}}>Cancel</button></div>}
 <p role="status">{message}</p>
 <p>Permanent deletion is not available yet. Backup retention and safe restoration handling must be confirmed before irreversible deletion is enabled.</p>
 {admin&&<Link to="/account/users">Users administration — reactivation</Link>}</section>;
}
