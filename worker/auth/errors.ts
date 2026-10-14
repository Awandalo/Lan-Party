export type AuthFailure = 'invalid-credentials' | 'invalid-token' | 'rate-limited' | 'unavailable';

const failures = {
  'invalid-credentials': { status: 401, message: 'Unable to sign in with these credentials.' },
  'invalid-token': { status: 400, message: 'This link is invalid or has expired.' },
  'rate-limited': { status: 429, message: 'Too many attempts. Please try again later.' },
  unavailable: { status: 503, message: 'Authentication is temporarily unavailable.' },
} as const;

// Callers map internal failures to these fixed responses; never serialize exceptions.
export function authFailureResponse(failure: AuthFailure): Response {
  const detail = failures[failure];
  return Response.json({ error: detail.message }, {
    status: detail.status, headers: { 'Cache-Control': 'no-store' },
  });
}

// Use the same response for missing, disabled and eligible accounts, and provider failures.
export function passwordRecoveryResponse(): Response {
  return Response.json({ message: 'If the account is eligible, recovery instructions will be sent.' }, {
    status: 202, headers: { 'Cache-Control': 'no-store' },
  });
}
