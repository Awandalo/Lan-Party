import {useFeedback} from '../lib/feedback';
import {useEffect,useLayoutEffect,useRef} from 'react';
import {Link,NavLink,useLocation} from 'react-router';
import {useAuth} from '../lib/auth';
import {useAdministration} from '../lib/administration';
import {publicNavigation,contextualNavigation,mainArea,isLogs} from '../lib/navigation';
import Icon from './Icon';
export function Brand(){return <Link className="brand" to="/" aria-label="LAN Party home"><span className="brand-mark" aria-hidden="true">LP</span><span>LAN<span className="brand-accent"> / </span>PARTY</span></Link>;}
function Navigation(){
 const {adminUnread}=useFeedback();
 const access=useAdministration(),{session}=useAuth(),{pathname}=useLocation(),area=mainArea(pathname);
 const children=contextualNavigation(pathname,access.status==='ready'?access.sections:[],!!session);
 return <><Brand/><nav className="workspace-navigation" aria-label="Main navigation">{publicNavigation.map(item=><NavLink key={item.href} to={item.href} end><Icon name={item.icon}/>{item.label}</NavLink>)}
  {session&&access.status==='ready'&&access.sections.length>0&&<NavLink to="/manage"><Icon name="grid"/>Administration</NavLink>}
  {session&&<NavLink to="/account"><Icon name="settings"/>User Settings</NavLink>}
  {children.length>0&&<div className="workspace-admin" aria-label={area==='account'?'User Settings navigation':'Administration navigation'}><p className="navigation-caption">{area==='account'?'User Settings':'Administration'}</p>{children.map(item=>{const active=item.href==='/manage/logs'?isLogs(pathname):pathname===item.href||!['/manage','/account'].includes(item.href)&&pathname.startsWith(item.href+'/');return <Link key={item.href} to={item.href} className={active?'active':undefined} aria-current={active?'page':undefined}><Icon name={item.icon}/>{item.label}{item.href==='/manage/feedback'&&adminUnread>0&&<span className="feedback-nav-count" aria-label={adminUnread+' unread requests'}>{adminUnread}</span>}</Link>;})}</div>}
 </nav><div className="navigation-bottom"><p className="navigation-caption">Good friends. Great games.</p>{session?<Link to="/account">My account <span aria-hidden="true">↗</span></Link>:<Link to="/login">Join the next get-together <span aria-hidden="true">↗</span></Link>}<Link to="/privacy">Privacy Policy</Link><small>Made for our crew.</small></div></>;
}
export default function SiteNavigation({open,onClose}:{open:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),{pathname}=useLocation();
 // Close before RouteFocus's passive effect: native dialog focus restoration
 // must not steal focus back from the destination's main content.
 useLayoutEffect(()=>{if(dialog.current?.open)dialog.current.close();onClose();},[pathname,onClose]);
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current.close();},[open]);
 return <><aside className="site-sidebar"><Navigation/></aside><dialog ref={dialog} className="navigation-drawer" aria-label="Site navigation" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><button className="drawer-close button button-secondary" onClick={onClose} aria-label="Close navigation">✕</button><Navigation/></dialog></>;
}
