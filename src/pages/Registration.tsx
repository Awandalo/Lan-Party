import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import PasswordInput from '../components/PasswordInput';
import GoogleButton from '../components/GoogleButton';
import '../CSS/Registration_style.css';

export default function Registration() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [successful, setSuccessful] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const fields = ['nickname', 'firstName', 'lastName', 'email', 'password'] as const;
    const input = Object.fromEntries(fields.map(name => [name, String(data.get(name) ?? '')]));
    setBusy(true); setSuccessful(false); setFeedback('');
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' },
        body: JSON.stringify(input), signal: AbortSignal.timeout(15000),
      });
      if (response.status === 202) {
        setSuccessful(true);
        setFeedback('Check your inbox (and spam folder) for your verification email. If your details were available, we attempted to send it. Follow the link to finish setting up your account and join the party!');
        form.reset();
      } else if (response.status === 400) {
        setFeedback('Please check all five fields. Follow the nickname rules shown with the form, avoid spaces around names or email, and use a password of 12–128 characters.');
      } else if (response.status === 429) {
        setFeedback('Too many registration attempts. Please wait up to one hour before trying again.');
      } else if (response.status === 403) {
        setFeedback('Your request could not be accepted. Reload this page and try again.');
      } else {
        setFeedback('Registration is unavailable. Please try again later.');
      }
    } catch {
      setFeedback('We could not confirm the result. No automatic retry was made. Your account may have been created; check before submitting again.');
    } finally {
      input.password = '';
      const passwordInput = form.elements.namedItem('password');
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
      setBusy(false);
      requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }

  return (
    <section className="page-section registration-page">
      <div className="panel registration-card">
        <p className="eyebrow">Join the party</p>
        <h1>{successful ? "You're almost connected!" : 'Create your account'}</h1>
        {!successful && <>
        <p>Choose a public nickname. Your first name, last name and email stay private.</p>
        <p className="registration-local-notice">{import.meta.env.DEV ? 'Use fictional .test details and a disposable password. ' : 'DEV testing is limited to approved test addresses. '}Verify your email before logging in.</p>
        <GoogleButton /><p>or register with email and password</p>
        <form onSubmit={submit} aria-busy={busy}>
          <fieldset disabled={busy}>
            <legend className="registration-legend">All five fields are required</legend>
            <label htmlFor="registration-nickname">Nickname <span>(public)</span></label>
            <input id="registration-nickname" name="nickname" required minLength={3} maxLength={24}
              autoComplete="nickname" aria-describedby="nickname-rules" pattern="[A-Za-z0-9 _\-]{3,24}" />
            <p id="nickname-rules" className="registration-hint">3–24 letters A–Z, numbers, spaces, underscores or hyphens. No spaces at the ends, repeated spaces, or spaces beside underscores/hyphens. Admin, Moderator and System are reserved. Capitalization is preserved; names are unique regardless of case.</p>
            <label htmlFor="registration-first-name">First name <span>(private)</span></label>
            <input id="registration-first-name" name="firstName" required maxLength={100} autoComplete="given-name" />
            <label htmlFor="registration-last-name">Last name <span>(private)</span></label>
            <input id="registration-last-name" name="lastName" required maxLength={100} autoComplete="family-name" />
            <label htmlFor="registration-email">Email address <span>(private)</span></label>
            <input id="registration-email" name="email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" />
            <label htmlFor="registration-password">Password</label>
            <PasswordInput id="registration-password" name="password" required autoComplete="new-password" aria-describedby="password-rules" />
            <p id="password-rules" className="registration-hint">12–128 characters. Passphrases and Unicode are supported. Your password is never trimmed.</p>
            <button className="button" type="submit">{busy ? 'Creating account…' : 'Create account'}</button>
          </fieldset>
        </form></>}
        <div ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite"
          className={`registration-feedback${successful ? ' registration-success' : ''}`}>{feedback}</div>
        <p><Link to="/login">Back to login</Link></p>
        {successful && <p>No message yet? Delivery may be unavailable, or your details may already be in use. <Link to="/verify-email">Get verification help</Link> or try your existing login.</p>}
        {import.meta.env.DEV && <p><Link to="/local-mail">Restricted local mailbox</Link></p>}
      </div>
    </section>
  );
}
