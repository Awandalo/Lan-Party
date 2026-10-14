import { sessionCookie, clearSessionCookie, readSessionCookie } from '../auth/cookies';
import { isValidMutationRequest, sessionCsrfToken } from '../auth/csrf';
import { defaultAuthConfiguration } from '../auth/config';
import { changeParticipantNickname, inspectLegacyNicknames } from '../auth/nickname-state';

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
interface Env { DB: D1Database }
const token = '01'.repeat(32);
const digest = '02'.repeat(32);
const secret = '03'.repeat(32); // fictional local fixture only, never deployment configuration

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const path = new URL(request.url).pathname;
      if (path === '/cookies') {
        check(defaultAuthConfiguration('dev', 'https://example.test').sessionLifetimeSeconds === 604800, 'Seven-day default');
        const cookie = sessionCookie(token);
        check(cookie === `__Host-lan_session=${token}; Max-Age=604800; Secure; HttpOnly; SameSite=Lax; Path=/`, 'Cookie attributes');
        check(!cookie.includes('Domain'), 'Host-only cookie');
        check(clearSessionCookie() === '__Host-lan_session=; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=/', 'Clear attributes');
        check(readSessionCookie(new Request('https://example.test', { headers: { Cookie: `other=x; __Host-lan_session=${token}` } })) === token, 'Read valid');
        for (const Cookie of ['', '__Host-lan_session=bad', `__Host-lan_session=${token}; __Host-lan_session=${token}`, `__Host-lan_session=${token}%20`]) {
          check(readSessionCookie(new Request('https://example.test', { headers: { Cookie } })) === null, 'Fail closed parsing');
        }
        let rejected = false;
        try { sessionCookie('bad; Domain=example.test'); } catch { rejected = true; }
        check(rejected, 'Cookie injection rejected');
      } else if (path === '/csrf') {
        const csrf = await sessionCsrfToken(digest, secret);
        const base = { Origin: 'https://example.test', 'Content-Type': 'application/json; charset=utf-8',
          'X-LAN-Request': '1', 'X-CSRF-Token': csrf };
        const make = (overrides: Record<string, string> = {}, method = 'POST') =>
          new Request('https://example.test/api/change', { method, headers: { ...base, ...overrides } });
        check(await isValidMutationRequest(make(), 'https://example.test', digest, secret), 'Valid mutation');
        for (const method of ['GET', 'HEAD', 'OPTIONS']) check(!await isValidMutationRequest(make({}, method), 'https://example.test', digest, secret), 'No mutation through GET');
        const invalidHeaders: Record<string, string>[] = [{ Origin: '' }, { Origin: 'null' }, { Origin: 'https://evil.test' },
          { Origin: 'https://example.test.evil.test' }, { 'Content-Type': 'text/plain' },
          { 'Content-Type': 'application/x-www-form-urlencoded' }, { 'X-LAN-Request': '' },
          { 'X-CSRF-Token': '' }, { 'X-CSRF-Token': '00'.repeat(32) }];
        for (const override of invalidHeaders) {
          check(!await isValidMutationRequest(make(override), 'https://example.test', digest, secret), 'Invalid mutation');
        }
        check(!await isValidMutationRequest(make(), 'https://example.test', '04'.repeat(32), secret), 'Different session');
        check(!await isValidMutationRequest(make(), 'https://example.test', digest, '05'.repeat(32)), 'Different secret');
      } else if (path === '/legacy') {
        const rows = [{ userId: 'one', nickname: 'Existing Player' }, { userId: 'two', nickname: 'existing player' },
          { userId: 'three', nickname: null }, { userId: 'four', nickname: 'Admin' }, { userId: 'five', nickname: 'Valid Name' }];
        const issues = inspectLegacyNicknames(rows);
        check(issues.length === 4, 'Detect all conflicts');
        check(issues.filter((issue) => issue.reason === 'duplicate').length === 2, 'Both owners reported');
        check(!JSON.stringify(issues).includes('Existing') && !JSON.stringify(issues).includes('Admin'), 'Sanitized report');
        check(rows[0].nickname === 'Existing Player' && rows[2].nickname === null, 'No remediation');
      } else if (path === '/cooldown') {
        const id = crypto.randomUUID();
        const initial = 100;
        await env.DB.prepare('INSERT INTO users(id,first_name,last_name,email,email_normalized,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
          .bind(id, 'Fictional', 'Player', `${id}@example.test`, `${id}@example.test`, initial, initial).run();
        check(await changeParticipantNickname(env.DB, id, 'Missing Name', initial) === 'onboarding-required', 'No silent legacy onboarding');
        await env.DB.prepare('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES(?,?,?,?)').bind(id, 'Initial Name', initial, initial).run();
        check(await changeParticipantNickname(env.DB, id, 'Initial Name', initial) === 'unchanged', 'Initial no-op');
        check(await changeParticipantNickname(env.DB, id, 'initial name', initial) === 'changed', 'Immediate first case-only change');
        check(await changeParticipantNickname(env.DB, id, 'Another Name', initial + 1) === 'cooldown', 'Cooldown enforced');
        const boundary = initial + 14 * 86400;
        check(await changeParticipantNickname(env.DB, id, 'Another Name', boundary - 1) === 'cooldown', 'Before boundary');
        check(await changeParticipantNickname(env.DB, id, 'Another Name', boundary) === 'changed', 'At boundary');
        check(await changeParticipantNickname(env.DB, id, 'Another Name', boundary + 10) === 'unchanged', 'No-op during cooldown');
        await env.DB.prepare('UPDATE user_nicknames SET nickname=?,updated_at=? WHERE user_id=?').bind('Corrected Name', boundary + 20, id).run();
        check(await env.DB.prepare('SELECT nickname_changed_at FROM user_nicknames WHERE user_id=?').bind(id).first('nickname_changed_at') === boundary, 'Correction preserves state');
        const next = boundary + 14 * 86400;
        const outcomes = await Promise.all([changeParticipantNickname(env.DB, id, 'Race One', next), changeParticipantNickname(env.DB, id, 'Race Two', next)]);
        check(outcomes.filter((outcome) => outcome === 'changed').length === 1, 'One concurrent winner');
        check(outcomes.filter((outcome) => outcome === 'cooldown').length === 1, 'Second change blocked');
        await env.DB.prepare("UPDATE users SET status='disabled',updated_at=? WHERE id=?").bind(next, id).run();
        check(await changeParticipantNickname(env.DB, id, 'Disabled Name', next + 14 * 86400) === 'account-unavailable', 'Disabled account');
        check(await changeParticipantNickname(env.DB, crypto.randomUUID(), 'Other Name', next) === 'account-unavailable', 'Missing account');
      } else return new Response('Unknown local test', { status: 404 });
      return Response.json({ passed: true });
    } catch (error) { return Response.json({ failure: error instanceof Error ? error.message : 'Test failure' }, { status: 500 }); }
  },
};
