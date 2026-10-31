import {useEffect,useRef,useState} from 'react';
import {FeedbackFailure,useFeedback} from '../lib/feedback';
import {feedbackPrivacy} from './FeedbackDisplay';
import '../CSS/Roles_style.css';

export default function NewFeedbackDialog({onClose,onCreated}:{onClose:(attempted:boolean)=>void;onCreated:(id:string)=>void}){
 const {request,refresh}=useFeedback(),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
 const [kind,setKind]=useState('bug'),[title,setTitle]=useState(''),[description,setDescription]=useState('');
 const [pending,setPending]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const operation=useRef(crypto.randomUUID()),sending=useRef(false),active=useRef(false),attempted=useRef(false);
 useEffect(()=>{active.current=true;const node=dialog.current;node?.showModal();heading.current?.focus();return()=>{active.current=false;if(node?.open)node.close();};},[]);
 function changed(){operation.current=crypto.randomUUID();}
 async function submit(){
  if(sending.current||!title.trim()||!description.trim())return;
  attempted.current=true;sending.current=true;setPending(true);setError('');
  try{
   const result=await request<{requestId:string}>('/api/feedback/requests',{operationId:operation.current,kind,title,description});
   if(!active.current)return;
   refresh();onCreated(result.requestId);
  }catch(e){if(active.current){setError((e as Error).message);setUncertain(e instanceof FeedbackFailure&&e.uncertain);}}
  finally{sending.current=false;if(active.current)setPending(false);}
 }
 return <dialog ref={dialog} className="role-wizard feedback-dialog" aria-labelledby="feedback-create-heading"
  onCancel={e=>{if(sending.current)e.preventDefault();}} onClose={()=>onClose(attempted.current)}>
  <form className="feedback-form" onSubmit={e=>{e.preventDefault();void submit();}}>
   <div className="wizard-heading"><div><p className="eyebrow">Help improve our next LAN</p><h2 id="feedback-create-heading" ref={heading} tabIndex={-1}>New request</h2></div><button type="button" className="text-action" aria-label="Close new request" disabled={pending} onClick={()=>dialog.current?.close()}>✕</button></div>
   <p>{feedbackPrivacy}</p>
   <fieldset disabled={pending||uncertain}>
    <label>Type<select value={kind} onChange={e=>{changed();setKind(e.target.value);}}><option value="bug">Bug report</option><option value="feature">Feature request</option></select></label>
    <label>Title<input required maxLength={120} value={title} onChange={e=>{changed();setTitle(e.target.value);}}/></label>
    <label>Description<textarea required rows={7} maxLength={5000} value={description} onChange={e=>{changed();setDescription(e.target.value);}}/></label>
    <small>For bugs, describe what you expected, what happened and how to reproduce it. For features, explain the benefit.</small>
   </fieldset>
   <p className="feedback-status" role="status">{error}</p>
   <div className="wizard-actions"><button type="button" className="button button-secondary" disabled={pending} onClick={()=>dialog.current?.close()}>Cancel</button><button className="button" disabled={pending||!title.trim()||!description.trim()}>{pending?'Submitting…':uncertain?'Retry same submission':'Submit request'}</button></div>
  </form>
 </dialog>;
}
