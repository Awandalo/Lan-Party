import SwitchInput from './SwitchInput';
import MemberBillGroup from './MemberBillGroup';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../lib/auth';
import {financeRequest,euro} from '../lib/event-finance';
import type {FinanceData} from '../lib/event-finance';
import './EventFinance.css';

function FinalizeDialog({title,pending,message,onCancel,onConfirm,onReload}:{title:string;pending:boolean;message:string;onCancel:()=>void;onConfirm:()=>void;onReload:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[name,setName]=useState('');useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="role-wizard finance-confirm" aria-labelledby="finalize-title" onCancel={e=>{if(pending)e.preventDefault();}} onClose={onCancel}><div className="wizard-heading"><h2 id="finalize-title">Permanently close event</h2><button className="text-action" aria-label="Cancel permanent closure" disabled={pending} onClick={onCancel}>✕</button></div><p>This locks attendance, Pay/Free, payment instructions, the daily rate and every bill. The event cannot be reopened or repriced. No payment emails will be sent.</p><form onSubmit={e=>{e.preventDefault();if(name===title)onConfirm();}}><fieldset disabled={pending}><label>Type {title} to confirm<input required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></label><label className="finance-ack"><SwitchInput required/><span>I reviewed attendance and bills. Closure is permanent.</span></label>{message&&<><p role="alert">{message}</p><button type="button" className="button button-secondary" onClick={onReload}>Reload latest review</button></>}<div className="wizard-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Keep reviewing</button><button className="button" disabled={name!==title}>{pending?'Closing…':'Permanently close event'}</button></div></fieldset></form></dialog>;
}
export default function EventFinance({id,title,onChange}:{id:string;title:string;onChange:()=>void}){
 const auth=useAuth(),proof=auth.status==='ready'&&auth.administration?.status==='ready'?auth.session?.csrfToken:undefined,context=id+':'+proof+':'+auth.administration?.revision;
 const current=useRef(context);current.current=context;
 const [state,setState]=useState<{context:string;data:FinanceData}|null>(null),[retry,setRetry]=useState(0),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(false),[pending,setPending]=useState(false);
 const data=state?.context===context?state.data:null;
 useEffect(()=>{setConfirm(false);if(!proof)return;const controller=new AbortController();financeRequest<FinanceData>(id,proof,true,undefined,controller.signal).then(data=>{if(!controller.signal.aborted){setState({context,data});setMessage('');}}).catch(e=>{if(!controller.signal.aborted){setState(null);setMessage(e.message);}});return()=>controller.abort();},[context,id,proof,retry]);
 async function finalize(){if(!proof||!data||pending)return;const captured=context;setPending(true);setMessage('');try{await financeRequest(id,proof,true,{action:'finalize',revision:data.revision,confirmation:title});if(current.current!==captured)return;setConfirm(false);setRetry(n=>n+1);onChange();}catch(e){if(current.current===captured)setMessage((e as Error).message);}finally{setPending(false);}}
 if(!data)return <section><h3>Finance</h3><p role="status">{message||'Loading finalization review…'}</p>{message&&<button className="button button-secondary" onClick={()=>setRetry(n=>n+1)}>Check again</button>}</section>;
 const allowed=data.ended&&!data.open&&data.participantDays>0;
 return <section className="event-finance"><h3>{data.finalized?'Event permanently closed':'Review & close event'}</h3>{data.finalized?<p>Finalized {new Date(data.closedAt!*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})}. Attendance and bills are locked. Payment remains manual.</p>:<p>Review the final attendance and bills below. Only permanent closure makes these bills available to members. Closing sends no emails.</p>}
 <dl className="finance-totals"><div><dt>Venue rental</dt><dd>{euro(data.rentalCents)}</dd></div><div><dt>Retained participant-days</dt><dd>{data.participantDays}</dd></div><div><dt>{data.finalized?'Locked daily price':'Daily price on closure'}</dt><dd>{euro(data.dailyRateCents)}</dd></div></dl>
 <p>The daily price is rounded up to the next €0.50. Complimentary days stay in the divisor; their share is covered by the organization.</p><p>Only retained attendance from accounts present at closure is included. Deleting an account after closure does not change the locked price or totals.</p>
 <div className="finance-bills">{data.bills.map((bill,i)=><MemberBillGroup key={bill.id??bill.owner??i} bill={bill} dailyRateCents={data.dailyRateCents} finalized={data.finalized}/>)}</div>
 {!data.bills.length&&<p>No member bills.</p>}{!data.finalized&&<><p>{!data.ended?'Wait until the event has ended before closing.':data.open?'Close registration in Participants before finalizing.':!data.participantDays?'Retain at least one participant-day before finalizing.':'Ready for permanent closure after your review.'}</p><button className="button" disabled={!allowed||pending} onClick={()=>{setMessage('');setConfirm(true);}}>Review permanent closure</button></>}
 {message&&!confirm&&<p role="alert">{message}</p>}{confirm&&<FinalizeDialog title={title} pending={pending} message={message} onCancel={()=>{if(!pending)setConfirm(false);}} onConfirm={()=>void finalize()} onReload={()=>{setConfirm(false);setRetry(n=>n+1);}}/>}
 </section>;
}
