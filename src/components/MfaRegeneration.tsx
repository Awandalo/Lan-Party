import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {flushSync} from 'react-dom';
import PasswordInput from './PasswordInput';
import LoginChallenge from './LoginChallenge';
import {securityRequest} from '../lib/account-security';
import '../CSS/MfaRegeneration_style.css';

type Props={csrf:string;open:boolean;disabled:boolean;methods:{password:boolean};onOpen:()=>void;onBusy:(busy:boolean)=>void;onActivated:()=>Promise<unknown>;onActive?:(active:boolean)=>void};
type Operation={token:string;acknowledgment?:string};
export default function MfaRegeneration(props:Props){
 const [engaged,setEngaged]=useState(false);
 const [operation,setOperation]=useState<Operation|null>(null),[codes,setCodes]=useState<string[]>([]),[saved,setSaved]=useState(false);
 const [primaryRequired,setPrimaryRequired]=useState(false),[mfaRequired,setMfaRequired]=useState(true),[verified,setVerified]=useState(false);
 const method='totp' as const;
 const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
 const [siteKey,setSiteKey]=useState(''),[challenge,setChallenge]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
 const [uncertain,setUncertain]=useState(false),[revealAttempted,setRevealAttempted]=useState(false);
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(engaged)panel.current?.focus();},[engaged,operation!==null,primaryRequired,mfaRequired,codes.length]);
 const receipt=useRef<Operation|null>(null),pending=useRef<string|null>(null),mounted=useRef(true),callbacks=useRef(props);
 callbacks.current=props;
 function clear(){receipt.current=null;setEngaged(false);setOperation(null);setCodes([]);setSaved(false);setVerified(false);setUncertain(false);setRevealAttempted(false);setPrimaryRequired(false);setMfaRequired(true);setSiteKey('');setChallenge(null);callbacks.current.onActive?.(false);}
 function abandon(){const old=receipt.current;const activating=pending.current==='finish';clear();
  if(old&&!activating)void fetch('/api/auth/mfa/manage/cancel',{method:'POST',credentials:'same-origin',redirect:'error',keepalive:true,
   headers:{'X-LAN-Request':'1','Content-Type':'application/json','X-CSRF-Token':props.csrf},body:JSON.stringify({token:old.token,regeneration:true})}).catch(()=>{});
 }
 async function request(action:string,input:object={}){
  const response=await fetch('/api/auth/mfa/manage/'+action,{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000),
   headers:{'X-LAN-Request':'1','Content-Type':'application/json','X-CSRF-Token':props.csrf},body:JSON.stringify(input)});
  return {response,body:await response.json()};
 }
 useEffect(()=>{
  mounted.current=true;
  const leave=()=>flushSync(()=>abandon());
  const resume=()=>{if(document.visibilityState==='visible'&&!pending.current){if(receipt.current)void run('check');}};
  const restored=(event:PageTransitionEvent)=>{if(event.persisted)flushSync(()=>abandon());};
  window.addEventListener('pagehide',leave);window.addEventListener('pageshow',restored);document.addEventListener('visibilitychange',resume);
  return()=>{mounted.current=false;window.removeEventListener('pagehide',leave);window.removeEventListener('pageshow',restored);document.removeEventListener('visibilitychange',resume);abandon();};
  // Receipt and codes never survive navigation, bfcache restoration, or a session change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[props.csrf]);
 useEffect(()=>{if(!props.open&&engaged&&!pending.current)abandon();},[props.open,engaged]);
 async function run(action:string,input:object={}){
  if(pending.current)return;
  const old=receipt.current;pending.current=action;if(action==='reveal')setRevealAttempted(true);setBusy(true);callbacks.current.onBusy(true);setFeedback('');
  try{
   const {response,body}=await request(action,{...(old?{token:old.token,regeneration:true}:{}),...input});
   if(!mounted.current)return;
   if(response.status===401&&body.code==='session_required'){clear();await callbacks.current.onActivated();setFeedback('Your session ended. Sign in again.');return;}
   if(response.status===410&&body.code==='regeneration_ended'){clear();await callbacks.current.onActivated();setFeedback(body.error);return;}
   if(response.status===428){if(action==='reveal')setRevealAttempted(false);setPrimaryRequired(body.primaryRequired===true);setMfaRequired(true);setVerified(false);setFeedback(body.error);return;}
   if(response.status===403&&typeof body.siteKey==='string'){setSiteKey(body.siteKey);setFeedback('Complete the security check, then submit again.');return;}
   if(response.status===403){clear();await callbacks.current.onActivated();setFeedback('Request authorization changed. Check your current account settings.');return;}
   if(!response.ok){if(action==='finish')setUncertain(true);setFeedback(response.status===429?'Please wait '+(response.headers.get('Retry-After')??'')+' seconds before trying again.':body.error??'This operation could not be confirmed. No automatic retry was made.');return;}
   if(action==='start'){
    if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw Error();
    receipt.current={token:body.token};setOperation(receipt.current);setMfaRequired(true);setPrimaryRequired(false);setVerified(false);callbacks.current.onActive?.(true);
   }else if(action==='verify'){setVerified(true);setMfaRequired(false);setPrimaryRequired(false);setFeedback('Identity confirmed. Choose Reveal or Activate when ready.');}
   else if(action==='reveal'){
    if(!old||!Array.isArray(body.codes)||body.codes.length!==10||new Set(body.codes).size!==10||body.codes.some((v:unknown)=>typeof v!=='string'||!/^([A-Z2-7]{4}-){6}[A-Z2-7]{2}$/.test(v))||typeof body.acknowledgment!=='string'||!/^[a-f0-9]{64}$/.test(body.acknowledgment))throw Error();
    receipt.current={...old,acknowledgment:body.acknowledgment};setOperation(receipt.current);setCodes(body.codes);setSaved(false);
   }else if(action==='check'){
    if(body.phase==='activated'){clear();await callbacks.current.onActivated();setFeedback('Activation confirmed. New recovery codes are active.');return;}
    if(typeof body.primaryRequired!=='boolean'||typeof body.mfaRequired!=='boolean')throw Error();
    setUncertain(false);
    setPrimaryRequired(body.primaryRequired);setMfaRequired(body.mfaRequired);setVerified(!body.primaryRequired&&!body.mfaRequired);
   }else if(action==='finish'){
    clear();await callbacks.current.onActivated();setFeedback('New recovery codes activated. Previous codes no longer work.'+(body.notification==='unconfirmed'?' Notification delivery could not be confirmed.':''));
   }else if(action==='cancel'){clear();setFeedback('Changes cancelled. Previous recovery codes remain active, except any spent as proof.');}
  }catch{if(action==='finish')setUncertain(true);if(mounted.current)setFeedback(action==='finish'?'Activation could not be confirmed. No automatic retry was made. Sign in and check your settings.':'The operation could not be confirmed. No automatic retry was made. If reveal was interrupted, cancel and start a new regeneration.');}
  finally{pending.current=null;callbacks.current.onBusy(false);if(mounted.current){setBusy(false);setChallenge(null);setAttempt(n=>n+1);}}
 }
 async function primary(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(pending.current)return;const form=event.currentTarget,password=String(new FormData(form).get('password')??'');form.reset();
  let confirmed=false;pending.current='primary';setBusy(true);callbacks.current.onBusy(true);
  try{const response=await securityRequest('reauth-password',{password,...(challenge?{turnstileToken:challenge}:{})},props.csrf),body=await response.json();
   if(!mounted.current)return;
   if(response.ok){confirmed=true;setPrimaryRequired(false);setMfaRequired(true);setVerified(false);setFeedback(receipt.current?'Sign-in method confirmed. Confirm your authenticator next.':'Sign-in method confirmed. Continue to your authenticator.');}
   else if(response.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check, then confirm your password again.');}
   else if(response.status===403){clear();await callbacks.current.onActivated();setFeedback('Request authorization changed. Check your current account settings.');}
   else setFeedback('Identity confirmation failed. No automatic retry was made.');
  }catch{setFeedback('Identity confirmation could not be confirmed. No automatic retry was made.');}
  finally{pending.current=null;callbacks.current.onBusy(false);if(mounted.current){setBusy(false);setChallenge(null);setAttempt(n=>n+1);}}
  if(confirmed&&!receipt.current&&mounted.current)await run('start',{purpose:'regenerate'});
 }
 function verify(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,code=String(new FormData(form).get('code')??'');form.reset();void run('verify',{method,code,...(challenge?{turnstileToken:challenge}:{})});}
 async function copy(){try{await navigator.clipboard.writeText(codes.join('\n'));setFeedback('Codes copied. Save them privately, then acknowledge and activate.');}catch{setFeedback('Clipboard access was unavailable. Select and copy the codes manually.');}}
 function begin(){
  if(pending.current||props.disabled)return;
  setEngaged(true);callbacks.current.onActive?.(true);props.onOpen();void run('start',{purpose:'regenerate'});
 }
 const step=busy&&!operation?'Checking security requirements':primaryRequired||!operation?'Confirm sign-in':mfaRequired?'Confirm authenticator':!codes.length?'Reveal codes':'Save and activate';
 function cancel(){if(receipt.current)void run('cancel');else{clear();setFeedback('No regeneration was started.');}}
 const primaryControls=<div className="mfa-regeneration-primary">
  <p>{codes.length?'Confirm your identity to activate this same saved set.':'Confirm your sign-in method to continue.'}</p>
  <form onSubmit={primary}><fieldset disabled={busy}>
   {props.methods.password&&<><label htmlFor="regeneration-password">Current password</label><PasswordInput id="regeneration-password" name="password" autoComplete="current-password" required/></>}
   <div className="mfa-actions">
    {props.methods.password&&<button className="button" disabled={!!siteKey&&!challenge}>{busy?'Confirming…':'Confirm'}</button>}
    <button type="button" className="button button-secondary" onClick={cancel}>Cancel</button>
   </div>
  </fieldset></form>
 </div>;
 const totpControls=<form onSubmit={verify}><fieldset disabled={busy}>
  <label htmlFor="regeneration-code">Six-digit authenticator code</label>
  <input id="regeneration-code" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required/>
  <button className="button" disabled={!!siteKey&&!challenge}>{busy?'Checking…':'Confirm authenticator'}</button>
 </fieldset></form>;
 return <div className="mfa-regeneration">
  {!engaged&&<button className="button button-secondary" disabled={props.disabled||busy} onClick={begin}>Regenerate recovery codes</button>}
  {engaged&&<section className="account-confirmation mfa-regeneration-panel" ref={panel} tabIndex={-1} aria-busy={busy} aria-label="Recovery code regeneration">
   <h3>Regenerate recovery codes</h3>
   <p className="eyebrow">{step}</p>
   <p>Previous codes stay active until you activate the new set, except any spent as proof.</p>
   <div className={!codes.length?'mfa-regeneration-stage':undefined}>
   {busy&&!operation&&!primaryRequired&&!codes.length&&<div className="mfa-regeneration-loading-shape" aria-hidden="true"><span/><span/><span/></div>}
   {!codes.length&&primaryRequired&&primaryControls}
   {!codes.length&&operation&&!primaryRequired&&mfaRequired&&totpControls}
   {siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setChallenge}/>}
   {operation&&!codes.length&&!primaryRequired&&<>
    {!verified&&<p>Confirm your authenticator to enable Reveal.</p>}
    <button className="button" disabled={busy||!verified||revealAttempted} onClick={()=>void run('reveal')}>{busy&&pending.current==='reveal'?'Revealing…':'Reveal recovery codes'}</button>
   </>}
   {codes.length>0&&<><p><strong>Not active yet.</strong> Save these ten codes privately. They are shown once, with no countdown. Leaving or refreshing this view loses the display.</p>
    <ul className="mfa-regeneration-codes" aria-label="New recovery codes">{codes.map(code=><li key={code}><code>{code}</code></li>)}</ul>
    <p className="mfa-clipboard-guidance">Clipboard contents are sensitive. Paste into a secure password manager and clear the clipboard when finished.</p><button className="button button-secondary" disabled={busy} onClick={()=>void copy()}>Copy all codes</button>
    <label className="mfa-saved"><input type="checkbox" checked={saved} disabled={busy} onChange={event=>setSaved(event.target.checked)}/>I have saved the new recovery codes</label>
    {primaryRequired&&primaryControls}{!primaryRequired&&mfaRequired&&totpControls}
    <div className="mfa-actions">
    <button className="button" disabled={busy||!saved||uncertain||primaryRequired||mfaRequired} onClick={()=>void run('finish',{acknowledgment:operation?.acknowledgment,confirmed:true})}>{busy&&pending.current==='finish'?'Activating…':'Activate'}</button>{!primaryRequired&&<button className="button button-secondary" disabled={busy} onClick={cancel}>Cancel</button>}</div>
   </>}
   {operation&&codes.length>0&&uncertain&&<button className="button button-secondary" disabled={busy} onClick={()=>void run('check')}>Check activation result</button>}
   <p role="status" aria-live="polite">{busy&&!operation?'Checking your session and sign-in freshness. No recovery codes have been activated…':busy?'Checking securely…':feedback}</p>
   {!codes.length&&!primaryRequired&&<button className="button button-secondary" disabled={busy} onClick={cancel}>Cancel</button>}
   </div>
  </section>}
  {!engaged&&<p role="status" aria-live="polite">{feedback}</p>}
 </div>;
}
