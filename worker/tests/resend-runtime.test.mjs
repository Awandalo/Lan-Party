import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const wr = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wr('miniflare');
const { build } = wr('esbuild');

test('native Workers fetch reaches only the intercepted Resend fixture and rejects redirects and failures', async () => {
  const { outputFiles } = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('../auth/', import.meta.url)),
      contents: `import { DevResendEmailTransport } from './dev-email';
        export default { async fetch() {
          // Fictional policy and budget fixture: exercise the real transport defaults.
          const db = { prepare() { return { bind() { return { async first() { return { attempts: 1 }; } }; } }; } };
          const env = { AUTH_ENVIRONMENT: 'dev', AUTH_EMAIL_TRANSPORT: 'resend',
            AUTH_PUBLIC_ORIGIN: 'https://dev.lan-party.club', RESEND_API_KEY: 'fictional-key',
            AUTH_DEV_RECIPIENT_ALLOWLIST: '["participant@example.test"]',
            AUTH_EMAIL_PROVIDER_DAILY_LIMIT: '100', AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT: '3000' };
          try {
            await new DevResendEmailTransport(db, env).send({ to: 'participant@example.test',
              url: 'https://dev.lan-party.club/verify-email#fictional-proof', expiresAt: 2000000000,
              idempotencyKey: 'fictional-runtime-fixture' });
            return Response.json({ delivered: true });
          } catch (error) { return Response.json({ error: error.message }); }
        } }`,
    },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  let status = 200;
  let calls = 0;
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, cf: false, compatibilityDate: '2026-10-11', script: outputFiles[0].text,
    // Every outbound request is intercepted; no external email/network delivery.
    outboundService: async request => {
      calls++;
      assert.equal(request.url, 'https://api.resend.com/emails');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('Authorization'), 'Bearer fictional-key');
      assert.equal(request.headers.get('Idempotency-Key'), 'fictional-runtime-fixture');
      const body = await request.json();
      assert.deepEqual(body.to, ['participant@example.test']);
      assert.equal(body.from, 'noreply@auth.lan-party.club');
      return new Response('private provider payload', {
        status, headers: { Location: 'https://untrusted.example.test/credential-leak' },
      });
    },
  }));
  try {
    for (status of [200, 202, 301, 302, 303, 307, 308, 400, 401, 403, 422, 429, 500, 503]) {
      const before = calls;
      const result = await (await runtime.dispatchFetch('http://localhost/fixture')).json();
      assert.deepEqual(result, status < 300 ? { delivered: true } : { error: 'Email delivery unavailable' });
      assert.equal(calls - before, 1, `status ${status}: no redirect follow or retry`);
    }
  } finally { await runtime.dispose(); }
});
