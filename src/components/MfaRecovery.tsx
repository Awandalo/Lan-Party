import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router';
import QRCode from 'qrcode';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import '../CSS/MfaRecovery_style.css';

interface Status {phase:'initial'|'pending'|'committed'|'acknowledged';expiresAt:number;csrfToken:string;password:boolean}
export default function MfaRecovery(){
 const [status,setStatus]=useState<Status|null>(null),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
 const [setup,setSetup]=useState<{secret:string;uri:string}|null>(null),[qr,setQr]=useState(''),[codes,setCodes]=useState<string[]>([]);
 const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const lock=useRef(false),mounted=useRef(true);
 async function refresh(signal?:AbortSignal){
  const r=await fetch('/api/auth/mfa/recovery/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal});
  if(!r.ok)throw Error();const value=await r.json();
  if(!['initial','pending','committed','acknowledged'].includes(value.phase)||!Number.isSafeInteger(value.expiresAt)||!/^[a-f0-9]{64}$/.test(value.csrfToken))throw Error();
  if(mounted.current)setStatus(value);
 }
 useEffect(()=>{mounted.current=true;const controller=new AbortController();void refresh(controller.signal).catch(()=>{
  if(mounted.current&&!controller.signal.aborted)setFeedback('Recovery is unavailable or expired. Return to login.');
 });return()=>{mounted.current=false;controller.abort();};},[]);
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>{setStatus(null);setSetup(null);setQr('');setCodes([]);
  setFeedback('This recovery window expired. If replacement completed, log in with your new authenticator.');},Math.max(0,status.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[status]);
 async function run(action:string,input:object={}){
  if(lock.current||!status)return;lock.current=true;setBusy(true);setFeedback('');
  try{
   const r=await fetch('/api/auth/mfa/recovery/'+action,{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{'X-LAN-Request':'1','Content-Type':'application/json','X-CSRF-Token':status.csrfToken},
    body:JSON.stringify({...input,...(proof?{turnstileToken:proof}:{})})});
   const body=await r.json();if(!mounted.current)return;
   if(!r.ok){
    if(r.status===403&&body.siteKey)setSiteKey(body.siteKey);
    setFeedback(r.status===429?`Wait ${r.headers.get('Retry-After')??''} seconds before trying again.`:body.error??'Recovery unavailable.');return;
   }
   if(action==='setup'){
    setSetup(body);setQr(await QRCode.toDataURL(body.uri,{margin:2,width:240}));
   }else if(action==='reveal')setCodes(body.codes);
   else if(action==='commit'){setSetup(null);setQr('');setCodes([]);setFeedback('Authenticator replaced. Wait for a fresh code, then reveal your recovery codes.');}
   else if(action==='ack'||action==='cancel'){setSetup(null);setQr('');setCodes([]);setStatus(null);setFeedback(body.message);return;}
   else if(action==='primary')setFeedback('Identity confirmed. Continue before the fixed deadline.');
   await refresh();
  }catch{if(mounted.current){setSetup(null);setQr('');setCodes([]);setFeedback('The result is uncertain. No automatic retry was made. Check recovery status before continuing.');}}
  finally{lock.current=false;if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
 }
 function submit(event:FormEvent<HTMLFormElement>,action:string,field='code'){
  event.preventDefault();if(lock.current)return;const form=event.currentTarget,data=new FormData(form);
  const value=String(data.get(field)??''),confirmed=data.get('confirmed')==='on';form.reset();void run(action,{[field]:value,confirmed});
 }
 return <section className="mfa-recovery" aria-labelledby="mfa-recovery-heading"><h1 id="mfa-recovery-heading">Replace a lost authenticator</h1>
  <p>This restricted recovery cannot access your account or change other sign-in methods.</p>
  {status?.phase==='initial'&&<form onSubmit={e=>submit(e,'start')} aria-busy={busy}><fieldset disabled={busy}>
   <p>Use an unused recovery code, including your last one. It will be spent immediately. If you lose this browser context before replacement, self-service recovery may be unavailable.</p>
   <label htmlFor="replace-code">Unused recovery code</label><input id="replace-code" name="code" required maxLength={40} autoComplete="one-time-code"/>
   <label><input name="confirmed" type="checkbox" required/> I understand this code will be spent and I have five minutes to replace my authenticator.</label>
   <button className="button" disabled={!!siteKey&&!proof}>Start restricted recovery</button></fieldset></form>}
  {status&&['pending','committed'].includes(status.phase)&&<>
   <p>The deadline is fixed. Confirming your identity does not extend it.</p>
   {status.password&&<form onSubmit={e=>submit(e,'primary','password')}><fieldset disabled={busy}><label htmlFor="recovery-password">Confirm current password</label>
    <PasswordInput id="recovery-password" name="password" required autoComplete="current-password" maxLength={256}/><button className="button button-secondary">Confirm identity</button></fieldset></form>}
   {status.phase==='pending'&&<>
    <button className="button button-secondary" disabled={busy} onClick={()=>void run('setup')}>{setup?'Show the same setup again':'Set up replacement authenticator'}</button>
    {setup&&<><p>Scan this with your replacement authenticator, or enter the setup key. Keep the authenticator after saving.</p>
     {qr&&<img src={qr} alt="Replacement authenticator setup QR code" width="240" height="240"/>}<code className="mfa-recovery-secret">{setup.secret}</code>
     <form onSubmit={e=>submit(e,'commit')}><fieldset disabled={busy}><label htmlFor="replacement-totp">Code from the new authenticator</label>
      <input id="replacement-totp" name="code" required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} autoComplete="one-time-code"/>
      <p>Replacing invalidates your old authenticator, all old recovery codes and existing sessions.</p><button className="button" disabled={!!siteKey&&!proof}>Replace authenticator</button></fieldset></form></>}
   </>}
   {status.phase==='committed'&&<><h2>Save your new recovery codes</h2><p>Your new authenticator is active. Use a fresh code (wait for the next code after each successful use) to show the same ten recovery codes within five minutes. If this display expires, log in with your new authenticator and regenerate codes in Security.</p>
    <form onSubmit={e=>submit(e,'reveal')}><fieldset disabled={busy}><label htmlFor="reveal-totp">Fresh new-authenticator code</label><input id="reveal-totp" name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code"/>
     <button className="button" disabled={!!siteKey&&!proof}>Show recovery codes</button></fieldset></form>
    {codes.length===10&&<><ul className="mfa-recovery-codes">{codes.map(code=><li key={code}><code>{code}</code></li>)}</ul>
     <form onSubmit={e=>{e.preventDefault();void run('ack',{confirmed:true});}}><fieldset disabled={busy}><label><input type="checkbox" required/> I saved these recovery codes somewhere private</label><button className="button">Finish and return to login</button></fieldset></form></>}
   </>}
   <button className="button button-secondary" disabled={busy} onClick={()=>void run('cancel',{confirmed:true})}>Close recovery</button>
  </>}
  {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
  <button type="button" className="button button-secondary" disabled={busy||lock.current} onClick={()=>{setCodes([]);setSetup(null);setQr('');void refresh().catch(()=>setFeedback('Recovery is unavailable or expired.'));}}>Check recovery status</button>
  <p role="status" aria-live="polite">{feedback}</p><Link to="/login">Return to normal login</Link>
 </section>;
}
