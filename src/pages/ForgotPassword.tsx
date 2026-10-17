import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import '../CSS/ForgotPassword_style.css';

export default function ForgotPassword() {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
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
      setFeedback(response.status === 202 ? 'If an eligible account exists, a password-reset email was requested. Check your email messages. Delivery may be unavailable; try again later if needed.'
        : response.status === 429 ? 'Too many requests. Please wait up to one hour.'
          : response.status === 400 ? 'Check your email address.' : 'Password recovery is unavailable. Please try again later.');
    } catch { setFeedback('The result could not be confirmed. No automatic retry was made.'); }
    finally { setBusy(false); requestAnimationFrame(() => feedbackRef.current?.focus()); }
  }
  return <section className="page-section forgot-password-page"><div className="panel forgot-password-card">
    <p className="eyebrow">Account recovery</p><h1>Forgot your password?</h1>
    <p>Reset links expire in 30 minutes and work once.</p>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <legend>Request a reset link</legend><label htmlFor="forgot-email">Email address</label>
      <input id="forgot-email" name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" />
      <button className="button" type="submit">{busy ? 'Requesting…' : 'Request password reset'}</button>
    </fieldset></form>
    <div className="forgot-password-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    <p>{import.meta.env.DEV && <><Link to="/local-mail">Restricted local mailbox</Link> · </>}<Link to="/login">Back to login</Link></p>
  </div></section>;
}
