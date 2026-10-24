import { AUTH_UI_AVAILABLE, authUIEnabled } from './auth-mode';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { isMemberNumber } from './member-number';

interface Session { account: { userId: string; nickname: string; memberNumber: string }; csrfToken: string; emailVerified: boolean; recoveryCodesRemaining?:number }
interface Authentication {
  session: Session | null;
  status: 'loading' | 'ready' | 'error';
  refresh: () => Promise<boolean>;
  logout: () => Promise<boolean>;
}
const Context = createContext<Authentication | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Authentication['status']>((AUTH_UI_AVAILABLE && authUIEnabled()) ? 'loading' : 'ready');
  const { pathname } = useLocation();
  const refresh = useCallback(async () => {
    if (!(AUTH_UI_AVAILABLE && authUIEnabled())) return false;
    try {
      const response = await fetch('/api/auth/session', { credentials: 'same-origin', redirect: 'error',
        headers: { 'X-LAN-Request': '1' }, signal: AbortSignal.timeout(15000) });
      if (response.status === 401) { setSession(null); setStatus('ready'); return false; }
      if (!response.ok) throw new Error('Session unavailable');
      const value: Session = await response.json();
      if (typeof value.account?.userId !== 'string' || typeof value.account?.nickname !== 'string'
        || !isMemberNumber(value.account?.memberNumber)
        || typeof value.emailVerified !== 'boolean'
        || !/^[0-9a-f]{64}$/.test(value.csrfToken)) throw new Error('Invalid session response');
      if(value.recoveryCodesRemaining!==undefined&&(!Number.isInteger(value.recoveryCodesRemaining)||value.recoveryCodesRemaining<0||value.recoveryCodesRemaining>10))delete value.recoveryCodesRemaining;
      setSession(value); setStatus('ready'); return true;
    } catch { setSession(null); setStatus('error'); return false; }
  }, []);
  useEffect(() => { void refresh(); }, [refresh, pathname]);
  const logout = async () => {
    if (!session || !(AUTH_UI_AVAILABLE && authUIEnabled())) return false;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-LAN-Request': '1', 'X-CSRF-Token': session.csrfToken },
        body: '{}', signal: AbortSignal.timeout(15000) });
      if (response.ok || response.status === 401) { setSession(null); setStatus('ready'); return true; }
      // A stale CSRF key can be refreshed without retrying the mutation automatically.
      if (response.status === 403) await refresh();
      return false;
    } catch { return false; }
  };
  // Tokens stay in HttpOnly cookies; only the separate CSRF proof lives in React memory.
  return <Context value={{ session, status, refresh, logout }}>{children}</Context>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('Authentication provider missing');
  return value;
}
