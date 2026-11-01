import {useEffect,useId,useRef,useState} from 'react';
import {locationDirections} from '../lib/locations';
import type {LocationRow} from '../lib/locations';
export default function LocationEditor({row,creating,pending,message,onSave,onCancel}:{row:LocationRow;creating:boolean;pending:boolean;message:string;onSave:(body:object)=>Promise<void>;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),heading=useId();
 const [draft,setDraft]=useState({...row,capacity:row.capacity===null?'':String(row.capacity),rental:(row.rentalCents/100).toFixed(2)});
 useEffect(()=>{dialog.current?.showModal();},[]);
 const [validation,setValidation]=useState('');
 const stringField=(key:'name'|'addressLine'|'postalCode'|'city'|'countryCode'|'directionsUrl',label:string,max:number,required=false)=><label>{label}<input required={required} maxLength={max} value={draft[key]??''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>;
 const directions=locationDirections(draft);
 async function submit(e:React.SubmitEvent){
  e.preventDefault();
  if(!draft.name.trim()){setValidation('Enter a location name.');return;}
  if(draft.directionsUrl&&!locationDirections(draft)){setValidation('Use an HTTPS Google Maps link, or leave the override empty.');return;}
  if(!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(draft.rental)){setValidation('Enter a nonnegative rental amount with at most two decimal places.');return;}
  const [whole,fraction='']=draft.rental.replace(',','.').split('.'),rentalCents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(rentalCents>100000000){setValidation('Default rental must be at most €1,000,000.');return;}
  setValidation('');
  await onSave({action:creating?'create':'update',...(creating?{}:{id:row.id,revision:row.revision}),name:draft.name,addressLine:draft.addressLine??'',postalCode:draft.postalCode??'',city:draft.city??'',countryCode:(draft.countryCode??'').toUpperCase(),instructions:draft.instructions??'',directionsUrl:draft.directionsUrl??'',capacity:draft.capacity===''?null:Number(draft.capacity),rentalCents});
 }
 return <dialog className="location-dialog role-wizard" ref={dialog} aria-labelledby={heading} onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}>
 <div className="wizard-heading"><div><p className="eyebrow">A place for your next LAN</p><h2 id={heading}>{creating?'Add location':'Edit location'}</h2></div><button type="button" className="text-action" aria-label="Close location editor" disabled={pending} onClick={onCancel}>✕</button></div>
 <form onSubmit={e=>void submit(e)}><fieldset disabled={pending}><legend className="visually-hidden">Location details</legend><p>Start with a name. Complete the address and capacity before using this venue in a published event.</p>
 <div className="location-fields">{stringField('name','Location name',120,true)}{stringField('addressLine','Street and number',200)}{stringField('postalCode','Postal code',30)}{stringField('city','City',100)}{stringField('countryCode','Country code (for example NL)',2)}
 <label>Capacity<input type="number" min="1" max="100000" step="1" value={draft.capacity} onChange={e=>setDraft({...draft,capacity:e.target.value})}/></label>
 <label>Default venue rental (€)<input inputMode="decimal" required value={draft.rental} onChange={e=>setDraft({...draft,rental:e.target.value})}/></label>
 {stringField('directionsUrl','Google Maps link (optional override)',2048)}
 <label className="location-wide">Description and practical instructions<textarea rows={5} maxLength={8000} value={draft.instructions??''} onChange={e=>setDraft({...draft,instructions:e.target.value})}/></label></div>
 {directions&&<a href={directions} target="_blank" rel="noreferrer">Preview directions in Google Maps ↗</a>}
 <p role="alert">{validation||message}</p><div className="wizard-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button" disabled={pending}>{pending?'Saving…':creating?'Create location':'Save changes'}</button></div></fieldset></form>
 </dialog>;
}
