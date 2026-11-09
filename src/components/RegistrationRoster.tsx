import type {RegistrationData} from '../lib/event-registration-api';
import {registrationDate} from '../lib/event-registration';

export default function RegistrationRoster({people,day,reviewed,onShowAll}:{people:NonNullable<RegistrationData['participants']>;day:string|null;reviewed:boolean;onShowAll:()=>void}){
 return <details className="participant-roster">
  <summary>Registrations &amp; waiting list <span>{people.length} {people.length===1?'person':'people'} · {day?registrationDate(day):'All days'}</span></summary>
  <div className="participant-roster-content">
   {day&&<button className="button button-secondary" onClick={onShowAll}>All days</button>}
   {!people.length?<p>No registrations for {day?registrationDate(day):'this event'} yet.</p>:<ul className="participant-roster-list">{people.map(person=><li key={person.owner+':'+person.id}>
    <div className="participant-roster-person"><strong>{person.name}</strong><small>{person.kind}</small></div>
    <ul className="participant-roster-days">{person.places.filter(place=>!day||place.day===day).map(place=><li key={place.day}>
     <time dateTime={place.day}>{registrationDate(place.day)}</time>
     <span className={place.status==='waitlisted'?'participant-roster-waiting':'participant-roster-confirmed'}>{place.status==='waitlisted'?`Waiting${place.position!==undefined?' · position '+place.position:''}`:reviewed?'Attended':'Confirmed'}</span>
    </li>)}</ul>
   </li>)}</ul>}
  </div>
 </details>;
}
