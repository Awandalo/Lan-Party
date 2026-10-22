import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../lib/auth';
import LoginChallenge from './LoginChallenge';
import GoogleButton from './GoogleButton';
import PasswordInput from './PasswordInput';

export default function LocalLogin() {
  const { session, status, refresh } = useAuth();
  const navigate = useNavigate();
  const [params]=useSearchParams();
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  const pending=useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [siteKey, setSiteKey] = useState(''), [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [challengeAttempt, setChallengeAttempt] = useState(0);
  if (session) return <Navigate to="/account" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    if (siteKey && !challengeToken) { setFeedback('Complete the security check before signing in.'); return; }
    const form = event.currentTarget, data = new FormData(form);
    const input = { email: String(data.get('email') ?? ''), password: String(data.get('password') ?? ''),
      ...(challengeToken ? { turnstileToken: challengeToken } : {}) };
    pending.current=true;setBusy(true); setFeedback(''); setVerificationRequired(false);
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1' }, body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const result=await response.json();
        if(result.next==='/mfa')navigate('/mfa',{replace:true});
        else if (await refresh()) navigate('/account', { replace: true });
        else setFeedback('Login could not be confirmed. Check that your browser accepts secure cookies, then reload.');
      } else if ([400, 401].includes(response.status)) setFeedback('Email or password is incorrect.');
      else if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        setFeedback(Number.isInteger(seconds) && seconds > 0 && seconds <= 3600
          ? `Too many login attempts. Please wait ${seconds} seconds before trying again.`
          : 'Too many login attempts. Please wait before trying again.');
      }
      else if (response.status === 403) {
        const result = await response.json();
        if (['challenge_required', 'challenge_failed'].includes(result.code) && typeof result.siteKey === 'string' && result.siteKey.length <= 200) {
          setSiteKey(result.siteKey);
          setFeedback('Please complete the security check, then re-enter your password and select Log in. No automatic retry was made.');
        } else if (result.code === 'verification_required') {
          setVerificationRequired(true); setFeedback('Your password is correct. Please verify your email before signing in.');
        } else setFeedback('Request rejected. Reload this page and try again.');
      }
      else setFeedback('Login or its security check is temporarily unavailable. Please try again later.');
    } catch { setFeedback('We could not confirm your login. Reload before trying again. No automatic retry was made.'); }
    finally {
      input.password = '';
      if ('turnstileToken' in input) input.turnstileToken = '';
      setChallengeToken(null); setChallengeAttempt(value => value + 1);
      const password = form.elements.namedItem('password');
      if (password instanceof HTMLInputElement) password.value = '';
      pending.current=false;setBusy(false); requestAnimationFrame(() => feedbackRef.current?.focus());
    }
  }
  return <section className="page-section login-page"><div className="panel login-card">
    <p className="eyebrow">Welcome back</p><h1>Login</h1>
    <p>Sign in to your LAN Party account.</p>
    {params.get('password')==='updated'&&<p role="status">Password updated. Sign in again. {params.get('notice')==='unconfirmed'?'Security notification delivery could not be confirmed.':'A security notification was requested; inbox delivery is not confirmed.'}</p>}
    {status === 'error' && <p role="status">Session service unavailable. Please reload and try again.</p>}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset className="login-fields" disabled={busy || status === 'loading'} aria-label="Login credentials">
        <label htmlFor="login-email">Email address</label>
        <input id="login-email" name="email" type="email" required maxLength={254} autoComplete="username" autoCapitalize="none" />
        <label htmlFor="login-password">Password</label>
        <PasswordInput id="login-password" name="password" required autoComplete="current-password" />
        {siteKey && <LoginChallenge key={challengeAttempt} siteKey={siteKey} onToken={setChallengeToken} />}
        <button className="button" type="submit">{busy ? 'Logging in…' : 'Log in'}</button>
      </fieldset>
    </form>
    <div className="login-feedback" ref={feedbackRef} tabIndex={-1} role="status" aria-live="polite">{feedback}</div>
    {verificationRequired && <p><Link to="/verify-email">Request a verification email</Link></p>}
    <div className="login-divider"><span>or</span></div>
    <GoogleButton />
    <div className="login-links">
      <p>New here? <Link to="/register">Create account</Link></p>
      <Link to="/forgot-password">Forgot password?</Link>
    </div>
  </div></section>;
}
