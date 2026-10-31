import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router';
import {FeedbackFailure,feedbackLabel,useFeedback,useFeedbackRead} from '../lib/feedback';
import type {FeedbackDetail} from '../lib/feedback';
import {formatMemberNumber} from '../lib/member-number';
import {FeedbackDelta,FeedbackLabels,FeedbackState,feedbackPrivacy} from './FeedbackDisplay';
import FeedbackAdminTools from './FeedbackAdminTools';

export default function FeedbackThread({id,admin,prefix,onUpdated,onBusyChange}:{id:string;admin:boolean;prefix:string;onUpdated?:()=>void;onBusyChange?:(busy:boolean)=>void}){
 const api=(admin?'/api/manage/feedback/':'/api/feedback/requests/')+id,read=useFeedbackRead<FeedbackDetail>(api),{request,refresh}=useFeedback();
 const [older,setOlder]=useState<FeedbackDetail['events']>([]),[before,setBefore]=useState<string|null>(null),[message,setMessage]=useState('');
 const [reply,setReply]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const op=useRef(crypto.randomUUID()),seen=useRef(''),active=useRef(false),sending=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{onBusyChange?.(busy);return()=>{onBusyChange?.(false);};},[busy,onBusyChange]);
 const data=read.data;
 useEffect(()=>{
  if(!data||seen.current===data.through)return;
  let current=true;seen.current=data.through;
  // A mounted, rendered selection only; fetching the list never acknowledges it.
  void request(api+'/read',{through:data.through}).then(()=>{if(current){refresh();onUpdated?.();}}).catch(()=>{if(current){seen.current='';setMessage('Read acknowledgement failed. Reload to try again.');}});
  return()=>{current=false;};
 },[data,api,request,refresh,onUpdated]);
 async function save(path:string,body:object){
  if(sending.current)return false;sending.current=true;setBusy(true);setMessage('');
  try{
   await request(path,body);if(!active.current)return false;
   refresh();setOlder([]);setBefore(null);read.reload();setUncertain(false);onUpdated?.();return true;
  }catch(e){if(active.current){setMessage((e as Error).message);setUncertain(e instanceof FeedbackFailure&&e.uncertain);}return false;}
  finally{sending.current=false;if(active.current)setBusy(false);}
 }
 async function olderMessages(){
  if(sending.current||!data)return;sending.current=true;setBusy(true);
  try{const page=await request<FeedbackDetail>(api+'?before='+encodeURIComponent(before??data.nextBefore!));if(active.current){setOlder(old=>[...page.events,...old]);setBefore(page.nextBefore??'');}}
  catch(e){if(active.current)setMessage((e as Error).message);}
  finally{sending.current=false;if(active.current)setBusy(false);}
 }
 return <>
  <section className={admin?'feedback-center-column':'feedback-member-thread'} aria-label="Selected request">
   {!admin&&<Link to={prefix}>Back to My Requests</Link>}
   <FeedbackState loading={read.loading} refreshing={!!data} error={read.error} retry={read.reload}/>
   {data&&<>
    <article className="panel feedback-detail"><h2>{data.request.title}</h2><FeedbackLabels item={data.request}/>
     {admin&&<p className="feedback-author">From: {data.request.nickname??'Nickname unavailable'}{data.request.memberNumber?' · '+formatMemberNumber(data.request.memberNumber):''}</p>}
     <p className="feedback-text">{data.request.description}</p>
     {data.request.closedAt!==null&&<p className="feedback-retention">This private request expires 30 days after closure and is removed by daily cleanup. Public GitHub issues have a separate lifetime.</p>}
     {data.request.githubNumber&&<a href={'https://github.com/Awandalo/Lan-Party/issues/'+data.request.githubNumber} target="_blank" rel="noopener noreferrer">GitHub issue #{data.request.githubNumber} ↗</a>}
    </article>
    <section className="panel feedback-conversation" aria-label="Conversation"><h2>Conversation</h2>
     {(before??data.nextBefore)&&<button className="button button-secondary" disabled={busy} onClick={()=>void olderMessages()}>Older messages</button>}
     {[...older,...data.events].map(event=><article className="feedback-event" key={event.sequence}><strong>{event.anonymized?'Former ':''}{event.actorKind==='administrator'?'Administrator':'Member'} · {feedbackLabel(event.kind)}</strong><small>{new Date(event.occurredAt*1000).toLocaleString()}</small>{event.body&&<p className="feedback-text">{event.body}</p>}{event.delta&&<FeedbackDelta text={event.delta}/>}</article>)}
    </section>
    <form className="panel feedback-form" onSubmit={e=>{e.preventDefault();void save(api+'/replies',{operationId:op.current,body:reply}).then(ok=>{if(ok&&active.current){setReply('');op.current=crypto.randomUUID();}});}}>
     <h2>Reply</h2><p>{admin?'Your reply is visible to the submitting member.':feedbackPrivacy}</p>
     {!admin&&['completed','closed'].includes(data.request.progress)?<p>This request is read-only. An administrator can reopen it.</p>:<><label>Message<textarea required rows={4} maxLength={2000} disabled={busy||uncertain} value={reply} onChange={e=>{op.current=crypto.randomUUID();setReply(e.target.value);}}/></label><button className="button" disabled={busy||!reply.trim()}>{busy?'Sending…':uncertain?'Retry same reply':'Send reply'}</button></>}
    </form>
   </>}
   <p className="feedback-status" role="status">{message}</p>
  </section>
  {admin&&<aside className="feedback-review-column" aria-label="Request administration">{data?<FeedbackAdminTools key={id+':'+data.request.revision} item={data.request} api={api} save={save} busy={busy}/>:<section className="panel"><h2>Request administration</h2><p>{read.error?'Reload the request to review it.':'Loading request controls…'}</p></section>}</aside>}
 </>;
}
