import { AUTH_UI_AVAILABLE, authUIEnabled } from './auth-mode';
interface VerificationLink { userId: string; token: string }
let captured: VerificationLink | null = null;
let resetCaptured: VerificationLink | null = null;

// Called before React/router initialization. Fragments are not sent in HTTP or
// referrers; immediately replace the history entry and retain the proof in memory.
export function captureVerificationLink() {
  if (!(AUTH_UI_AVAILABLE && authUIEnabled()) || !['/verify-email', '/reset-password'].includes(window.location.pathname)) return;
  const reset = window.location.pathname === '/reset-password';
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, '', reset ? '/reset-password' : '/verify-email');
  const userId = params.get('user'), token = params.get('token');
  if ([...params.keys()].length === 2 && userId && userId.length === 36 && token && token.length === 64 && /^[0-9a-f]{64}$/.test(token)
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userId)) {
    if (reset) resetCaptured = { userId, token }; else captured = { userId, token };
  }
}
export function getVerificationLink() { return captured; }
export function clearVerificationLink() { captured = null; }
export function getResetLink() { return resetCaptured; }
export function clearResetLink() { resetCaptured = null; }
