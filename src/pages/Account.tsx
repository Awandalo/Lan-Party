import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import '../CSS/Account_style.css';

export default function Account() {
  const { session, status, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <section className="page-section"><h1>Account unavailable</h1><p>We could not check your session. Reload after checking the local server.</p></section>;
  if (!session) return <Navigate to="/login" replace />;
  async function signOut() {
    if (busy) return;
    setBusy(true); setFeedback('');
    if (await logout()) navigate('/login', { replace: true });
    else setFeedback('Logout could not be confirmed. Your session may still be active. Reload and try again.');
    setBusy(false);
  }
  return <section className="page-section account-page"><div className="panel account-card">
    <p className="eyebrow">Your account</p><h1>Welcome, {session.account.nickname}</h1>
    <p>You are signed in locally. Your private name and email are not shown here.</p>
    <p>Email verification is not implemented yet. Event registration remains unavailable.</p>
    <button className="button" onClick={signOut} disabled={busy}>{busy ? 'Logging out…' : 'Log out'}</button>
    <p role="status" aria-live="polite">{feedback}</p>
  </div></section>;
}
