import {useEffect,useId,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import './HelpButton.css';

function HelpDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="role-wizard context-help-dialog" aria-labelledby={titleId} onCancel={e=>e.stopPropagation()} onClose={e=>{e.stopPropagation();onClose();}}>
  <div className="wizard-heading"><h2 id={titleId}>{title}</h2><button type="button" className="text-action" aria-label={'Close '+title.toLowerCase()} onClick={onClose}>✕</button></div>
  {children}<div className="wizard-actions"><button type="button" className="button" onClick={onClose}>Got it</button></div>
 </dialog>;
}

export default function HelpButton({label,title,children}:{label:string;title:string;children:ReactNode}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
 useEffect(()=>{if(open)wasOpen.current=true;else if(wasOpen.current){trigger.current?.focus({preventScroll:true});wasOpen.current=false;}},[open]);
 return <><button ref={trigger} type="button" className="context-help-button" aria-label={label} aria-haspopup="dialog" onClick={()=>setOpen(true)}>?</button>{open&&<HelpDialog title={title} onClose={()=>setOpen(false)}>{children}</HelpDialog>}</>;
}
