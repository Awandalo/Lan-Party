import {useId,useRef,useState} from 'react';
import {eventInputDate,resolveEventInput} from '../lib/event-date-input';
import type {EventDateInput} from '../lib/event-date-input';
import '../CSS/EventDateTimeInput_style.css';
const quarters=['00','15','30','45'];
export default function EventDateTimeInput({label,value,original,onChange}:{label:string;value:EventDateInput;original?:number;onChange:(value:EventDateInput)=>void}){
 const id=useId(),picker=useRef<HTMLInputElement>(null),[touched,setTouched]=useState(false),[pickerHint,setPickerHint]=useState('');
 let error='';try{resolveEventInput(value,original);}catch(e){error=(e as Error).message;}
 const saved=original===undefined?null:new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(original*1000));
 const legacy=original!==undefined&&original%900!==0;
 const props={'aria-invalid':touched&&!!error,'aria-describedby':id,onBlur:()=>setTouched(true),onInvalid:()=>setTouched(true)};
 return <fieldset className="event-date-time"><legend>{label} (Netherlands time)</legend><div className="event-date-controls">
  <label className="event-date-text">Date (DD/MM/YYYY)<input {...props} required type="text" placeholder="DD/MM/YYYY" maxLength={10} pattern="[0-9]{2}/[0-9]{2}/20[0-9]{2}" value={value.date} onChange={e=>onChange({...value,date:e.target.value})}/></label>
  <span className="event-calendar"><button type="button" className="button button-secondary" aria-label={`Choose ${label.toLowerCase()} date`} onClick={()=>{try{if(!picker.current?.showPicker)throw Error();picker.current.showPicker();}catch{setPickerHint('Enter the date as DD/MM/YYYY in the date field.');}}}>Calendar</button><input ref={picker} type="date" tabIndex={-1} aria-hidden="true" min="2000-01-01" max="2099-12-31" value={eventInputDate(value.date)??''} onChange={e=>{const [y,m,d]=e.target.value.split('-');if(y&&m&&d)onChange({...value,date:`${d}/${m}/${y}`});}}/></span>
  <label>Hour<select {...props} required aria-label={`${label} hour`} value={value.hour} onChange={e=>onChange({...value,hour:e.target.value})}><option value="">HH</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(hour=><option key={hour}>{hour}</option>)}</select></label>
  <label>Minute<select {...props} required aria-label={`${label} minute`} value={value.minute} onChange={e=>onChange({...value,minute:e.target.value})}><option value="">MM</option>{value.minute&&!quarters.includes(value.minute)&&<option disabled value={value.minute}>{value.minute} (saved)</option>}{quarters.map(minute=><option key={minute}>{minute}</option>)}</select></label>
 </div><div id={id}>{legacy&&<p className="event-time-hint">Saved time {saved} is preserved exactly while unchanged. To change it, choose quarter-hour minutes; seconds will be 00.</p>}{pickerHint&&<p>{pickerHint}</p>}{touched&&error&&<p role="alert">{error}</p>}</div></fieldset>;
}
