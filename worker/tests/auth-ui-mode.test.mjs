import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
const { build } = wr('esbuild');
test('frontend defaults off and explicit hosted flags isolate DEV/PROD and deny apex/aliases', async () => {
  const previous = globalThis.window;
  try {
    for (const [local, flag] of [[false, ''], [false, 'hosted-dev'], [false, 'hosted-prod'], [true, '']]) {
      const code = (await build({ entryPoints: [fileURLToPath(new URL('../../src/lib/auth-mode.ts', import.meta.url))],
        bundle: true, write: false, format: 'esm', platform: 'node', define: {
          'import.meta.env.DEV': String(local), 'import.meta.env.VITE_AUTH_MODE': JSON.stringify(flag),
        } })).outputFiles[0].text;
      const mode = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
      for (const origin of ['https://dev.lan-party.club', 'https://www.lan-party.club', 'https://lan-party.club', 'https://lan-party-dev.servok.workers.dev']) {
        globalThis.window = { location: { origin } };
        assert.equal(mode.authUIEnabled(), local || flag === 'hosted-dev' && origin === 'https://dev.lan-party.club' || flag === 'hosted-prod' && origin === 'https://www.lan-party.club');
      }
    }
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
