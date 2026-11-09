import {euro,euroAmount,euroCents} from '../lib/currency';
import {useEffect,useId,useRef,useState} from 'react';
import {locationDirections} from '../lib/locations';
import type {LocationRow} from '../lib/locations';
export default function LocationEditor({row,creating,pending,message,onSave,onCancel}:{row:LocationRow;creating:boolean;pending:boolean;message:string;onSave:(body:object)=>Promise<void>;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),form=useRef<HTMLFormElement>(null),stepHeading=useRef<HTMLHeadingElement>(null),heading=useId();
 const [step,setStep]=useState(0),steps=['Location details','Additional information','Review & Create'];
 const [draft,setDraft]=useState({...row,capacity:row.capacity===null?'':String(row.capacity),rental:euroAmount(row.rentalCents)});
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{if(creating)stepHeading.current?.focus();},[creating,step]);
 const [validation,setValidation]=useState('');
 const stringField=(key:'name'|'addressLine'|'postalCode'|'city'|'countryCode'|'directionsUrl',label:string,max:number,required=false)=><label>{label}<input required={required} maxLength={max} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 const directions=locationDirections(draft);
 function rentalAmount(){
  if(draft.directionsUrl&&!locationDirections(draft)){setValidation('Use an HTTPS Google Maps link, or leave the override empty.');return null;}
  try{return euroCents(draft.rental.trim()||'0');}catch(error){setValidation((error as Error).message);return null;}
 }
 function next(){
  if(!form.current?.reportValidity())return;
  if(!draft.name.trim()){setValidation('Enter a location name.');return;}
  if(step===1&&rentalAmount()===null)return;
  setValidation('');setStep(step+1);
 }
 async function submit(e:React.SubmitEvent){
  e.preventDefault();
  if(creating&&step<2){next();return;}
  if(!draft.name.trim()){setValidation('Enter a location name.');return;}
  const rentalCents=rentalAmount();if(rentalCents===null)return;
  setValidation('');
  await onSave({action:creating?'create':'update',...(creating?{}:{id:row.id,revision:row.revision}),name:draft.name,addressLine:draft.addressLine??'',postalCode:draft.postalCode??'',city:draft.city??'',countryCode:(draft.countryCode??'').toUpperCase(),instructions:draft.instructions??'',directionsUrl:draft.directionsUrl??'',capacity:draft.capacity===''?null:Number(draft.capacity),rentalCents});
 }
 return <dialog className="location-dialog role-wizard" ref={dialog} aria-labelledby={heading} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}>
 <div className="wizard-heading"><div><p className="eyebrow">A place for your next LAN</p><h2 id={heading}>{creating?'Add location':'Edit location'}</h2></div><button type="button" className="text-action" aria-label="Close location editor" disabled={pending} onClick={onCancel}>✕</button></div>
 {creating&&<ol className="wizard-steps" aria-label="Create location progress">{steps.map((label,index)=><li key={label} aria-current={step===index?'step':undefined}><span>{index+1}</span>{label}</li>)}</ol>}
 <form ref={form} onSubmit={e=>void submit(e)}><fieldset disabled={pending}><legend className="visually-hidden">Location details</legend>
 {creating&&<h3 ref={stepHeading} tabIndex={-1}>{steps[step]}</h3>}
 {(!creating||step===0)&&<><p>Only the name is required. Complete the address and capacity before using this venue in an event.</p>
 <div className="location-fields">{stringField('name','Location name',120,true)}{stringField('addressLine','Street and number',200)}{stringField('postalCode','Postal code',30)}{stringField('city','City',100)}{stringField('countryCode','Country code (for example NL)',2)}
 <label>Capacity<input type="number" min="1" max="100000" step="1" value={draft.capacity} onChange={e=>setDraft({...draft,capacity:e.target.value})}/></label></div></>}
 {(!creating||step===1)&&<div className="location-fields"><label>Default venue rental (€)<input inputMode="decimal" value={draft.rental} onChange={e=>setDraft({...draft,rental:e.target.value})}/></label>
 {stringField('directionsUrl','Google Maps link (optional override)',2048)}
 <label className="location-wide">Description and practical instructions<textarea rows={5} maxLength={8000} value={draft.instructions??''} onChange={e=>setDraft({...draft,instructions:e.target.value})}/></label></div>}
 {creating&&step===2&&<div className="location-review"><p>Review this template before creating it. You can complete optional details later.</p><dl><dt>Location name</dt><dd>{draft.name.trim()}</dd><dt>Address</dt><dd>{[draft.addressLine,draft.postalCode,draft.city,draft.countryCode?.toUpperCase()].filter(Boolean).join(', ')||'Not set'}</dd><dt>Capacity</dt><dd>{draft.capacity||'Not set'}</dd><dt>Default venue rental</dt><dd>{euro(euroCents(draft.rental.trim()||'0'))}</dd><dt>Practical instructions</dt><dd className="location-instructions">{draft.instructions||'Not set'}</dd></dl></div>}
 {directions&&(!creating||step>0)&&<a href={directions} target="_blank" rel="noreferrer">Preview directions in Google Maps ↗</a>}
 <p role="alert">{validation||message}</p><div className="wizard-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><div>{creating&&step>0&&<button type="button" className="button button-secondary" onClick={()=>{setValidation('');setStep(step-1);}}>Back</button>}{creating&&step<2?<button type="submit" className="button">Next</button>:<button className="button" disabled={pending}>{pending?'Saving…':creating?'Create location':'Save changes'}</button>}</div></div></fieldset></form>
 </dialog>;
}
