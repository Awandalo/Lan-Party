import {useEffect,useLayoutEffect,useRef} from 'react';
import {Link,NavLink,useLocation} from 'react-router';
import {useAuth} from '../lib/auth';
import {useAdministration} from '../lib/administration';
import {publicNavigation,administrationNavigation} from '../lib/navigation';
import Icon from './Icon';
export function Brand(){return <Link className="brand" to="/" aria-label="LAN Party home"><span className="brand-mark" aria-hidden="true">LP</span><span>LAN<span className="brand-accent"> / </span>PARTY</span></Link>;}
function Navigation(){
 const access=useAdministration(),{session}=useAuth();
 return <><Brand/><nav className="workspace-navigation" aria-label="Main navigation">{publicNavigation.map(item=><NavLink key={item.href} to={item.href} end><Icon name={item.icon}/>{item.label}</NavLink>)}
  {(access.sections.length>0||access.status==='loading')&&<div className="workspace-admin"><p className="navigation-caption">Administration</p>{access.status==='loading'?<div className="navigation-loading" aria-label="Checking administration access"/>:administrationNavigation.filter(item=>!item.section||access.sections.includes(item.section)).map(item=><NavLink key={item.href} to={item.href} end={item.href==='/manage'}><Icon name={item.icon}/>{item.label}</NavLink>)}</div>}
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
