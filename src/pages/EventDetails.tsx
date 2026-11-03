import {EVENT_ARTWORK,EVENT_ARTWORK_ALT} from '../lib/event-artwork';
import {lazy,Suspense,useEffect,useState} from 'react';
import {Link,useLocation,useNavigate,useParams} from 'react-router';
import {useAuth} from '../lib/auth';
import {eventTime,loadPublicEvents} from '../lib/public-events';
import type {PublicEvent} from '../lib/public-events';
import {locationDirections} from '../lib/locations';
import EventDescription from '../components/EventDescription';
import '../CSS/EventDetails_style.css';
const EventRegistration=(import.meta.env.DEV||import.meta.env.VITE_AUTH_MODE==='hosted-dev')?lazy(()=>import('../components/EventRegistration')):null;
export default function EventDetails(){
 const {eventId}=useParams(),location=useLocation(),navigate=useNavigate(),auth=useAuth(),proof=auth.status==='ready'?auth.session?.csrfToken:undefined;
 const registration=location.pathname.endsWith('/registration'),selectedDay=new URLSearchParams(location.search).get('day');
 const key=eventId+':'+auth.status+':'+(auth.session?.account.userId??'')+':'+(proof??''),[state,setState]=useState<{key:string;event:PublicEvent|null;message:string}|null>(null),[retry,setRetry]=useState(0),[copied,setCopied]=useState('');
 const current=state?.key===key?state:null,event=current?.event;
 useEffect(()=>{const controller=new AbortController();let active=true;loadPublicEvents('/api/events/'+encodeURIComponent(eventId??''),controller.signal,proof).then(data=>{if(!data.event)throw Error('Invalid event');if(active)setState({key,event:data.event,message:''});}).catch(error=>{if(active)setState({key,event:null,message:String(error.message)});});return()=>{active=false;controller.abort();};},[key,eventId,proof,retry]);
 useEffect(()=>{document.title='LAN Party | '+(event?.title??current?.message??'Event')+(registration?' · Your registration':'');},[event?.title,current?.message,registration]);
 if(!event)return <section className="page-section"><h1>{current?.message==='Event not found'?'Page not found':'Event'}</h1><p role="status">{current?.message??'Loading event…'}</p>{current?.message&&<button className="button" onClick={()=>setRetry(n=>n+1)}>Check again</button>}<p><Link to="/events">All events</Link></p></section>;
 const directions=event.venue?locationDirections(event.venue):null,base='/events/'+event.id,href=window.location.origin+base;
 const showRegistration=(day?:string)=>navigate(base+'/registration'+(day?'?'+new URLSearchParams({day}):''));
 return <article className="page-section event-details"><p><Link to="/events">← All events</Link></p><img className="event-details-cover" src={EVENT_ARTWORK} alt={EVENT_ARTWORK_ALT}/><h1>{event.title}</h1><p>{eventTime(event.startsAt)} — {eventTime(event.endsAt)} (Netherlands time)</p>
  <nav className="event-member-navigation" aria-label="Event pages"><Link className={'button button-secondary'+(!registration?' selected':'')} to={base} aria-current={!registration?'page':undefined}>Event details</Link><Link className={'button button-secondary'+(registration?' selected':'')} to={base+'/registration'} aria-current={registration?'page':undefined}>Your registration &amp; crew</Link></nav>
  {!registration&&<><EventDescription source={event.description??''}/><section className="event-details-section"><h2>Venue</h2>{event.venue?<><h3>{event.venue.name}</h3><p>{[event.venue.addressLine,event.venue.postalCode,event.venue.city,event.venue.countryCode].join(', ')}</p><p className="event-details-instructions">{event.venue.instructions}</p>{directions&&<a href={directions} target="_blank" rel="noreferrer">Directions in Google Maps ↗</a>}</>:<p>Venue details are available to signed-in members. <Link to="/login">Log in</Link></p>}</section>{!proof&&<section className="event-details-section"><h2>Attendance days</h2><ul>{event.days.map(d=><li key={d.date}>{d.date.split('-').reverse().join('-')}: {d.remaining} places remaining</li>)}</ul></section>}</>}
  {EventRegistration&&<Suspense fallback={<p>Loading registration…</p>}><EventRegistration key={key} id={event.id} view={registration?'registration':'details'} selectedDay={selectedDay} onShowRegistration={showRegistration} onChange={()=>setRetry(n=>n+1)}/></Suspense>}
  {!registration&&<div className="event-details-actions"><p role="status">{copied}</p><button className="button button-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(href);setCopied('Event link copied');}catch{setCopied('Copy this event’s address from your browser.');}}}>Copy link</button><a className="button button-secondary" href={'https://wa.me/?text='+encodeURIComponent(event.title+' · '+eventTime(event.startsAt)+' — '+eventTime(event.endsAt)+' (Netherlands time)\n'+href)} target="_blank" rel="noreferrer">Share on WhatsApp ↗</a></div>}
 </article>;
}
