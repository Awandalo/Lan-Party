import BillCalculationHelp from './BillCalculationHelp';
import SwitchInput from './SwitchInput';
import MemberBillGroup from './MemberBillGroup';
import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../lib/auth';
import {financeRequest,euro,filterBillsByPayment} from '../lib/event-finance';
import type {FinanceData,BillPaymentFilter} from '../lib/event-finance';
import './EventFinance.css';

function FinalizeConfirmation({pending,message,onConfirm,onReload}:{pending:boolean;message:string;onConfirm:()=>void;onReload:()=>void}){
 const [acknowledged,setAcknowledged]=useState(false);
 return <form className="finance-final-confirm" onSubmit={e=>{e.preventDefault();if(acknowledged)onConfirm();}}><fieldset disabled={pending}><h3>Finalize event & publish bills</h3><p>This permanently locks attendance, Free attendance, payment instructions, the daily price and bill amounts. Members will see their own final bill. You can still record and correct payment status afterwards. No emails will be sent.</p><label className="finance-ack"><SwitchInput required checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>I reviewed attendance and bills. Finalization is permanent.</span></label>{message&&<><p role="alert">{message}</p><button type="button" className="button button-secondary" onClick={onReload}>Reload latest review</button></>}<button className="button" disabled={!acknowledged}>{pending?'Finalizing…':'Finalize event & publish bills'}</button></fieldset></form>;
}
export default function EventFinance({id,title,onChange,mode='browse',onFinished,onBusyChange,initial,revision,load}:{id:string;title:string;onChange:()=>void;mode?:'browse'|'preview'|'confirm';initial?:FinanceData;load?:(signal:AbortSignal,force?:boolean)=>Promise<FinanceData>;revision?:number|null;onFinished?:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const auth=useAuth(),proof=auth.status==='ready'&&auth.administration?.status==='ready'?auth.session?.csrfToken:undefined,context=JSON.stringify([id,proof,auth.session?.account.userId,auth.administration?.revision,auth.administration?.authorization,auth.administration?.sections,revision]);
 const reader=useRef(load);reader.current=load;
 const current=useRef(context);current.current=context;
 const [state,setState]=useState<{context:string;data:FinanceData}|null>(()=>initial?{context,data:initial}:null),[retry,setRetry]=useState(0),[message,setMessage]=useState(''),[saving,setPending]=useState(false),[refreshing,setRefreshing]=useState(true);
 const [paymentFilter,setPaymentFilter]=useState<BillPaymentFilter>('all');
 const data=state?.context===context?state.data:null,pending=saving||refreshing;
 useEffect(()=>{onBusyChange?.(pending);return()=>onBusyChange?.(false);},[pending,onBusyChange]);
 useEffect(()=>{if(!proof)return;const controller=new AbortController();setRefreshing(true);(reader.current?reader.current(controller.signal,retry>0):financeRequest<FinanceData>(id,proof,true,undefined,controller.signal)).then(data=>{if(!controller.signal.aborted){setRefreshing(false);setState({context,data});setMessage('');}}).catch(e=>{if(!controller.signal.aborted){setRefreshing(false);setState(null);setMessage(e.message);}});return()=>controller.abort();},[context,id,proof,retry]);
 async function mutate(body:object,finished=false){if(!proof||!data||pending)return;const captured=context;setPending(true);setMessage('');try{await financeRequest(id,proof,true,{...body,revision:data.revision});if(current.current!==captured)return;const latest=await financeRequest<FinanceData>(id,proof,true);if(current.current!==captured)return;setState({context,data:latest});onChange();if(finished)onFinished?.();}catch(e){if(current.current===captured)setMessage((e as Error).message);}finally{setPending(false);}}
 if(!data)return <section><h3>Finance</h3><p role="status">{message||'Loading bills…'}</p>{message&&<button className="button button-secondary" onClick={()=>setRetry(n=>n+1)}>Check again</button>}</section>;
 const activeFilter=data.finalized?paymentFilter:'all',bills=filterBillsByPayment(data.bills,activeFilter);
 const allowed=data.ended&&!data.open&&data.participantDays>0;
 return <section className="event-finance" aria-busy={refreshing}>{refreshing&&<p className="event-panel-refresh" role="status">Updating bills…</p>}<div className="finance-heading"><h3>{data.finalized?'Final bills & payments':'Bill preview'}</h3><BillCalculationHelp/></div>{data.finalized?<p>Finalized {new Date(data.closedAt!*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})}. Attendance and amounts are locked. Payment is recorded manually.</p>:<p>These are draft amounts. Finish the event to lock the calculation and publish members’ bills.</p>}
 <dl className="finance-totals"><div><dt>Venue rental</dt><dd>{euro(data.rentalCents)}</dd></div><div><dt>Retained participant-days</dt><dd>{data.participantDays}</dd></div><div><dt>{data.finalized?'Locked daily price':'Estimated daily price'}</dt><dd>{euro(data.dailyRateCents)}</dd></div></dl>
 <div className="finance-payment-filters" role="group" aria-label="Filter bills by payment status">{(['all','paid','unpaid'] as const).map(filter=><button key={filter} type="button" className="button button-secondary" aria-pressed={activeFilter===filter} disabled={!data.finalized&&filter!=='all'} title={!data.finalized&&filter!=='all'?'Available after finalization':undefined} onClick={()=>setPaymentFilter(filter)}>{filter==='all'?'All':filter==='paid'?'Paid':'Unpaid'}{(data.finalized||filter==='all')&&' ('+filterBillsByPayment(data.bills,filter).length+')'}</button>)}</div>
 <p role="status">{bills.length} of {data.bills.length} bills{!data.finalized?' · Payment filters unlock after finalization.':''}</p>
 <div className="finance-bills">{bills.map((bill,i)=><MemberBillGroup key={bill.id??bill.owner??i} bill={bill} dailyRateCents={data.dailyRateCents} finalized={data.finalized} paymentPending={pending} onPaymentChange={data.finalized&&data.canManagePayments&&bill.id&&bill.owner!==null&&bill.totalCents>0?(paid)=>void mutate({action:'payment',billId:bill.id,paid}):undefined}/>)}</div>
 {!bills.length&&<p>{data.bills.length?'No bills match this payment filter.':'No member bills.'}</p>}
 {!data.finalized&&mode==='confirm'&&(allowed?<FinalizeConfirmation pending={pending} message={message} onConfirm={()=>void mutate({action:'finalize',confirmation:title},true)} onReload={()=>setRetry(n=>n+1)}/>:<p role="alert">The event is not ready. Go back to review attendance and close registration before finalizing.</p>)}
 {message&&mode!=='confirm'&&<><p role="alert">{message}</p><button className="button button-secondary" disabled={pending} onClick={()=>setRetry(n=>n+1)}>Reload latest bills</button></>}
 </section>;
}
