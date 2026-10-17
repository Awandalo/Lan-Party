interface VerificationLink { userId: string; token: string }
let captured: VerificationLink | null = null;

// Called before React/router initialization. Fragments are not sent in HTTP or
// referrers; immediately replace the history entry and retain the proof in memory.
export function captureVerificationLink() {
  if (!import.meta.env.DEV || window.location.pathname !== '/verify-email') return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  window.history.replaceState(null, '', '/verify-email');
  const userId = params.get('user'), token = params.get('token');
  if ([...params.keys()].length === 2 && userId && userId.length === 36 && token && token.length === 64 && /^[0-9a-f]{64}$/.test(token)
    && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(userId)) captured = { userId, token };
}
export function getVerificationLink() { return captured; }
export function clearVerificationLink() { captured = null; }
