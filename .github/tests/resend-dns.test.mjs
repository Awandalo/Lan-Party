import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertTrustedRun, DKIM, RECORDS, matches, publishResendDNS } from '../scripts/resend-dns.mjs';

const zone = { id: '83c0841a468b8368704d7ad48313707c', name: 'lan-party.club', status: 'active',
  account: { id: '11ddea61be41a70883d6c703d2a9a3d6' } };
const trusted = { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REPOSITORY: 'Awandalo/Lan-Party', GITHUB_REF: 'refs/heads/main', GITHUB_REF_TYPE: 'branch',
  GITHUB_REF_PROTECTED: 'true', GITHUB_WORKFLOW_REF: 'Awandalo/Lan-Party/.github/workflows/configure-resend-dns.yml@refs/heads/main',
  GITHUB_SHA: 'a'.repeat(40), GITHUB_WORKFLOW_SHA: 'a'.repeat(40), GITHUB_RUN_ATTEMPT: '1' };
const token = 'fictional-test-credential';
const id = i => i.toString(16).padStart(32, '0');
function fixture(initial = [], intercept = () => null) {
  const records = structuredClone(initial), calls = [], logs = [];
  const fetcher = async (url, options) => {
    const u = new URL(url), method = options.method;
    calls.push({ url: u, method, body: options.body ? JSON.parse(options.body) : undefined });
    assert.equal(u.origin, 'https://api.cloudflare.com');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.redirect, 'error');
    const overridden = intercept(calls.at(-1), records, calls);
    if (overridden) return overridden;
    if (method === 'GET' && u.pathname.endsWith('/dns_records')) {
      const found = records.filter(r => r.name === u.searchParams.get('name'));
      return Response.json({ success: true, result: found, result_info: { total_pages: 1, total_count: found.length } });
    }
    if (method === 'GET' && u.pathname === `/client/v4/zones/${zone.id}`) return Response.json({ success: true, result: zone });
    if (method === 'POST' && u.pathname === `/client/v4/zones/${zone.id}/dns_records` && !u.search) {
      const body = JSON.parse(options.body);
      assert.ok(RECORDS.some(r => matches(body, r)));
      const record = { id: id(records.length + 1), ...body }; records.push(record);
      return Response.json({ success: true, result: record });
    }
    assert.fail('Unexpected operation');
  };
  return { records, calls, logs, run: () => publishResendDNS({ token, fetcher, report: line => logs.push(line) }) };
}

test('fixed plan contains the complete independently supplied public key and only approved records', () => {
  const supplied = 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDG4H9v90dlePxl3MXNQhTKxebkuZEYyFDtQ7ptSPukTs4U8EoBjrKrIuF3Ib2l+Pa8/LMKDIXLf8Z8pHWgARMpLKtbROz/TTVVW9TsfEEjnKXb0nqonRNvOuELAolUrxxw7/6n2v7VIrlokfLei+bMLNuV6Nr5ZpwLxlgeoOXFAwIDAQAB';
  assert.equal(DKIM, supplied);
  assert.equal(createPublicKey({ key: Buffer.from(DKIM.slice(2), 'base64'), format: 'der', type: 'spki' }).asymmetricKeyType, 'rsa');
  assert.deepEqual(RECORDS.map(r => [r.type, r.name, r.content]), [
    ['TXT', 'resend._domainkey.auth.lan-party.club', supplied],
    ['CNAME', 'rsend.auth.lan-party.club', 'rsend-euw1.forge.rmta.net'],
    ['CNAME', 'send.auth.lan-party.club', 'send.forge.rmta.net'],
    ['TXT', '_dmarc.auth.lan-party.club', 'v=DMARC1; p=none;'],
  ]);
  for (const record of RECORDS) { assert.equal(record.ttl, 1); assert.equal(record.proxied, false); assert.ok(Object.isFrozen(record)); }
});

test('trusted-run gate rejects PRs, forks, dev, unprotected refs, alternate workflows and reruns', () => {
  assert.doesNotThrow(() => assertTrustedRun(trusted));
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: 'false', GITHUB_EVENT_NAME: 'pull_request_target',
    GITHUB_REPOSITORY: 'other/Lan-Party', GITHUB_REF: 'refs/heads/dev', GITHUB_REF_TYPE: 'tag',
    GITHUB_REF_PROTECTED: 'false', GITHUB_WORKFLOW_REF: 'other', GITHUB_SHA: '',
    GITHUB_WORKFLOW_SHA: 'b'.repeat(40), GITHUB_RUN_ATTEMPT: '2' })) {
    assert.throws(() => assertTrustedRun({ ...trusted, [key]: value }), /fresh manual run/);
  }
});

test('local CLI execution fails before network access, even with a token', () => {
  const result = spawnSync(process.execPath, ['.github/scripts/resend-dns.mjs'], {
    encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'false', CLOUDFLARE_DNS_API_TOKEN: token },
  });
  assert.equal(result.status, 1); assert.match(result.stderr, /fresh manual run/);
  assert.ok(!result.stderr.includes(token));
});

test('creates exactly four fixed records, records IDs and skips every matching record on repetition', async () => {
  const f = fixture(); const first = await f.run();
  assert.equal(first.length, 4); assert.ok(first.every(r => r.action === 'created'));
  const posts = f.calls.filter(c => c.method === 'POST'); assert.equal(posts.length, 4);
  assert.equal(f.calls[5].method, 'GET'); // Full plan inventory precedes any write.
  for (const post of posts) {
    const position = f.calls.indexOf(post);
    assert.equal(f.calls[position - 1].url.searchParams.get('name'), post.body.name);
  }
  const second = await f.run(); assert.ok(second.every(r => r.action === 'existing'));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 4);
  assert.ok(!f.logs.join('\n').includes(token));
});

