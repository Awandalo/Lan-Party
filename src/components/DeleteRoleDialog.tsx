import {useEffect,useRef,useState} from 'react';
import type {Role} from '../lib/roles';
import {useAuth} from '../lib/auth';
type DeletionState='loading'|'available'|'assigned'|'protected'|'unavailable'|'error';
export default function DeleteRoleDialog({role,pending,onDelete,onClose}:{role:Role;pending:boolean;onDelete:()=>Promise<void>;onClose:()=>void}){
 const {session}=useAuth(),proof=session?.csrfToken;
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),[confirmed,setConfirmed]=useState(false);
 const [state,setState]=useState<DeletionState>('loading');
 useEffect(()=>{dialog.current?.showModal();cancel.current?.focus();},[]);
 useEffect(()=>{
  setConfirmed(false);setState('loading');if(!proof){setState('error');return;}
  const controller=new AbortController();
  void fetch('/api/manage/roles/'+encodeURIComponent(role.id)+'/deletion',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
   .then(async response=>{if(!response.ok)throw Error();const body=await response.json();if(!['available','assigned','protected','unavailable'].includes(body?.state))throw Error();if(!controller.signal.aborted)setState(body.state);})
   .catch(()=>{if(!controller.signal.aborted)setState('error');});
  return()=>controller.abort();
 },[role.id,proof]);
 const available=state==='available';
 const message=state==='assigned'?"Role can't be deleted yet. Please check the current members.":state==='protected'?'This role is protected and cannot be deleted.':state==='loading'?'Checking current role assignments…':state==='unavailable'?'Role deletion is not available.':'Assignment status could not be checked. Close this dialog and try again.';
 return <dialog ref={dialog} className="role-wizard role-review-dialog" aria-labelledby="delete-role-title" aria-busy={state==='loading'||pending} onCancel={event=>{if(pending)event.preventDefault();}} onClose={onClose}><h2 id="delete-role-title">Delete {role.name}?</h2>{available?<><p>This permanently removes the custom role and its permissions. Its private activity history remains.</p><p>Unassign it from every member first, including inactive accounts. Assignment status is checked again when you confirm.</p></>:<><p role="status">{message}</p>{state==='assigned'&&<p>Unassign this role from every member, including inactive accounts, before trying again.</p>}</>}<label className="role-check role-delete-confirmation"><span className="role-switch"><input type="checkbox" role="switch" checked={confirmed} disabled={pending||!available} onChange={e=>setConfirmed(e.target.checked)}/><span aria-hidden="true"/></span><span>I understand this role will be permanently deleted</span></label><div className="wizard-actions"><button ref={cancel} type="button" className="button button-secondary" disabled={pending} onClick={()=>dialog.current?.close()}>Cancel</button><button type="button" className="button role-danger" disabled={!confirmed||pending||!available} onClick={()=>{if(available)void onDelete();}}>{pending?'Deleting…':'Confirm delete role'}</button></div></dialog>;
}
