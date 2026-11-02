import {lazy,Suspense,useEffect,useId,useRef,useState} from 'react';
import {Link} from 'react-router';
import type {ManagedEvent} from '../lib/event-management';
import type {LocationRow} from '../lib/locations';
import {locationComplete} from '../lib/locations';
import {useAdministration} from '../lib/administration';
import {eventDates} from '../lib/event-time';
import {eventInputFromInstant,resolveEventInput} from '../lib/event-date-input';
import EventDateTimeInput from './EventDateTimeInput';
import {eventDocument,validateEventDocument} from '../lib/event-document';
import EventDescription from './EventDescription';
const RichTextEditor=lazy(()=>import('./EventRichTextEditor'));

export default function EventEditor({row,duplicate,templates,pending,message,onSave,onCancel}:{row:ManagedEvent|null;duplicate:boolean;templates:LocationRow[];pending:boolean;message:string;onSave:(body:object)=>Promise<void>;onCancel:()=>void}){
 const creating=!row||duplicate,access=useAdministration(),dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null),stepHeading=useRef<HTMLHeadingElement>(null),heading=useId();
 const [step,setStep]=useState(0),[title,setTitle]=useState(duplicate?'':row?.title??''),[description,setDescription]=useState(()=>eventDocument(row?.description??''));
 const originalStart=!duplicate?row?.startsAt??undefined:undefined,originalEnd=!duplicate?row?.endsAt??undefined:undefined;
 const [start,setStart]=useState(()=>eventInputFromInstant(originalStart)),[end,setEnd]=useState(()=>eventInputFromInstant(originalEnd));
 const [locationId,setLocationId]=useState(''),[maxGuests,setMaxGuests]=useState(String(row?.maxGuests||1)),[minimum,setMinimum]=useState(String(row?.minimumParticipants||1)),[validation,setValidation]=useState('');
 const template=templates.find(t=>t.id===locationId),snapshot=row?.venue??template,capacity=row?.capacity??template?.capacity,rental=row?.rentalCents??template?.rentalCents;
 function times(){let starts:number,ends:number;try{starts=resolveEventInput(start,originalStart);}catch(e){throw Error('Start: '+(e as Error).message);}try{ends=resolveEventInput(end,originalEnd);}catch(e){throw Error('End: '+(e as Error).message);}return {starts,ends};}
 let starts:number|null=null,ends:number|null=null;try{({starts,ends}=times());}catch{/* Show field errors before advancing. */}
 let dates:string[]=[];try{if(starts!==null&&ends!==null)dates=eventDates(starts,ends);}catch{/* Explain invalid ranges before advancing. */}
 useEffect(()=>{const trigger=document.activeElement;dialog.current?.showModal();return()=>{if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();};},[]);
 useEffect(()=>{stepHeading.current?.focus();},[step]);
 function payload(){
  if(!title.trim())throw Error('Enter an event name.');
  const {starts,ends}=times();
  const selected=eventDates(starts,ends);
  if(row&&!duplicate&&row.registrationHistory&&JSON.stringify(selected)!==JSON.stringify(row.days.map(d=>d.date)))throw Error('Attendance dates are locked because this event has registration history.');
  if(!row&&(!template||!locationComplete(template)))throw Error('Choose a completed Location with an address and positive capacity.');
  const limit=Number(maxGuests),minimumParticipants=Number(minimum);if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Use a guest limit between 1 and 20.');
  if(!Number.isInteger(minimumParticipants)||minimumParticipants<1||minimumParticipants>100000)throw Error('Use a minimum participant headcount between 1 and 100,000.');
  return {action:duplicate?'duplicate':row?'update':'create',...(row?duplicate?{sourceId:row.id,sourceRevision:row.revision}:{id:row.id,revision:row.revision}:{locationId,locationRevision:template!.revision}),title,description:validateEventDocument(description),startsAt:starts,endsAt:ends,minimumParticipants,maxGuests:limit};
 }
 async function submit(e:React.SubmitEvent){e.preventDefault();if(!form.current?.reportValidity())return;try{const body=payload();setValidation('');if(step<2){setStep(n=>n+1);return;}await onSave(body);}catch(error){setValidation((error as Error).message);}}
 const venuePreview=snapshot&&<section className="event-snapshot" aria-label="Copied venue preview"><h4>{snapshot.name}</h4><p>{[snapshot.addressLine,snapshot.postalCode,snapshot.city,snapshot.countryCode].filter(Boolean).join(', ')}</p><p>{capacity??'Not set'} places each day · Venue rental €{((rental??0)/100).toFixed(2)}</p>{snapshot.instructions&&<p className="event-instructions">{snapshot.instructions}</p>}<p>{snapshot.directionsUrl||'Directions use the copied venue address.'}</p></section>;
 const steps=['Event details','Attendance & guests','Review & '+(creating?'Create':'Save')];
 return <dialog ref={dialog} className="event-dialog role-wizard" aria-labelledby={heading} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}>
  <div className="wizard-heading"><h2 id={heading}>{duplicate?'Duplicate event':creating?'Create Draft':row?.status==='published'?'Edit event':'Edit Draft'}</h2><button type="button" disabled={pending} className="text-action" aria-label="Close event editor" onClick={onCancel}>✕</button></div>
  <ol className="wizard-steps" aria-label="Event progress">{steps.map((label,i)=><li key={label} aria-current={step===i?'step':undefined}><span>{i+1}</span>{label}</li>)}</ol>
  <form ref={form} onSubmit={e=>void submit(e)}><fieldset disabled={pending}><legend className="visually-hidden">Event details</legend><h3 ref={stepHeading} tabIndex={-1}>{steps[step]}</h3>
   {step===0&&<>
    {!row?<><label className="event-description-input">Location template<select required value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Choose a completed Location</option>{templates.map(t=><option key={t.id} value={t.id} disabled={!locationComplete(t)}>{t.name}{!locationComplete(t)?' — complete address/capacity first':''}</option>)}</select></label><p>Complete the venue in {access.sections.includes('locations')?<Link to="/manage/locations">Locations</Link>:'Locations with an authorized location manager'} first. Its address, directions, instructions, rental and capacity are copied when this event is created.</p></>:null}
    <div className="event-fields"><label>Event name<input required maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label></div><div className="event-date-pair"><EventDateTimeInput label="Start" value={start} original={originalStart} onChange={setStart}/><EventDateTimeInput label="End" value={end} original={originalEnd} onChange={setEnd}/></div>
    <p>All calendar dates from start through end are included. {row?.registrationHistory?'Dates are locked by registration history.':'Dates can be corrected until the first registration.'}</p>
    {dates.length>0&&<p className="event-days-summary">Attendance: {dates.join(', ')} · {capacity??'Choose a Location for capacity'}{capacity?' places each day':''}</p>}
    <h4>Event description</h4><Suspense fallback={<p role="status">Loading description editor…</p>}><RichTextEditor value={description} disabled={pending} onChange={setDescription}/></Suspense>
   </>}
   {step===1&&<><div className="event-fields"><label>Maximum invited guests per member<input required type="number" min={1} max={20} value={maxGuests} onChange={e=>setMaxGuests(e.target.value)}/></label><label>Minimum participants<input required type="number" min={1} max={100000} value={minimum} onChange={e=>setMinimum(e.target.value)}/></label></div><p>The minimum is the organizer's target headcount for the whole event. It never cancels or closes an event automatically.</p><p>Only logged-in members can invite accountless guests. Others need their own account.</p></>}
   {step===2&&<><p>Review before {creating?'creating':'saving'}. Registration stays closed. Copied venue, rental and capacity remain fixed.</p><h4>{title}</h4><p>{start.date} {start.hour}:{start.minute} — {end.date} {end.hour}:{end.minute} (Netherlands time)</p><p>Attendance: {dates.join(', ')}</p>{venuePreview}<EventDescription source={JSON.stringify(description)}/><p>Minimum participants: {minimum} · Up to {maxGuests} member-invited guests</p></>}
   {(validation||message)&&<p role="alert">{validation||message}</p>}<div className="wizard-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><div>{step>0&&<button type="button" className="button button-secondary" onClick={()=>{setStep(n=>n-1);setValidation('');}}>Back</button>}<button className="button" disabled={pending}>{pending?'Saving…':step<2?'Next':creating?'Create Draft':'Save changes'}</button></div></div>
  </fieldset></form>
 </dialog>;
}