import {useEffect,useId,useRef,useState} from 'react';
import type {ManagedEvent} from '../lib/event-management';
export default function EventLifecycleDialog({row,action,pending,message,onSave,onClose}:{row:ManagedEvent;action:'publish'|'unpublish'|'cancel';pending:boolean;message:string;onSave:(confirmation:string,acknowledge:boolean)=>Promise<void>;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef<HTMLButtonElement>(null),heading=useId(),[confirmation,setConfirmation]=useState(''),[acknowledge,setAcknowledge]=useState(false);
 const label=action==='publish'?'Publish':action==='unpublish'?'Unpublish':'Cancel event',archived=action==='publish'&&row.templateActive!==1;
 useEffect(()=>{const trigger=document.activeElement;dialog.current?.showModal();cancel.current?.focus();return()=>{if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();};},[]);
 return <dialog ref={dialog} className="event-dialog role-wizard" aria-labelledby={heading} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onClose}>
  <h2 id={heading}>{label}: {row.title}</h2>
  <p>{action==='publish'?'This makes the event description, dates, venue and availability public and opens registration. Events that have already ended stay closed.':action==='unpublish'?'This hides the event and its direct public link. It retains the published history and can be published again.':'This hides the event and closes registration. Cancellation cannot be undone.'}</p>
  <p>{row.days.map(d=>d.date).join(', ')} · {row.venue?.name} · {row.capacity} places per day</p>
  <form onSubmit={e=>{e.preventDefault();if(!pending&&confirmation===row.title&&(!archived||acknowledge))void onSave(confirmation,acknowledge);}}><fieldset disabled={pending}><legend className="visually-hidden">Confirm event action</legend>
   {archived&&<label><input type="checkbox" checked={acknowledge} onChange={e=>setAcknowledge(e.target.checked)}/>The source location is archived. I have reviewed the event’s saved venue details.</label>}
   <label className="event-description-input">Type the event name to confirm<input autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><p role="alert">{message}</p>
   <div className="wizard-actions"><button ref={cancel} type="button" className="button button-secondary" onClick={onClose}>Back</button><button className="button" disabled={pending||confirmation!==row.title||archived&&!acknowledge}>{pending?'Saving…':label}</button></div>
  </fieldset></form>
 </dialog>;
}
