import {EVENT_ARTWORK,EVENT_ARTWORK_ALT} from '../lib/event-artwork';
import {useEffect,useState} from 'react';
import {Link,useParams} from 'react-router';
import {useAuth} from '../lib/auth';
import {eventTime,loadPublicEvents} from '../lib/public-events';
import type {PublicEvent} from '../lib/public-events';
import {locationDirections} from '../lib/locations';
import EventDescription from '../components/EventDescription';
import '../CSS/EventDetails_style.css';
export default function EventDetails(){
 const {eventId}=useParams(),auth=useAuth(),proof=auth.status==='ready'?auth.session?.csrfToken:undefined;
 const key=eventId+':'+auth.status+':'+(auth.session?.account.userId??'')+':'+(proof??''),[state,setState]=useState<{key:string;event:PublicEvent|null;message:string}|null>(null),[retry,setRetry]=useState(0),[copied,setCopied]=useState('');
 const current=state?.key===key?state:null,event=current?.event;
 useEffect(()=>{const controller=new AbortController();let active=true;loadPublicEvents('/api/events/'+encodeURIComponent(eventId??''),controller.signal,proof).then(data=>{if(!data.event)throw Error('Invalid event');if(active)setState({key,event:data.event,message:''});}).catch(error=>{if(active)setState({key,event:null,message:String(error.message)});});return()=>{active=false;controller.abort();};},[key,eventId,proof,retry]);
 useEffect(()=>{document.title='LAN Party | '+(event?.title??current?.message??'Event');},[event?.title,current?.message]);
 if(!event)return <section className="page-section"><h1>{current?.message==='Event not found'?'Page not found':'Event'}</h1><p role="status">{current?.message??'Loading event…'}</p>{current?.message&&<button className="button" onClick={()=>setRetry(n=>n+1)}>Check again</button>}<p><Link to="/events">All events</Link></p></section>;
 const directions=event.venue?locationDirections(event.venue):null,href=window.location.origin+'/events/'+event.id;
 return <article className="page-section event-details"><p><Link to="/events">← All events</Link></p><img className="event-details-cover" src={EVENT_ARTWORK} alt={EVENT_ARTWORK_ALT}/><h1>{event.title}</h1><p>{eventTime(event.startsAt)} — {eventTime(event.endsAt)} (Netherlands time)</p><EventDescription source={event.description??''}/>
  <section className="event-details-section"><h2>Attendance days</h2><ul>{event.days.map(day=><li key={day.date}>{day.date}: {day.remaining} places remaining</li>)}</ul><p>Registration {event.registrationStatus}. Online registration is not available yet.</p></section>
  <section className="event-details-section"><h2>Venue</h2>{event.venue?<><h3>{event.venue.name}</h3><p>{[event.venue.addressLine,event.venue.postalCode,event.venue.city,event.venue.countryCode].join(', ')}</p><p className="event-details-instructions">{event.venue.instructions}</p>{directions&&<a href={directions} target="_blank" rel="noreferrer">Directions in Google Maps ↗</a>}</>:<p>Venue details are available to signed-in members. <Link to="/login">Log in</Link></p>}</section>
  <div className="event-details-actions"><p role="status">{copied}</p><button className="button button-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(href);setCopied('Event link copied');}catch{setCopied('Copy this event’s address from your browser.');}}}>Copy link</button><a className="button button-secondary" href={'https://wa.me/?text='+encodeURIComponent(event.title+' · '+eventTime(event.startsAt)+' — '+eventTime(event.endsAt)+' (Netherlands time)\n'+href)} target="_blank" rel="noreferrer">Share on WhatsApp ↗</a></div>
 </article>;
}
