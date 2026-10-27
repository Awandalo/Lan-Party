import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Link} from 'react-router';
import QRCode from 'qrcode';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import '../CSS/MfaRecovery_style.css';

interface Status {phase:'initial'|'pending'|'committed'|'acknowledged';expiresAt:number;csrfToken:string;password:boolean;primaryRequired:boolean}
export default function MfaRecovery(){
 const [status,setStatus]=useState<Status|null>(null),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false);
 const [setup,setSetup]=useState<{secret:string;uri:string}|null>(null),[qr,setQr]=useState(''),[codes,setCodes]=useState<string[]>([]);
 const [siteKey,setSiteKey]=useState(''),[proof,setProof]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const [uncertain,setUncertain]=useState(false),[copied,setCopied]=useState(false),[outcome,setOutcome]=useState<'complete'|'closed'|null>(null);
 const lock=useRef(false),mounted=useRef(true),panel=useRef<HTMLDivElement>(null);
 function clearSecrets(){setSetup(null);setQr('');setCodes([]);setCopied(false);}
 async function refresh(signal?:AbortSignal):Promise<Status>{
  const r=await fetch('/api/auth/mfa/recovery/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:signal??AbortSignal.timeout(15000)});
  if(!r.ok)throw Error();const value=await r.json();
  if(!['initial','pending','committed','acknowledged'].includes(value.phase)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()/1000
   ||!/^[a-f0-9]{64}$/.test(value.csrfToken)||typeof value.password!=='boolean'||typeof value.primaryRequired!=='boolean')throw Error();
  if(mounted.current)setStatus(value);return value;
 }
 useEffect(()=>{mounted.current=true;const controller=new AbortController();void refresh(controller.signal).catch(()=>{
  if(mounted.current&&!controller.signal.aborted)setFeedback('Recovery is unavailable or expired. If replacement completed, log in with your new authenticator and regenerate recovery codes in Account Security. Otherwise use an existing valid method or contact an administrator.');
 });return()=>{mounted.current=false;controller.abort();};},[]);
 useEffect(()=>{if(!status)return;const timer=setTimeout(()=>{setStatus(null);setUncertain(false);clearSecrets();
  setFeedback('This fixed recovery window expired. If replacement completed, log in with your new authenticator and regenerate recovery codes in Account Security. No spent code becomes reusable.');},Math.max(0,status.expiresAt*1000-Date.now()));return()=>clearTimeout(timer);},[status]);
 useEffect(()=>{if(busy)return;requestAnimationFrame(()=>{
  const id=status?.primaryRequired?'recovery-password':codes.length?'recovery-saved':setup?'replacement-totp':'';
  if(id)document.getElementById(id)?.focus();else panel.current?.focus();
 });},[busy,status?.phase,status?.primaryRequired,setup,codes.length,uncertain]);
 async function post(action:string,input:object,current:Status){
  return fetch('/api/auth/mfa/recovery/'+action,{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'X-LAN-Request':'1','Content-Type':'application/json','X-CSRF-Token':current.csrfToken},body:JSON.stringify({...input,...(proof?{turnstileToken:proof}:{})})});
 }
 async function showSetup(current:Status){
  // A confirmed primary response may continue to this read-only setup request;
  // replacement/reveal/acknowledgment are always separate explicit user actions.
  const response=await post('setup',{},current);if(!response.ok)throw Error();const body=await response.json(),uri=new URL(body.uri);
  if(typeof body.secret!=='string'||!/^[A-Z2-7]{32}$/.test(body.secret)||uri.protocol!=='otpauth:'||uri.hostname!=='totp'||uri.username||uri.password||uri.port||uri.hash
   ||uri.searchParams.get('secret')!==body.secret||uri.searchParams.get('issuer')!=='LAN Party'||uri.searchParams.get('algorithm')!=='SHA1'
   ||uri.searchParams.get('digits')!=='6'||uri.searchParams.get('period')!=='30'||[...uri.searchParams.keys()].sort().join(',')!=='algorithm,digits,issuer,period,secret'
   ||body.expiresAt!==current.expiresAt)throw Error();
  const image=await QRCode.toDataURL(body.uri,{margin:2,width:240});if(mounted.current){setSetup({secret:body.secret,uri:body.uri});setQr(image);}
 }
 async function checkStatus(){
  if(lock.current)return;lock.current=true;setBusy(true);clearSecrets();
  try{await refresh();if(mounted.current){setUncertain(false);setFeedback('Server state checked. Continue with the indicated step; no operation was retried.');}}
  catch{if(mounted.current){setStatus(null);setUncertain(false);setFeedback('Recovery is unavailable or expired. If replacement completed, log in with your new authenticator and regenerate recovery codes in Account Security.');}}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 function validCodes(value:unknown):value is string[]{return Array.isArray(value)&&value.length===10
  &&value.every(c=>typeof c==='string'&&/^[A-Z2-7]{26}$/.test(c.replaceAll('-','')))
  &&new Set(value.map(c=>c.replaceAll('-',''))).size===10;}
 async function run(action:string,input:object={}){
  if(lock.current||!status||uncertain)return;lock.current=true;setBusy(true);setFeedback('');
  try{
   if(action==='setup'){await showSetup(status);return;}
   const r=await post(action,input,status),body=await r.json();if(!mounted.current)return;
   if(!r.ok){
    if(r.status===403&&body.siteKey)setSiteKey(body.siteKey);
    if(r.status===428&&body.code==='reauth_required'){setStatus({...status,primaryRequired:true});setFeedback('Confirm your password to continue this same recovery. The fixed deadline does not change.');return;}
    if(body.code==='recovery_unavailable'){setStatus(null);clearSecrets();setFeedback('Recovery is unavailable or expired. If your new authenticator is active, log in with it and regenerate codes in Account Security.');return;}
    if(r.status>=500){setUncertain(true);clearSecrets();setFeedback('The result could not be confirmed. Check server status before continuing; no automatic retry was made.');return;}
    setFeedback(r.status===429?'Wait '+(r.headers.get('Retry-After')??'a few')+' seconds before trying again.':
     body.error??'Recovery unavailable.');return;
   }
   if(action==='reveal'){
    if(!validCodes(body.codes)||body.expiresAt!==status.expiresAt)throw Error();
    setCodes(body.codes);setCopied(false);setFeedback('Save all ten codes privately, then finish.');
    // Do not discard a successful secret-bearing response because an unrelated
    // follow-up status read fails. Existing fixed-deadline cleanup still applies.
    return;
   }
   if(action==='commit'){
    if(!Number.isSafeInteger(body.displayExpiresAt)||body.displayExpiresAt<=Date.now()/1000||body.displayExpiresAt>Date.now()/1000+301)throw Error();
    if(!validCodes(body.codes))throw Error();
    clearSecrets();setStatus({...status,phase:'committed',expiresAt:body.displayExpiresAt,primaryRequired:false});setCodes(body.codes);
    setFeedback('Your replacement authenticator is active. Save these ten recovery codes privately, then finish.');return;
   }
   if(action==='ack'||action==='cancel'){clearSecrets();setStatus(null);setOutcome(action==='ack'?'complete':'closed');setFeedback(body.message);return;}
   const latest=await refresh();
   if((action==='primary'||action==='start')&&latest.phase==='pending'&&!latest.primaryRequired)await showSetup(latest);
   if(action==='primary')setFeedback(latest.phase==='pending'?'Identity confirmed. Scan your replacement authenticator below.':'Identity confirmed. Continue to display the same recovery codes.');
  }catch{if(mounted.current){clearSecrets();setUncertain(true);setFeedback('The result is uncertain. Check recovery status before continuing. No automatic replacement or reveal retry was made.');}}
  finally{lock.current=false;if(mounted.current){setBusy(false);setProof(null);setAttempt(n=>n+1);}}
 }
 function submit(event:FormEvent<HTMLFormElement>,action:string,field='code'){
  event.preventDefault();if(lock.current)return;const form=event.currentTarget,data=new FormData(form);
  const value=String(data.get(field)??''),confirmed=data.get('confirmed')==='on';form.reset();void run(action,{[field]:value,confirmed});
 }
 async function copy(){try{await navigator.clipboard.writeText(codes.join('\n'));if(mounted.current)setCopied(true);}catch{if(mounted.current)setFeedback('Clipboard unavailable. Select and copy the codes manually.');}}
 const active=status&&['pending','committed'].includes(status.phase);
 const stage=outcome==='complete'||status?.phase==='acknowledged'?'Recovery complete':outcome==='closed'?'Recovery closed':uncertain?'Check server state':!status?(feedback?'Recovery unavailable':'Loading recovery…'):status.phase==='initial'?'Confirm recovery code':status.primaryRequired?'Confirm identity':status.phase==='pending'?'Set up replacement':codes.length?'Save recovery codes':'Show recovery codes';
 return <section className="mfa-recovery" aria-labelledby="mfa-recovery-heading"><h1 id="mfa-recovery-heading">Replace a lost authenticator</h1>
  <p>This restricted recovery cannot access your account or change other sign-in methods.</p>
  <div className="account-confirmation mfa-recovery-stage" ref={panel} tabIndex={-1} aria-busy={busy}>
  <h2>{stage}</h2>
  {active&&<p className="mfa-recovery-deadline">{status.phase==='pending'?'Complete replacement':'Save these codes'} before {new Date(status.expiresAt*1000).toLocaleTimeString()}. This fixed five-minute window is not extended by confirming your identity.</p>}
  {!uncertain&&status?.phase==='initial'&&<form onSubmit={e=>submit(e,'start')}><fieldset disabled={busy}>
   <p>Use an unused recovery code, including your last one. It will be spent immediately. Losing this browser context may require administrator assistance.</p>
   <label htmlFor="replace-code">Unused recovery code</label><input id="replace-code" name="code" required maxLength={40} autoComplete="one-time-code"/>
   <label><input name="confirmed" type="checkbox" required/> I understand this code will be spent and I have five minutes to replace my authenticator.</label>
   <button className="button" disabled={!!siteKey&&!proof}>Start restricted recovery</button></fieldset></form>}
  {!uncertain&&active&&status.primaryRequired&&<form onSubmit={e=>submit(e,'primary','password')}><fieldset disabled={busy}>
   <label htmlFor="recovery-password">Confirm current password</label><PasswordInput id="recovery-password" name="password" required autoComplete="current-password" maxLength={256}/>
   <button className="button" disabled={!status.password||!!siteKey&&!proof}>Confirm and continue</button></fieldset></form>}
  {!uncertain&&active&&!status.primaryRequired&&status.phase==='pending'&&<>
   {!setup&&<button className="button" disabled={busy} onClick={()=>void run('setup')}>Continue to authenticator setup</button>}
   {setup&&<><p>Scan with your replacement authenticator, or enter the manual key. Keep it private.</p>
    {qr&&<img src={qr} alt="Replacement authenticator setup QR code" width="240" height="240"/>}<code className="mfa-recovery-secret">{setup.secret}</code>
    <form onSubmit={e=>submit(e,'commit')}><fieldset disabled={busy}><label htmlFor="replacement-totp">Code from the new authenticator</label>
     <input id="replacement-totp" name="code" required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} autoComplete="one-time-code"/>
     <p>Replacing invalidates the old authenticator, all old recovery codes and existing sessions.</p><button className="button" disabled={!!siteKey&&!proof}>Replace authenticator</button></fieldset></form></>}
  </>}
  {!uncertain&&active&&status.phase==='committed'&&!status.primaryRequired&&!codes.length&&<>
   <p>Your replacement authenticator has already been verified. Display the same ten recovery codes within this restricted window.</p>
   <button type="button" className="button" disabled={busy||!!siteKey&&!proof} onClick={()=>void run('reveal')}>Show recovery codes</button>
   <p>If this display window expires, log in with your new authenticator and regenerate recovery codes in Account Security.</p>
  </>}
  {!uncertain&&codes.length===10&&<><p>Save all ten one-use recovery codes somewhere private.</p><ul className="mfa-recovery-codes" aria-label="Replacement recovery codes">{codes.map(code=><li key={code}><code>{code}</code></li>)}</ul>
   <p className="mfa-clipboard-guidance">Clipboard contents are sensitive. Paste into a secure password manager and clear the clipboard when finished.</p><button className="button button-secondary" disabled={busy} onClick={()=>void copy()}>{copied?'Copied':'Copy all codes'}</button>
   <form onSubmit={e=>{e.preventDefault();void run('ack',{confirmed:true});}}><fieldset disabled={busy}><label><input id="recovery-saved" type="checkbox" required/> I saved these recovery codes somewhere private</label><button className="button">Finish recovery</button></fieldset></form></>}
  {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setProof}/>}
  <p role="status" aria-live="polite">{busy?'Checking securely…':feedback}</p>
  <footer className="mfa-recovery-footer">
   {uncertain?<button className="button" disabled={busy} onClick={()=>void checkStatus()}>Check recovery status</button>:active?<><p>{status.phase==='committed'?'Closing does not undo your new authenticator. Unsaved codes remain subject to this fixed display deadline.':'Cancelling does not restore a spent recovery code.'}</p><button className="button button-secondary" disabled={busy} onClick={()=>void run('cancel',{confirmed:true})}>{status.phase==='committed'?'Close without saving':'Cancel recovery'}</button></>:null}
   {(!status||uncertain||status.phase==='acknowledged')&&<Link to="/login">Return to normal login</Link>}
  </footer></div>
 </section>;
}
