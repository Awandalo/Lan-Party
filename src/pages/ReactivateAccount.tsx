import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router';
import PasswordInput from '../components/PasswordInput';
import LoginChallenge from '../components/LoginChallenge';
import {lifecycleRequest} from '../components/AccountLifecycle';
import '../CSS/ReactivateAccount_style.css';

export default function ReactivateAccount(){
 const invitation=useRef(window.location.hash.slice(1));
 const [claimed,setClaimed]=useState(false),[csrf,setCsrf]=useState(''),[mfa,setMfa]=useState(false),[recovery,setRecovery]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false),[activated,setActivated]=useState(false),[siteKey,setSiteKey]=useState(''),[token,setToken]=useState<string|null>(null);
 const pending=useRef(false);
 useEffect(()=>{window.history.replaceState(null,'',window.location.pathname);
 const abort=new AbortController();void fetch('/api/auth/lifecycle/reactivation/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:abort.signal}).then(async r=>{if(!r.ok)return;const b=await r.json();if(!abort.signal.aborted&&b.available&&b.csrfToken){setClaimed(true);setCsrf(b.csrfToken);setMfa(b.mfa===true);}}).catch(()=>{});return()=>abort.abort();},[]);
 async function claim(){
 if(pending.current)return;pending.current=true;setBusy(true);
 try{const r=await lifecycleRequest('reactivation/claim',{token:invitation.current},''),b=await r.json();
 if(!r.ok)throw Error(b.error??'Invitation unavailable.');invitation.current='';
 const status=await fetch('/api/auth/lifecycle/reactivation/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:AbortSignal.timeout(15000)});
 const data=await status.json();if(!status.ok||!data.available)throw Error('Could not confirm invitation status. Reload to check; no automatic retry was made.');
 setClaimed(true);setCsrf(data.csrfToken);setMfa(data.mfa===true);setMessage('Confirm your existing sign-in details. This restricted window expires after five minutes.');
 }catch(e){setMessage(e instanceof Error?e.message:'Invitation result not confirmed. Ask the administrator for a new invitation.');}
 finally{pending.current=false;setBusy(false);}
 }
 async function cancel(){
 if(pending.current)return;pending.current=true;setBusy(true);
 try{const r=await lifecycleRequest('reactivation/cancel',{},csrf),b=await r.json();
 if(r.ok){setDone(true);setMessage(b.message);}else setMessage(b.error??'Cancellation not confirmed.');
 }catch{setMessage('Cancellation not confirmed. The restricted context expires automatically. No automatic retry was made.');}
 finally{pending.current=false;setBusy(false);}
 }
 async function complete(event:FormEvent<HTMLFormElement>){
 event.preventDefault();if(pending.current)return;const form=event.currentTarget,data=new FormData(form);
 const body={password:String(data.get('password')??''),firstName:String(data.get('firstName')??''),lastName:String(data.get('lastName')??''),code:String(data.get('code')??''),method:recovery?'recovery':'totp',...(token?{turnstileToken:token}:{})};
 form.reset();pending.current=true;setBusy(true);
 try{const r=await lifecycleRequest('reactivation/complete',body,csrf),b=await r.json();
 if(r.ok){setDone(true);setActivated(true);setMessage(b.message);return;}if(r.status===403&&b.siteKey)setSiteKey(b.siteKey);setMessage(b.error??'Reactivation could not be confirmed.');
 }catch{setMessage('Result not confirmed. Try normal sign-in to check whether reactivation completed. No automatic retry was made.');}
 finally{body.password='';body.code='';setToken(null);pending.current=false;setBusy(false);}
 }
 return <section className="page-section reactivate-page"><div className="panel"><h1>Reactivate your account</h1><p>Opening an invitation does not activate your account. Confirm your existing password and two-factor protection if enabled. Your original private names were cleared when you deactivated; enter them again.</p>
 <p role="status">{message}</p>
 {!done&&(!claimed?<button className="button" disabled={busy||!invitation.current} onClick={()=>void claim()}>Continue with invitation</button>:<form onSubmit={complete}><fieldset disabled={busy}><label htmlFor="reactivate-first">First name</label><input id="reactivate-first" name="firstName" autoComplete="given-name" maxLength={100} required/><label htmlFor="reactivate-last">Last name</label><input id="reactivate-last" name="lastName" autoComplete="family-name" maxLength={100} required/><label htmlFor="reactivate-password">Existing password</label><PasswordInput id="reactivate-password" name="password" autoComplete="current-password" maxLength={128} required/>
 {mfa&&<><label htmlFor="reactivate-code">{recovery?'Unused recovery code':'Authenticator code'}</label><input id="reactivate-code" name="code" autoComplete="one-time-code" maxLength={64} required/><button type="button" className="button button-secondary" onClick={()=>setRecovery(v=>!v)}>{recovery?'Use authenticator':'Use a recovery code instead'}</button></>}
 {siteKey&&<LoginChallenge siteKey={siteKey} onToken={setToken}/>}<button className="button">{busy?'Checking…':'Reactivate account'}</button></fieldset></form>)}
 {claimed&&!done&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void cancel()}>Cancel reactivation</button>}<Link to={activated?"/account/security":"/login"}>{activated?"Continue to Account Security":"Return to sign-in"}</Link><p>If you cannot use your existing sign-in methods, contact a LAN Party administrator. This page cannot bypass two-factor authentication.</p></div></section>;
}
