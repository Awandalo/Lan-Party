import {createContext,useContext,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {createPortal} from 'react-dom';

const DetailsHost=createContext<HTMLElement|null|undefined>(undefined);

/** Keep summaries in place while their existing forms render below all controls. */
export function SecurityDetailsLayout({children}:{children:ReactNode}){
 const [host,setHost]=useState<HTMLDivElement|null>(null);
 return <DetailsHost.Provider value={host}>{children}<div ref={setHost} className="security-details-region"/></DetailsHost.Provider>;
}

export default function SecurityDetails({children,open,title,className='',onClose,disabled=false,controlsId}:{children:ReactNode;open:boolean;title:string;className?:string;onClose?:()=>void;disabled?:boolean;controlsId?:string}){
 const host=useContext(DetailsHost),panel=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!open||!host)return;
  const frame=requestAnimationFrame(()=>{
   // Existing action-specific autofocus takes precedence over this region focus.
   if(panel.current&&!panel.current.contains(document.activeElement))panel.current.focus({preventScroll:true});
  });
  return()=>cancelAnimationFrame(frame);
 },[open,host]);
 // Standalone action screens retain their established layout and lifecycle.
 if(host===undefined)return children;
 if(!host)return null;
 function close(){
  if(disabled)return;
  onClose?.();
  requestAnimationFrame(()=>{
   const trigger=[...document.querySelectorAll<HTMLButtonElement>('button[aria-controls]')].find(button=>button.getAttribute('aria-controls')===controlsId);
   trigger?.focus();
  });
 }
 return createPortal(<section ref={panel} hidden={!open} tabIndex={-1} aria-label={title} className={'security-detail-panel '+className}><header className="security-details-heading"><h2>{title}</h2>{onClose&&<button type="button" className="button button-secondary" disabled={disabled} onClick={close}>Close details</button>}</header>{children}</section>,host);
}
