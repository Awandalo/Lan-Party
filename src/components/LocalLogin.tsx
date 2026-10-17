import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';

export default function LocalLogin() {
  const { session, status, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  if (session) return <Navigate to="/account" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget, data = new FormData(form);
    const input = { email: String(data.get('email') ?? ''), password: String(data.get('password') ?? '') };
    setBusy(true); setFeedback('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        if (await refresh()) navigate('/account', { replace: true });
        else setFeedback('Login could not be confirmed. Check that your browser accepts secure cookies, then reload.');
      } else if ([400, 401].includes(response.status)) setFeedback('Email or password is incorrect.');
      else if (response.status === 429) setFeedback('Too many login attempts. Please wait up to one hour before trying again.');
      else if (response.status === 403) setFeedback('Request rejected. Reload this page and try again.');
      else setFeedback('Login is temporarily unavailable. Please try again later.');
    } catch { setFeedback('We could not confirm your login. Reload before trying again. No automatic retry was made.'); }
    finally {
      input.password = '';
      const password = form.elements.namedItem('password');
      if (password instanceof HTMLInputElement) password.value = '';
      setBusy(false); requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }
  return <section className="page-section login-page"><div className="panel login-card">
    <p className="eyebrow">Welcome back</p><h1>Login</h1>
    <p>Verify your email before logging in.</p>
    {status === 'error' && <p role="status">Session service unavailable. Please reload and try again.</p>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset className="login-fields" disabled={busy || status === 'loading'}>
        <legend>Email and password</legend>
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" name="email" type="email" required maxLength={254} autoComplete="username" autoCapitalize="none" />
        <label htmlFor="login-password">Password</label>
        <input id="login-password" name="password" type="password" required autoComplete="current-password" />
        <button className="button" type="submit">{busy ? 'Logging in…' : 'Log in'}</button>
      </fieldset>
    </form>
    <div className="login-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    <p><Link to="/verify-email">Verify email or request another link</Link></p>
    <p><Link to="/register">Create an account</Link></p>
    <p><Link to="/forgot-password">Forgot your password?</Link></p>
  </div></section>;
}
