import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router';
import LoginChallenge from './LoginChallenge';
import {MFA_ENROLLMENT_AVAILABLE} from '../lib/mfa-mode';
import {readMfaStatus} from '../lib/mfa-status';
import '../CSS/MfaStepUp_style.css';

export default function MfaStepUp({csrf,onVerified,onCancel,onBusy,confirmationLabel='Confirm code',hideCancel=false,description='Confirm a code before changing your sign-in methods. Afterwards, select your account action again. No account change has been submitted.'}:{csrf:string;onVerified:()=>Promise<unknown>;onCancel:()=>void;onBusy:(busy:boolean)=>void;confirmationLabel?:string;description?:string;hideCancel?:boolean}){
  const pending=useRef(false),field=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const [method,setMethod]=useState<'totp'|'recovery'>('totp'),[siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const [uncertain,setUncertain]=useState(false);
  const [available,setAvailable]=useState<boolean|null>(null);
  useEffect(()=>{const controller=new AbortController();setAvailable(null);
    if(MFA_ENROLLMENT_AVAILABLE)void readMfaStatus(controller.signal).then(status=>{if(!controller.signal.aborted)setAvailable(status.enabled&&status.enrollmentAvailable);}).catch(()=>{if(!controller.signal.aborted)setAvailable(false);});
    else setAvailable(false);
    return()=>controller.abort();
  },[csrf]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending.current||uncertain||available!==true)return;
    const form=event.currentTarget,code=String(new FormData(form).get('code')??'');form.reset();
    pending.current=true;setBusy(true);onBusy(true);setFeedback('');
    try{
      const response=await fetch('/api/auth/mfa/step-up',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{'X-LAN-Request':'1','X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({method,code,...(proof?{turnstileToken:proof}:{})})});
      const body=await response.json();
      if(response.ok){await onVerified();return;}
      if(response.status===401&&body.code==='session_required'){setUncertain(true);setFeedback('Your session is no longer available. Sign in again before changing your sign-in methods.');return;}
      if(response.status===403&&body.siteKey)setSiteKey(body.siteKey);
      setFeedback(response.status===429?`Please wait ${response.headers.get('Retry-After')??''} seconds before trying again.`:body.error??'Confirmation unavailable.');
    }catch{setUncertain(true);setFeedback('Confirmation could not be established. Sign in again to recover your session. A submitted recovery code may already be used. No automatic retry was made.');}
    finally{pending.current=false;setBusy(false);onBusy(false);setProof(null);setAttempt(n=>n+1);requestAnimationFrame(()=>field.current?.focus());}
  }
  if(available!==true)return <section className="account-confirmation"><h2>Confirm two-factor authentication</h2>
    <p role="status">{available===null?'Checking MFA availability…':'MFA confirmation is unavailable in this environment. Sign in again to continue.'}</p>
    {available===false&&<Link to="/login">Sign in again</Link>}</section>;
  return <section className="account-confirmation mfa-step-up" aria-labelledby="step-up-heading"><h2 id="step-up-heading">Confirm two-factor authentication</h2>
    <p>{description}</p>
    <form onSubmit={submit}><fieldset disabled={busy||uncertain}><label htmlFor="step-up-method">Confirmation method</label>
      <select id="step-up-method" value={method} onChange={event=>setMethod(event.target.value as 'totp'|'recovery')}><option value="totp">Authenticator code</option><option value="recovery">Unused recovery code</option></select>
      <label htmlFor="step-up-code">{method==='totp'?'Authenticator code':'Recovery code'}</label>
      <input ref={field} id="step-up-code" name="code" autoComplete="one-time-code" inputMode={method==='totp'?'numeric':'text'} maxLength={40} required autoFocus/>
      {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
      <button type="submit" className="button" aria-busy={busy}>{busy?'Confirming…':confirmationLabel}</button>
      {!hideCancel&&<button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>}
    </fieldset></form><p role="status" aria-live="polite">{feedback}</p>{uncertain&&<Link className="button" to="/login">Sign in again</Link>}</section>;
}
