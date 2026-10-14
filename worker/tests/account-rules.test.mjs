import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
let simulator;
before(async () => {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('./account-rules.fixture.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  simulator = new Miniflare(convertV4MiniflareOptions({ modules: true, script: outputFiles[0].text,
    compatibilityDate: '2026-10-11', cf: false }));
});
after(async () => { await simulator?.dispose(); });
for (const name of ['nicknames', 'registration']) {
  test(`account rules in workerd: ${name}`, async () => {
    const response = await simulator.dispatchFetch(`http://localhost/${name}`);
    assert.deepEqual(await response.json(), { passed: true });
    assert.equal(response.status, 200);
  });
}
