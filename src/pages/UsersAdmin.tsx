import {useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {Link,Navigate} from 'react-router';
import {useAuth} from '../lib/auth';
import {LifecycleProof,lifecycleRequest} from '../components/AccountLifecycle';
import MfaStepUp from '../components/MfaStepUp';
import '../CSS/UsersAdmin_style.css';

interface User {userId:string;nickname:string;email:string;memberNumber:string}
export default function UsersAdmin(){
 const {session,status,refresh}=useAuth(),csrf=session?.csrfToken;
 const [allowed,setAllowed]=useState(false),[query,setQuery]=useState(''),[users,setUsers]=useState<User[]>([]),[message,setMessage]=useState('Checking access…'),[proof,setProof]=useState(false),[mfa,setMfa]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!csrf)return;const abort=new AbortController();setAllowed(false);setUsers([]);
 void fetch('/api/auth/lifecycle/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const b=await r.json();if(!abort.signal.aborted){setAllowed(b.available===true&&b.administrator===true);setMessage(b.available&&b.administrator?'':'Users administration is unavailable.');}}).catch(()=>{if(!abort.signal.aborted)setMessage('Users administration is unavailable.');});return()=>abort.abort();},[csrf]);
 async function action(kind:'users'|'invite',input:object){
 if(!csrf||busy)return;setBusy(true);setMessage('');
 try{const r=await lifecycleRequest(kind,input,csrf),b=await r.json();if(r.ok){if(kind==='users')setUsers(b.users);setMessage(b.message??(b.users.length?'Select the intended account.':'No eligible account found.'));}
 else{setUsers([]);if(r.status===428){if(b.code==='mfa_required')setMfa(true);else setProof(true);}setMessage(b.error??'Request denied.');}
 }catch{setMessage('Result not confirmed. No automatic retry was made.');}finally{setBusy(false);}
 }
 if(status==='ready'&&!session)return <Navigate to="/login" replace/>;
 return <section className="page-section users-admin-page"><div className="panel"><h1>Account reactivation</h1><p>Only voluntarily deactivated accounts can receive an invitation. Invitations go to the existing account email. Reactivation still requires the account password and optional two-factor authentication.</p>
 <p role="status">{message}</p>
 {allowed&&csrf&&<>{mfa?<MfaStepUp csrf={csrf} onBusy={setBusy} onCancel={()=>setMfa(false)} onVerified={async()=>{await refresh();setMfa(false);setMessage('Two-factor authentication confirmed. Repeat the requested administrator action.');}}/>:proof?<div className="lifecycle-confirmation"><LifecycleProof csrf={csrf} onConfirmed={async()=>{setProof(false);setMessage('Password confirmed. Repeat the requested administrator action.');}}/></div>:<><form onSubmit={(e:FormEvent)=>{e.preventDefault();void action('users',{query});}}><label htmlFor="user-lookup">Exact email or nickname</label><input id="user-lookup" value={query} maxLength={254} minLength={3} required onChange={e=>setQuery(e.target.value)}/><button className="button" disabled={busy}>Find deactivated account</button></form>
 <ul>{users.map(u=><li key={u.userId}><strong>{u.nickname}</strong> — {u.email} · member {u.memberNumber}<button type="button" className="button button-secondary" disabled={busy} onClick={()=>{if(window.confirm('Send a new 30-minute invitation to this account’s existing email? Previous invitations stop working.'))void action('invite',{userId:u.userId});}}>Send reactivation invitation</button></li>)}</ul></>}</>}
 <Link to="/account/security">Back to Account Security</Link></div></section>;
}
