import { Link } from 'react-router';
import {usePublicEvents,eventTime} from '../lib/public-events';
import {EVENT_ARTWORK,EVENT_ARTWORK_ALT} from '../lib/event-artwork';
import { newsPosts } from '../lib/content';
import '../CSS/Home_style.css';

export default function Home() {
 const upcoming=usePublicEvents('upcoming',true),next=upcoming.events[0];
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">Friends first. Games all weekend.</p>
        <h1 id="home-title">Same crew.<br />Next <span>great LAN.</span></h1>
        <p className="home-intro">Bring your setup, grab a seat, and make a weekend of it.
          Your next get-together starts here.</p>
        {!next&&!upcoming.loading&&<div className="home-actions">
          <Link className="button" to="/events">Explore events <span aria-hidden="true">↗</span></Link>
        </div>}
        <div className="home-motif" aria-hidden="true"><span>PLAY</span><span>TOGETHER</span><i /></div>
      </section>
      <section className={'home-upcoming panel'+(next?' has-event':'')} aria-labelledby="upcoming-title">
        {next&&<img className="home-event-artwork" src={EVENT_ARTWORK} alt={EVENT_ARTWORK_ALT}/>}
        <div><p className="eyebrow">Up next</p><h2 id="upcoming-title">{next?.title??'The next session is taking shape.'}</h2>
          {next?<><p>{eventTime(next.startsAt)} — {eventTime(next.endsAt)} (Netherlands time)</p><p>Registration {next.registrationStatus}</p><ul>{next.days.map(day=><li key={day.date}>{day.date}: {day.remaining} places remaining</li>)}</ul></>:<p role="status">{upcoming.loading?'Loading the next event…':upcoming.message||'Upcoming LAN events will appear here once published.'}</p>}</div>
        <div className="home-upcoming-actions"><Link className={next?'button':'text-link'} to={next?'/events/'+next.id:'/events'}>{next?'View event':'Visit the events page'} <span aria-hidden="true">→</span></Link>{next&&<Link className="button button-secondary home-browse-events" to="/events">Browse all events →</Link>}</div>
      </section>
      <section className="home-news" aria-labelledby="news-title">
        <p className="eyebrow">From the crew</p>
        <h2 id="news-title">Latest news</h2>
        {newsPosts.map((post) => (
          <article className="panel home-news-post" key={post.id}>
            {post.preview && <span className="status-label">Example announcement</span>}
            <h3>{post.title}</h3>
            <p>{post.body}</p>
          </article>
        ))}
      </section>
      <section className="home-features" aria-label="What is coming">
        <article className="panel"><span className="home-number" aria-hidden="true">01 /</span><h2>Find your weekend</h2><p>Planned events and a calendar will make the next LAN easy to find.</p></article>
        <article className="panel"><span className="home-number" aria-hidden="true">02 /</span><h2>Choose your days</h2><p>Future registration will let you select the event days that work for you.</p></article>
        <article className="panel"><span className="home-number" aria-hidden="true">03 /</span><h2>See the crew</h2><p>Display names and daily attendance will help everyone plan their session.</p></article>
      </section>
    </div>
  );
}

