import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { clearPasswordSetup, googleRequest, passwordSetupRequested } from '../lib/google';
import GoogleButton from '../components/GoogleButton';
import type { GoogleButtonHandle } from '../components/GoogleButton';
import LoginChallenge from '../components/LoginChallenge';
import PasswordInput from '../components/PasswordInput';
import SecurityActionIcon from '../components/SecurityActionIcon';
import MfaEnrollment from '../components/MfaEnrollment';
import { MFA_ENROLLMENT_AVAILABLE } from '../lib/mfa-mode';
import '../CSS/AccountSecurity_style.css';
export default function AccountSecurity(){
  const {session,status,refresh}=useAuth();
  const [methods,setMethods]=useState<{password:boolean;google:boolean}|null>(null),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
  const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const [needsPassword,setNeedsPassword]=useState(false),confirmationRef=useRef<HTMLDivElement>(null);
  const [disconnecting,setDisconnecting]=useState(false),[passwordSetupOpen,setPasswordSetupOpen]=useState(passwordSetupRequested());
  const [needsGoogle,setNeedsGoogle]=useState(false);
  const [mfaOpen,setMfaOpen]=useState(false);
  const [googleBusy,setGoogleBusy]=useState(false),googlePending=useRef(false);
  const googleButton=useRef<GoogleButtonHandle>(null),activeSession=useRef(session?.csrfToken),actionPending=useRef(false);
  const disconnectTrigger=useRef<HTMLButtonElement>(null);
  const passwordTrigger=useRef<HTMLButtonElement>(null);
  const passwordPanel=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(needsGoogle)passwordPanel.current?.focus();},[needsGoogle]);
  activeSession.current=session?.csrfToken;
  function clearAction(){setMfaOpen(false);clearPasswordSetup();setPasswordSetupOpen(false);setNeedsGoogle(false);setNeedsPassword(false);setDisconnecting(false);setFeedback('');setSiteKey('');setProof(null);setAttempt(n=>n+1);}
  function selectAction(action:'password'|'disconnect'){
    if(actionPending.current||googlePending.current)return;
    googleButton.current?.cancelLink();clearAction();
    if(action==='password'){setPasswordSetupOpen(true);requestAnimationFrame(()=>document.getElementById(methods?.password?'current-password':'new-password')?.focus());}
    else {setDisconnecting(true);setNeedsPassword(true);requestAnimationFrame(()=>confirmationRef.current?.focus());}
  }
  function googleProgress(pending:boolean){googlePending.current=pending;setGoogleBusy(pending);}
  function requestPasswordConfirmation(){setPasswordSetupOpen(false);setNeedsGoogle(false);setDisconnecting(false);setNeedsPassword(true);requestAnimationFrame(()=>confirmationRef.current?.focus());}
  function cancelConfirmation(){googleButton.current?.cancelLink();setNeedsPassword(false);setDisconnecting(false);setFeedback('');setSiteKey('');setProof(null);requestAnimationFrame(()=>disconnectTrigger.current?.focus());}
  useEffect(()=>{if(session)void googleRequest('methods').then(async r=>{if(r.ok)setMethods(await r.json());else setFeedback('Account security is unavailable.');}).catch(()=>setFeedback('Account security is unavailable.'));},[session]);
  if(status==='loading')return <p role="status">Checking session…</p>;
  if(status==='error')return <p role="status">Account security is unavailable. Reload before trying again.</p>;
  if(!session)return <Navigate to="/login" replace/>;
  const csrf=session.csrfToken;
  async function action(name:string,input:object={}){
    if(actionPending.current||googlePending.current)return;actionPending.current=true;setBusy(true);setFeedback('');
    let navigating=false;
    try{const r=await googleRequest(name,input,csrf),body=await r.json();
      if(activeSession.current!==csrf)return;
      if(r.ok&&body.next==='/login'){clearPasswordSetup();window.location.assign(body.notification?'/login?password=updated&notice='+body.notification:'/login');navigating=true;}
      else if(r.ok&&body.next==='/mfa'){clearPasswordSetup();window.location.assign('/mfa');navigating=true;}
      else if(r.ok&&name==='add-password'&&body.next==='/account/security'){
        clearPasswordSetup();setPasswordSetupOpen(false);setNeedsGoogle(false);
        // Read the rotated HttpOnly session and its new CSRF proof before another action.
        if(await refresh()){
          setMethods({password:true,google:true});
          setFeedback('Password added successfully. You can now sign in using Google or your password.'+(body.notification==='unconfirmed'?' Security notification delivery could not be confirmed.':''));
          requestAnimationFrame(()=>passwordTrigger.current?.focus());
        }
      }
      else if(r.ok&&name==='reauth-password'){
        if(disconnecting){
          const result=await googleRequest('unlink',{},csrf),outcome=await result.json();
          if(activeSession.current!==csrf)return;
          if(result.ok&&outcome.next==='/login'){clearPasswordSetup();window.location.assign('/login');navigating=true;}
          else setFeedback(outcome.error??'Disconnection could not be confirmed. Reload before trying again.');
        }else{
          setNeedsPassword(false);
          setFeedback(googleButton.current?.resumeLink(csrf)?'Identity confirmed.':'Identity confirmed. Select your account action to continue.');
        }
      }
      else if(r.status===428&&body.code==='reauth_required'){
        if(body.method==='google')setNeedsGoogle(true);
        if(body.method!=='google')requestPasswordConfirmation();
        setFeedback(body.method==='google'?'Confirm your Google identity before continuing.':'Confirm your password below before continuing.');
      }
      else if(r.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check and explicitly try again.');}
      else setFeedback(body.message??body.error??'Request unavailable.');
    }catch{setFeedback('Unable to confirm request. No automatic retry was made.');}finally{if(!navigating){actionPending.current=false;setProof(null);setAttempt(n=>n+1);setBusy(false);}}
  }
  function passwordForm(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const password=String(data.get('password')??'');form.reset();
    void action('reauth-password',{password,...(proof?{turnstileToken:proof}:{})});}
  function managePassword(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(actionPending.current)return;const data=new FormData(event.currentTarget);
    const password=String(data.get('newPassword')??'');
    if(methods?.password)void action('change-password',{password:String(data.get('currentPassword')??''),newPassword:password,...(proof?{turnstileToken:proof}:{})});
    else void action('add-password',{password});
  }
  return <section className="page-section account-security-page"><div className="panel account-security-card"><h1>Account security</h1>
    <p>All your account security settings in one place.</p>
    {methods&&<><section className="connected-accounts" aria-labelledby="connected-accounts-heading">
      <h2 id="connected-accounts-heading">Connected accounts</h2>
      <dl className="connected-methods"><div><dt>Email &amp; password</dt><dd className="security-method-status">{methods.password?'Connected':'Not connected'}
        {!passwordSetupOpen&&<button ref={passwordTrigger} className="security-icon-action" aria-label={methods.password?'Change password':'Add password'} title={methods.password?'Change password':'Add password'} disabled={busy||googleBusy} onClick={()=>selectAction('password')}><SecurityActionIcon action="key"/></button>}</dd>
        {passwordSetupOpen&&<dd className="security-method-controls"><div className="account-confirmation" ref={passwordPanel} tabIndex={-1}>
          {needsGoogle?<><p>Confirm your Google identity to continue. You will return to this form and enter your new password again; it is not saved across redirects.</p><GoogleButton purpose="reauth" csrf={csrf} disabled={busy||googleBusy} onPendingChange={googleProgress}/></>:
          <form onSubmit={managePassword}><fieldset disabled={busy} aria-label={methods.password?'Change password':'Add password'}>
            {methods.password&&<><label htmlFor="current-password">Current password</label><PasswordInput id="current-password" name="currentPassword" required autoComplete="current-password" autoFocus/></>}
            <label htmlFor="new-password">New password</label><PasswordInput id="new-password" name="newPassword" minLength={12} maxLength={128} required autoComplete="new-password" autoFocus={!methods.password}/>
            {!methods.password&&<p>Recent Google authentication is required. Your current session will be securely replaced; other sessions will be signed out. Google stays connected. A security notification will be requested.</p>}
            {methods.password&&<><p>Saving signs out all sessions. A security notification will be requested after the change.</p><Link to="/forgot-password" onClick={event=>{if(actionPending.current||googlePending.current)event.preventDefault();}}>Forgot your current password?</Link></>}
            {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
            <button className="button">{busy?'Saving…':'Save password'}</button>
          </fieldset></form>}
          <p role="status" aria-live="polite">{feedback}</p>
          <button type="button" className="button button-secondary" disabled={busy||googleBusy} onClick={()=>{clearAction();requestAnimationFrame(()=>passwordTrigger.current?.focus());}}>Cancel</button>
        </div></dd>}</div>
        <div><dt>Google</dt><dd className="security-method-status">{methods.google?'Connected':'Not connected'}
      {!methods.google&&<GoogleButton iconOnly key={csrf} ref={googleButton} purpose="link" csrf={csrf} disabled={busy||googleBusy||needsPassword} onStart={clearAction} onPendingChange={googleProgress} onRecentAuthenticationRequired={requestPasswordConfirmation}/>}
      {methods.google&&methods.password&&!needsPassword&&<button ref={disconnectTrigger} className="security-icon-action" aria-label="Disconnect Google" title="Disconnect Google" disabled={busy||googleBusy} onClick={()=>selectAction('disconnect')}><SecurityActionIcon action="unlink"/></button>}</dd>
      {methods.google&&!methods.password&&<dd className="security-method-controls"><p>Add a password before disconnecting Google. At least one usable sign-in method must remain.</p></dd>}
      {methods.password&&needsPassword&&<dd className="security-method-controls"><div ref={confirmationRef} tabIndex={-1} className="account-confirmation">
        <p>{disconnecting?'Confirm your password to disconnect Google. You will be signed out of all sessions; use your password to sign in again.':'Confirm your password to connect Google. Your other sessions will be signed out.'}</p>
        <form onSubmit={passwordForm}><fieldset disabled={busy} aria-label={disconnecting?'Disconnect Google':'Connect Google'}>
        <label htmlFor="security-password">Confirm current password</label><PasswordInput id="security-password" name="password" required autoComplete="current-password"/>
        {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
        <button className="button">{busy?'Confirming…':disconnecting?'Confirm & disconnect':'Confirm and continue'}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={cancelConfirmation}>Cancel</button>
        </fieldset></form></div></dd>}</div></dl>
    </section>
      {MFA_ENROLLMENT_AVAILABLE&&<MfaEnrollment csrf={csrf} open={mfaOpen} disabled={busy||googleBusy} onOpen={()=>{if(actionPending.current||googlePending.current)return;googleButton.current?.cancelLink();clearAction();setMfaOpen(true);}} onBusy={value=>{actionPending.current=value;setBusy(value);}} onActivated={refresh}/>}
    </>}
    <section aria-labelledby="security-email-status"><h2 id="security-email-status">Email verification</h2>
      <dl className="connected-methods"><div><dt>Email address</dt><dd>{session.emailVerified ? 'Verified' : 'Not verified'}</dd></div></dl>
    </section>
    {!passwordSetupOpen&&<p role="status" aria-live="polite">{feedback}</p>}</div></section>;
}
