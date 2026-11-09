import {useEffect,useId,useRef,useState} from 'react';
import {Link} from 'react-router';
import type {RegistrationDraft,RegistrationGuest} from '../lib/event-registration';
import {registrationDate} from '../lib/event-registration';
import '../CSS/EventRegistration_style.css';
export default function EventRegistrationWizard({days,maxGuests,initial,pending,message,onSave,onCancel}:{days:string[];maxGuests:number;initial:RegistrationDraft;pending:boolean;message:string;onSave:(draft:RegistrationDraft)=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),title=useId(),heading=useRef<HTMLHeadingElement>(null),[step,setStep]=useState(0),[selected,setSelected]=useState(initial.days),[guests,setGuests]=useState<RegistrationGuest[]>(initial.guests.map(g=>({...g,days:[...g.days]}))),[error,setError]=useState('');
 useEffect(()=>{const trigger=document.activeElement;dialog.current?.showModal();return()=>{if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus({preventScroll:true});};},[]);
 useEffect(()=>{heading.current?.focus();},[step]);
 const toggle=(values:string[],day:string)=>values.includes(day)?values.filter(d=>d!==day):days.filter(d=>d===day||values.includes(d));
 const change=(id:string,patch:Partial<RegistrationGuest>)=>setGuests(old=>old.map(g=>g.id===id?{...g,...patch}:g));
 function next(){
  if(!selected.length){setError('Choose at least one day for yourself.');return;}
  if(step===1&&guests.some(g=>!g.name.trim()||!g.email.trim()||!g.days.length)){setError('Give every guest a name, email and at least one day.');return;}
  setError('');if(step<2)setStep(step+1);else onSave({days:selected,guests});
 }
 const labels=['Your days','Invited guests','Review & confirm'];
 return <dialog ref={dialog} className="role-wizard registration-wizard" aria-labelledby={title} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}>
  <div className="wizard-heading"><h2 id={title}>Your event registration</h2><button type="button" className="text-action" aria-label="Close registration" disabled={pending} onClick={onCancel}>✕</button></div>
  <ol className="wizard-steps" aria-label="Registration progress">{labels.map((label,i)=><li key={label} aria-current={i===step?'step':undefined}><span>{i+1}</span>{label}</li>)}</ol>
  <form onSubmit={e=>{e.preventDefault();next();}}><fieldset disabled={pending}><legend className="visually-hidden">Registration</legend><h3 tabIndex={-1} ref={heading}>{labels[step]}</h3>
   {step===0&&<><p>Choose the days you will attend. Each person uses one place per selected day.</p><div className="registration-days">{days.map(day=><label key={day}><input type="checkbox" checked={selected.includes(day)} onChange={()=>setSelected(toggle(selected,day))}/>{registrationDate(day)}</label>)}</div><p>If your newly requested group cannot fit on a day, the whole group waits together for that day.</p></>}
   {step===1&&<><p>Invite up to {maxGuests} guests. You manage their registration; they do not need accounts. Their contact details stay private.</p><p>Let your guests know how their details are used and share our <Link to="/privacy" target="_blank" rel="noopener">Privacy Policy</Link> before adding them. Their details are visible only to you and authorized organizers; they may receive their own event cost information.</p>{guests.map((guest,index)=><fieldset key={guest.id} className="registration-guest"><legend>Guest {index+1}</legend><div className="registration-fields"><label>Guest name<input required maxLength={100} value={guest.name} onChange={e=>change(guest.id,{name:e.target.value})}/></label><label>Guest email<input required type="email" maxLength={254} autoComplete="off" value={guest.email} onChange={e=>change(guest.id,{email:e.target.value})}/></label></div><p>Guest days can differ from yours.</p><div className="registration-days">{days.map(day=><label key={day}><input type="checkbox" checked={guest.days.includes(day)} onChange={()=>change(guest.id,{days:toggle(guest.days,day)})}/>{registrationDate(day)}</label>)}</div><button className="button button-secondary" type="button" onClick={()=>setGuests(old=>old.filter(g=>g.id!==guest.id))}>Remove guest {index+1}</button></fieldset>)}<button type="button" className="button button-secondary" disabled={guests.length>=maxGuests} onClick={()=>setGuests(old=>[...old,{id:crypto.randomUUID(),name:'',email:'',days:[...selected]}])}>Add guest</button></>}
   {step===2&&<><p>Review your days before confirming. Existing confirmed places stay protected when adding new people or days.</p><h4>You</h4><p>{selected.map(registrationDate).join(', ')}</p>{guests.map((guest,index)=><section key={guest.id}><h4>Guest {index+1}: {guest.name}</h4><p>{guest.email}</p><p>{guest.days.map(registrationDate).join(', ')}</p></section>)}<p>The result will show confirmed and waitlisted places per person and day. Confirmation is automatic when space is available.</p></>}
   {(error||message)&&<p role="alert">{error||message}</p>}<div className="wizard-actions"><button className="button button-secondary" type="button" onClick={onCancel}>Cancel</button><div>{step>0&&<button className="button button-secondary" type="button" onClick={()=>{setStep(step-1);setError('');}}>Back</button>}<button className="button">{pending?'Saving…':step<2?'Next':'Confirm registration'}</button></div></div>
  </fieldset></form>
 </dialog>;
}
