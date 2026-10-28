import {Link, NavLink, Navigate, useParams} from 'react-router';
import {useAuth} from '../lib/auth';
import {useAdministration} from '../lib/administration';
import '../CSS/Administration_style.css';

const sections = {users: 'Members', roles: 'Roles & Permissions', events: 'Events'};
export default function Administration() {
  const {section} = useParams(), {session, status} = useAuth(), access = useAdministration();
  const loading = status === 'loading' || access.status === 'loading';
  if (loading) return <section className="page-section administration-page" aria-busy="true"><p className="eyebrow">Administration</p><h1>{section === 'users' ? 'Members' : section === 'roles' ? 'Roles & Permissions' : section === 'events' ? 'Events' : 'Administration'}</h1><div className="administration-nav administration-skeleton-nav" aria-hidden="true"><span>Overview</span><span>Members</span><span>Roles & Permissions</span><span>Events</span></div><p role="status">Checking access…</p><div className="panel administration-panel administration-skeleton" aria-hidden="true"/></section>;
  if (status === 'error' || access.status === 'error') return <section className="page-section"><h1>Administration unavailable</h1><p role="alert">Access could not be checked. Please reload to try again.</p></section>;
  if (!session) return <Navigate to="/login" replace/>;
  const key = section as keyof typeof sections;
  if (section && !Object.hasOwn(sections, section)) return <section className="page-section"><h1>Page not found</h1><Link to="/manage">Administration</Link></section>;
  if (!access.sections.length || section && !access.sections.includes(key)) return <section className="page-section"><h1>Access restricted</h1><p>You do not have permission to open this administration area.</p><Link to="/account">My account</Link></section>;
  return <section className="page-section administration-page">
    <p className="eyebrow">Administration</p><h1>{section ? sections[key] : 'Administration'}</h1>
    <nav className="administration-nav" aria-label="Administration"><NavLink to="/manage" end>Overview</NavLink>
      {access.sections.map(s => <NavLink key={s} to={'/manage/'+s}>{sections[s]}</NavLink>)}
    </nav>
    {section ? <div className="panel administration-panel"><h2>{sections[key]}</h2><p>{key === 'users' ? 'Member browsing and management will be added in a later iteration.' : key === 'roles' ? 'Role and permission editing will be added in a later iteration.' : 'Event management will be added here in a later iteration.'}</p>
      {key === 'users' && <p>Existing account reactivation remains available through Account Security for eligible administrators.</p>}
    </div> : <><p>Choose an area to get started. Only areas available to your account are shown.</p><div className="administration-grid">
      {access.sections.map(s => <Link className="panel administration-panel" key={s} to={'/manage/'+s}><h2>{sections[s]}</h2><p>Open {sections[s]}</p></Link>)}
    </div></>}
    <Link to="/events">Browse events</Link>
  </section>;
}
