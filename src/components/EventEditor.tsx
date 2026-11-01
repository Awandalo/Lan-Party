import {useEffect,useId,useRef,useState} from 'react';
import {Link} from 'react-router';
import type {ManagedEvent} from '../lib/event-management';
import type {LocationRow} from '../lib/locations';
import {locationComplete} from '../lib/locations';
import {useAdministration} from '../lib/administration';
import {eventDates,eventInstant,eventLocalTime} from '../lib/event-time';
import EventDescription from './EventDescription';

export default function EventEditor({row,duplicate,templates,pending,message,onSave,onCancel}:{row:ManagedEvent|null;duplicate:boolean;templates:LocationRow[];pending:boolean;message:string;onSave:(body:object)=>Promise<void>;onCancel:()=>void}){
 const creating=!row||duplicate,access=useAdministration(),dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null),stepHeading=useRef<HTMLHeadingElement>(null),heading=useId();
 const [review,setReview]=useState(false),[title,setTitle]=useState(duplicate?'':row?.title??''),[description,setDescription]=useState(row?.description??'');
 const [start,setStart]=useState(!duplicate&&row?.startsAt?eventLocalTime(row.startsAt):''),[end,setEnd]=useState(!duplicate&&row?.endsAt?eventLocalTime(row.endsAt):'');
 const [locationId,setLocationId]=useState(''),[finance,setFinance]=useState(!!row?.financeEnabled),[maxGuests,setMaxGuests]=useState(String(row?.maxGuests||1)),[validation,setValidation]=useState('');
 const template=templates.find(t=>t.id===locationId),snapshot=row?.venue??template,capacity=row?.capacity??template?.capacity,rental=row?.rentalCents??template?.rentalCents;
 const starts=eventInstant(start),ends=eventInstant(end);
 let dates:string[]=[];try{if(starts!==null&&ends!==null)dates=eventDates(starts,ends);}catch{/* The form explains invalid ranges on review/save. */}
 useEffect(()=>{const trigger=document.activeElement;dialog.current?.showModal();return()=>{if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();};},[]);
 useEffect(()=>{stepHeading.current?.focus();},[review]);
 function payload(){
  if(!title.trim()||starts===null||ends===null)throw Error('Enter a name and valid Netherlands start/end times. Ambiguous or nonexistent daylight-saving times must be changed.');
  const selected=eventDates(starts,ends);
  if(row&&!duplicate&&JSON.stringify(selected)!==JSON.stringify(row.days.map(d=>d.date)))throw Error('Attendance days are locked. Create a new event to change its calendar range.');
  if(!row&&(!template||!locationComplete(template)))throw Error('Choose a completed Location with an address and positive capacity.');
  const limit=Number(maxGuests);if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Use a guest limit between 1 and 20.');
  return {action:duplicate?'duplicate':row?'update':'create',...(row?duplicate?{sourceId:row.id,sourceRevision:row.revision}:{id:row.id,revision:row.revision}:{locationId,locationRevision:template!.revision}),title,description,startsAt:starts,endsAt:ends,financeEnabled:finance,maxGuests:limit};
 }
 async function submit(e:React.SubmitEvent){
  e.preventDefault();if(!form.current?.reportValidity())return;
  try{const body=payload();setValidation('');if(creating&&!review){setReview(true);return;}await onSave(body);}catch(error){setValidation((error as Error).message);}
 }
 const venuePreview=snapshot&&<section className="event-snapshot" aria-label="Copied venue preview"><h4>{snapshot.name}</h4><p>{[snapshot.addressLine,snapshot.postalCode,snapshot.city,snapshot.countryCode].filter(Boolean).join(', ')}</p><p>{capacity??'Not set'} places each day · Venue rental €{((rental??0)/100).toFixed(2)}</p>{snapshot.instructions&&<p className="event-instructions">{snapshot.instructions}</p>}<p>{snapshot.directionsUrl||'Directions use the copied venue address.'}</p></section>;
 return <dialog ref={dialog} className="event-dialog role-wizard" aria-labelledby={heading} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}>
  <div className="wizard-heading"><h2 id={heading}>{duplicate?'Duplicate event':creating?'Create Draft':'Edit Draft'}</h2><button type="button" disabled={pending} className="text-action" aria-label="Close event editor" onClick={onCancel}>✕</button></div>
  {creating&&<ol className="wizard-steps" aria-label="Create event progress">{['Event details','Review & Create'].map((s,i)=><li key={s} aria-current={Number(review)===i?'step':undefined}><span>{i+1}</span>{s}</li>)}</ol>}
  <form ref={form} onSubmit={e=>void submit(e)}><fieldset disabled={pending}><legend className="visually-hidden">Event details</legend><h3 ref={stepHeading} tabIndex={-1}>{review?'Review & Create':'Event details'}</h3>
   {!review&&<>
    {!row?<><label className="event-description-input">Location template<select required value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Choose a completed Location</option>{templates.map(t=><option key={t.id} value={t.id} disabled={!locationComplete(t)}>{t.name}{!locationComplete(t)?' — complete address/capacity first':''}</option>)}</select></label><p>Complete the venue in {access.sections.includes('locations')?<Link to="/manage/locations">Locations</Link>:'Locations with an authorized location manager'} first. Its address, directions, instructions, rental and capacity will be copied when this event is created.</p></>:<p>The copied venue, rental and capacity are fixed. {duplicate?'This duplicate keeps the original event snapshot. To use a corrected template, create an event from Locations instead.':'Correct the Location and create a new event if its source information was wrong.'}</p>}
    {row&&venuePreview}
    <div className="event-fields"><label>Event name<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Start (Netherlands time)<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>End (Netherlands time)<input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    <p>Every calendar date from start through end is included. {creating?'The dates and copied capacity lock when you create the Draft.':'Time edits must stay within the same locked calendar dates.'}</p>
    {dates.length>0&&<p className="event-days-summary">Attendance: {dates.join(', ')} · {capacity??'Select a Location for capacity'}{capacity?' places each day':''}</p>}
    <label className="event-description-input">Event description<textarea rows={5} maxLength={8000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <p>Formatting: # heading, **bold**, *italic*, - list, 1. numbered list, [label](https://example.com). HTML displays as text.</p><details><summary>Preview description</summary><EventDescription source={description}/></details>
    <details><summary>Event options</summary><div className="event-fields"><label><input type="checkbox" checked={finance} onChange={e=>setFinance(e.target.checked)}/>Enable Finance</label><label>Maximum invited guests per member<input required type="number" min={1} max={20} value={maxGuests} onChange={e=>setMaxGuests(e.target.value)}/></label></div></details><p>Only logged-in members can invite accountless guests. Others need their own account.</p>
   </>}
   {review&&<><p>Review before creating. Venue details, rental, common capacity and calendar days cannot be changed afterwards. Registration stays closed.</p><h4>{title}</h4><p>{start} — {end} (Netherlands time)</p><p>Attendance: {dates.join(', ')}</p>{venuePreview}<EventDescription source={description}/><p>Finance {finance?'enabled':'disabled'} · Up to {maxGuests} member-invited guests</p></>}
   <p role="alert">{validation||message}</p><div className="wizard-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><div>{review&&<button type="button" className="button button-secondary" onClick={()=>{setReview(false);setValidation('');}}>Back</button>}<button className="button" disabled={pending}>{pending?'Saving…':creating?review?'Create Draft':'Review':'Save changes'}</button></div></div>
  </fieldset></form>
 </dialog>;
}
