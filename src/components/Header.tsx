import {AUTH_UI_AVAILABLE,authUIEnabled} from '../lib/auth-mode';
import {Link,useLocation} from 'react-router';
import {routeLabel} from '../lib/navigation';
import Icon from './Icon';
import './Header.css';
import { useAuth } from '../lib/auth';
import AccountMenu from './AccountMenu';

export default function Header({onMenu}:{onMenu:()=>void}) {
  const { session } = useAuth();
  const {pathname}=useLocation();
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="navigation-trigger" aria-label="Open navigation" aria-haspopup="dialog" onClick={onMenu}><Icon name="menu"/></button>
        <div className="site-breadcrumb">{pathname.startsWith('/manage')?<><Link to="/manage">Administration</Link><span aria-hidden="true">/</span></>:<span className="header-site-label">LAN Party <span aria-hidden="true">/</span></span>}<span>{routeLabel(pathname)}</span></div>
          <span className="account-nav-slot">{(AUTH_UI_AVAILABLE && authUIEnabled()) && session
            ? <AccountMenu nickname={session.account.nickname} />
            : <Link className="header-login" to="/login">Log in <span aria-hidden="true">↗</span></Link>}</span>
      </div>
    </header>
  );
}

