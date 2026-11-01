import {Link} from 'react-router';
import {eventTime} from '../lib/public-events';
import type {PublicEvent} from '../lib/public-events';
export default function PublicEventCard({event}:{event:PublicEvent}){
 return <Link className="panel public-event-card" to={'/events/'+event.id}><img src="/lan-hall.png" alt=""/><div><h2>{event.title}</h2><p>{eventTime(event.startsAt)} — {eventTime(event.endsAt)} (Netherlands time)</p><p>Registration {event.registrationStatus}</p>{event.venue&&<p>{event.venue.name}</p>}<ul>{event.days.map(day=><li key={day.date}>{day.date}: {day.remaining} places remaining</li>)}</ul><span className="text-link">View event →</span></div></Link>;
}
