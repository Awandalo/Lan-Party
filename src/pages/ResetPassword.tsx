import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { clearResetLink, getResetLink } from '../lib/verification-link';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../lib/auth';
import '../CSS/ResetPassword_style.css';

export default function ResetPassword() {
  const [proof, setProof] = useState(getResetLink), [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(''), [complete, setComplete] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const { refresh } = useAuth();
  useEffect(() => () => clearResetLink(), []);
  function discardProof() { clearResetLink(); setProof(null); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !proof) return;
    const form = event.currentTarget, data = new FormData(form);
    const input = { ...proof, password: String(data.get('password') ?? '') };
    if (Array.from(input.password).length < 12 || Array.from(input.password).length > 128) {
      setFeedback('Use a password of 12–128 characters. Your password is never trimmed.');
      requestAnimationFrame(() => feedbackRef.current?.focus()); return;
    }
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        discardProof(); setComplete(true);
        setFeedback('');
        await refresh();
      } else if (response.status === 400) { discardProof(); setFeedback('The link or password was not accepted. Request a new link and use a password of 12–128 characters.'); }
      else if (response.status === 429) setFeedback('Too many attempts. Please wait up to one hour, then request a fresh link.');
      else setFeedback('Password recovery is unavailable. No success was confirmed. Please try again later.');
    } catch { setFeedback('The result is uncertain. Try logging in with your new password before requesting another reset. No automatic retry was made.'); }
    finally {
      input.password = '';
      const field = form.elements.namedItem('password');
      if (field instanceof HTMLInputElement) field.value = '';
      setBusy(false); requestAnimationFrame(() => (document.getElementById('reset-success') ?? feedbackRef.current)?.focus());
    }
  }
  return <section className="page-section reset-password-page"><div className="panel reset-password-card">
    <p className="eyebrow">Account recovery</p><h1 id={complete ? 'reset-success' : undefined} tabIndex={complete ? -1 : undefined}>{complete ? 'Password updated!' : 'Time for a new password!'}</h1>
    {complete ? <><p>You're ready to get back into the game! Your password has been changed successfully.</p><p>For your security, you've been signed out on all devices. Sign in again with your new password.</p></> : <p>Choose a new password and get back into the game. For your security, you'll be signed out on any other devices.</p>}
    {proof && !complete && <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy} aria-label="Password reset">
      <label htmlFor="reset-password">New password</label>
      <PasswordInput id="reset-password" name="password" required autoComplete="new-password" aria-describedby="reset-policy" />
      <p id="reset-policy">12–128 characters. Passphrases and Unicode are supported. Passwords are never trimmed.</p>
      <button className="button" type="submit">{busy ? 'Resetting…' : 'Set new password'}</button>
    </fieldset></form>}
    {!proof && !complete && <p>No reset confirmation is loaded. Open your latest reset message or request a new link.</p>}
    <div className="reset-password-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    <p><Link className={complete ? 'button' : undefined} to="/login">{complete ? 'Continue to login' : 'Log in'}</Link>{!complete && !proof && <> · <Link to="/forgot-password">Request a new reset link</Link></>}</p>
  </div></section>;
}
