import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { clearVerificationLink, getVerificationLink } from '../lib/verification-link';
import { useAuth } from '../lib/auth';
import '../CSS/VerifyEmail_style.css';

export default function VerifyEmail() {
  const [proof, setProof] = useState(getVerificationLink);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const [verified, setVerified] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const { refresh } = useAuth();
  useEffect(() => () => clearVerificationLink(), []);
  async function confirm() {
    if (busy || !proof) return;
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/verify-email', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify(proof),
        signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        setVerified(true); setFeedback('');
        await refresh();
      } else if (response.status === 400) setFeedback('This link is invalid, expired or already used. Request a new email below.');
      else if (response.status === 429) setFeedback('Too many attempts. Please wait up to one hour.');
      else setFeedback('Verification is unavailable. Request a new email after trying again later.');
    } catch { setFeedback('We could not confirm the result. Check your account before requesting a new email. No automatic retry was made.'); }
    finally {
      clearVerificationLink(); setProof(null); setBusy(false);
      requestAnimationFrame(() => (document.getElementById('verification-success') ?? feedbackRef.current)?.focus());
    }
  }
  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/resend-verification', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(15000) });
      setFeedback(response.status === 202 ? 'If an eligible unverified account exists, a verification email was requested. Check your email messages. Delivery may be unavailable; try again later if needed.'
        : response.status === 429 ? 'Too many requests. Please wait up to one hour.'
          : 'Request unavailable. Check the email address and service availability.');
    } catch { setFeedback('The result could not be confirmed. No automatic retry was made.'); }
    finally { setBusy(false); requestAnimationFrame(() => feedbackRef.current?.focus()); }
  }
  return <section className="page-section verification-page"><div className="panel verification-card" aria-busy={busy}>
    <p className="eyebrow">Account security</p><h1 id={verified ? 'verification-success' : undefined} tabIndex={verified ? -1 : undefined}>{verified ? 'Email verified!' : 'Verify your email'}</h1>
    {verified ? <><p>Your LAN Party account is ready. You can now sign in and join the party!</p>
      <Link className="button" to="/login">Continue to login</Link></>
      : <p>Opening this link does not verify your account. Select Verify my email to confirm. Links expire after 24 hours and work once.</p>}
    {proof && !verified && <button className="button" onClick={confirm} disabled={busy}>{busy ? 'Verifying…' : 'Verify my email'}</button>}
    {!proof && !verified && <p>No pending confirmation is loaded. Open your latest verification message or request a new one.</p>}
    <div ref={feedbackRef} className="verification-feedback" tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    {!verified && !proof && <form onSubmit={resend}><fieldset disabled={busy}>
      <legend>Request another verification email</legend>
      <label htmlFor="verification-email">Email address</label>
      <input id="verification-email" name="email" type="email" required maxLength={254} autoComplete="email" />
      <button className="button" type="submit">Request verification email</button>
    </fieldset></form>}
    {!verified && <p><Link to="/login">Log in</Link> · <Link to="/account">Your account</Link>{import.meta.env.DEV && <> · <Link to="/local-mail">Restricted local mailbox</Link></>}</p>}
  </div></section>;
}
