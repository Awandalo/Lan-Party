import { useState } from 'react';
import type { FormEvent } from 'react';
import '../CSS/LocalMail_style.css';

export default function LocalMail() {
  const [link, setLink] = useState<string | null>(null), [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  async function retrieve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    setBusy(true); setLink(null); setFeedback('');
    try {
      const response = await fetch('/api/auth/local-mail', { method: 'POST', credentials: 'omit', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1', Authorization: `Bearer ${String(data.get('secret') ?? '')}` },
        body: JSON.stringify({ email: String(data.get('email') ?? ''), purpose: String(data.get('purpose') ?? '') }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('Mailbox unavailable');
      const value = await response.json();
      if (!value.mail) setFeedback('No usable message. Request a new email if the local Worker restarted or a link was replaced.');
      else {
        const url = new URL(value.mail.url);
        if (url.origin !== window.location.origin || !['/verify-email', '/reset-password', '/account/security'].includes(url.pathname)) throw new Error('Unexpected link');
        setLink(url.href); setFeedback('One disposable account message retrieved. Open it now; the link is not saved.');
      }
    } catch { setFeedback('Mailbox access denied or unavailable. Check your separate local mailbox secret and configuration.'); }
    finally {
      const secret = form.elements.namedItem('secret');
      if (secret instanceof HTMLInputElement) secret.value = '';
      setBusy(false);
    }
  }
  return <section className="page-section local-mail-page"><div className="panel local-mail-card">
    <p className="eyebrow">Development tool</p><h1>Restricted local mailbox</h1>
    <p>Fictional .test accounts only. A separate disposable mailbox secret is required. No real email is sent; messages are lost when the local Worker restarts.</p>
    <form onSubmit={retrieve}><fieldset disabled={busy}>
      <legend>Retrieve one test message</legend>
      <label htmlFor="mail-email">Fictional email address</label>
      <input id="mail-email" name="email" type="email" autoComplete="off" required maxLength={254} />
      <label htmlFor="mail-purpose">Message type</label>
      <select id="mail-purpose" name="purpose"><option value="email-verification">Email verification</option><option value="password-reset">Password reset</option><option value="password-setup">First password confirmation</option></select>
      <label htmlFor="mail-secret">Local mailbox secret</label>
      <input id="mail-secret" name="secret" type="password" autoComplete="off" required />
      <button className="button" type="submit">{busy ? 'Retrieving…' : 'Retrieve local message'}</button>
    </fieldset></form>
    <p role="status" aria-live="polite">{feedback}</p>
    {link && <button className="button" onClick={() => window.location.assign(link)}>Open account message</button>}
  </div></section>;
}
