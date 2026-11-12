import type {ReactNode} from 'react';
import type {CrewCounts} from '../lib/event-registration-api';
import RegistrationPersonCard from './RegistrationPersonCard';
import {useEffect,useState} from 'react';
import {registrationDate} from '../lib/event-registration';
export default function RegistrationCrew({members,day,onReset,filters,counts}:{members:{id:string;name:string;prefix?:string;badgeCode?:string|null;rankCode?:string|null;days:string[]}[];day:string|null;onReset:()=>void;filters?:ReactNode;counts?:CrewCounts}){
 const [visible,setVisible]=useState(24);
 useEffect(()=>setVisible(24),[day]);
 const roster=members.map(m=>({...m,days:m.days.filter(d=>!day||d===day)})).filter(m=>m.days.length);
 const summary=(day?counts?.days.find(d=>d.date===day):counts)??{members:roster.length,guests:0,total:roster.length};
 return <section id="registration-crew" className="event-details-section"><h2>Who is coming</h2>{filters}<p className="registration-roster-status" role="status">{day?'Confirmed for '+registrationDate(day):'All confirmed days'} · {summary.members} {summary.members===1?'member':'members'} · {summary.guests} {summary.guests===1?'guest':'guests'} · {summary.total} total</p><p>Confirmed members are listed below; confirmed guests count anonymously. Guest identities and waitlisted days are private.</p><div className="registration-member-grid">{roster.slice(0,visible).map(m=><RegistrationPersonCard key={m.id} name={m.name} prefix={m.prefix} badgeCode={m.badgeCode} rankCode={m.rankCode} kind="Confirmed member"><p className="registration-member-dates-label">Confirmed dates</p><ul className="registration-confirmed-dates">{m.days.map(d=><li key={d}><time dateTime={d}>{registrationDate(d)}</time></li>)}</ul></RegistrationPersonCard>)}</div>{roster.length>visible&&<div className="registration-crew-pagination"><p>Showing {visible} of {roster.length} confirmed members</p><button type="button" className="button button-secondary" onClick={()=>setVisible(n=>n+24)}>Show more members</button></div>}{!roster.length&&<p className="registration-crew-empty">No members are confirmed for {day?'this day':'the event'} yet.</p>}{!filters&&<button type="button" className="button button-secondary registration-show-all" aria-disabled={!day} onClick={onReset}>Show all days</button>}</section>;
}
