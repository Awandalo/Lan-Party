import {useCallback,useEffect,useRef,useState} from 'react';
import EventAttendanceReview from './EventAttendanceReview';
import type {ReviewStepState} from './EventAttendanceReview';
import EventFinance from './EventFinance';
import './FinishEventWizard.css';

export default function FinishEventWizard({id,title,onChange,onClose,onFinished}:{id:string;title:string;onChange:()=>void;onClose:()=>void;onFinished:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[step,setStep]=useState(0),[review,setReview]=useState<ReviewStepState>({ready:false,busy:false,dirty:false}),[busy,setBusy]=useState(false);
 const updateReview=useCallback((state:ReviewStepState)=>setReview(state),[]);
 useEffect(()=>{dialog.current?.showModal();},[]);
 const blocked=busy||review.busy,leave=()=>{if(!blocked&&(!review.dirty||window.confirm('Discard unsaved payment instructions?')))onClose();};
 function move(next:number){setReview({ready:false,busy:false,dirty:false});setStep(next);}
 return <dialog ref={dialog} className="role-wizard finish-event-wizard" aria-labelledby="finish-event-title" onCancel={e=>{if(e.target!==e.currentTarget)return;e.preventDefault();leave();}} onClose={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="wizard-heading"><h2 id="finish-event-title">Finish event · {title}</h2><button type="button" className="text-action" aria-label="Close finish event" disabled={blocked} onClick={leave}>✕</button></div>
  <ol className="finish-event-steps" aria-label="Finish event steps">{['Attendance','Bills','Confirm'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined}><span>{i+1}</span>{label}</li>)}</ol>
  <div className="finish-event-content" key={step}>
   {step===0&&<EventAttendanceReview id={id} view="attendance" onChange={onChange} onStateChange={updateReview}/>}
   {step===1&&<><EventAttendanceReview id={id} view="instructions" onChange={onChange} onStateChange={updateReview}/><EventFinance id={id} title={title} mode="preview" onChange={onChange}/></>}
   {step===2&&<EventFinance id={id} title={title} mode="confirm" onChange={onChange} onBusyChange={setBusy} onFinished={onFinished}/>}
  </div>
  {review.dirty&&<p role="status">Save your payment instructions before continuing.</p>}
  <div className="wizard-actions"><button type="button" className="button button-secondary" disabled={blocked||review.dirty} onClick={step?()=>move(step-1):leave}>{step?'Back':'Keep reviewing'}</button>{step<2&&<button type="button" className="button" disabled={!review.ready||blocked||review.dirty} onClick={()=>move(step+1)}>{step===0?'Next: bills':'Next: confirm'}</button>}</div>
 </dialog>;
}
