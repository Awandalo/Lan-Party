import {Link} from 'react-router';
import EventActionsMenu from './EventActionsMenu';
import type {EventMenuAction} from './EventActionsMenu';
import type {EventCatalogue,ManagedEvent} from '../lib/event-management';
type Access=Pick<EventCatalogue,'canCreate'|'canUpdate'|'canDelete'|'canPublish'|'canCancel'|'canManageRegistrations'>;
interface Props {row:ManagedEvent;access:Access;onDelete:()=>void;onDuplicate:()=>void;onEdit:()=>void;onLifecycle:(action:'publish'|'unpublish'|'cancel')=>void;onRegistration?:()=>void;onFinish?:()=>void;pending?:boolean}
export default function EventOverviewActions({row,access,onDelete,onDuplicate,onEdit,onLifecycle,onRegistration,onFinish,pending=false}:Props){
 const editable=!row.finalized&&['draft','published'].includes(row.status),reason=row.registrationHistory?'Unavailable: this event has registration history.':undefined;
 const actions:EventMenuAction[]=[];
 if(access.canDelete&&!row.finalized)actions.push({id:'delete',label:'Delete event',danger:true,reason,onSelect:onDelete});
 if(access.canCreate)actions.push({id:'duplicate',label:'Duplicate',onSelect:onDuplicate});
 if(access.canManageRegistrations&&onRegistration&&row.status==='published'&&row.revision!==null&&row.endsAt!==null&&row.endsAt>Date.now()/1000)actions.push({id:'registration',label:row.registrationStatus==='open'?'Close registration':'Reopen registration',reason:pending?'A change is being saved.':undefined,onSelect:onRegistration});
 if(access.canCancel&&editable)actions.push({id:'cancel',label:'Cancel event',onSelect:()=>onLifecycle('cancel')});
 if(access.canPublish&&editable)actions.push({id:'publish',label:row.listed?'Unpublish':'Publish',onSelect:()=>onLifecycle(row.listed?'unpublish':'publish')});
 return <div className="event-actions"><EventActionsMenu key={row.id} actions={actions}/><div className="event-primary-actions">
  {row.status==='published'&&row.listed===1&&<Link className="button button-secondary" to={'/events/'+row.id}>View public page</Link>}
  {access.canManageRegistrations&&row.status==='published'&&!row.finalized&&row.revision!==null&&onFinish&&<button className="button button-secondary" disabled={pending||row.endsAt===null||row.endsAt>Date.now()/1000} title={row.endsAt===null||row.endsAt>Date.now()/1000?'Available after the event ends':undefined} onClick={onFinish}>Finish event</button>}
  {access.canUpdate&&editable&&<button className="button" onClick={onEdit}>{row.status==='draft'?'Edit Draft':'Edit event'}</button>}
 </div></div>;
}
