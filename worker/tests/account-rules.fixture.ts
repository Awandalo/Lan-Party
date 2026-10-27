import { validateNickname } from '../auth/nicknames';
import { newAccountId, publicAccount, validateRegistration } from '../auth/accounts';

function check(condition: boolean): asserts condition {
  if (!condition) throw new Error('Account rule assertion failed');
}
function rejects(action: () => unknown) {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  check(rejected);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const name = new URL(request.url).pathname;
    try {
      if (name === '/nicknames') {
        for (const nickname of ['LAN Player', 'abc', 'A'.repeat(24), 'Player_1', 'Player-1', '123']) {
          const result = validateNickname(nickname);
          check(result.display === nickname && result.lookupKey === nickname.toLowerCase());
        }
        for (const nickname of ['', 'ab', 'A'.repeat(25), ' abc', 'abc ', 'A  B', 'A _B', 'A_ B',
          'A -B', 'A- B', 'A\tB', 'A\nB', 'A\u00a0B', 'Pläyer', 'Ａｄｍｉｎ', 'Player!', 'A\0B',
          'Admin', 'MODERATOR', 'system', 'A_d_m_i_n', 'M-o-d-e-r-a-t-o-r', 'S Y S T E M', null]) {
          rejects(() => validateNickname(nickname));
        }
        check(validateNickname('LaN Player').lookupKey === validateNickname('lan player').lookupKey);
      } else if (name === '/registration') {
        const input = { nickname: 'Fictional Player', firstName: 'Fictional', lastName: 'Example',
          email: 'Player+Tag@Example.test', password: 'fictional password' };
        const parsed = validateRegistration(input);
        check(parsed.email === input.email && parsed.emailNormalized === 'player+tag@example.test');
        check(parsed.firstName === input.firstName && parsed.lastName === input.lastName);
        for (const field of ['firstName', 'lastName', 'email', 'password', 'nickname']) {
          rejects(() => validateRegistration({ ...input, [field]: '' }));
        }
        for (const email of ['a@@example.test', 'a@example', 'a@-example.test', 'a@exam_ple.test',
          ' a@example.test', 'a..b@example.test', '.a@example.test', 'a.@example.test', 'á@example.test']) {
          rejects(() => validateRegistration({ ...input, email }));
        }
        rejects(() => validateRegistration({ ...input, firstName: 'A\nB' }));
        rejects(() => validateRegistration({ ...input, firstName: 'A'.repeat(101) }));
        const userId = newAccountId();
        check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(userId));
        const privateAccount = { userId, memberNumber: '11', nickname: parsed.nickname, firstName: parsed.firstName,
          lastName: parsed.lastName, email: parsed.email, password: parsed.password };
        const visible = publicAccount(privateAccount);
        check(JSON.stringify(Object.keys(visible).sort()) === JSON.stringify(['memberNumber', 'nickname', 'userId']));
        check(visible.userId === userId && visible.nickname === input.nickname);
      } else return new Response('Unknown local test', { status: 404 });
      return Response.json({ passed: true });
    } catch (error) {
      return Response.json({ failure: error instanceof Error ? error.message : 'Test failure' }, { status: 500 });
    }
  },
};
