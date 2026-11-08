import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../lib/auth';
import {financeRequest} from '../lib/event-finance';
import type {FinanceData} from '../lib/event-finance';
import type {PaymentInfoPreview} from '../lib/payment-info';
import './PaymentInfoButton.css';
export default function PaymentInfoButton({id,disabled,onSent,openOnMount=false}:{id:string;disabled:boolean;onSent:()=>void;openOnMount?:boolean}){
 const auth=useAuth(),proof=auth.status==='ready'&&auth.administration?.status==='ready'?auth.session?.csrfToken:undefined;
 const context=id+':'+proof+':'+auth.administration?.revision,live=useRef(context);live.current=context;
 const trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false),[preview,setPreview]=useState<PaymentInfoPreview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 function close(){dialog.current?.close();setOpen(false);trigger.current?.focus({preventScroll:true});}
 useEffect(()=>{setOpen(false);setPreview(null);return()=>{live.current='';};},[context]);
 useEffect(()=>{if(open)dialog.current?.showModal();else if(dialog.current?.open){dialog.current.close();trigger.current?.focus({preventScroll:true});}},[open]);
 useEffect(()=>{if(openOnMount&&proof){setOpen(true);void refresh();}},[context,openOnMount]);
 async function refresh(){
  if(!proof)return;const captured=context;setBusy(true);setMessage('');
  try{const data=await financeRequest<FinanceData>(id,proof,true);const value=await financeRequest<PaymentInfoPreview>(id,proof,true,{action:'payment-info-preview',revision:data.revision});if(live.current===captured)setPreview(value);}
  catch(e){if(live.current===captured){setPreview(null);setMessage((e as Error).message);}}
  finally{if(live.current===captured)setBusy(false);}
 }
 async function send(retryFailed:boolean){
  if(!proof||!preview||busy)return;const captured=context;setBusy(true);setMessage('Sending payment information…');
  let revision=preview.revision,remaining=preview.recipients.filter(r=>r.state===(retryFailed?'failed':'ready')).length;
  try{
   // A single confirmation covers this exact recipient/content preview. Continue
   // new chunks only after a confirmed response; never retry an uncertain POST.
   for(let batch=0;remaining>0&&batch<preview.recipients.length;batch++){
    const result=await financeRequest<{revision:number;remaining:number;stopped?:boolean}>(id,proof,true,{action:'send-payment-info',revision,previewToken:preview.previewToken,retryFailed});
    if(live.current!==captured)return;revision=result.revision;
    if(result.stopped||result.remaining===0)break;
    if(result.remaining>=remaining)throw Error('Sending paused. Check the results before continuing.');remaining=result.remaining;
   }
   if(live.current!==captured)return;
   const value=await financeRequest<PaymentInfoPreview>(id,proof,true,{action:'payment-info-preview',revision});
   if(live.current===captured){setPreview(value);setMessage('Sending finished. Review the summary below.');onSent();}
  }catch(e){if(live.current===captured){setPreview(null);setMessage((e as Error).message+' Check again before sending anything else.');onSent();}}
  finally{if(live.current===captured)setBusy(false);}
 }
 const count=(state:string)=>preview?.recipients.filter(r=>r.state===state).length??0;
 const unknown=count('unknown')+count('sending');
 return <><button ref={trigger} type="button" className="button button-secondary" disabled={disabled||!proof} title={disabled?'Available after finalization, using saved instructions':undefined} onClick={()=>{setOpen(true);void refresh();}}>Send payment info</button>
 {open&&<dialog ref={dialog} className="role-wizard payment-info-dialog" aria-labelledby="payment-info-title" onCancel={e=>{e.stopPropagation();e.preventDefault();if(!busy)close();}}>
  <div className="wizard-heading"><h2 id="payment-info-title">Send payment info</h2><button type="button" className="text-action" aria-label="Close payment preview" disabled={busy} onClick={close}>✕</button></div>
  <div className="payment-info-content"><p>Each member receives their combined final bill. Guests receive only their own cost information; the member arranges payment. Nothing is sent until you confirm.</p>
   {message&&<p role="status">{message}</p>}{!preview&&!message&&<p role="status">Loading saved payment information…</p>}
   {preview&&<>{preview.missingInstructions&&<p className="review-note">No payment link or bank instructions were saved. The message will ask members to contact the organizer.</p>}
    {preview.sendBlockedReason&&<p role="alert" className="review-note">{preview.sendBlockedReason}</p>}
    <p role="status">{count('ready')} ready · {count('sent')} accepted · {count('failed')} not sent{unknown>0&&' · '+unknown+' need checking'}</p>
    {unknown>0&&<p>Some outcomes are uncertain. Check them with the organizer/provider; they will not be resent here.</p>}
    <div className="payment-info-recipients">{preview.recipients.map(r=><details key={r.key}><summary>{r.name} · {r.kind} · {r.email} <small>{r.state==='sent'?'Accepted':r.state==='sending'||r.state==='unknown'?'Needs checking':r.state==='failed'?'Not sent':'Ready'}</small></summary><pre>{r.text}</pre></details>)}</div>
    {!preview.recipients.length&&<p>No eligible member or guest emails.</p>}
   </>}
  </div>
  <div className="wizard-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={close}>Close</button><div>{!preview&&<button type="button" className="button" disabled={busy} onClick={()=>void refresh()}>Check again</button>}{preview&&count('failed')>0&&<button type="button" className="button button-secondary" disabled={busy||!!preview.sendBlockedReason} onClick={()=>void send(true)}>Retry {count('failed')} not-sent emails</button>}{preview&&count('ready')>0&&<button type="button" className="button" disabled={busy||!!preview.sendBlockedReason} onClick={()=>void send(false)}>{busy?'Sending…':'Confirm & send '+count('ready')+' emails'}</button>}</div></div>
 </dialog>}
 </>;
}
