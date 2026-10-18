import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { clearPasswordSetup, googleRequest, passwordSetupToken } from '../lib/google';
import GoogleButton from '../components/GoogleButton';
import type { GoogleButtonHandle } from '../components/GoogleButton';
import LoginChallenge from '../components/LoginChallenge';
import PasswordInput from '../components/PasswordInput';
import '../CSS/AccountSecurity_style.css';
export default function AccountSecurity(){
  const {session,status}=useAuth();
  const [methods,setMethods]=useState<{password:boolean;google:boolean}|null>(null),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
  const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const [needsPassword,setNeedsPassword]=useState(false),confirmationRef=useRef<HTMLDivElement>(null);
  const [disconnecting,setDisconnecting]=useState(false),[passwordSetupOpen,setPasswordSetupOpen]=useState(!!passwordSetupToken());
  const googleButton=useRef<GoogleButtonHandle>(null),activeSession=useRef(session?.csrfToken),actionPending=useRef(false);
  const disconnectTrigger=useRef<HTMLButtonElement>(null);
  activeSession.current=session?.csrfToken;
  function requestPasswordConfirmation(){setDisconnecting(false);setNeedsPassword(true);requestAnimationFrame(()=>confirmationRef.current?.focus());}
  function cancelConfirmation(){googleButton.current?.cancelLink();setNeedsPassword(false);setDisconnecting(false);setFeedback('');setSiteKey('');setProof(null);requestAnimationFrame(()=>disconnectTrigger.current?.focus());}
  useEffect(()=>{if(session)void googleRequest('methods').then(async r=>{if(r.ok)setMethods(await r.json());else setFeedback('Account security is unavailable.');}).catch(()=>setFeedback('Account security is unavailable.'));},[session]);
  if(status==='loading')return <p role="status">Checking session…</p>;
  if(status==='error')return <p role="status">Account security is unavailable. Reload before trying again.</p>;
  if(!session)return <Navigate to="/login" replace/>;
  const csrf=session.csrfToken;
  async function action(name:string,input:object={}){
    if(actionPending.current)return;actionPending.current=true;setBusy(true);setFeedback('');
    let navigating=false;
    try{const r=await googleRequest(name,input,csrf),body=await r.json();
      if(activeSession.current!==csrf)return;
      if(r.ok&&body.next==='/login'){clearPasswordSetup();window.location.assign('/login');navigating=true;}
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
        if(body.method!=='google')requestPasswordConfirmation();
        setFeedback(body.method==='google'?'Confirm your Google identity before continuing.':'Confirm your password below before continuing.');
      }
      else if(r.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check and explicitly try again.');}
      else setFeedback(body.message??body.error??'Request unavailable.');
    }catch{setFeedback('Unable to confirm request. No automatic retry was made.');}finally{if(!navigating){actionPending.current=false;setProof(null);setAttempt(n=>n+1);setBusy(false);}}
  }
  function passwordForm(event:FormEvent<HTMLFormElement>,setup:boolean){event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const password=String(data.get('password')??'');form.reset();
    void action(setup?'add-password':'reauth-password',setup?{password,token:passwordSetupToken()}:{password,...(proof?{turnstileToken:proof}:{})});}
  return <section className="page-section account-security-page"><div className="panel account-security-card"><h1>Account security</h1>
    <p>All your account security settings in one place.</p>
    {methods&&<><section className="connected-accounts" aria-labelledby="connected-accounts-heading">
      <h2 id="connected-accounts-heading">Connected accounts</h2>
      <dl className="connected-methods"><div><dt>Email &amp; password</dt><dd>{methods.password?'Connected':'Not connected'}</dd></div>
        <div><dt>Google</dt><dd>{methods.google?'Connected':'Not connected'}</dd></div></dl>
      {!methods.google&&<GoogleButton key={csrf} ref={googleButton} purpose="link" csrf={csrf} disabled={busy||needsPassword} onRecentAuthenticationRequired={requestPasswordConfirmation}/>}
      {methods.google&&methods.password&&<button ref={disconnectTrigger} className="button button-secondary" disabled={busy||needsPassword} onClick={()=>{setDisconnecting(true);setNeedsPassword(true);requestAnimationFrame(()=>confirmationRef.current?.focus());}}>Disconnect Google</button>}
      {methods.google&&!methods.password&&<p>Add a password before disconnecting Google. At least one usable sign-in method must remain.</p>}
      {methods.password&&needsPassword&&<div ref={confirmationRef} tabIndex={-1} className="account-confirmation">
        <p>{disconnecting?'Confirm your password to disconnect Google. You will be signed out of all sessions; use your password to sign in again.':'Confirm your password to connect Google. Your other sessions will be signed out.'}</p>
        <form onSubmit={e=>passwordForm(e,false)}><fieldset disabled={busy}><legend>Confirm current password</legend>
        <label htmlFor="security-password">Current password</label><PasswordInput id="security-password" name="password" required autoComplete="current-password"/>
        {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
        <button className="button">{busy?'Confirming…':disconnecting?'Confirm & disconnect':'Confirm and continue'}</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={cancelConfirmation}>Cancel</button>
        </fieldset></form></div>}
      {methods.google&&!methods.password&&<>
        {!passwordSetupOpen&&<button className="button button-secondary" onClick={()=>setPasswordSetupOpen(true)}>Add password</button>}
        {passwordSetupOpen&&<><p>Adding a password requires recent Google authentication and a separate confirmation email in this browser. Google-only accounts cannot use forgotten-password recovery.</p>
        <GoogleButton purpose="reauth" csrf={csrf} disabled={busy}/>
        <button className="button" disabled={busy} onClick={()=>void action('request-password')}>{busy?'Requesting…':'Request password setup email'}</button>
        {passwordSetupToken()&&<form onSubmit={e=>passwordForm(e,true)}><fieldset disabled={busy}><legend>Add password</legend>
          <label htmlFor="setup-password">New password (12–128 characters)</label><PasswordInput id="setup-password" name="password" minLength={12} maxLength={128} required autoComplete="new-password"/>
          <button className="button">{busy?'Saving…':'Add password and sign out'}</button></fieldset></form>}</>}
        </>}
    </section>
      {/* Phase 3.9: optional MFA belongs immediately after Connected accounts. */}
    </>}
    <section aria-labelledby="security-email-status"><h2 id="security-email-status">Email verification</h2>
      <dl className="connected-methods"><div><dt>Email address</dt><dd>{session.emailVerified ? 'Verified' : 'Not verified'}</dd></div></dl>
    </section>
    <p role="status" aria-live="polite">{feedback}</p></div></section>;
}
