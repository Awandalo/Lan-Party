import {euro} from '../lib/currency';
import FinishEventWizard from '../components/FinishEventWizard';
import EventFinance from '../components/EventFinance';
import EventOverviewActions from '../components/EventOverviewActions';
import EventSections from '../components/EventSections';
import EventParticipants from '../components/EventParticipants';
import {useState} from 'react';
import {useEventRead,useEventMutation,eventStatus} from '../lib/event-management';
import type {EventCatalogue,ManagedEvent} from '../lib/event-management';
import EventLifecycleDialog from '../components/EventLifecycleDialog';
import EventEditor from '../components/EventEditor';
import DeleteEventDialog from '../components/DeleteEventDialog';
import EventDescription from '../components/EventDescription';
import {locationDirections} from '../lib/locations';
import '../CSS/Roles_style.css';
import '../CSS/EventManagement_style.css';
export default function EventManagement(){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[selected,setSelected]=useState<string|null>(null),[editing,setEditing]=useState<{row:ManagedEvent|null;duplicate:boolean}|null>(null);
 const [lifecycle,setLifecycle]=useState<{row:ManagedEvent;action:'publish'|'unpublish'|'cancel'}|null>(null);
 const [section,setSection]=useState<'overview'|'participants'|'finance'>('overview');
 const [finishing,setFinishing]=useState<string|null>(null);
 const [deleting,setDeleting]=useState<ManagedEvent|null>(null);
 const read=useEventRead<EventCatalogue>('/api/manage/events?'+new URLSearchParams({status,...query?{search:query}:{}})),mutation=useEventMutation();
 const row=read.data?.events.find(e=>e.id===selected),directions=row?.venue?locationDirections(row.venue):null;
 async function save(body:object){if(await mutation.save(body)){setEditing(null);read.reload();}}
 async function deleteEvent(confirmation:string){if(deleting&&await mutation.save({action:'delete',id:deleting.id,revision:deleting.revision,confirmation})){setDeleting(null);setSelected(null);read.reload();}}
 async function toggleRegistration(){if(row&&await mutation.save({action:row.registrationStatus==='open'?'close':'open',revision:row.revision},row.id))read.reload();}
 return <div className="event-management"><div className="event-heading"><p>Prepare events, review their public details, and publish when ready. Manage registration from Participants or the Actions menu.</p>{read.data?.canCreate&&<button className="button" onClick={()=>setEditing({row:null,duplicate:false})}>Create event</button>}</div>
 <form className="panel event-search" onSubmit={e=>{e.preventDefault();setQuery(search.trim());read.reload();}}><label>Search events<input maxLength={80} value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}>{['all','draft','published','unpublished','archived','cancelled'].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></label><button className="button">Search</button><button type="button" className="button button-secondary" onClick={()=>{setQuery('');setSearch('');setStatus('all');read.reload();}}>Clear</button></form>
 <p className="event-search-feedback" role="status">{read.loading?(read.data?'Updating events…':'Loading events…'):read.message||mutation.message}</p>{(read.message||mutation.message)&&<button className="button" onClick={read.reload}>Check again</button>}
 {read.data&&<div className="event-layout" aria-busy={read.loading}><div className="event-list">{read.data.events.map(e=><button key={e.id} className={'panel event-card'+(selected===e.id?' selected':'')} aria-pressed={selected===e.id} onClick={()=>{setSelected(e.id);setSection('overview');}}><strong>{e.title}</strong><span>{eventStatus(e)} · {e.days.map(d=>d.date).join(', ')||'No attendance days'}</span>{e.revision===null&&<span>Legacy record — review needed</span>}</button>)}{!read.data.events.length&&<p>No events match these filters.</p>}</div>{row&&<article className="panel event-preview"><img src="/lan-hall.png" alt="" className="event-default-cover"/><h2>{row.title}</h2><p>{eventStatus(row)} · Registration {row.registrationStatus}</p>{row.startsAt!==null&&row.endsAt!==null&&<p>{new Date(row.startsAt*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})} — {new Date(row.endsAt*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})} (Netherlands time)</p>}
 {!!row.finalized&&<p className="review-note">Event permanently finalized. Attendance and financial inputs are locked.</p>}<EventSections selected={section} onSelect={read.data.canManageRegistrations?setSection:undefined}/>{section==='finance'&&read.data.canManageRegistrations?<EventFinance key={row.id} id={row.id} title={row.title} onChange={read.reload}/>:section==='participants'&&read.data.canManageRegistrations?<EventParticipants key={row.id} id={row.id} minimumParticipants={row.minimumParticipants} onChange={read.reload}/>:<><EventDescription source={row.description}/><h3>Attendance days</h3><ul>{row.days.map(d=><li key={d.date}>{d.date}: {row.capacity??'not set'} places</li>)}</ul>{row.venue&&<><h3>{row.venue.name}</h3><p>{[row.venue.addressLine,row.venue.postalCode,row.venue.city,row.venue.countryCode].filter(Boolean).join(', ')}</p><p className="event-instructions">{row.venue.instructions}</p>{directions&&<a href={directions} target="_blank" rel="noreferrer">Directions in Google Maps ↗</a>}<p>Venue rental {euro(row.rentalCents)} · Minimum participants: {row.minimumParticipants} · Member-invited guests: up to {row.maxGuests}</p></>}
 {row.revision===null?<p>This legacy event is preserved. Its venue and attendance settings need review before management can be enabled.</p>:<EventOverviewActions row={row} access={read.data} onDelete={()=>setDeleting(row)} onDuplicate={()=>setEditing({row,duplicate:true})} onEdit={()=>setEditing({row,duplicate:false})} onLifecycle={action=>setLifecycle({row,action})} onRegistration={()=>void toggleRegistration()} onFinish={()=>setFinishing(row.id)} pending={mutation.pending}/>}</>}</article>}</div>}
 {finishing&&row&&row.id===finishing&&read.data?.canManageRegistrations&&<FinishEventWizard id={row.id} title={row.title} onChange={read.reload} onClose={()=>setFinishing(null)} onFinished={()=>{setFinishing(null);setSection('finance');read.reload();}}/>}
 {editing&&read.data&&<EventEditor key={(editing.row?.id??'new')+String(editing.duplicate)} {...editing} templates={read.data.templates} pending={mutation.pending} message={mutation.message} onSave={save} onCancel={()=>{if(!mutation.pending)setEditing(null);}}/>}
 {lifecycle&&<EventLifecycleDialog {...lifecycle} pending={mutation.pending} message={mutation.message} onClose={()=>{if(!mutation.pending)setLifecycle(null);}} onSave={async(confirmation,acknowledgeArchivedTemplate)=>{if(await mutation.save({action:lifecycle.action,id:lifecycle.row.id,revision:lifecycle.row.revision,confirmation,acknowledgeArchivedTemplate})){setLifecycle(null);read.reload();}}}/>}
 {deleting&&read.data?.canDelete&&<DeleteEventDialog row={deleting} pending={mutation.pending} message={mutation.message} onDelete={deleteEvent} onClose={()=>{if(!mutation.pending)setDeleting(null);}}/>}</div>;
}
