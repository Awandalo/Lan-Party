import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
let simulator;
before(async () => {
  const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('./security-rules.fixture.ts', import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
  simulator = new Miniflare(convertV4MiniflareOptions({ modules: true, script: outputFiles[0].text,
    compatibilityDate: '2026-10-11', cf: false, d1Databases: { DB: randomUUID() } }));
  const db = await simulator.getD1Database('DB');
  for (const name of (await readdir(new URL('../../migrations/', import.meta.url))).filter((name) => /^000[1-8]_.*\.sql$/.test(name)).sort()) {
    let rest = (await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8')).replace(/--[^\n]*/g, '').trim();
    const statements = [];
    while (rest) {
      const end = rest.startsWith('CREATE TRIGGER') ? rest.indexOf('\nEND;') + 5 : rest.indexOf(';') + 1;
      if (end <= 0 || end === 4) throw new Error('Incomplete migration statement');
      statements.push(db.prepare(rest.slice(0, end))); rest = rest.slice(end).trim();
    }
    await db.batch(statements);
  }
});
after(async () => { await simulator?.dispose(); });
for (const name of ['cookies', 'csrf', 'legacy', 'cooldown']) test(`security rules in workerd/D1: ${name}`, async () => {
  const response = await simulator.dispatchFetch(`http://localhost/${name}`);
  assert.deepEqual(await response.json(), { passed: true });
  assert.equal(response.status, 200);
});
