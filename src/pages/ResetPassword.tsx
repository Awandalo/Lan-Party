import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { clearResetLink, getResetLink } from '../lib/verification-link';
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
    const confirmation = String(data.get('confirmation') ?? '');
    if (input.password !== confirmation || Array.from(input.password).length < 12 || Array.from(input.password).length > 128) {
      setFeedback('Use matching passwords of 12–128 characters. Your password is never trimmed.');
      requestAnimationFrame(() => feedbackRef.current?.focus()); return;
    }
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/reset-password', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        discardProof(); setComplete(true);
        setFeedback('Password reset. All previous sessions were revoked. Log in with your new password.');
        await refresh();
      } else if (response.status === 400) { discardProof(); setFeedback('The link or password was not accepted. Request a new link and use a password of 12–128 characters.'); }
      else if (response.status === 429) setFeedback('Too many attempts. Please wait up to one hour, then request a fresh link.');
      else setFeedback('Password recovery is unavailable. No success was confirmed. Please try again later.');
    } catch { setFeedback('The result is uncertain. Try logging in with your new password before requesting another reset. No automatic retry was made.'); }
    finally {
      input.password = '';
      for (const name of ['password', 'confirmation']) {
        const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement) field.value = '';
      }
      setBusy(false); requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }
  return <section className="page-section reset-password-page"><div className="panel reset-password-card">
    <p className="eyebrow">Account recovery</p><h1>Reset your password</h1>
    <p>Opening a link does not change your password. A successful reset signs out every existing session.</p>
    {proof && !complete && <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      <legend>Choose a new password</legend><label htmlFor="reset-password">New password</label>
      <input id="reset-password" name="password" type="password" required autoComplete="new-password" aria-describedby="reset-policy" />
      <p id="reset-policy">12–128 characters. Passphrases and Unicode are supported. Passwords are never trimmed.</p>
      <label htmlFor="reset-confirmation">Confirm new password</label>
      <input id="reset-confirmation" name="confirmation" type="password" required autoComplete="new-password" />
      <button className="button" type="submit">{busy ? 'Resetting…' : 'Set new password'}</button>
    </fieldset></form>}
    {!proof && !complete && <p>No reset confirmation is loaded. Open your latest reset message or request a new link.</p>}
    <div className="reset-password-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    <p><Link to="/login">Log in</Link> · <Link to="/forgot-password">Request a new reset link</Link></p>
  </div></section>;
}
