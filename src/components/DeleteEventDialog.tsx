import {useEffect,useId,useRef,useState} from 'react';
import type {ManagedEvent} from '../lib/event-management';
export default function DeleteEventDialog({row,pending,message,onDelete,onClose}:{row:ManagedEvent;pending:boolean;message:string;onDelete:(confirmation:string)=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),heading=useId(),[confirmation,setConfirmation]=useState('');
 useEffect(()=>{const trigger=document.activeElement;dialog.current?.showModal();cancel.current?.focus();return()=>{if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();};},[]);
 return <dialog ref={dialog} className="event-dialog role-wizard" aria-labelledby={heading} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onClose}>
  <h2 id={heading}>Permanently delete {row.title}?</h2><p>This removes the event and its attendance days. Any public event link will stop working. Its audit history remains. Any registration history prevents deletion, even after cancellation.</p>
  <form onSubmit={e=>{e.preventDefault();if(!pending&&confirmation===row.title)void onDelete(confirmation);}}><fieldset disabled={pending}><legend className="visually-hidden">Confirm event deletion</legend><label className="event-description-input">Type the event name to confirm<input autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><p role="alert">{message}</p><div className="wizard-actions"><button ref={cancel} type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button role-danger" disabled={pending||confirmation!==row.title}>{pending?'Deleting…':'Permanently delete event'}</button></div></fieldset></form>
 </dialog>;
}
