import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import '../CSS/ForgotPassword_style.css';

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const [complete, setComplete] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/forgot-password', { method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(15000) });
      if (response.status === 202) setComplete(true);
      setFeedback(response.status === 202 ? ''
        : response.status === 429 ? 'Too many requests. Please wait up to one hour.'
          : response.status === 400 ? 'Check your email address.' : 'Password recovery is unavailable. Please try again later.');
    } catch { setFeedback('The result could not be confirmed. No automatic retry was made.'); }
    finally { setBusy(false); requestAnimationFrame(() => (document.getElementById('forgot-success') ?? feedbackRef.current)?.focus()); }
  }
  return <section className="page-section forgot-password-page"><div className="panel forgot-password-card">
    <p className="eyebrow">Account recovery</p><h1 id={complete ? 'forgot-success' : undefined} tabIndex={complete ? -1 : undefined}>{complete ? 'Check your inbox!' : 'Forgot your password?'}</h1>
    {complete ? <><p>If an account matches that email address, you'll receive a password-reset link shortly.</p><p>Follow the link to choose a new password and get back into the game. The link expires after 30 minutes.</p><p>No message yet? Check your spam folder. Delivery may be unavailable; contact the organizers if you need help.</p></> : <>
    <p>No worries! Enter your email address and we'll send you a link to get back into the game.</p>
    <p className="recovery-hint">Reset links expire in 30 minutes and work once.</p>
    <form onSubmit={submit}><fieldset disabled={busy} aria-label="Password recovery">
      <label htmlFor="forgot-email">Email address</label>
      <input id="forgot-email" name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" />
      <button className="button" type="submit">{busy ? 'Requesting…' : 'Send reset link'}</button>
    </fieldset></form></>}
    <div className="forgot-password-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    <p>{import.meta.env.DEV && <><Link to="/local-mail">Restricted local mailbox</Link> · </>}<Link to="/login">Back to login</Link></p>
  </div></section>;
}
