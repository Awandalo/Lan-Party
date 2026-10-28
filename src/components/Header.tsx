import {useAdministration} from '../lib/administration';
import { AUTH_UI_AVAILABLE, authUIEnabled } from '../lib/auth-mode';
import { Link, NavLink } from 'react-router';
import './Header.css';
import { useAuth } from '../lib/auth';
import AccountMenu from './AccountMenu';

export default function Header() {
  const { session } = useAuth();
  const access = useAdministration();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" to="/" aria-label="LAN Party home">
          <span className="brand-mark" aria-hidden="true">LP</span>
          <span>LAN<span className="brand-accent"> / </span>PARTY</span>
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/events">Events</NavLink>
          {(access.sections.length > 0 || access.status === 'loading') && <span className="administration-nav-slot">{access.sections.length > 0 ? <NavLink to="/manage">Administration</NavLink> : <span className="administration-nav-placeholder" aria-hidden="true">Administration</span>}</span>}
          <span className="account-nav-slot">{(AUTH_UI_AVAILABLE && authUIEnabled()) && session
            ? <AccountMenu nickname={session.account.nickname} />
            : <NavLink to="/login">Login</NavLink>}</span>
        </nav>
      </div>
    </header>
  );
}

