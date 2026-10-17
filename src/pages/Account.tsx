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
  async function resendVerification() {
    if (busy || !session) return;
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1', 'X-CSRF-Token': session.csrfToken },
        body: '{}', signal: AbortSignal.timeout(15000) });
      setFeedback(response.status === 202 ? 'If your account is eligible, a verification email was requested. Check the restricted local mailbox; delivery may be unavailable.'
        : response.status === 429 ? 'Too many requests. Please wait up to one hour.' : 'Request unavailable. Reload and try again later.');
    } catch { setFeedback('Delivery could not be confirmed. No automatic retry was made.'); }
    finally { setBusy(false); }
  }
  return <section className="page-section account-page"><div className="panel account-card">
    <p className="eyebrow">Your account</p><h1>Welcome, {session.account.nickname}</h1>
    <p>You are signed in locally. Your private name and email are not shown here.</p>
    <p>Email status: <strong>{session.emailVerified ? 'Verified' : 'Unverified'}</strong></p>
    <p>Event registration remains unavailable. Verified email will be required when it is implemented.</p>
    {!session.emailVerified && <button className="button" onClick={resendVerification} disabled={busy}>Request verification email</button>}
    <button className="button" onClick={signOut} disabled={busy}>{busy ? 'Logging out…' : 'Log out'}</button>
    <p role="status" aria-live="polite">{feedback}</p>
  </div></section>;
}
