// Bundled only by the local test harness, never imported by worker/index.ts.
import { AUTH_POLICY, expiresAt, validateAuthConfiguration } from '../auth/config';
import { isAccountVerifiedForRegistration, isSessionUsable } from '../auth/contracts';
import { toHex } from '../auth/encoding';
import { authFailureResponse, passwordRecoveryResponse } from '../auth/errors';
import { hashPassword, isValidPassword, verifyPassword } from '../auth/passwords';
import { actionTokenExpiresAt, digestToken, generateToken, isTokenUsable, isValidToken, matchesToken } from '../auth/tokens';

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function throws(action: () => unknown): void {
  let caught = false;
  try { action(); } catch { caught = true; }
  check(caught, 'Expected invalid input to throw');
}

async function rejects(action: () => Promise<unknown>): Promise<void> {
  let caught = false;
  try { await action(); } catch { caught = true; }
  check(caught, 'Expected invalid input to reject');
}

const cases: Record<string, () => Promise<void>> = {
  async passwords() {
    const password = 'fictional password 🕹';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    check(first !== second, 'Unique random salts');
    check(first.startsWith('lp-pbkdf2-sha256-v1$600000$'), 'Version and cost persisted');
    check(await verifyPassword(password, first), 'Correct password');
    check(!await verifyPassword('wrong fictional password', first), 'Wrong password');
    check(!await verifyPassword(`${password} `, first), 'No whitespace trimming');
    const last = first.at(-1) === 'a' ? 'b' : 'a';
    check(!await verifyPassword(password, first.slice(0, -1) + last), 'Tampered hash');
    check(!await verifyPassword(password, first.replace('$600000$', '$600001$')), 'Stored cost used');
  },
  async passwordPolicy() {
    check(!isValidPassword('a'.repeat(11)), 'Minimum enforced');
    check(isValidPassword('a'.repeat(12)), 'No character classes required');
    check(isValidPassword(' '.repeat(12)), 'Whitespace preserved');
    check(isValidPassword('😀'.repeat(128)), '128 Unicode code points');
    check(!isValidPassword('a'.repeat(129)), 'Maximum enforced');
    check(!isValidPassword('😀'.repeat(129)), 'Unicode maximum enforced');
    check(!isValidPassword('a'.repeat(12) + '\ud800'), 'Reject lone surrogate');
    check(!isValidPassword('a'.repeat(12) + '\udc00'), 'Reject lone low surrogate');
    await rejects(() => hashPassword('short'));
    const long = '😀'.repeat(128);
    check(await verifyPassword(long, await hashPassword(long)), 'Long password not truncated');
  },
  async malformedHashes() {
    const prefix = 'lp-pbkdf2-sha256-v1';
    const salt = '00'.repeat(16);
    const hash = '00'.repeat(32);
    for (const record of ['', 'dummy-hash-like-test-value-not-a-credential',
      `${prefix}$100000$${salt}$${hash}`, `${prefix}$1000001$${salt}$${hash}`,
      `${prefix}$0600000$${salt}$${hash}`, `${prefix}$600000junk$${salt}$${hash}`,
      `${prefix}$600000$short$${hash}`, `${prefix}$600000$${'GG'.repeat(16)}$${hash}`,
      `${prefix}$600000$${salt}$${hash}$extra`, 'x'.repeat(10000)]) {
      check(!await verifyPassword('fictional password', record), 'Malformed hash fails closed');
    }
  },
  async knownVector() {
    // Independent PBKDF2 implementation (Node) supplies expected values in the harness.
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
    const password = 'fictional vector password';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: AUTH_POLICY.passwordIterations }, key, 256);
    const expected = VECTOR_HASH;
    check(toHex(new Uint8Array(derived)) === expected, 'Independent PBKDF2 vector');
    check(await verifyPassword(password, `lp-pbkdf2-sha256-v1$600000$${toHex(salt)}$${expected}`), 'Known record verified');
  },
  async tokens() {
    const token = generateToken();
    check(isValidToken(token) && token !== generateToken(), 'Random 256-bit token');
    const digest = await digestToken(token, 'password-reset');
    check(digest !== token && digest.length === 64, 'Only digest persisted');
    check(await matchesToken(token, 'password-reset', digest), 'Token matches');
    check(!await matchesToken(token, 'email-verification', digest), 'Purpose separation');
    check(!await matchesToken(generateToken(), 'password-reset', digest), 'Wrong token');
    check(!await matchesToken('short', 'password-reset', digest), 'Invalid token');
    check(!await matchesToken(token, 'password-reset', 'bad'), 'Invalid digest');
    check(!isValidToken(token.toUpperCase()), 'Canonical token format');
    await rejects(() => digestToken('short', 'session'));
    const fixed = '01'.repeat(32);
    check(await digestToken(fixed, 'session') === VECTOR_TOKEN_DIGEST, 'Independent digest vector');
  },
  async expiry() {
    const now = 100;
    check(actionTokenExpiresAt('email-verification', now) === now + 86400, '24-hour verification');
    check(actionTokenExpiresAt('password-reset', now) === now + 1800, '30-minute reset');
    check(AUTH_POLICY.nicknameCooldownSeconds === 14 * 86400, '14-day cooldown');
    const token = { createdAt: now, expiresAt: now + 1800, consumedAt: null };
    check(isTokenUsable(token, now), 'Valid on creation');
    check(isTokenUsable(token, now + 1799), 'Valid before expiry');
    check(!isTokenUsable(token, now + 1800), 'Invalid at expiry');
    check(!isTokenUsable(token, now - 1), 'Future token');
    check(!isTokenUsable({ ...token, consumedAt: now }, now), 'Consumed token');
    check(!isTokenUsable({ ...token, expiresAt: now }, now), 'Invalid lifetime');
    check(!isTokenUsable(token, NaN), 'Invalid clock');
    throws(() => expiresAt(-1, 1800));
    throws(() => expiresAt(now, 0));
    throws(() => expiresAt(Number.MAX_SAFE_INTEGER, 1));
  },
  async sessions() {
    const account = { userId: 'fictional-user', status: 'active' as const, emailVerifiedAt: null, authVersion: 0 };
    const session = { tokenDigest: '00'.repeat(32), userId: account.userId, createdAt: 100, expiresAt: 200, revokedAt: null, authVersion: 0 };
    check(isSessionUsable(session, account, 100), 'Unverified account may log in');
    check(!isAccountVerifiedForRegistration(account, 'Player'), 'Unverified account cannot register');
    check(isAccountVerifiedForRegistration({ ...account, emailVerifiedAt: 100 }, 'Player'), 'Verified account may pass verification gate');
    check(!isAccountVerifiedForRegistration({ ...account, emailVerifiedAt: -1 }, 'Player'), 'Invalid verification timestamp');
    check(!isAccountVerifiedForRegistration({ ...account, status: 'disabled', emailVerifiedAt: 100 }, 'Player'), 'Disabled verified account');
    check(!isAccountVerifiedForRegistration({ ...account, emailVerifiedAt: 100 }, null), 'Nickname onboarding required');
    check(!isAccountVerifiedForRegistration({ ...account, emailVerifiedAt: 100 }, 'Admin'), 'Invalid nickname gate');
    check(!isSessionUsable(session, { ...account, status: 'disabled' }, 100), 'Disabled account');
    check(!isSessionUsable(session, { ...account, userId: 'other-user' }, 100), 'Account mismatch');
    check(!isSessionUsable({ ...session, revokedAt: 100 }, account, 100), 'Revoked session');
    check(!isSessionUsable(session, account, 200), 'Expired session');
    check(!isSessionUsable(session, { ...account, authVersion: 1 }, 100), 'Old credential generation');
  },
  async configuration() {
    const config = { environment: 'dev' as const, publicOrigin: 'https://example.test', sessionLifetimeSeconds: 3600 };
    check(Object.isFrozen(validateAuthConfiguration(config)), 'Validated configuration frozen');
    for (const publicOrigin of ['http://example.test', 'https://example.test/', 'https://example.test/path',
      'https://user:pass@example.test', 'https://example.test?query', 'https://example.test#fragment']) {
      throws(() => validateAuthConfiguration({ ...config, publicOrigin }));
    }
    for (const sessionLifetimeSeconds of [0, 59, NaN, 3600.5, 31 * 86400]) {
      throws(() => validateAuthConfiguration({ ...config, sessionLifetimeSeconds }));
    }
  },
  async errors() {
    for (const [code, status] of [['invalid-credentials', 401], ['invalid-token', 400],
      ['rate-limited', 429], ['unavailable', 503]] as const) {
      const response = authFailureResponse(code);
      check(response.status === status, 'Safe status');
      check(response.headers.get('Cache-Control') === 'no-store', 'No authentication caching');
      const body = await response.json() as { error: string };
      check(typeof body.error === 'string' && Object.keys(body).length === 1, 'Fixed public error');
    }
    const recovery = passwordRecoveryResponse();
    check(recovery.status === 202 && recovery.headers.get('Cache-Control') === 'no-store', 'Generic recovery');
    check((await recovery.text()).includes('If the account is eligible'), 'No enumeration');
  },
};

// Replaced by esbuild define, never configuration or a shipped credential.
declare const VECTOR_HASH: string;
declare const VECTOR_TOKEN_DIGEST: string;

export default {
  async fetch(request: Request): Promise<Response> {
    const run = cases[new URL(request.url).pathname.slice(1)];
    if (!run) return new Response('Unknown local test', { status: 404 });
    try {
      await run();
      return Response.json({ passed: true });
    } catch (error) {
      return Response.json({ failure: error instanceof Error ? error.message : 'Test failure' }, { status: 500 });
    }
  },
};
