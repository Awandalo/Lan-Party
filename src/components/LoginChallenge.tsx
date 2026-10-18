import { useEffect, useRef, useState } from 'react';

interface TurnstileAPI {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileAPI } }
let loading: Promise<TurnstileAPI> | undefined;
function load(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileAPI>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { script.remove(); loading = undefined; reject(new Error('Security check unavailable')); };
    const timeout = window.setTimeout(fail, 8000);
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    script.onload = () => { window.clearTimeout(timeout); if (window.turnstile) resolve(window.turnstile); else fail(); };
    script.onerror = () => { window.clearTimeout(timeout); fail(); };
    document.head.append(script);
  });
  return loading;
}

export default function LoginChallenge({ siteKey, onToken }: { siteKey: string; onToken: (value: string | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('Loading security check…'), [retry, setRetry] = useState(0);
  useEffect(() => {
    let disposed = false, widget: string | undefined, api: TurnstileAPI | undefined;
    onToken(null); setMessage('Loading security check…');
    void load().then(value => {
      if (disposed || !container.current) return;
      api = value;
      widget = api.render(container.current, { sitekey: siteKey, action: 'login', appearance: 'interaction-only', size: 'flexible',
        'response-field': false, retry: 'never', 'refresh-expired': 'manual', 'refresh-timeout': 'manual',
        callback: (token: string) => { if (!disposed) { onToken(token); setMessage('Security check ready. Enter your password and select Log in.'); } },
        'expired-callback': () => { if (!disposed) { onToken(null); setMessage('Security check expired. Reload it before signing in.'); } },
        'timeout-callback': () => { if (!disposed) { onToken(null); setMessage('Security check timed out. Reload it before signing in.'); } },
        'error-callback': () => { if (!disposed) { onToken(null); setMessage('Security check unavailable. Reload it or try again later. Sign-in has not been submitted.'); } return true; },
      });
      setMessage('Complete the security check if prompted.');
    }).catch(() => { if (!disposed) setMessage('Security check could not load. Check your connection or content blocker, then reload the check. Sign-in has not been submitted.'); });
    return () => { disposed = true; if (widget && api) api.remove(widget); };
  }, [siteKey, onToken, retry]);
  return <div className="login-challenge"><div ref={container} /><p role="status" aria-live="polite">{message}</p>
    <button type="button" className="button button-secondary" onClick={() => setRetry(value => value + 1)}>Reload security check</button></div>;
}
