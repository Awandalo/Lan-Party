import { Link } from 'react-router';
import {usePublicEvents,eventTime} from '../lib/public-events';
import {EVENT_ARTWORK,EVENT_ARTWORK_ALT} from '../lib/event-artwork';
import {useNews} from '../lib/news';
import {NewsCards} from '../components/NewsReading';
import '../CSS/News_style.css';
import '../CSS/Home_style.css';

export default function Home() {
 const news=useNews('/api/news?limit=4');
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
        {news.loading?<p role="status">Loading news…</p>:news.error?<p role="status">News is temporarily unavailable.</p>:news.data?.articles?.length?<NewsCards articles={news.data.articles}/>:<p>No announcements published yet.</p>}
        <Link className="text-link" to="/news">All news →</Link>
      </section>
    </div>
  );
}

