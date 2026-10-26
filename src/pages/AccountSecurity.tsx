import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link,Navigate,useLocation} from 'react-router';
import {useAuth} from '../lib/auth';
import {securityRequest,mfaSettingsRequested} from '../lib/account-security';
import AccountLifecycle from '../components/AccountLifecycle';
import MfaRecovery from '../components/MfaRecovery';
import RecoveryWarning from '../components/RecoveryWarning';
import LoginChallenge from '../components/LoginChallenge';
import PasswordInput from '../components/PasswordInput';
import SecurityActionIcon from '../components/SecurityActionIcon';
import MfaSettings from '../components/MfaSettings';
import MfaStepUp from '../components/MfaStepUp';
import {MFA_ENROLLMENT_AVAILABLE} from '../lib/mfa-mode';
import '../CSS/AccountSecurity_style.css';

export default function AccountSecurity(){
 const location=useLocation();
 if(new URLSearchParams(location.search).get('recovery')==='1')return <section className="page-section account-security-page"><div className="panel account-security-card"><MfaRecovery/></div></section>;
 return <SecuritySettings/>;
}
function ConnectedLoading({failed=false}:{failed?:boolean}){
 return <section className="connected-accounts" aria-busy={!failed}><h2>Sign-in method</h2><dl className="connected-methods"><div><dt>Email &amp; password</dt><dd className="security-method-status"><span role="status">{failed?'Unavailable':'Loading…'}</span><span className="security-action-placeholder" aria-hidden="true"/></dd></div></dl>{failed&&<p role="status">Account settings are unavailable. Reload before trying again.</p>}</section>;
}
function SecurityLoading({failed=false}:{failed?:boolean}){
 return <section className="page-section account-security-page"><div className="panel account-security-card"><h1>Account security</h1><p>All your account security settings in one place.</p><ConnectedLoading failed={failed}/><section className="mfa-enrollment security-mfa-section" aria-busy={!failed}><h2>Two-factor authentication</h2><div className="mfa-summary"><span>Authenticator app</span><span role="status" aria-label={failed?'Account security unavailable':'Checking your session…'}>{failed?'Unavailable':'Loading…'}</span></div></section><section><h2>Email verification</h2><dl className="connected-methods"><div><dt>Email address</dt><dd role="status">{failed?'Unavailable':'Checking…'}</dd></div></dl></section></div></section>;
}
function SecuritySettings(){
 const {session,status,refresh}=useAuth();
 const [snapshot,setMethods]=useState<{csrf:string;password:boolean}|null>(null),[failed,setFailed]=useState(false);
 const [feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false),[passwordOpen,setPasswordOpen]=useState(false);
 const [needsMfa,setNeedsMfa]=useState(false),[mfaOpen,setMfaOpen]=useState(mfaSettingsRequested());
 const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const pending=useRef(false),activeSession=useRef(session?.csrfToken),passwordTrigger=useRef<HTMLButtonElement>(null);
 activeSession.current=session?.csrfToken;
 const sessionKey=session?.csrfToken,methods=snapshot?.csrf===sessionKey?snapshot:null;
 useEffect(()=>{setFailed(false);if(!sessionKey){setMethods(null);return;}const controller=new AbortController();
 void fetch('/api/auth/security/methods',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
 .then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(typeof b.password!=='boolean')throw Error();if(!controller.signal.aborted)setMethods({csrf:sessionKey,password:b.password});})
 .catch(()=>{if(!controller.signal.aborted){setMethods(null);setFailed(true);}});return()=>controller.abort();
 },[sessionKey]);
 function clear(){setPasswordOpen(false);setNeedsMfa(false);setMfaOpen(false);setFeedback('');setSiteKey('');setProof(null);setAttempt(n=>n+1);}
 if(status==='loading')return <SecurityLoading/>;
 if(status==='error')return <SecurityLoading failed/>;
 if(!session)return <Navigate to="/login" replace/>;
 const csrf=session.csrfToken;
 async function changePassword(event:FormEvent<HTMLFormElement>){
 event.preventDefault();if(pending.current)return;const form=event.currentTarget,data=new FormData(form);
 const input={password:String(data.get('currentPassword')??''),newPassword:String(data.get('newPassword')??''),...(proof?{turnstileToken:proof}:{})};form.reset();pending.current=true;setBusy(true);setFeedback('');
 try{const r=await securityRequest('change-password',input,csrf),b=await r.json();if(activeSession.current!==csrf)return;
 if(r.ok&&b.next==='/login'){window.location.assign(b.notification?'/login?password=updated&notice='+b.notification:'/login');return;}
 if(r.status===428&&b.code==='mfa_required'){clear();setNeedsMfa(true);}
 else if(r.status===403&&b.siteKey){setSiteKey(b.siteKey);setFeedback('Complete the security check and explicitly try again.');}
 else setFeedback(b.error??'Password change could not be confirmed.');
 }catch{setFeedback('Unable to confirm request. No automatic retry was made.');}
 finally{input.password='';input.newPassword='';pending.current=false;setBusy(false);setProof(null);setAttempt(n=>n+1);}
 }
 return <section className="page-section account-security-page"><div className="panel account-security-card"><h1>Account security</h1><p>All your account security settings in one place.</p><RecoveryWarning remaining={session.recoveryCodesRemaining}/>
 {needsMfa&&<MfaStepUp key={csrf} csrf={csrf} onBusy={v=>{pending.current=v;setBusy(v);}} onCancel={clear} onVerified={async()=>{if(!await refresh())throw Error('Session unavailable');clear();setFeedback('Two-factor authentication confirmed. Select your account action again.');}}/>}
 {!methods&&<ConnectedLoading failed={failed}/>}
 {methods&&<section className="connected-accounts" aria-labelledby="connected-accounts-heading"><h2 id="connected-accounts-heading">Sign-in method</h2><dl className="connected-methods"><div><dt>Email &amp; password</dt><dd className="security-method-status">{methods.password?'Connected':'Not available'}
 {methods.password&&!passwordOpen&&<button ref={passwordTrigger} className="security-icon-action" aria-label="Change password" title="Change password" disabled={busy} onClick={()=>{if(pending.current)return;clear();setPasswordOpen(true);requestAnimationFrame(()=>document.getElementById('current-password')?.focus());}}><SecurityActionIcon action="key"/></button>}</dd>
 {!methods.password&&<dd><p>No password is configured. Contact a LAN Party administrator for account assistance. This page cannot bypass account ownership or MFA checks.</p></dd>}
 {passwordOpen&&methods.password&&<dd className="security-method-controls"><div className="account-confirmation"><form onSubmit={changePassword}><fieldset disabled={busy} aria-label="Change password"><label htmlFor="current-password">Current password</label><PasswordInput id="current-password" name="currentPassword" required autoComplete="current-password" autoFocus/><label htmlFor="new-password">New password</label><PasswordInput id="new-password" name="newPassword" minLength={12} maxLength={128} required autoComplete="new-password"/><p>Saving signs out all sessions. A security notification will be requested after the change.</p><Link to="/forgot-password" onClick={e=>{if(pending.current)e.preventDefault();}}>Forgot your current password?</Link>{siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}<button className="button">{busy?'Saving…':'Save password'}</button></fieldset></form><p role="status" aria-live="polite">{feedback}</p><button type="button" className="button button-secondary" disabled={busy} onClick={()=>{clear();requestAnimationFrame(()=>passwordTrigger.current?.focus());}}>Cancel</button></div></dd>}</div></dl></section>}
 {MFA_ENROLLMENT_AVAILABLE&&<MfaSettings csrf={csrf} methods={methods} open={mfaOpen} disabled={busy} onOpen={()=>{if(pending.current)return;clear();setMfaOpen(true);}} onBusy={v=>{pending.current=v;setBusy(v);}} onActivated={refresh}/>}
 <section aria-labelledby="security-email-status"><h2 id="security-email-status">Email verification</h2><dl className="connected-methods"><div><dt>Email address</dt><dd>{session.emailVerified?'Verified':'Not verified'}</dd></div></dl></section><AccountLifecycle key={csrf}/>{!passwordOpen&&<p role="status" aria-live="polite">{feedback}</p>}</div></section>;
}
