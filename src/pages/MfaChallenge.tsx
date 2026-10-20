import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link,useNavigate} from 'react-router';
import {useAuth} from '../lib/auth';
import LoginChallenge from '../components/LoginChallenge';
import '../CSS/MfaChallenge_style.css';

export default function MfaChallenge(){
  const {refresh}=useAuth(),navigate=useNavigate();
  const [challenge,setChallenge]=useState<{expiresAt:number;csrfToken:string}|null>(null);
  const [method,setMethod]=useState<'totp'|'recovery'>('totp'),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
  const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const pending=useRef(false),input=useRef<HTMLInputElement>(null),mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;const controller=new AbortController();
    void fetch('/api/auth/mfa/challenge',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error();const value=await r.json();
        if(!/^[a-f0-9]{64}$/.test(value.csrfToken)||!Number.isSafeInteger(value.expiresAt))throw Error();
        if(mounted.current){setChallenge(value);setFeedback('');}
      }).catch(()=>{if(mounted.current&&!controller.signal.aborted)setFeedback('This challenge is unavailable or expired. Return to login.');});
    return()=>{mounted.current=false;controller.abort();};
  },[]);
  useEffect(()=>{if(!challenge)return;const timer=setTimeout(()=>{setChallenge(null);if(input.current)input.current.value='';setFeedback('Your challenge expired. Log in again.');},Math.max(0,challenge.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[challenge]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(pending.current||!challenge)return;
    const code=String(new FormData(event.currentTarget).get('code')??'');event.currentTarget.reset();await run('complete',code);
  }
  async function run(action:'complete'|'cancel',code?:string){
    if(pending.current||!challenge)return;pending.current=true;setBusy(true);setFeedback('');
    try{
      const r=await fetch('/api/auth/mfa/'+action,{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{'X-LAN-Request':'1','Content-Type':'application/json','X-CSRF-Token':challenge.csrfToken},
        body:JSON.stringify(action==='cancel'?{}:{method,code,...(proof?{turnstileToken:proof}:{})})});
      const body=await r.json();if(!mounted.current)return;
      if(r.ok){if(action==='cancel')navigate('/login',{replace:true});else if(await refresh())navigate('/account',{replace:true});else{setChallenge(null);setFeedback('Sign-in could not be confirmed. Return to login.');}}
      else if(r.status===403&&typeof body.siteKey==='string'){setSiteKey(body.siteKey);setFeedback('Complete the security check, then explicitly try again.');}
      else if(r.status===429){setFeedback(`Too many attempts. Wait ${r.headers.get('Retry-After')??''} seconds before trying again.`);}
      else{setFeedback(body.error??'Code not accepted.');if(r.status===401&&body.error?.includes('expired'))setChallenge(null);}
    }catch{if(mounted.current)setFeedback('The result could not be confirmed. No automatic retry was made. Return to login if needed.');}
    finally{pending.current=false;if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
  }
  return <section className="page-section mfa-challenge-page"><div className="panel mfa-challenge-card"><p className="eyebrow">One more step</p><h1>Verify your sign-in</h1>
    <p>Enter a code from your authenticator, or use one of your saved recovery codes.</p>
    {challenge&&<><form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}><label htmlFor="mfa-code">{method==='totp'?'Six-digit authenticator code':'Recovery code'}</label>
      <input ref={input} key={method} id="mfa-code" name="code" required autoFocus autoComplete="one-time-code" inputMode={method==='totp'?'numeric':'text'} pattern={method==='totp'?'[0-9]{6}':undefined} maxLength={method==='totp'?6:40}/>
      {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
      <button className="button" disabled={!!siteKey&&!proof}>{busy?'Checking…':'Verify and log in'}</button></fieldset></form>
      <button className="button button-secondary" disabled={busy} onClick={()=>{if(pending.current)return;if(input.current)input.current.value='';setMethod(method==='totp'?'recovery':'totp');requestAnimationFrame(()=>input.current?.focus());}}>{method==='totp'?'Use a recovery code':'Use authenticator'}</button>
      <button className="button button-secondary" disabled={busy} onClick={()=>void run('cancel')}>Cancel and return to login</button></>}
    <p role="status" aria-live="polite">{feedback}</p>{!challenge&&<Link to="/login">Back to login</Link>}
  </div></section>;
}
