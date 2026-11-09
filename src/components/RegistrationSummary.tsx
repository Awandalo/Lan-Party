import type {RegistrationPlace} from '../lib/event-registration';
import {registrationDate} from '../lib/event-registration';
import './RegistrationSummary.css';
function CalendarIcon(){return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>;}
const dayLabel=(day:string)=>new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
export default function RegistrationSummary({people,places}:{people:{id:string;name:string;days:string[]}[];places:RegistrationPlace[]}){
 return <div className="registration-person-summaries">{people.map(person=>{
  const confirmed=person.days.filter(day=>places.some(p=>p.personId===person.id&&p.day===day&&p.status==='confirmed')).length;
  const waiting=person.days.filter(day=>places.some(p=>p.personId===person.id&&p.day===day&&p.status==='waitlisted')).length;
  const total=person.days.length,complete=total>0&&confirmed===total,percentage=total?Math.round(100*confirmed/total):0;
  const tone=complete?'confirmed':confirmed?'mixed':'waiting';
  return <section key={person.id} className="registration-person-summary" aria-label={person.name+' registration'}><header className="registration-person-heading"><h3>{person.name}</h3><span className="registration-day-count"><CalendarIcon/>{total} {total===1?'day':'days'}</span></header>
   <div className={'registration-confirmation '+tone}><span className="registration-confirmation-icon" aria-hidden="true">{complete?'✓':confirmed?'◷':'⌛'}</span><div className="registration-confirmation-copy"><h4>{complete?'Registration confirmed':confirmed?'Partly confirmed':waiting?'On the waitlist':'Awaiting confirmation'}</h4><p>{confirmed} of {total} selected {total===1?'day is':'days are'} confirmed.{waiting>0&&` ${waiting} ${waiting===1?'day is':'days are'} waitlisted.`}</p></div><span className="registration-confirmation-percentage"><strong>{percentage}%</strong><small>confirmed</small></span><progress max={Math.max(1,total)} value={confirmed} aria-label={'Confirmed selected days for '+person.name}/></div>
   <ul className="registration-status-days">{person.days.map(day=>{const place=places.find(p=>p.personId===person.id&&p.day===day),isConfirmed=place?.status==='confirmed';return <li key={day} className={isConfirmed?'confirmed':'waiting'}><div className="registration-status-date"><CalendarIcon/><strong>{dayLabel(day)}</strong></div><time dateTime={day}>{registrationDate(day)}</time><span className="registration-status-badge">{isConfirmed?'✓ Confirmed':place?.status==='waitlisted'?'◷ Waitlisted':'Awaiting status'}</span>{place?.status==='waitlisted'&&place.position!==undefined&&<small>Group position {place.position}</small>}</li>;})}</ul>
  </section>;
 })}</div>;
}
