import NewsManagement from './NewsManagement';
import EventManagement from './EventManagement';
import EventActivityLog from '../components/EventActivityLog';
import Members from './Members';
import Locations from './Locations';
import LocationActivityLog from '../components/LocationActivityLog';
import Roles,{RoleActivity,RolesLoading} from './Roles';
import {Link,NavLink,Navigate,useParams} from 'react-router';
import UserActivityLog from '../components/UserActivityLog';
import {useAuth} from '../lib/auth';
import {useAdministration} from '../lib/administration';
import {useNavigationPrefetch} from '../lib/use-navigation-prefetch';
import {logDestination} from '../lib/navigation';
import '../CSS/Administration_style.css';

const sections={news:'News',feedback:'Feedback',users:'Members',roles:'Roles & Permissions',events:'Events',activity:'Role Activity Log',userActivity:'User Log',locations:'Locations'};
export default function Administration() {
  const {section:routeSection,userId} = useParams(), {session, status} = useAuth(), access = useAdministration();
  const prefetch=useNavigationPrefetch();
  const locationLog=routeSection==='location-activity',eventLog=routeSection==='event-activity';
  const section = userId ? 'users' : routeSection==='user-activity'?'userActivity':locationLog?'locations':eventLog?'events':routeSection;
  const logs=section==='logs'||section==='activity'||section==='userActivity'||locationLog||eventLog;
  const pageClass='page-section administration-page'+(section==='users'?' members-workspace':'');
  const loading = status === 'loading' || access.status === 'loading';
  if (loading) return <section className={pageClass} aria-busy="true"><h1>{section === 'feedback' ? 'Feedback' : section === 'users' ? 'Members' : section === 'roles' ? 'Roles & Permissions' : section === 'events' ? 'Events' : section === 'activity' ? 'Role Activity Log' : section==='userActivity'?'User Log':section==='logs'?'Logs':'Administration'}</h1><div className="administration-nav administration-skeleton-nav" aria-hidden="true"><span>Overview</span><span>Members</span><span>Roles & Permissions</span><span>Events</span></div>{section==='roles'?<RolesLoading/>:<><p role="status">Checking access…</p><div className="panel administration-panel administration-skeleton" aria-hidden="true"/></>}</section>;
  if (status === 'error' || access.status === 'error') return <section className="page-section"><h1>Administration unavailable</h1><p role="alert">Access could not be checked. Please reload to try again.</p></section>;
  if (!session) return <Navigate to="/login" replace/>;
  if(section==='logs'){const destination=logDestination('/manage/logs',access.sections);return destination?<Navigate to={destination.path} replace/>:<section className="page-section"><h1>Access restricted</h1></section>;}
  const key = section as keyof typeof sections;
  if (section && !Object.hasOwn(sections, section)) return <section className="page-section"><h1>Page not found</h1><Link to="/manage">Administration</Link></section>;
  if (!access.sections.length || section && !access.sections.includes(key)) return <section className="page-section"><h1>Access restricted</h1><p>You do not have permission to open this administration area.</p><Link to="/account">My account</Link></section>;
  return <section className={pageClass}>
    <h1>{eventLog?'Events Log':locationLog?'Locations Log':section ? sections[key] : 'Administration'}</h1>
    {logs&&<nav className="logs-navigation" aria-label="Logs">{access.sections.includes('activity')&&<NavLink to="/manage/activity" onPointerEnter={()=>prefetch('/manage/activity')} onFocus={()=>prefetch('/manage/activity')}>Role Activity Log</NavLink>}{access.sections.includes('userActivity')&&<NavLink to="/manage/user-activity" onPointerEnter={()=>prefetch('/manage/user-activity')} onFocus={()=>prefetch('/manage/user-activity')}>User Log</NavLink>}{access.sections.includes('locations')&&<NavLink to="/manage/location-activity" onPointerEnter={()=>prefetch('/manage/location-activity')} onFocus={()=>prefetch('/manage/location-activity')}>Locations</NavLink>}{access.sections.includes('events')&&<NavLink to="/manage/event-activity" onPointerEnter={()=>prefetch('/manage/event-activity')} onFocus={()=>prefetch('/manage/event-activity')}>Events</NavLink>}</nav>}
    {section==='news'?<NewsManagement/>:eventLog?<EventActivityLog/>:section==='events'?<EventManagement/>:locationLog?<LocationActivityLog/>:section==='locations'?<Locations/>:section === 'feedback' ? <Link to="/manage/feedback">Open Feedback inbox</Link> : section === 'users' ? <Members/> : section==='roles'?<Roles/>:section==='activity'?<RoleActivity/>:section==='userActivity'?<UserActivityLog/>:section ? <div className="panel administration-panel"><h2>{sections[key]}</h2><p>Event management will be added here in a later iteration.</p>

    </div> : <><p>Choose an area to get started. Only areas available to your account are shown.</p><div className="administration-grid">
      {access.sections.filter(s=>s!=='activity'&&s!=='userActivity').map(s => <Link className="panel administration-panel" key={s} to={'/manage/'+s}><h2>{sections[s]}</h2></Link>)}
      {(access.sections.includes('activity')||access.sections.includes('userActivity')||access.sections.includes('locations')||access.sections.includes('events'))&&<Link className="panel administration-panel" to="/manage/logs" onPointerEnter={()=>prefetch('/manage/logs')} onFocus={()=>prefetch('/manage/logs')}><h2>Logs</h2></Link>}
    </div></>}
  </section>;
}
