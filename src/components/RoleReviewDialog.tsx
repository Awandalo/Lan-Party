import SwitchInput from './SwitchInput';
import {useEffect,useRef,useState} from 'react';
import type {Catalogue,Role} from '../lib/roles';
import type {RoleDraft} from '../lib/role-presentation';
import RoleReview from './RoleReview';
export default function RoleReviewDialog({catalogue,role,draft,onConfirm,onClose}:{catalogue:Catalogue;role:Role;draft:RoleDraft;onConfirm:()=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog className="role-wizard role-review-dialog" ref={dialog} aria-label="Review role changes" onClose={onClose}><RoleReview catalogue={catalogue} role={role} draft={draft}/><label className="role-check"><SwitchInput checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I reviewed these changes</label><div className="wizard-actions"><button className="button button-secondary" onClick={()=>dialog.current?.close()}>Back to editing</button><button className="button" disabled={!confirmed} onClick={()=>{onConfirm();dialog.current?.close();}}>Confirm review</button></div><p className="role-footnote">Confirming review does not save. Use Save changes in the editor when ready.</p></dialog>;
}
