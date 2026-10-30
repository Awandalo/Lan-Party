import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link,useNavigate} from 'react-router';
import PasswordInput from '../components/PasswordInput';
import LoginChallenge from '../components/LoginChallenge';
import {lifecycleRequest} from '../components/AccountLifecycle';
import {useAuth} from '../lib/auth';
import '../CSS/ReactivateAccount_style.css';
type Phase='checking'|'invited'|'claimed'|'unavailable'|'error'|'cancelled'|'session-error';
const unavailable='Invitation unavailable. Ask the administrator for a new invitation.';
export default function ReactivateAccount(){
 const auth=useAuth(),navigate=useNavigate(),invitation=useRef(window.location.hash.slice(1)),alive=useRef(false),pending=useRef(false);
 const [phase,setPhase]=useState<Phase>('checking'),[origin,setOrigin]=useState(''),[csrf,setCsrf]=useState(''),[mfa,setMfa]=useState(false),[recovery,setRecovery]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[siteKey,setSiteKey]=useState(''),[token,setToken]=useState<string|null>(null);
 async function check(signal:AbortSignal){
  setPhase('checking');setMessage('');
  try{
   const r=invitation.current?await fetch('/api/auth/lifecycle/reactivation/inspect',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1'},body:JSON.stringify({token:invitation.current}),signal}):await fetch('/api/auth/lifecycle/reactivation/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal});
   if(signal.aborted||!alive.current)return;
   if(r.status===401||r.status===409){setPhase('unavailable');return;}
   if(!r.ok)throw Error('Check unavailable');const b=await r.json();if(signal.aborted||!alive.current)return;
   if(!b.available){setPhase('unavailable');return;}
   setOrigin(b.origin??'');if(b.csrfToken){setCsrf(b.csrfToken);setMfa(b.mfa===true);setPhase('claimed');}else setPhase('invited');
  }catch{if(alive.current&&(!signal.aborted||signal.reason?.name==='TimeoutError')){setPhase('error');setMessage('The invitation could not be checked. Check again or reopen the link from your email.');}}
 }
 useEffect(()=>{
  alive.current=true;window.history.replaceState(null,'',window.location.pathname);const abort=new AbortController();
  void check(AbortSignal.any([abort.signal,AbortSignal.timeout(15000)]));
  return()=>{alive.current=false;abort.abort();};
 },[]);
 async function claim(){
  if(pending.current)return;pending.current=true;setBusy(true);setMessage('');
  try{const r=await lifecycleRequest('reactivation/claim',{token:invitation.current},''),b=await r.json();if(!alive.current)return;
   if(!r.ok){setPhase(r.status===409?'unavailable':'error');setMessage(r.status===409?unavailable:b.error??'Invitation result not confirmed.');return;}
   invitation.current='';const status=await fetch('/api/auth/lifecycle/reactivation/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:AbortSignal.timeout(15000)}),data=await status.json();if(!alive.current)return;
   if(!status.ok||!data.available){setPhase(status.status===401?'unavailable':'error');setMessage('Could not confirm invitation status. Reload to check.');return;}
   setCsrf(data.csrfToken);setMfa(data.mfa===true);setOrigin(data.origin??'');setPhase('claimed');
  }catch{if(alive.current){setPhase('error');setMessage('Invitation result not confirmed. Reload to check; no automatic retry was made.');}}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 async function cancel(){
  if(pending.current)return;pending.current=true;setBusy(true);
  try{const r=await lifecycleRequest('reactivation/cancel',{},csrf),b=await r.json();if(!alive.current)return;if(r.ok){setPhase('cancelled');setMessage(b.message);}else if(r.status===401)setPhase('unavailable');else setMessage(b.error??'Cancellation not confirmed.');}
  catch{if(alive.current)setMessage('Cancellation not confirmed. The restricted context expires automatically. No automatic retry was made.');}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 async function complete(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;const form=event.currentTarget,data=new FormData(form);
  const body={password:String(data.get('password')??''),firstName:String(data.get('firstName')??''),lastName:String(data.get('lastName')??''),code:String(data.get('code')??''),method:recovery?'recovery':'totp',...(token?{turnstileToken:token}:{})};
  for(const name of ['password','code']){const field=form.elements.namedItem(name);if(field instanceof HTMLInputElement)field.value='';}
  pending.current=true;setBusy(true);setMessage('');
  try{const r=await lifecycleRequest('reactivation/complete',body,csrf),b=await r.json();
   if(r.ok){if(alive.current){setPhase('session-error');setMessage('Account reactivated. Initializing your session…');}
    const ready=await auth.invalidateAdministration().catch(()=>false);if(!alive.current)return;
    if(ready)navigate('/account',{replace:true});else setMessage('Account reactivated, but the session could not be initialized. Open your account or sign in to continue.');return;
   }
   if(!alive.current)return;
   if(b.code==='reactivation_unavailable')setPhase('unavailable');
   if(r.status===403&&b.siteKey)setSiteKey(b.siteKey);setMessage(b.error??'Reactivation could not be confirmed.');
  }catch{await auth.refresh().catch(()=>false);if(alive.current)setMessage('Result not confirmed. Try normal sign-in to check whether reactivation completed. No automatic retry was made.');}
  finally{body.password='';body.code='';setToken(null);pending.current=false;if(alive.current)setBusy(false);}
 }
 const usable=phase==='invited'||phase==='claimed';
 return <section className="page-section reactivate-page"><div className="panel"><p className="eyebrow">Account access</p><h1>{phase==='unavailable'?'Invitation unavailable':'Reactivate your account'}</h1>
  {phase==='checking'&&<p role="status">Checking invitation…</p>}
  {phase==='unavailable'&&<p className="reactivate-notice" role="alert">{unavailable}</p>}
  {usable&&<><p>Opening an invitation does not activate your account. Confirm your existing password and two-factor protection if enabled.</p><p className="reactivate-context">{origin==='voluntary'?'Your private names were cleared during voluntary deactivation. Enter them again.':origin==='administrator'?'An administrator disabled your account. Your private names were preserved; confirm your names below to complete reactivation.':'Confirm your names below to complete reactivation.'}</p></>}
  {message&&<p className="reactivate-feedback" role="status">{message}</p>}
  {phase==='invited'&&<div className="reactivate-actions"><button className="button" disabled={busy} onClick={()=>void claim()}>{busy?'Checking…':'Continue with invitation'}</button></div>}
  {phase==='claimed'&&<form onSubmit={complete}><fieldset disabled={busy}><legend className="sr-only">Verify account ownership</legend><div className="reactivate-name-grid"><label htmlFor="reactivate-first">First name<input id="reactivate-first" name="firstName" autoComplete="given-name" maxLength={100} required/></label><label htmlFor="reactivate-last">Last name<input id="reactivate-last" name="lastName" autoComplete="family-name" maxLength={100} required/></label></div><div className="reactivate-field"><label htmlFor="reactivate-password">Existing password</label><PasswordInput id="reactivate-password" name="password" autoComplete="current-password" maxLength={128} required/></div>
   {mfa&&<div className="reactivate-mfa"><label htmlFor="reactivate-code">{recovery?'Unused recovery code':'Authenticator code'}<input id="reactivate-code" name="code" autoComplete="one-time-code" maxLength={64} required/></label><button type="button" className="button button-secondary" onClick={()=>setRecovery(v=>!v)}>{recovery?'Use authenticator':'Use a recovery code instead'}</button></div>}
   {siteKey&&<LoginChallenge siteKey={siteKey} onToken={setToken}/>}<p className="reactivate-help">This restricted verification window lasts at most five minutes and cannot extend the invitation deadline.</p><div className="reactivate-actions"><button className="button">{busy?'Checking…':'Reactivate account'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void cancel()}>Cancel reactivation</button></div></fieldset></form>}
  {phase==='error'&&<button type="button" className="button button-secondary" onClick={()=>void check(AbortSignal.timeout(15000))}>Check invitation again</button>}
  {phase==='session-error'&&!busy&&<Link className="button" to="/account">Open your account</Link>}
  {usable&&<p className="reactivate-help">If you cannot use your existing sign-in methods, contact an administrator. This page cannot bypass two-factor authentication.</p>}
  <nav className="reactivate-footer" aria-label="Account navigation"><Link to="/login">Return to sign-in</Link></nav>
 </div></section>;
}
