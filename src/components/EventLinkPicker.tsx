import {useEffect,useRef,useState} from 'react';
import {eventTime,usePublicEvents} from '../lib/public-events';
import type {PublicEvent} from '../lib/public-events';

export default function EventLinkPicker({id,disabled,onSelect,onCancel}:{id:string;disabled:boolean;onSelect:(event:PublicEvent)=>void;onCancel:()=>void}){
 const {events,loading,message,reload}=usePublicEvents('upcoming'),[selected,setSelected]=useState(''),select=useRef<HTMLSelectElement>(null),panel=useRef<HTMLDivElement>(null);
 const event=events.find(item=>item.id===selected);
 useEffect(()=>{if(!loading)(select.current??panel.current?.querySelector('button'))?.focus();},[loading,message]);
 return <div ref={panel} id={id} className="event-link-controls event-event-link-controls" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onCancel();}else if(e.key==='Enter'&&e.target===select.current){e.preventDefault();if(event&&!disabled)onSelect(event);}}}>
  {loading?<p role="status">Loading published events…</p>:message?<><p role="alert">{message}</p><button type="button" onClick={reload} disabled={disabled}>Try again</button></>:events.length?<><label>Published event<select ref={select} value={selected} disabled={disabled} onChange={e=>setSelected(e.target.value)}><option value="">Choose an event…</option>{events.map(item=><option key={item.id} value={item.id}>{item.title} · {eventTime(item.startsAt)}</option>)}</select></label><button type="button" disabled={disabled||!event} onClick={()=>event&&onSelect(event)}>Insert event link</button></>:<p role="status">No published upcoming events are available.</p>}
  <button type="button" onClick={onCancel}>Cancel event link</button>
  <p className="event-link-help">Published, publicly listed events that haven’t ended. Selected text becomes the link; otherwise the event title is inserted.</p>
 </div>;
}