test('a conflict at the final hostname stops the complete plan before any write', async () => {
  const f = fixture([{ id: id(1), ...RECORDS[3], content: 'v=DMARC1; p=reject;' }]);
  await assert.rejects(f.run(), /Conflicting records/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});

test('duplicate records, wrong type, altered key, proxied CNAME and non-Auto TTL are conflicts', async () => {
  for (const initial of [
    [{ id: id(1), ...RECORDS[0] }, { id: id(2), ...RECORDS[0] }],
    [{ id: id(1), ...RECORDS[0], type: 'CNAME' }],
    [{ id: id(1), ...RECORDS[0], content: DKIM.slice(0, -1) }],
    [{ id: id(1), ...RECORDS[1], proxied: true }],
    [{ id: id(1), ...RECORDS[1], ttl: 300 }],
  ]) {
    const f = fixture(initial); await assert.rejects(f.run(), /Conflicting records/);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  }
});

test('race-time conflicts discovered immediately before creation stop without overwriting', async () => {
  let inventories = 0;
  const f = fixture([], (call, records) => {
    if (call.method === 'GET' && call.url.searchParams.get('name') === RECORDS[0].name && ++inventories === 2) {
      records.push({ id: id(1), ...RECORDS[0], content: 'different' });
    }
  });
  await assert.rejects(f.run(), /Conflicting records/); assert.equal(f.records.length, 1);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
});

test('403 stops immediately without leaking response payloads, headers or token', async () => {
  const f = fixture([], () => Response.json({ success: false, errors: [{ code: 10000, message: token }] }, { status: 403 }));
  await assert.rejects(f.run(), error => error.message.includes('HTTP 403') && !error.message.includes(token));
  assert.equal(f.calls.length, 1); assert.deepEqual(f.logs, []);
});

test('wrong account or inactive zone prevents all DNS writes', async () => {
  for (const changed of [{ ...zone, status: 'pending' }, { ...zone, account: { id: 'wrong' } }]) {
    const f = fixture([], call => call.url.pathname.endsWith(zone.id) ? Response.json({ success: true, result: changed }) : null);
    await assert.rejects(f.run(), /zone mismatch/); assert.equal(f.calls.length, 1);
  }
});

test('unexpected inventory pagination and non-JSON responses fail closed', async () => {
  for (const response of [Response.json({ success: true, result: [], result_info: { total_pages: 2, total_count: 101 } }), new Response('not JSON')]) {
    const f = fixture([], call => call.url.pathname.endsWith('/dns_records') ? response : null);
    await assert.rejects(f.run(), /unexpected|Unexpected/);
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 0);
  }
});

test('zero pages with an empty result is a complete empty inventory', async () => {
  const f = fixture([], call => call.method === 'GET' && call.url.pathname.endsWith('/dns_records')
    ? Response.json({ success: true, result: [], result_info: { total_pages: 0, total_count: 0 } }) : null);
  // Readback deliberately remains empty: the first creation is reported, then
  // the inconsistent readback must fail rather than continue creating records.
  await assert.rejects(f.run(), /Readback mismatch/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
});

test('uncertain creation is never retried and preserves partial completion evidence', async () => {
  let posts = 0;
  const f = fixture([], call => {
    if (call.method === 'POST' && ++posts === 2) throw new Error(`request headers containing ${token}`);
  });
  await assert.rejects(f.run(), e => /outcome uncertain/.test(e.message) && !e.message.includes(token));
  assert.equal(posts, 2); assert.equal(f.records.length, 1);
  assert.ok(f.logs.some(line => line.includes(id(1))));
});

test('unexpected creation result stops after the first write and retains returned ID', async () => {
  const f = fixture([], call => call.method === 'POST'
    ? Response.json({ success: true, result: { id: id(9), ...RECORDS[0], proxied: true } }) : null);
  await assert.rejects(f.run(), /Unexpected creation result/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.ok(f.logs.some(line => line.includes(id(9))));
});

test('TXT quoting and canonical CNAME spelling compare without relaxing actual content', () => {
  assert.ok(matches({ ...RECORDS[0], content: `"${DKIM.slice(0, 100)}" "${DKIM.slice(100)}"` }, RECORDS[0]));
  assert.ok(matches({ ...RECORDS[1], content: 'RSEND-EUW1.FORGE.RMTA.NET.' }, RECORDS[1]));
  assert.equal(matches({ ...RECORDS[3], content: 'v=DMARC1; p=none; ' }, RECORDS[3]), false);
});

test('missing credentials fail before invoking any network operation', async () => {
  let calls = 0;
  await assert.rejects(publishResendDNS({ token: '', fetcher: () => { calls++; } }), /unavailable/);
  assert.equal(calls, 0);
});

test('workflow has only manual trigger, immutable actions, least privilege and step-scoped DNS secret', () => {
  const source = readFileSync(new URL('../workflows/configure-resend-dns.yml', import.meta.url), 'utf8');
  assert.match(source, /on:\s+workflow_dispatch:\s+permissions:/);
  assert.doesNotMatch(source, /pull_request|push:|inputs:|CLOUDFLARE_API_TOKEN_DEV|npm ci|wrangler/);
  assert.match(source, /github\.ref_protected == true/);
  assert.match(source, /ref: \$\{\{ github.sha \}\}/);
  assert.match(source, /persist-credentials: false/);
  assert.equal([...source.matchAll(/uses: [^\n]+@([0-9a-f]{40})/g)].length, 2);
  assert.equal([...source.matchAll(/secrets\./g)].length, 1);
  assert.match(source, /secrets\.CLOUDFLARE_DNS_API_TOKEN/);
});
