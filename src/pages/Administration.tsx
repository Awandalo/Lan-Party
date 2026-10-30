import Members from './Members';
import Roles,{RoleActivity,RolesLoading} from './Roles';
import {Link, Navigate, useParams} from 'react-router';
import {administrationNavigation} from '../lib/navigation';
import {useAuth} from '../lib/auth';
import {useAdministration} from '../lib/administration';
import '../CSS/Administration_style.css';

const sections = Object.fromEntries(administrationNavigation.filter(item=>item.section).map(item=>[item.section,item.label])) as Record<'users'|'roles'|'events'|'activity',string>;
export default function Administration() {
  const {section:routeSection,userId} = useParams(), {session, status} = useAuth(), access = useAdministration();
  const section = userId ? 'users' : routeSection;
  const loading = status === 'loading' || access.status === 'loading';
  if (loading) return <section className="page-section administration-page" aria-busy="true"><h1>{section === 'users' ? 'Members' : section === 'roles' ? 'Roles & Permissions' : section === 'events' ? 'Events' : section === 'activity' ? 'Role Activity Log' : 'Administration'}</h1><div className="administration-nav administration-skeleton-nav" aria-hidden="true"><span>Overview</span><span>Members</span><span>Roles & Permissions</span><span>Events</span></div>{section==='roles'?<RolesLoading/>:<><p role="status">Checking access…</p><div className="panel administration-panel administration-skeleton" aria-hidden="true"/></>}</section>;
  if (status === 'error' || access.status === 'error') return <section className="page-section"><h1>Administration unavailable</h1><p role="alert">Access could not be checked. Please reload to try again.</p></section>;
  if (!session) return <Navigate to="/login" replace/>;
  const key = section as keyof typeof sections;
  if (section && !Object.hasOwn(sections, section)) return <section className="page-section"><h1>Page not found</h1><Link to="/manage">Administration</Link></section>;
  if (!access.sections.length || section && !access.sections.includes(key)) return <section className="page-section"><h1>Access restricted</h1><p>You do not have permission to open this administration area.</p><Link to="/account">My account</Link></section>;
  return <section className="page-section administration-page">
    <h1>{section ? sections[key] : 'Administration'}</h1>
    {section === 'users' ? <Members/> : section==='roles'?<Roles/>:section==='activity'?<RoleActivity/>:section ? <div className="panel administration-panel"><h2>{sections[key]}</h2><p>Event management will be added here in a later iteration.</p>

    </div> : <><p>Choose an area to get started. Only areas available to your account are shown.</p><div className="administration-grid">
      {access.sections.map(s => <Link className="panel administration-panel" key={s} to={'/manage/'+s}><h2>{sections[s]}</h2></Link>)}
    </div></>}
  </section>;
}
