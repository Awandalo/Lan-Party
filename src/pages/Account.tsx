import RecoveryWarning from '../components/RecoveryWarning';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import '../CSS/Account_style.css';
import { formatMemberNumber } from '../lib/member-number';

export default function Account() {
  const { session, status } = useAuth();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'error') return <section className="page-section"><h1>Account unavailable</h1><p>We could not check your session. Reload after trying again later.</p></section>;
  if (!session) return <Navigate to="/login" replace />;
  async function resendVerification() {
    if (busy || !session) return;
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1', 'X-CSRF-Token': session.csrfToken },
        body: '{}', signal: AbortSignal.timeout(15000) });
      setFeedback(response.status === 202 ? 'If your account is eligible, a verification email was requested. Check your email messages; delivery may be unavailable.'
        : response.status === 429 ? 'Too many requests. Please wait up to one hour.' : 'Request unavailable. Reload and try again later.');
    } catch { setFeedback('Delivery could not be confirmed. No automatic retry was made.'); }
    finally { setBusy(false); }
  }
  return <section className="page-section account-page"><div className="panel account-card">
    <p className="eyebrow">Your account</p><h1>Welcome, {session.account.nickname} {formatMemberNumber(session.account.memberNumber)}</h1>
    <Link className="button button-secondary" to="/account/profile">Edit profile</Link>
    <RecoveryWarning remaining={session.recoveryCodesRemaining}/>
    <div className="account-updates">
      <section aria-labelledby="account-events"><h2 id="account-events">Upcoming events</h2><p>Find your next LAN, choose your days and see who is coming.</p><Link className="button button-secondary" to="/events">Browse events →</Link></section>
      <section aria-labelledby="account-polls"><h2 id="account-polls">Upcoming polls</h2><p>Help shape the next LAN with your vote.</p><Link className="button button-secondary" to="/news?polls=open">View open polls →</Link></section>
      <section aria-labelledby="account-news"><h2 id="account-news">Latest news</h2><p>Read the latest announcements and updates from the crew.</p><Link className="button button-secondary" to="/news">Read news →</Link></section>
    </div>
    {!session.emailVerified && <button className="button" onClick={resendVerification} disabled={busy}>Request verification email</button>}
    <p role="status" aria-live="polite">{feedback}</p>
  </div></section>;
}
