import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import QRCode from 'qrcode';
import {MFA_ENROLLMENT_AVAILABLE} from '../lib/mfa-mode';
import '../CSS/MfaEnrollment_style.css';

type Enrollment={token:string;secret:string;uri:string;expiresAt:number};
type Codes={codes:string[];acknowledgment:string};
type Request=(action:string,input:object)=>Promise<unknown>;
export default function MfaEnrollment({csrf,request:fixture,open=true,disabled=false,onOpen,onBusy,onActivated}:{csrf:string;request?:Request;open?:boolean;disabled?:boolean;onOpen?:()=>void;onBusy?:(busy:boolean)=>void;onActivated?:()=>Promise<unknown>}){
  const [enrollment,setEnrollment]=useState<Enrollment|null>(null),[codes,setCodes]=useState<Codes|null>(null);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[saved,setSaved]=useState(false);
  const [enabled,setEnabled]=useState(false);
  const pending=useRef(false),canvas=useRef<HTMLCanvasElement>(null),panel=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(fixture)return;void fetch('/api/auth/mfa/status',{headers:{'X-LAN-Request':'1'},credentials:'same-origin',redirect:'error'})
    .then(async response=>{if(!response.ok)throw Error();const value=await response.json();if(mounted.current)setEnabled(value.enabled===true);})
    .catch(()=>{if(mounted.current)setFeedback('MFA status unavailable. Reload before starting setup.');});},[csrf,fixture]);
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
  async function request(action:string,input:object){
    if(fixture)return fixture(action,input);
    const response=await fetch('/api/auth/mfa/enroll/'+action,{method:'POST',credentials:'same-origin',redirect:'error',
      headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':csrf},body:JSON.stringify(input),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Enrollment unavailable');return response.json();
  }
  async function run(action:'start'|'verify'|'cancel'|'activate',code?:string){
    if(pending.current||(action==='start'&&disabled))return;pending.current=true;setBusy(true);onBusy?.(true);setFeedback('');
    const token=enrollment?.token;
    if(action==='cancel'){setEnrollment(null);setCodes(null);setSaved(false);}
    try{
      const result=await request(action,action==='start'?{}:{token,...(code?{code}:{}),...(action==='activate'?{acknowledgment:codes?.acknowledgment}:{})});
      if(!mounted.current)return;
      if(action==='start'){
        const value=result as Enrollment,uri=new URL(value.uri);
        if(!/^[a-f0-9]{64}$/.test(value.token)||!/^[A-Z2-7]{32}$/.test(value.secret)||uri.protocol!=='otpauth:'||uri.hostname!=='totp'
          ||uri.searchParams.get('secret')!==value.secret||uri.searchParams.get('issuer')!=='LAN Party'
          ||uri.username||uri.password||uri.port||uri.hash||uri.searchParams.get('algorithm')!=='SHA1'||uri.searchParams.get('digits')!=='6'||uri.searchParams.get('period')!=='30'
          ||[...uri.searchParams.keys()].sort().join(',')!=='algorithm,digits,issuer,period,secret'
          ||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()/1000||value.expiresAt>Date.now()/1000+600)throw Error();
        setEnrollment(value);requestAnimationFrame(()=>panel.current?.focus());
      }else if(action==='verify'){
        const value=result as Codes;
        if(!enrollment||enrollment.expiresAt<=Date.now()/1000||!Array.isArray(value.codes)||value.codes.length!==10
          ||value.codes.some(c=>typeof c!=='string'||c.length>40||!/^[A-Z2-7]{26}$/.test(c.replaceAll('-','')))
          ||new Set(value.codes.map(c=>c.replaceAll('-',''))).size!==10||!/^[a-f0-9]{64}$/.test(value.acknowledgment))throw Error();
        setCodes(value);setEnrollment(current=>current?{...current,secret:'',uri:''}:null);setSaved(false);requestAnimationFrame(()=>panel.current?.focus());
      }else if(action==='activate'){
        setEnrollment(null);setCodes(null);setSaved(false);setEnabled(true);
        await onActivated?.();setFeedback('MFA enabled. Keep your recovery codes private.');
      }else{setFeedback('Setup cancelled. MFA was not enabled.');requestAnimationFrame(()=>trigger.current?.focus());}
    }catch{if(mounted.current)setFeedback(action==='activate'?'Activation could not be confirmed. Do not repeat it automatically. Sign in again using your authenticator or saved recovery codes if activation succeeded.':'Setup could not be confirmed. No automatic retry was made. Cancel and restart if needed.');}
    finally{pending.current=false;onBusy?.(false);if(mounted.current)setBusy(false);}
  }
  function verify(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,code=String(new FormData(form).get('code')??'');form.reset();void run('verify',code);}
  return <section className="mfa-enrollment" aria-labelledby="mfa-enrollment-heading"><h2 id="mfa-enrollment-heading">Two-factor authentication</h2>
    <dl className="connected-methods"><div><dt>Authenticator app</dt><dd className="security-method-status">{enabled?'Enabled':'Not enabled'}
      {!enabled&&!(open&&enrollment)&&<button className="button button-secondary" ref={trigger} disabled={busy||disabled} onClick={()=>{onOpen?.();void run('start');}}>Set up MFA</button>}</dd></div></dl>
    {!enabled&&<p>An authenticator adds a second sign-in check to protect your LAN Party account.</p>}
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
