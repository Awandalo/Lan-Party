import {useCallback,useEffect,useRef,useState} from 'react';
import EventAttendanceReview from './EventAttendanceReview';
import type {ReviewStepState} from './EventAttendanceReview';
import EventFinance from './EventFinance';
import PaymentInfoButton from './PaymentInfoButton';
import {useAuth} from '../lib/auth';
import {EventPanelReads} from '../lib/event-panel-reads';
import {eventReviewRequest} from '../lib/event-review';
import {financeRequest} from '../lib/event-finance';
import type {FinanceData} from '../lib/event-finance';
import './FinishEventWizard.css';

export default function FinishEventWizard({id,title,revision,onChange,onClose,onFinished}:{id:string;title:string;revision:number|null;onChange:()=>void;onClose:()=>void;onFinished:()=>void}){
 const auth=useAuth(),proof=auth.status==='ready'&&auth.administration?.status==='ready'?auth.session?.csrfToken:undefined;
 const context=proof?JSON.stringify([id,revision,auth.session?.account.userId,proof,auth.administration?.revision,auth.administration?.authorization,auth.administration?.sections]):'';
 // Memory belongs to this open wizard; step unmounts do not cancel shared reads.
 const panels=useRef(new EventPanelReads());panels.current.synchronize(context);
 useEffect(()=>()=>panels.current.invalidate(),[]);
 const invalidate=useCallback(()=>panels.current.invalidate(),[]);
 function changed(){invalidate();onChange();}
 function loadReview(_signal:AbortSignal,force=false){if(force)invalidate();return panels.current.read('review',signal=>eventReviewRequest(id,proof!,undefined,signal));}
 function loadFinance(_signal:AbortSignal,force=false){if(force)invalidate();return panels.current.read('finance',signal=>financeRequest<FinanceData>(id,proof!,true,undefined,signal));}
 const dialog=useRef<HTMLDialogElement>(null),[step,setStep]=useState(0),[review,setReview]=useState<ReviewStepState>({ready:false,busy:false,dirty:false}),[busy,setBusy]=useState(false),[canEmail,setCanEmail]=useState(false),[emailsSkipped,setEmailsSkipped]=useState(false);
 const updateReview=useCallback((state:ReviewStepState)=>setReview(state),[]);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const blocked=busy||review.busy,leave=()=>{if(!blocked&&(!review.dirty||window.confirm('Discard unsaved payment instructions?')))onClose();};
 function move(next:number){setReview({ready:false,busy:false,dirty:false});setStep(next);}
 return <dialog ref={dialog} className="role-wizard finish-event-wizard" aria-labelledby="finish-event-title" onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();leave();}} onClose={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="wizard-heading"><h2 id="finish-event-title">Finish event · {title}</h2><button type="button" className="text-action" aria-label="Close finish event" disabled={blocked} onClick={leave}>✕</button></div>
  {step<3&&<ol className="finish-event-steps" aria-label="Finish event steps">{['Attendance','Bills','Confirm'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined}><span>{i+1}</span>{label}</li>)}</ol>}
  <div className="finish-event-content" key={step}>
   {step===0&&<EventAttendanceReview id={id} revision={revision} view="attendance" initial={panels.current.peek('review')} load={loadReview} onInvalidate={invalidate} onChange={changed} onStateChange={updateReview}/>}
   {step===1&&<><EventAttendanceReview id={id} revision={revision} view="instructions" initial={panels.current.peek('review')} load={loadReview} onInvalidate={invalidate} onChange={changed} onStateChange={updateReview}/><EventFinance id={id} revision={revision} title={title} mode="preview" initial={panels.current.peek('finance')} load={loadFinance} onInvalidate={invalidate} onChange={changed} onBusyChange={setBusy}/></>}
   {step===2&&<EventFinance id={id} revision={revision} title={title} mode="confirm" initial={panels.current.peek('finance')} load={loadFinance} onInvalidate={invalidate} onChange={changed} onBusyChange={setBusy} onFinished={(allowed,skipped)=>{setCanEmail(allowed);setEmailsSkipped(skipped);move(3);}}/>}
   {step===3&&<><h3>Event finished</h3><p>Registration is closed and attendance is locked. Any final bills are published. No emails have been sent by finishing the event.</p>{canEmail?<PaymentInfoButton id={id} disabled={false} openOnMount onSent={onChange}/>:emailsSkipped?<p role="status">Payment emails were skipped for this event. Sending is permanently disabled.</p>:<p>Payment emails are available only for payable bills and staff with Planner and Finance access.</p>}</>}
  </div>
  {review.dirty&&<p role="status">Save your payment instructions before continuing.</p>}
  <div className="wizard-actions">{step===3?<button type="button" className="button" onClick={onFinished}>Done</button>:<><button type="button" className="button button-secondary" disabled={blocked||review.dirty} onClick={step?()=>move(step-1):leave}>{step?'Back':'Keep reviewing'}</button>{step<2&&<button type="button" className="button" disabled={!review.ready||blocked||review.dirty} onClick={()=>move(step+1)}>{step===0?'Next: bills':'Next: confirm'}</button>}</>}</div>
 </dialog>;
}
