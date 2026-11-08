import PaymentInfoButton from './PaymentInfoButton';
import {euro} from '../lib/currency';
import PaymentRequestHelp from './PaymentRequestHelp';
import {paymentRequestProviders} from '../lib/payment-request';
import AttendanceTimeline from './AttendanceTimeline';
import {useEffect,useId,useRef,useState} from 'react';
import {useAuth} from '../lib/auth';
import {registrationRequest} from '../lib/event-registration-api';
import {eventReviewRequest} from '../lib/event-review';
import type {EventReviewData,ReviewPerson} from '../lib/event-review';
import {registrationDate} from '../lib/event-registration';
import RegistrationPersonCard from './RegistrationPersonCard';
import './EventAttendanceReview.css';

function ReviewDialog({person,finance,pending,message,onSave,onCancel,availableDays}:{person:ReviewPerson;availableDays:string[];finance:boolean;pending:boolean;message:string;onSave:(body:object)=>void;onCancel:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[days,setDays]=useState([...person.days]),[reason,setReason]=useState('');
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="role-wizard attendance-review-dialog" aria-labelledby="review-dialog-title" onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}>
  <div className="wizard-heading"><h2 id="review-dialog-title">{finance?(person.complimentary?'Set to Pay':'Make complimentary'):'Review attendance'} · {person.name}</h2><button type="button" className="text-action" aria-label="Close review" disabled={pending} onClick={onCancel}>✕</button></div>
  <form onSubmit={e=>{e.preventDefault();onSave({action:finance?'complimentary':'attendance',registrationId:person.registrationId,personId:person.id,...finance?{complimentary:!person.complimentary}:{days},reason});}}><fieldset disabled={pending}>
   {finance?<p>{person.complimentary?'This person will pay for their retained days.':'This person will pay €0. Their retained days still count toward the shared daily rate.'}</p>:<><p>Choose the days this person actually attended, including a missed day. Original registration history stays preserved. Guests are reviewed separately.</p><div className="registration-days">{availableDays.map(day=><label key={day}><input type="checkbox" checked={days.includes(day)} onChange={()=>setDays(current=>current.includes(day)?current.filter(d=>d!==day):availableDays.filter(d=>d===day||current.includes(d)))}/>{registrationDate(day)}</label>)}</div><button type="button" className="button button-secondary" onClick={()=>setDays([])}>Remove participant from attendance</button>{!days.length&&<p>No days retained. This person will be excluded from the final attendance divisor.</p>}</>}
   <label className="review-reason">Reason<input required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>{message&&<p role="alert">{message}</p>}
   <div className="wizard-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button">{pending?'Saving…':finance?'Save Pay/Free':'Save attendance'}</button></div>
  </fieldset></form>
 </dialog>;
}
function PaymentInstructions({id,data,pending,onSave,onDirty,onSent}:{id:string;data:EventReviewData;pending:boolean;onSent:()=>void;onSave:(body:object)=>void;onDirty?:(dirty:boolean)=>void}){
 const paymentLinkId=useId();
 const [url,setUrl]=useState(data.settings?.payment_url??''),[instructions,setInstructions]=useState(data.settings?.instructions??''),[reason,setReason]=useState('');
 useEffect(()=>{setUrl(data.settings?.payment_url??'');setInstructions(data.settings?.instructions??'');setReason('');},[data.revision,data.settings?.payment_url,data.settings?.instructions]);
 const changed=url!==(data.settings?.payment_url??'')||instructions!==(data.settings?.instructions??'');
 useEffect(()=>{onDirty?.(changed);},[changed,onDirty]);
 return <details open={!!onDirty||undefined} className="review-payment-settings"><summary>Payment instructions (optional)</summary><p>Leave both fields empty to arrange payment entirely outside the website. Anything saved here appears on members’ final bills.</p><form onSubmit={e=>{e.preventDefault();onSave({action:'instructions',paymentUrl:url,instructions,reason});}}><fieldset disabled={pending||data.finalized}><div className="payment-request-label"><label htmlFor={paymentLinkId}>Payment request URL (optional)</label><PaymentRequestHelp/></div><input id={paymentLinkId} type="url" maxLength={2048} placeholder="https://betaalverzoek.rabobank.nl/betaalverzoek/?id=…" value={url} onChange={e=>setUrl(e.target.value)}/><p className="payment-request-help">Supported: {paymentRequestProviders}. Paste the full shared link.</p><label>Bank transfer / payment instructions (optional)<textarea maxLength={2000} rows={4} value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Recipient, IBAN and payment reference"/></label>{changed&&<label>Reason for update<input required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>}</fieldset><div className="payment-instruction-actions"><button className="button" disabled={pending||data.finalized||!changed}>{pending?'Saving…':'Save payment instructions'}</button><PaymentInfoButton id={id} disabled={pending||changed||!data.finalized} onSent={onSent}/></div></form></details>;
}
export interface ReviewStepState {ready:boolean;busy:boolean;dirty:boolean}
export default function EventAttendanceReview({id,onChange,view='all',onStateChange,initial}:{id:string;onChange:()=>void;initial?:EventReviewData;view?:'all'|'attendance'|'instructions';onStateChange?:(state:ReviewStepState)=>void}){
 const auth=useAuth(),proof=auth.status==='ready'&&auth.administration?.status==='ready'?auth.session?.csrfToken:undefined,context=id+':'+proof+':'+auth.administration?.revision;
 const live=useRef(context);live.current=context;
 const reviewTrigger=useRef<HTMLButtonElement|null>(null);
 const [state,setState]=useState<{context:string;data:EventReviewData}|null>(()=>initial?{context,data:initial}:null),[retry,setRetry]=useState(0),[pending,setPending]=useState(false),[message,setMessage]=useState(''),[day,setDay]=useState<string|null>(null),[edit,setEdit]=useState<{person:ReviewPerson;finance:boolean}|null>(null);
 const initialRead=useRef({context,data:initial});
 const data=state?.context===context?state.data:null;
 const [dirty,setDirty]=useState(false);
 useEffect(()=>{onStateChange?.({ready:!!data&&data.ended&&!data.open&&!data.finalized,busy:pending||!!edit,dirty});},[data,pending,edit,dirty,onStateChange]);
 useEffect(()=>{if(!edit&&!pending&&reviewTrigger.current){reviewTrigger.current.focus({preventScroll:true});reviewTrigger.current=null;}},[edit,pending]);
 useEffect(()=>{if(!proof)return;if(retry===0&&initialRead.current.context===context&&initialRead.current.data)return;const controller=new AbortController();setEdit(null);eventReviewRequest(id,proof,undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setState({context,data});}).catch(e=>{if(!controller.signal.aborted){setState(null);setMessage(e.message);}});return()=>controller.abort();},[context,id,proof,retry]);
 async function save(body:object){if(!proof||!data||pending)return;const captured=context;setPending(true);setMessage('');try{await eventReviewRequest(id,proof,{...body,revision:data.revision});if(live.current!==captured)return;setEdit(null);setRetry(n=>n+1);setMessage('Review saved.');onChange();}catch(e){if(live.current===captured)setMessage((e as Error).message);}finally{setPending(false);}}
 async function closeRegistration(){if(!proof||!data||pending)return;const captured=context;setPending(true);setMessage('');try{await registrationRequest(id,proof,true,{action:'close',revision:data.revision});if(live.current!==captured)return;setRetry(n=>n+1);onChange();}catch(e){if(live.current===captured)setMessage((e as Error).message);}finally{setPending(false);}}
 if(!data)return <section><h3>Attendance review</h3><p role="status">{message||'Loading attendance review…'}</p>{message&&<button className="button button-secondary" onClick={()=>setRetry(n=>n+1)}>Check again</button>}</section>;
 const personDays=data.people.reduce((n,p)=>n+p.days.length,0),people=data.people.filter(p=>!day||p.confirmed.includes(day)||p.days.includes(day)),canReview=data.ended&&!data.open&&!data.finalized;
 return <section className="event-attendance-review">{view!=='instructions'&&<h3>Attendance review</h3>}{view!=='instructions'&&<p>Check who attended and correct their days or Free attendance. Closing registration here stops signups; bills are published only at the final confirmation.</p>}
  {view!=='instructions'&&<div className="review-totals"><span><strong>{data.people.filter(p=>p.days.length).length}</strong> retained participants</span><span><strong>{personDays}</strong> participant-days</span><span>Venue rental <strong>{euro(data.rentalCents)}</strong></span></div>}
  {data.finalized&&<p className="review-note">Event permanently finalized. Attendance, Pay/Free and payment instructions are locked.</p>}{!canReview&&!data.finalized&&<p className="review-note">Attendance can be corrected after the event ends and registration is closed.{data.ended&&data.open&&<> <button type="button" className="button button-secondary" disabled={pending} onClick={()=>void closeRegistration()}>Close registration for review</button></>}</p>}
  {view!=='attendance'&&(data.canFinance?<PaymentInstructions id={id} onSent={()=>{setRetry(n=>n+1);onChange();}} data={data} pending={pending} onSave={body=>void save(body)} onDirty={onStateChange?setDirty:undefined}/>:<p>Payment instructions are prepared by staff with Planner and Finance permissions. You can finalize using the saved instructions.</p>)}
  {view!=='instructions'&&<>
  <nav className="registration-crew-filters" aria-label="Review attendance day"><button className="button button-secondary" aria-pressed={!day} onClick={()=>setDay(null)}>All days</button>{data.days.map(date=><button key={date} className="button button-secondary" aria-pressed={day===date} onClick={()=>setDay(date)}>{registrationDate(date)} · {data.people.filter(p=>p.days.includes(date)).length}</button>)}</nav><p role="status">{message}</p>
  <div className="registration-member-grid">{people.map(person=><RegistrationPersonCard key={person.registrationId+person.id} name={person.name} kind={person.kind}>
   <AttendanceTimeline days={data.days} places={person.days.map(day=>({day,status:'confirmed' as const}))} confirmedLabel="Attended"/>{!person.days.length&&<p>Removed from attendance</p>}{!person.confirmed.length&&!person.days.length&&<p>No confirmed days · waitlisted only</p>}
   <div className="review-person-actions"><button className="button button-secondary" disabled={pending||!canReview} onClick={event=>{reviewTrigger.current=event.currentTarget;setMessage('');setEdit({person,finance:false});}}>Review days</button>{data.canFinance&&<button type="button" className="review-pay-switch" role="switch" aria-checked={person.complimentary??false} aria-label={'Free attendance for '+person.name} disabled={pending||data.finalized} onClick={event=>{reviewTrigger.current=event.currentTarget;setMessage('');setEdit({person,finance:true});}}><span aria-hidden="true"/>Free attendance</button>}</div>
  </RegistrationPersonCard>)}</div>
  <details className="review-history"><summary>Review history</summary>{(data.deletedAccounts>0||data.anonymousPeople>0)&&<article className="review-note"><h4>{data.deletedAccounts?(data.deletedAccounts===1?'Account no longer exists':data.deletedAccounts+' accounts no longer exist'):'Former participants'}</h4><p>{data.anonymousPeople} anonymous historical participants · {data.anonymousDays.reduce((n,d)=>n+d.total,0)} retained participant-days</p><ul>{data.anonymousDays.filter(d=>d.total>0).map(d=><li key={d.date}>{registrationDate(d.date)}: {d.total}</li>)}</ul></article>}{data.activity.length?<ul>{data.activity.map((entry,i)=><li key={i}><strong>{entry.action==='attendance'?'Attendance corrected':entry.action==='complimentary'?'Pay/Free changed':'Payment instructions updated'}{entry.personName&&' · '+entry.personName}</strong> · {new Date(entry.occurredAt*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})}<p>{entry.reason}</p></li>)}</ul>:<p>No review changes yet.</p>}</details>
  </>}
  {edit&&<ReviewDialog key={edit.person.registrationId+edit.person.id+String(edit.finance)} {...edit} availableDays={data.days} pending={pending} message={message} onSave={body=>void save(body)} onCancel={()=>{if(!pending)setEdit(null);}}/>}
 </section>;
}
