import assert from 'node:assert/strict';
import { createHash, pbkdf2Sync } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
let simulator;
let application;

before(async () => {
  const vectorHash = pbkdf2Sync('fictional vector password', Buffer.from(Array.from({ length: 16 }, (_, i) => i)), 600000, 32, 'sha256').toString('hex');
  const vectorTokenDigest = createHash('sha256').update(`lan-party:session:v1:${'01'.repeat(32)}`).digest('hex');
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL('./auth-foundation.fixture.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
    define: { VECTOR_HASH: JSON.stringify(vectorHash), VECTOR_TOKEN_DIGEST: JSON.stringify(vectorTokenDigest) },
  });
  simulator = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: outputFiles[0].text, compatibilityDate: '2026-10-11', cf: false,
  }));
  const applicationBuild = await build({
    entryPoints: [fileURLToPath(new URL('../index.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  });
  application = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: applicationBuild.outputFiles[0].text, compatibilityDate: '2026-10-11', cf: false,
  }));
});

after(async () => { await Promise.all([simulator?.dispose(), application?.dispose()]); });

for (const name of ['passwords', 'passwordPolicy', 'malformedHashes', 'knownVector',
  'tokens', 'expiry', 'sessions', 'configuration', 'errors']) {
  test(`auth foundation in workerd: ${name}`, async () => {
    const response = await simulator.dispatchFetch(`http://localhost/${name}`);
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.deepEqual(body, { passed: true });
  });
}

test('application retains health and exposes no unfinished authentication routes', async () => {
  const health = await application.dispatchFetch('http://localhost/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const wrongMethod = await application.dispatchFetch('http://localhost/api/health', { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('Allow'), 'GET');
  for (const route of ['register', 'login', 'sessions', 'verify-email', 'reset-password', 'google']) {
    for (const method of ['GET', 'POST']) {
      const response = await application.dispatchFetch(`http://localhost/api/auth/${route}`, { method });
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: 'Not found' });
    }
  }
});
