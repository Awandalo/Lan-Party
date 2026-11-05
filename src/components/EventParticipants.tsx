import {loadParticipantAttendance} from '../lib/participant-attendance';
import {eventReviewRequest} from '../lib/event-review';
import MinimumAttendanceCounter from './MinimumAttendanceCounter';
import EventAttendanceReview from './EventAttendanceReview';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../lib/auth';
import RegistrationPersonCard from './RegistrationPersonCard';
import {registrationRequest} from '../lib/event-registration-api';
import type {RegistrationData} from '../lib/event-registration-api';
import {registrationDate} from '../lib/event-registration';
import '../CSS/EventRegistration_style.css';
import '../CSS/EventParticipants_style.css';
export default function EventParticipants({id,onChange,minimumParticipants}:{id:string;onChange:()=>void;minimumParticipants:number}){
 const auth=useAuth(),proof=auth.status==='ready'&&auth.administration?.status==='ready'?auth.session?.csrfToken:undefined,context=id+':'+proof+':'+auth.administration?.revision;
 const current=useRef(context);current.current=context;
 const [reviewing,setReviewing]=useState(false);
 const [state,setState]=useState<{context:string;data:RegistrationData}|null>(null),[retry,setRetry]=useState(0),[day,setDay]=useState<string|null>(null),[message,setMessage]=useState(''),[pending,setPending]=useState(false),[capacity,setCapacity]=useState('');
 const data=state?.context===context?state.data:null;
 useEffect(()=>{if(!proof)return;const controller=new AbortController();loadParticipantAttendance(()=>registrationRequest(id,proof,true,undefined,controller.signal),()=>eventReviewRequest(id,proof,undefined,controller.signal)).then(data=>{if(!controller.signal.aborted){setState({context,data});setCapacity(String(data.days[0]?.capacity??''));}}).catch(e=>{if(!controller.signal.aborted){setState(null);setMessage(e.message);}});return()=>controller.abort();},[context,id,proof,retry]);
 async function action(body:object){if(!proof||!data||pending)return;const captured=context;setPending(true);setMessage('');try{await registrationRequest(id,proof,true,{...body,revision:data.revision});if(current.current===captured){setState(null);setRetry(n=>n+1);onChange();}}catch(e){if(current.current===captured)setMessage((e as Error).message);}finally{setPending(false);}}
 const tabs=<div className="event-sections" role="group" aria-label="Participant views"><button className={!reviewing?'event-section-current':''} aria-pressed={!reviewing} onClick={()=>setReviewing(false)}>Registrations</button><button className={reviewing?'event-section-current':''} aria-pressed={reviewing} onClick={()=>setReviewing(true)}>Attendance review</button></div>;
 if(reviewing)return <>{tabs}<EventAttendanceReview id={id} onChange={()=>{setRetry(n=>n+1);onChange();}}/></>;
 if(!data)return <section><h3>Participants</h3><p role="status">{message||'Loading participants…'}</p><button className="button button-secondary" onClick={()=>setRetry(n=>n+1)}>Check again</button></section>;
 const people=(data.participants??[]).filter(p=>!day||p.places.some(x=>x.day===day));
 return <>{tabs}<section className="event-participants"><h3>Participants</h3><div className="participant-counters">{data.days.map(d=><button key={d.date} type="button" className={'participant-counter'+(day===d.date?' selected':'')} aria-pressed={day===d.date} onClick={()=>setDay(d.date)}><span className="participant-ring" style={{background:`conic-gradient(var(--accent) ${Math.min(100,d.confirmed/d.capacity*100)}%, var(--border) 0)`}}><span><strong>{d.confirmed}</strong><small>of {d.capacity}</small></span></span><strong>{registrationDate(d.date)}</strong><small>{d.waiting} waiting</small></button>)}<MinimumAttendanceCounter days={data.days} minimum={minimumParticipants} people={data.total??0} selected={!day} onSelect={()=>setDay(null)}/></div>
 <p>{data.attendanceReviewed&&<>Reviewed attendance is applied to these counts and dates. </>}One person attending every event day counts as 1 toward the minimum. Shorter stays count proportionally; confirmed guests count too.</p><div className="participant-controls">{!data.ended&&!data.cancelled&&<button className="button button-secondary" disabled={pending} onClick={()=>void action({action:data.open?'close':'open'})}>{data.open?'Close registration':'Reopen registration'}</button>}<label>Places per day<input type="number" min={1} max={100000} value={capacity} onChange={e=>setCapacity(e.target.value)}/></label><button className="button button-secondary" disabled={pending||data.cancelled||data.ended} onClick={()=>void action({action:'capacity',capacity:Number(capacity)})}>Update capacity</button></div><p role="status">{message}</p>
 <div className="registration-member-grid">{people.map(p=><RegistrationPersonCard key={p.owner+':'+p.id} name={p.name} kind={p.kind}>{p.places.filter(x=>!day||x.day===day).map(x=><p key={x.day} className="registration-result">{registrationDate(x.day)} <strong className={x.status}>{x.status==='confirmed'?'Confirmed':`Waitlisted · group ${x.position}`}</strong></p>)}</RegistrationPersonCard>)}</div>{!people.length&&<p>No registrations for {day?registrationDate(day):'this event'} yet.</p>}<button className="button button-secondary registration-show-all" aria-disabled={!day} onClick={()=>setDay(null)}>Show all days</button></section></>;
}
