import { Link } from 'react-router';
import { newsPosts } from '../lib/content';
import '../CSS/Home_style.css';

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-title">
        <p className="eyebrow">Friends first. Games all weekend.</p>
        <h1 id="home-title">Same crew.<br />Next <span>great LAN.</span></h1>
        <p className="home-intro">Bring your setup, grab a seat, and make a weekend of it.
          Your next get-together starts here.</p>
        <div className="home-actions">
          <Link className="button" to="/events">Explore events <span aria-hidden="true">↗</span></Link>
        </div>
        <div className="home-motif" aria-hidden="true"><span>PLAY</span><span>TOGETHER</span><i /></div>
      </section>
      <section className="home-upcoming panel" aria-labelledby="upcoming-title">
        <div><p className="eyebrow">Up next</p><h2 id="upcoming-title">The next session is taking shape.</h2>
          <p>Upcoming LAN events will appear here once event publishing is ready.
            No events are published in this preview.</p></div>
        <Link className="text-link" to="/events">Visit the events page <span aria-hidden="true">→</span></Link>
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

