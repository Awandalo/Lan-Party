import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { clearPasswordSetup, googleRequest, passwordSetupToken } from '../lib/google';
import GoogleButton from '../components/GoogleButton';
import LoginChallenge from '../components/LoginChallenge';
import PasswordInput from '../components/PasswordInput';
import '../CSS/AccountSecurity_style.css';
export default function AccountSecurity(){
  const {session,status}=useAuth();
  const [methods,setMethods]=useState<{password:boolean;google:boolean}|null>(null),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
  const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{if(session)void googleRequest('methods').then(async r=>{if(r.ok)setMethods(await r.json());else setFeedback('Account security is unavailable.');}).catch(()=>setFeedback('Account security is unavailable.'));},[session]);
  if(status==='loading')return <p role="status">Checking session…</p>;
  if(status==='error')return <p role="status">Account security is unavailable. Reload before trying again.</p>;
  if(!session)return <Navigate to="/login" replace/>;
  const csrf=session.csrfToken;
  async function action(name:string,input:object={}){
    if(busy)return;setBusy(true);setFeedback('');
    try{const r=await googleRequest(name,input,csrf),body=await r.json();
      if(r.ok&&body.next==='/login'){clearPasswordSetup();window.location.assign('/login');}
      else if(r.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check and explicitly try again.');}
      else setFeedback(body.message??body.error??'Request unavailable.');
    }catch{setFeedback('Unable to confirm request. No automatic retry was made.');}finally{setProof(null);setAttempt(n=>n+1);setBusy(false);}
  }
  function passwordForm(event:FormEvent<HTMLFormElement>,setup:boolean){event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const password=String(data.get('password')??'');form.reset();
    void action(setup?'add-password':'reauth-password',setup?{password,token:passwordSetupToken()}:{password,...(proof?{turnstileToken:proof}:{})});}
  return <section className="page-section account-security-page"><div className="panel account-security-card"><h1>Account security</h1>
    <p><Link to="/account">Your account</Link></p>
    {methods&&<><p>Password: {methods.password?'Connected':'Not configured'} · Google: {methods.google?'Connected':'Not connected'}</p>
      <p>Confirm an existing method before changing your sign-in methods. Confirmation lasts five minutes. Changes sign out existing sessions.</p>
      {methods.password&&<form onSubmit={e=>passwordForm(e,false)}><fieldset disabled={busy}><legend>Confirm current password</legend>
        <label htmlFor="security-password">Current password</label><PasswordInput id="security-password" name="password" required autoComplete="current-password"/>
        {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
        <button className="button">Confirm password</button></fieldset></form>}
      <GoogleButton purpose={methods.google?'reauth':'link'} csrf={csrf}/>
      {methods.google&&methods.password&&<button className="button button-secondary" disabled={busy} onClick={()=>void action('unlink')}>Disconnect Google after confirming password</button>}
      {methods.google&&!methods.password&&<><p>Google-only accounts cannot use forgotten-password recovery. Keep access to Google. Adding a password also requires a confirmation email in this browser.</p>
        <button className="button" disabled={busy} onClick={()=>void action('request-password')}>Request password setup email</button>
        {passwordSetupToken()&&<form onSubmit={e=>passwordForm(e,true)}><fieldset disabled={busy}><legend>Add password</legend>
          <label htmlFor="setup-password">New password (12–128 characters)</label><PasswordInput id="setup-password" name="password" minLength={12} maxLength={128} required autoComplete="new-password"/>
          <button className="button">Add password and sign out</button></fieldset></form>}</>}
    </>}<p role="status" aria-live="polite">{feedback}</p></div></section>;
}
