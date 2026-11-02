import {useEffect,useId,useRef,useState} from 'react';
import type {KeyboardEvent} from 'react';
import '../CSS/EventActionsMenu_style.css';
export interface EventMenuAction {id:string;label:string;reason?:string;danger?:boolean;onSelect:()=>void}
export function eventMenuPosition(rect:{top:number;bottom:number;left:number},space:{width:number;height:number;headerBottom:number;menuWidth:number;menuHeight:number;gap:number}){
 const above=Math.max(0,rect.top-space.gap-Math.max(0,space.headerBottom)-12),below=Math.max(0,space.height-rect.bottom-space.gap-12);
 const flip=below<Math.min(space.menuHeight,240)&&above>below;
 return {above:flip,height:flip?above:below,left:Math.max(12-rect.left,Math.min(0,space.width-12-rect.left-space.menuWidth))};
}

export default function EventActionsMenu({actions}:{actions:EventMenuAction[]}){
 const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),initial=useRef(0);
 const [open,setOpen]=useState(false),[position,setPosition]=useState({above:false,height:320,left:0});
 const enabled=()=>Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);
 function place(){
  if(!trigger.current||!menu.current)return;
  // Reserve the sticky header and the CSS half-rem gap when flipping upward.
  setPosition(eventMenuPosition(trigger.current.getBoundingClientRect(),{width:document.documentElement.clientWidth,height:innerHeight,headerBottom:document.querySelector('.site-header')?.getBoundingClientRect().bottom??0,menuWidth:menu.current.offsetWidth,menuHeight:menu.current.scrollHeight,gap:parseFloat(getComputedStyle(document.documentElement).fontSize)/2}));
 }
 function show(last=false){initial.current=last?-1:0;place();setOpen(true);}
 function close(restore=false){setOpen(false);if(restore)trigger.current?.focus();}
 useEffect(()=>{
  if(!open)return;
  const items=enabled();(items[initial.current===-1?items.length-1:0]??menu.current)?.focus({preventScroll:true});
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))close(true);};
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 function navigate(event:KeyboardEvent){
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(event.key==='Tab'){close();return;}
  const items=enabled(),current=items.indexOf(document.activeElement as HTMLButtonElement);
  let next:number|undefined;
  if(event.key==='ArrowDown')next=(current+1)%items.length;
  if(event.key==='ArrowUp')next=(current-1+items.length)%items.length;
  if(event.key==='Home')next=0;if(event.key==='End')next=items.length-1;
  if(next!==undefined){event.preventDefault();items[next]?.focus();}
 }
 if(!actions.length)return null;
 return <div ref={root} className="event-action-menu" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close();}}>
  <button ref={trigger} type="button" className="button button-secondary" aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={()=>open?close():show()} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show(event.key==='ArrowUp');}if(event.key==='Escape')close(true);}}>Actions <span className={'event-menu-chevron'+(open?' expanded':'')} aria-hidden="true">⌄</span></button>
  <div ref={menu} id={id} role="menu" tabIndex={-1} aria-label="Event actions" aria-hidden={!open} inert={!open} className={'event-menu-panel'+(open?' open':'')+(position.above?' above':'')} style={{maxHeight:position.height,left:position.left}} onKeyDown={navigate}>
   {actions.map(action=><button key={action.id} role="menuitem" type="button" tabIndex={-1} disabled={!!action.reason} className={action.danger?'event-menu-danger':''} onClick={()=>{close(true);action.onSelect();}}><span>{action.label}</span>{action.reason&&<small>{action.reason}</small>}</button>)}
  </div>
 </div>;
}
