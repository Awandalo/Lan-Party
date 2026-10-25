import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import QRCode from 'qrcode';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import {googleRequest} from '../lib/google';
import {MFA_ENROLLMENT_AVAILABLE} from '../lib/mfa-mode';
import '../CSS/MfaEnrollment_style.css';
class EnrollmentResponseError extends Error {constructor(readonly status:number,readonly code?:string){super('Enrollment unavailable');}}

type Enrollment={token:string;secret:string;uri:string;expiresAt:number};
type Codes={codes:string[];acknowledgment:string};
type Request=(action:string,input:object)=>Promise<unknown>;
export default function MfaEnrollment({csrf,request:fixture,open=true,disabled=false,onOpen,onBusy,onActivated,methods}:{methods?:{password:boolean;google:boolean};csrf:string;request?:Request;open?:boolean;disabled?:boolean;onOpen?:()=>void;onBusy?:(busy:boolean)=>void;onActivated?:()=>Promise<unknown>}){
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null),[codes,setCodes]=useState<Codes|null>(null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[saved,setSaved]=useState(false);
  const [enabled,setEnabled]=useState(false),[noticeOpen,setNoticeOpen]=useState(false),[reauth,setReauth]=useState(false),[needsLogin,setNeedsLogin]=useState(false),[uncertainStart,setUncertainStart]=useState(false);
  const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  const pending=useRef(false),canvas=useRef<HTMLCanvasElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const resumeGoogle=useRef<()=>Promise<void>>(async()=>{});
  const mounted=useRef(true),googleState=useRef<string|null>(null),restartIntent=useRef(false);
  const [statusReady,setStatusReady]=useState(!!fixture);
  const [unfinished,setUnfinished]=useState(false),[googleWaiting,setGoogleWaiting]=useState(false);
  async function status(){
    const response=await fetch('/api/auth/mfa/status',{headers:{'X-LAN-Request':'1'},credentials:'same-origin',redirect:'error'});
    if(!response.ok)throw Error();const value=await response.json();if(typeof value.enabled!=='boolean'||typeof value.enrollmentAvailable!=='boolean'||(value.pendingEnrollment&&(!Number.isSafeInteger(value.pendingEnrollment.expiresAt)||value.pendingEnrollment.expiresAt<=Date.now()/1000)))throw Error();if(!mounted.current)return;
    setStatusReady(true);setEnabled(value.enabled===true);setUnfinished(!!value.pendingEnrollment);setUncertainStart(false);
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(fixture)return;setStatusReady(false);void status().catch(()=>{if(mounted.current)setFeedback('MFA status unavailable. Check status before starting setup.');});},[csrf,fixture]);
  useEffect(()=>{
    if(open||pending.current)return;
    if(enrollment)void request('cancel',{token:enrollment.token}).catch(()=>{});
    setEnrollment(null);setCodes(null);setSaved(false);setFeedback('');
    // Switching actions clears unsaved secrets and cancels this setup only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);
  useEffect(()=>{
    if(!enrollment)return;
    const timer=setTimeout(()=>{setEnrollment(null);setCodes(null);setSaved(false);setFeedback(pending.current?'Setup expired during a request. The result is uncertain; sign in again and check your settings.':'Setup expired. MFA was not enabled. Start again.');},Math.max(0,enrollment.expiresAt*1000-Date.now()));
    return()=>clearTimeout(timer);
  },[enrollment]);
  useEffect(()=>{
    if(!enrollment||codes||!canvas.current)return;
    void QRCode.toCanvas(canvas.current,enrollment.uri,{width:220,margin:4,errorCorrectionLevel:'M'})
      .catch(()=>setFeedback('QR rendering unavailable. Use the manual setup key instead.'));
  },[enrollment,codes]);
  useEffect(()=>{if(noticeOpen&&!enrollment)requestAnimationFrame(()=>panel.current?.focus());},[noticeOpen,reauth,needsLogin]);
  async function request(action:string,input:object){
    if(fixture)return fixture(action,input);
    const response=await fetch('/api/auth/mfa/enroll/'+action,{method:'POST',credentials:'same-origin',redirect:'error',
      headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':csrf},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
    if(!response.ok){const body=await response.json().catch(()=>null);throw new EnrollmentResponseError(response.status,body?.code);}return response.json();
  }
  async function run(action:'start'|'verify'|'cancel'|'activate',code?:string,restart=false){
    if(pending.current||(action==='start'&&(disabled||!statusReady||(uncertainStart&&!restart))))return;pending.current=true;setBusy(true);onBusy?.(true);setFeedback('');
    const token=enrollment?.token;
    if(action==='start'){restartIntent.current=restart;setNoticeOpen(true);setReauth(false);setNeedsLogin(false);googleState.current=null;setGoogleWaiting(false);}
    if(action==='cancel'){setEnrollment(null);setCodes(null);setSaved(false);}
    try{
      const result=await request(action,action==='start'?(restart?{restart:true,confirmed:true}:{}):{token,...(code?{code}:{}),...(action==='activate'?{acknowledgment:codes?.acknowledgment}:{})});
      if(!mounted.current)return;
      if(action==='start'){
        const value=result as Enrollment,uri=new URL(value.uri);
        if(!/^[a-f0-9]{64}$/.test(value.token)||!/^[A-Z2-7]{32}$/.test(value.secret)||uri.protocol!=='otpauth:'||uri.hostname!=='totp'
          ||uri.searchParams.get('secret')!==value.secret||uri.searchParams.get('issuer')!=='LAN Party'
          ||uri.username||uri.password||uri.port||uri.hash||uri.searchParams.get('algorithm')!=='SHA1'||uri.searchParams.get('digits')!=='6'||uri.searchParams.get('period')!=='30'
          ||[...uri.searchParams.keys()].sort().join(',')!=='algorithm,digits,issuer,period,secret'
          ||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()/1000||value.expiresAt>Date.now()/1000+600)throw Error();
        setNoticeOpen(false);setUnfinished(false);setUncertainStart(false);setEnrollment(value);requestAnimationFrame(()=>panel.current?.focus());
      }else if(action==='verify'){
        const value=result as Codes;
        if(!enrollment||enrollment.expiresAt<=Date.now()/1000||!Array.isArray(value.codes)||value.codes.length!==10
          ||value.codes.some(c=>typeof c!=='string'||c.length>40||!/^[A-Z2-7]{26}$/.test(c.replaceAll('-','')))
          ||new Set(value.codes.map(c=>c.replaceAll('-',''))).size!==10||!/^[a-f0-9]{64}$/.test(value.acknowledgment))throw Error();
        setCodes(value);setEnrollment(current=>current?{...current,secret:'',uri:''}:null);setSaved(false);requestAnimationFrame(()=>panel.current?.focus());
      }else if(action==='activate'){
        setEnrollment(null);setCodes(null);setSaved(false);setEnabled(true);
        await onActivated?.();setFeedback('MFA enabled. Keep your recovery codes private.');
      }else{setNoticeOpen(false);setUnfinished(false);setUncertainStart(false);setFeedback('Setup cancelled. MFA was not enabled.');requestAnimationFrame(()=>trigger.current?.focus());}
    }catch(error){if(mounted.current){
      if(action==='start'&&error instanceof EnrollmentResponseError&&error.status===428&&error.code==='reauth_required'){
        setReauth(true);setFeedback('Confirm your sign-in method to start MFA setup. No setup was created by this refused request.');
      }else if(action==='start'&&error instanceof EnrollmentResponseError&&error.code==='enrollment_pending'){
        setUnfinished(true);setNoticeOpen(false);setFeedback('An unfinished setup exists. Explicitly restart it to replace the old QR code.');
      }else if(action==='start'&&error instanceof EnrollmentResponseError&&error.code==='mfa_enabled'){
        setEnabled(true);setNoticeOpen(false);setFeedback('MFA is already enabled. Check current Account Security settings.');
      }else if(action==='start'&&error instanceof EnrollmentResponseError&&error.status===401){
        setNeedsLogin(true);setFeedback('Your session expired. Sign in again before starting MFA setup.');
      }else if(action==='start'){
        setUncertainStart(true);setFeedback('Setup result is unconfirmed. No automatic retry was made. Check status or explicitly restart unfinished setup after confirming your identity.');
      }else if(action==='cancel'){setUncertainStart(true);setNoticeOpen(false);setFeedback('Cancellation could not be confirmed. Check status or explicitly restart unfinished setup.');}
      else setFeedback(action==='activate'?'Activation could not be confirmed. Do not repeat it automatically. Sign in again using your authenticator or saved recovery codes if activation succeeded.':'Setup could not be confirmed. No automatic retry was made. Cancel and restart if needed.');
    }}

    finally{pending.current=false;onBusy?.(false);if(mounted.current)setBusy(false);}
  }
  async function confirmPrimary(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending.current)return;const form=event.currentTarget,password=String(new FormData(form).get('password')??'');form.reset();pending.current=true;setBusy(true);onBusy?.(true);let confirmed=false;
    try{const response=await googleRequest('reauth-password',{password,...(proof?{turnstileToken:proof}:{})},csrf),body=await response.json();
      if(!mounted.current)return;
      if(response.ok){confirmed=true;setReauth(false);googleState.current=null;setGoogleWaiting(false);}
      else if(response.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check, then confirm your password again.');}
      else setFeedback(body.error??'Identity confirmation failed. No setup was started.');
    }catch{if(mounted.current)setFeedback('Identity confirmation could not be confirmed. No setup was retried.');}
    finally{pending.current=false;onBusy?.(false);if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
    if(confirmed&&mounted.current)await run('start',undefined,restartIntent.current);
  }
  async function google(){
    if(pending.current)return;const tab=window.open('about:blank','_blank');if(!tab){setFeedback('Allow the Google confirmation tab, then try again.');return;}
    tab.opener=null;pending.current=true;setBusy(true);onBusy?.(true);
    try{const r=await googleRequest('start',{purpose:'reauth',returnAction:'mfa',...(proof?{turnstileToken:proof}:{})},csrf),body=await r.json();
      if(!r.ok){if(r.status===403&&body.siteKey)setSiteKey(body.siteKey);throw Error();}
      const url=new URL(body.url),state=url.searchParams.get('state');
      if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth'||!state||!/^[a-f0-9]{64}$/.test(state))throw Error();
      if(!mounted.current){tab.close();return;}googleState.current=state;setGoogleWaiting(true);tab.location.replace(url.href);
      setFeedback('Complete Google confirmation in the other tab, then return here.');
    }catch{tab.close();if(mounted.current)setFeedback('Google confirmation could not start. Complete any security check, then try again.');}
    finally{pending.current=false;onBusy?.(false);if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
  }
  async function checkGoogle(){
    const state=googleState.current;if(!state||pending.current)return;pending.current=true;setBusy(true);onBusy?.(true);let confirmed=false;
    try{const r=await googleRequest('reauth-status',{state},csrf),body=await r.json();if(!mounted.current)return;if(!r.ok)throw Error();
      confirmed=body.confirmed===true;if(confirmed){googleState.current=null;setGoogleWaiting(false);setReauth(false);}
      else if(body.unavailable===true){googleState.current=null;setGoogleWaiting(false);setFeedback('Google confirmation is unavailable or expired. Check the result tab for its reference. Use your password if available, or cancel. No setup was retried.');}
      else setFeedback('Fresh Google proof is not available yet. Check the other tab. If Google cannot provide fresh authentication-time proof, use your password or cancel.');
    }catch{if(mounted.current)setFeedback('Google confirmation could not be checked. No setup was retried.');}
    finally{pending.current=false;onBusy?.(false);if(mounted.current)setBusy(false);}
    if(confirmed&&mounted.current)await run('start',undefined,restartIntent.current);
  }
  resumeGoogle.current=checkGoogle;
  useEffect(()=>{const resume=()=>{if(document.visibilityState==='visible'&&googleState.current)void resumeGoogle.current();};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);googleState.current=null;};},[csrf]);
  function restart(){onOpen?.();restartIntent.current=true;setNoticeOpen(true);setReauth(true);setNeedsLogin(false);setFeedback('Restart cancels unfinished QR codes and staged codes only. Confirm your sign-in method to create a new setup. Active MFA is never removed.');}
  async function checkStatus(){if(pending.current)return;pending.current=true;setBusy(true);try{await status();setNoticeOpen(false);setFeedback('Current MFA status checked.');}catch{setFeedback('Status unavailable. No setup was retried.');}finally{pending.current=false;if(mounted.current)setBusy(false);}}
  function dismiss(){googleState.current=null;setGoogleWaiting(false);setNoticeOpen(false);setReauth(false);setNeedsLogin(false);setFeedback(uncertainStart?'Setup result remains unconfirmed. Closing this notice does not cancel a server setup. Check status before considering another attempt.':'Setup was not started.');requestAnimationFrame(()=>trigger.current?.focus());}
  function verify(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,code=String(new FormData(form).get('code')??'');form.reset();void run('verify',code);}
  return <section className="mfa-enrollment" aria-labelledby="mfa-enrollment-heading"><h2 id="mfa-enrollment-heading">Two-factor authentication</h2>
    <dl className="connected-methods"><div><dt>Authenticator app</dt><dd className="security-method-status">{enabled?'Enabled':'Not enabled'}
      {!enabled&&!unfinished&&!uncertainStart&&!(open&&(enrollment||noticeOpen))&&<button className="button button-secondary" ref={trigger} disabled={busy||disabled||uncertainStart||!statusReady} onClick={()=>{onOpen?.();void run('start');}}>Set up MFA</button>}</dd></div></dl>
    {!enabled&&<p>An authenticator adds a second sign-in check to protect your LAN Party account.</p>}
    {open&&noticeOpen&&!enrollment&&<div ref={panel} className="account-confirmation" tabIndex={-1} aria-busy={busy}>
      {reauth&&<><p>Confirm your sign-in method. The two-minute security requirement still applies.</p>
        {methods?.password&&<form onSubmit={confirmPrimary}><fieldset disabled={busy}><label htmlFor="enrollment-password">Current password</label><PasswordInput id="enrollment-password" name="password" autoComplete="current-password" required/>
          <button className="button" disabled={!!siteKey&&!proof}>{busy?'Confirming…':'Confirm and continue'}</button></fieldset></form>}
        {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
        {methods?.google&&<button type="button" className="button button-secondary" disabled={busy||!!siteKey&&!proof} onClick={()=>void google()}>Confirm with Google</button>}
        {googleWaiting&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void checkGoogle()}>Check Google confirmation</button>}
        {!methods&&<a href="/login">Sign in again</a>}
      </>}
      {needsLogin&&<a href="/login">Sign in again</a>}
      {!reauth&&!needsLogin&&busy&&<p role="status">Checking setup requirements…</p>}
      <button type="button" className="button button-secondary" disabled={busy} onClick={dismiss}>{uncertainStart?'Close':'Cancel setup'}</button>
    </div>}
    {!enabled&&!enrollment&&(unfinished||uncertainStart||!statusReady)&&<div className="mfa-actions"><button type="button" className="button button-secondary" disabled={busy||disabled||!statusReady} onClick={restart}>Restart unfinished setup</button><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void checkStatus()}>Check MFA status</button></div>}
    {open&&enrollment&&
      <div ref={panel} className="account-confirmation" tabIndex={-1}>
        {!codes?<><p>Scan this QR code with your authenticator, or enter the manual setup key. Keep the key private.</p>
          <canvas ref={canvas} role="img" aria-label="Authenticator setup QR code. The same key is provided below."/>
          <p>Manual setup key: <code className="mfa-manual-key">{enrollment.secret}</code></p>
          <form onSubmit={verify}><fieldset disabled={busy}><label htmlFor="mfa-enrollment-code">Six-digit authenticator code</label>
            <input id="mfa-enrollment-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/>
            <button className="button">{busy?'Checking…':'Verify authenticator'}</button></fieldset></form></>:
          <><p>Save these ten recovery codes somewhere private. Each works once. They cannot be displayed again.</p>
            <ul aria-label="Recovery codes">{codes.codes.map(code=><li key={code}><code>{code}</code></li>)}</ul>
            <label className="mfa-saved"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I have saved my recovery codes</label>
            <button className="button" disabled={!MFA_ENROLLMENT_AVAILABLE||!saved||busy} onClick={()=>void run('activate')}>{busy?'Enabling…':'Enable MFA'}</button>
            <p>MFA remains disabled until you acknowledge the codes and enable it.</p></>}
        <button className="button button-secondary" disabled={busy} onClick={()=>void run('cancel')}>Cancel setup</button>
      </div>}
    <p role="status" aria-live="polite">{feedback}</p>
  </section>;
}
