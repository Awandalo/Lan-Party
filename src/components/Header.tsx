import {useRef,useState} from 'react';
import {AUTH_UI_AVAILABLE,authUIEnabled} from '../lib/auth-mode';
import {Link,useLocation,useNavigate} from 'react-router';
import {routeLabel} from '../lib/navigation';
import Icon from './Icon';
import './Header.css';
import {useAuth} from '../lib/auth';

export default function Header({onMenu}:{onMenu:()=>void}) {
 const {session,logout}=useAuth(),{pathname}=useLocation(),navigate=useNavigate();
 // Header remains mounted while logout invalidates its session-conditional content.
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[tooltipDismissed,setTooltipDismissed]=useState(false),pending=useRef(false);
 async function signOut(){
  if(pending.current)return;pending.current=true;setBusy(true);setError('');
  try{if(await logout())navigate('/login');else setError('Sign out could not be confirmed. Please try again.');}
  finally{pending.current=false;setBusy(false);}
 }
 return <header className="site-header"><div className="header-inner">
  <button className="navigation-trigger" aria-label="Open navigation" aria-haspopup="dialog" onClick={onMenu}><Icon name="menu"/></button>
  <div className="site-breadcrumb">{pathname.startsWith('/manage')?<><Link to="/manage">Administration</Link><span aria-hidden="true">/</span></>:<span className="header-site-label">LAN Party <span aria-hidden="true">/</span></span>}<span>{routeLabel(pathname)}</span></div>
  <span className="account-nav-slot">{busy||((AUTH_UI_AVAILABLE&&authUIEnabled())&&session)?<span className="sign-out-control"><button type="button" className="sign-out-button" aria-label="Sign out" aria-describedby={tooltipDismissed?undefined:'sign-out-tooltip'} disabled={busy} aria-busy={busy} onFocus={()=>setTooltipDismissed(false)} onMouseEnter={()=>setTooltipDismissed(false)} onKeyDown={event=>{if(event.key==='Escape')setTooltipDismissed(true);}} onClick={()=>void signOut()}><Icon name="power"/></button>{!tooltipDismissed&&<span id="sign-out-tooltip" role="tooltip">{busy?'Signing out…':'Sign out'}</span>}</span>:<Link className="header-login" to="/login">Log in <span aria-hidden="true">↗</span></Link>}</span>
 </div>{error&&<p className="header-feedback" role="alert">{error}</p>}</header>;
}
