import {Link} from 'react-router';
import {useAdministration} from '../lib/administration';
import { useState } from 'react';
import { publishedEvents } from '../lib/content';
import type { PublicEvent } from '../lib/content';
import '../CSS/Events_style.css';

export default function Events() {
  const access = useAdministration();
  const [period, setPeriod] = useState<PublicEvent['period']>('upcoming');
  const events = publishedEvents.filter((event) => event.period === period);

  return (
    <section className="page-section events-page">
      <p className="eyebrow">Make room for a weekend</p>
      <h1>Events</h1>
      {access.sections.includes('events') && <Link className="button" to="/manage/events">Manage events</Link>}
      <p className="page-intro">Find your next LAN or look back at past weekends.
        Registration will be available from each event's own page.</p>
      <div className="events-filters" role="group" aria-label="Filter events">
        <button type="button" aria-pressed={period === 'upcoming'} onClick={() => setPeriod('upcoming')}>Upcoming events</button>
        <button type="button" aria-pressed={period === 'past'} onClick={() => setPeriod('past')}>Past events</button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {events.length === 0 ? (
          <div className="panel events-empty">
            <span className="status-label">Coming soon</span>
            <h2>{period === 'upcoming' ? 'No upcoming events published yet' : 'No past events to show yet'}</h2>
            <p>{period === 'upcoming'
              ? 'Once organizers publish a LAN, you will find its dates, details, and day-by-day registration here.'
              : 'Completed LAN parties will appear here so you can revisit previous get-togethers.'}</p>
          </div>
        ) : (
          <div className="events-list">
            {events.map((event) => (
              <article className="panel" key={event.id}><h2>{event.title}</h2><p>{event.summary}</p></article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

