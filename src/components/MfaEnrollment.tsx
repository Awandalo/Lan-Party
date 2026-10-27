import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import QRCode from 'qrcode';
import PasswordInput from './PasswordInput';
import SecurityActionIcon from './SecurityActionIcon';
import LoginChallenge from './LoginChallenge';
import {securityRequest} from '../lib/account-security';
import {MFA_ENROLLMENT_AVAILABLE} from '../lib/mfa-mode';
import '../CSS/MfaEnrollment_style.css';
class EnrollmentResponseError extends Error {constructor(readonly status:number,readonly code?:string){super('Enrollment unavailable');}}

type Enrollment={token:string;secret:string;uri:string;expiresAt:number};
type Codes={codes:string[];acknowledgment:string};
type Request=(action:string,input:object)=>Promise<unknown>;
export default function MfaEnrollment({csrf,request:fixture,open=true,disabled=false,onOpen,onBusy,onActivated,methods,onToggle}:{methods?:{password:boolean};csrf:string;request?:Request;open?:boolean;disabled?:boolean;onOpen?:()=>void;onToggle?:()=>void;onBusy?:(busy:boolean)=>void;onActivated?:()=>Promise<unknown>}){
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null),[codes,setCodes]=useState<Codes|null>(null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[saved,setSaved]=useState(false);
  const [enabled,setEnabled]=useState(false),[noticeOpen,setNoticeOpen]=useState(false),[reauth,setReauth]=useState(false),[needsLogin,setNeedsLogin]=useState(false),[uncertainStart,setUncertainStart]=useState(false);
  const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0),[copied,setCopied]=useState(false);
  const pending=useRef(false),canvas=useRef<HTMLCanvasElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const mounted=useRef(true),restartIntent=useRef(false);
  const [statusReady,setStatusReady]=useState(!!fixture);
  const [unfinished,setUnfinished]=useState(false);
  async function status(){
    const response=await fetch('/api/auth/mfa/status',{headers:{'X-LAN-Request':'1'},credentials:'same-origin',redirect:'error'});
    if(!response.ok)throw Error();const value=await response.json();if(typeof value.enabled!=='boolean'||typeof value.enrollmentAvailable!=='boolean'||(value.pendingEnrollment&&(!Number.isSafeInteger(value.pendingEnrollment.expiresAt)||value.pendingEnrollment.expiresAt<=Date.now()/1000)))throw Error();if(!mounted.current)return;
    setStatusReady(true);setEnabled(value.enabled===true);setUnfinished(!!value.pendingEnrollment);setUncertainStart(false);
  }
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(fixture)return;setStatusReady(false);void status().catch(()=>{if(mounted.current)setFeedback('');});},[csrf,fixture]);
  useEffect(()=>{
    if(open||pending.current)return;
    if(enrollment)void request('cancel',{token:enrollment.token}).catch(()=>{});
    setEnrollment(null);setCodes(null);setSaved(false);setCopied(false);setFeedback('');
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
    if(action==='start'){restartIntent.current=restart;setNoticeOpen(true);setReauth(false);setNeedsLogin(false);}
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
        setCopied(false);setCodes(value);setEnrollment(current=>current?{...current,secret:'',uri:''}:null);setSaved(false);requestAnimationFrame(()=>panel.current?.focus());
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
    try{const response=await securityRequest('reauth-password',{password,...(proof?{turnstileToken:proof}:{})},csrf),body=await response.json();
      if(!mounted.current)return;
      if(response.ok){confirmed=true;setReauth(false);}
      else if(response.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check, then confirm your password again.');}
      else setFeedback(body.error??'Identity confirmation failed. No setup was started.');
    }catch{if(mounted.current)setFeedback('Identity confirmation could not be confirmed. No setup was retried.');}
    finally{pending.current=false;onBusy?.(false);if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
    if(confirmed&&mounted.current)await run('start',undefined,restartIntent.current);
  }
  function restart(){onOpen?.();restartIntent.current=true;setNoticeOpen(true);setReauth(true);setNeedsLogin(false);setFeedback('Restart cancels unfinished QR codes and staged codes only. Confirm your sign-in method to create a new setup. Active MFA is never removed.');}
  function begin(){if(pending.current||disabled)return;onOpen?.();setFeedback('');if(unfinished||uncertainStart||!statusReady){setNoticeOpen(true);return;}void run('start');}
  async function copyCodes(){if(!codes||pending.current)return;try{await navigator.clipboard.writeText(codes.codes.join('\n'));if(mounted.current)setCopied(true);}catch{if(mounted.current)setFeedback('Clipboard unavailable. Select and copy the codes manually.');}}
  async function checkStatus(){if(pending.current)return;pending.current=true;setBusy(true);try{await status();setNoticeOpen(false);setFeedback('');}catch{setFeedback('Status unavailable. No setup was retried.');}finally{pending.current=false;if(mounted.current)setBusy(false);}}
  function dismiss(){setNoticeOpen(false);setReauth(false);setNeedsLogin(false);setFeedback('');requestAnimationFrame(()=>trigger.current?.focus());}
  function verify(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,code=String(new FormData(form).get('code')??'');form.reset();void run('verify',code);}
  return <section className="mfa-enrollment" aria-labelledby="mfa-enrollment-heading"><h2 id="mfa-enrollment-heading">Two-factor authentication</h2>
    <dl className="connected-methods"><div><dt>Authenticator app</dt><dd className="security-method-status">{enabled?'Enabled':'Not enabled'}
      {!enabled&&<button type="button" className="security-icon-action" ref={trigger} aria-label="Set up MFA" title="Set up MFA" aria-expanded={open&&!!(enrollment||noticeOpen)} disabled={busy||disabled} onClick={()=>{if(onToggle&&open&&(enrollment||noticeOpen))onToggle();else begin();}}><SecurityActionIcon action="shield"/></button>}</dd></div></dl>
    {open&&(enrollment||noticeOpen)&&<div ref={panel} className="account-confirmation mfa-enrollment-flow" tabIndex={-1} aria-busy={busy}>
    {!enabled&&<p>An authenticator adds a second sign-in check to protect your LAN Party account.</p>}
    {open&&noticeOpen&&!enrollment&&<div>
      {reauth&&<><p>Confirm your sign-in method. The two-minute security requirement still applies.</p>
        {methods?.password&&<form onSubmit={confirmPrimary}><fieldset disabled={busy}><label htmlFor="enrollment-password">Current password</label><PasswordInput id="enrollment-password" name="password" autoComplete="current-password" required/>
          <button className="button" disabled={!!siteKey&&!proof}>{busy?'Confirming…':'Confirm and continue'}</button></fieldset></form>}
        {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
        {!methods&&<a href="/login">Sign in again</a>}
      </>}
      {needsLogin&&<a href="/login">Sign in again</a>}
      {!reauth&&!needsLogin&&busy&&<p role="status">Checking setup requirements…</p>}

    </div>}
    {!enabled&&!enrollment&&(unfinished||uncertainStart)&&!reauth&&<div className="mfa-actions"><p>An unfinished or unconfirmed setup needs an explicit restart. Restarting replaces its QR code after identity confirmation.</p><button type="button" className="button button-secondary" disabled={busy||disabled||!statusReady} onClick={restart}>Restart unfinished setup</button></div>}
    {!statusReady&&<div><p>MFA status is unavailable. Check it before starting setup.</p><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void checkStatus()}>Retry MFA status</button></div>}
    {open&&enrollment&&
      <div>
        {!codes?<><p>Scan this QR code with your authenticator, or enter the manual setup key. Keep the key private.</p>
          <canvas ref={canvas} role="img" aria-label="Authenticator setup QR code. The same key is provided below."/>
          <p>Manual setup key: <code className="mfa-manual-key">{enrollment.secret}</code></p>
          <form onSubmit={verify}><fieldset disabled={busy}><label htmlFor="mfa-enrollment-code">Six-digit authenticator code</label>
            <input id="mfa-enrollment-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/>
            <button className="button">{busy?'Checking…':'Verify authenticator'}</button></fieldset></form></>:
          <><p>Save these ten recovery codes somewhere private. Each works once. They cannot be displayed again.</p>
            <ul aria-label="Recovery codes">{codes.codes.map(code=><li key={code}><code>{code}</code></li>)}</ul>
            <button type="button" className="button button-secondary" disabled={busy} onClick={()=>void copyCodes()}>{copied?'Copied':'Copy all codes'}</button>
            <label className="mfa-saved"><input type="checkbox" checked={saved} onChange={e=>setSaved(e.target.checked)}/>I have saved my recovery codes</label>
            <button className="button" disabled={!MFA_ENROLLMENT_AVAILABLE||!saved||busy} onClick={()=>void run('activate')}>{busy?'Enabling…':'Enable MFA'}</button>
            <p>MFA remains disabled until you acknowledge the codes and enable it.</p></>}

      </div>}
    <p role="status" aria-live="polite">{feedback}</p>
    <footer className="mfa-enrollment-footer"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>enrollment?void run('cancel'):dismiss()}>{uncertainStart&&!enrollment?'Close':'Cancel setup'}</button></footer>
    </div>}
    {!(open&&(enrollment||noticeOpen))&&<p role="status" aria-live="polite">{feedback}</p>}
  </section>;
}
