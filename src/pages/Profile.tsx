import {useEffect,useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {Navigate} from 'react-router';
import {useAuth} from '../lib/auth';
import {NAME_PREFIXES} from '../lib/name-prefixes';
import '../CSS/Profile_style.css';

interface Details {nickname:string;firstName:string;lastName:string;prefixId:string|null}
interface Snapshot {profile:Details;revision:string;canChangeNickname:boolean;nicknameAvailableAt:number|null;prefixes:{id:string;label:string;active:boolean}[]}
function validSnapshot(data:Snapshot):boolean{return !!data?.profile&&typeof data.profile.nickname==='string'&&typeof data.profile.firstName==='string'&&typeof data.profile.lastName==='string'&&(data.profile.prefixId===null||typeof data.profile.prefixId==='string')&&typeof data.revision==='string'&&/^[a-f0-9]{64}$/.test(data.revision)&&typeof data.canChangeNickname==='boolean'&&(data.nicknameAvailableAt===null||Number.isSafeInteger(data.nicknameAvailableAt))&&Array.isArray(data.prefixes)&&data.prefixes.every(p=>typeof p.id==='string'&&typeof p.label==='string'&&typeof p.active==='boolean');}
export default function Profile(){
 const auth=useAuth();
 if(auth.status==='loading')return <p role="status">Checking your session…</p>;
 if(auth.status==='error')return <section className="page-section"><h1>Profile unavailable</h1><p>Reload to check your session.</p></section>;
 if(!auth.session)return <Navigate to="/login" replace/>;
 return <ProfileEditor key={auth.session.account.userId+':'+auth.session.csrfToken} proof={auth.session.csrfToken} refresh={auth.refresh}/>;
}
export function ProfileEditor({proof,refresh}:{proof:string;refresh:()=>Promise<boolean>}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[draft,setDraft]=useState<Details|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
 const pending=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const headers={'X-LAN-Request':'1','X-LAN-Session-Proof':proof};
 useEffect(()=>{
  const controller=new AbortController();setSnapshot(null);setDraft(null);setMessage('');
  void fetch('/api/auth/profile',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
  .then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error??'Profile unavailable.');if(!validSnapshot(data))throw Error('Profile unavailable. Reload to try again.');if(!controller.signal.aborted){setSnapshot(data);setDraft(data.profile);}})
  .catch(error=>{if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Profile unavailable. Reload to try again.');});
  return()=>controller.abort();
 },[proof,retry]);
 async function save(event:FormEvent){
  event.preventDefault();if(pending.current||!snapshot||!draft)return;
  pending.current=true;setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/auth/profile',{method:'POST',credentials:'same-origin',redirect:'error',headers:{...headers,'Content-Type':'application/json','X-CSRF-Token':proof},body:JSON.stringify({...draft,revision:snapshot.revision}),signal:AbortSignal.timeout(15000)});
   const data=await response.json();if(!response.ok)throw Error(data.error??'Profile could not be saved.');if(!validSnapshot(data))throw Error('Save could not be confirmed. Reload your profile before trying again.');
   if(alive.current){setSnapshot(data);setDraft(data.profile);setMessage('Profile saved. Your display name and prefix appear in Who is coming.');await refresh();}
  }catch(error){if(alive.current)setMessage(error instanceof Error&&!(error instanceof TypeError)&&!(error instanceof DOMException)?error.message:'Save could not be confirmed. Reload your profile before trying again; no automatic retry was made.');}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 const changed=!!snapshot&&!!draft&&JSON.stringify(draft)!==JSON.stringify(snapshot.profile),prefix=snapshot?.prefixes.find(p=>p.id===draft?.prefixId&&NAME_PREFIXES.some(n=>n.id===p.id))?.label;
 return <section className="page-section profile-page"><div className="panel profile-card"><p className="eyebrow">User settings</p><h1>Your profile</h1>
  <p>Your display name and optional prefix are visible to signed-in members in Who is coming. Your first and last names stay private.</p>
  <p className="profile-status" role="status" aria-live="polite">{message||(!snapshot?'Loading your profile…':'')}</p>
  {snapshot&&draft&&<form onSubmit={save}><fieldset disabled={busy}><legend className="visually-hidden">Profile details</legend>
   <div className="profile-fields"><label>Preferred prefix<select value={draft.prefixId??''} onChange={e=>setDraft({...draft,prefixId:e.target.value||null})}><option value="">None</option>{snapshot.prefixes.map(p=><option key={p.id} value={p.id} disabled={!p.active}>{p.label}{p.active?'':' (no longer available)'}</option>)}</select></label>
    <label>Display name<input value={draft.nickname} onChange={e=>setDraft({...draft,nickname:e.target.value})} required minLength={3} maxLength={24} autoComplete="nickname" readOnly={!snapshot.canChangeNickname} aria-describedby="profile-nickname-help"/></label>
    <label>First name<input value={draft.firstName} onChange={e=>setDraft({...draft,firstName:e.target.value})} required maxLength={100} autoComplete="given-name"/></label>
    <label>Last name<input value={draft.lastName} onChange={e=>setDraft({...draft,lastName:e.target.value})} required maxLength={100} autoComplete="family-name"/></label>
   </div><p id="profile-nickname-help" className="profile-hint">{snapshot.canChangeNickname?'Display names use 3–24 letters A–Z, numbers, spaces, underscores or hyphens. Your first change is available immediately; later changes have a 14-day cooldown.':`You can change your display name again on ${new Date(snapshot.nicknameAvailableAt!*1000).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'})}. You can still edit your other details.`}</p>
   <div className="profile-preview"><span className="eyebrow">Who is coming preview</span><strong>{prefix?prefix+' ':''}{draft.nickname}</strong></div>
   <div className="profile-actions"><button className="button button-secondary" type="button" disabled={!changed} onClick={()=>{setDraft(snapshot.profile);setMessage('');}}>Reset changes</button><button className="button" disabled={!changed}>{busy?'Saving…':'Save profile'}</button></div>
  </fieldset></form>}
  {!!message&&!message.startsWith('Profile saved.')&&<button className="button button-secondary profile-reload" type="button" disabled={busy} onClick={()=>setRetry(n=>n+1)}>Reload profile</button>}
 </div></section>;
}
