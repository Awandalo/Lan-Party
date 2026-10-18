import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import './AccountMenu.css';

export default function AccountMenu({ nickname }: { nickname: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const { logout } = useAuth(), navigate = useNavigate(), { pathname } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  async function signOut() {
    if (busy) return;
    setBusy(true); setError('');
    if (await logout()) navigate('/login');
    else { setBusy(false); setError('Logout could not be confirmed. Please try again later.'); }
  }
  // A disclosure with ordinary links/buttons keeps native Tab navigation; no fake menu roles.
  return <div className="account-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button className="account-menu-trigger" ref={trigger} type="button" aria-expanded={open}
      aria-controls="account-navigation" onClick={() => setOpen(value => !value)}>Account <span aria-hidden="true">▾</span></button>
    {open && <div id="account-navigation" className="account-menu-panel" aria-label="Account options">
      <Link className="account-menu-name" to="/account" onClick={() => setOpen(false)}>{nickname}<span>My account</span></Link>
      <Link to="/account/security" onClick={() => setOpen(false)}>Settings <small>Security and sign-in methods</small></Link>
      <button type="button" disabled>Profile <small>Coming soon</small></button>
      <button type="button" disabled>Badge Display Case <small>Coming soon</small></button>
      <hr />
      <button type="button" onClick={signOut} aria-disabled={busy}>{busy ? 'Logging out…' : 'Log out'}</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
