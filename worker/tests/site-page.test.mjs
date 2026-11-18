import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const wrangler = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wrangler('miniflare');
const { build } = wrangler('esbuild');
const config = JSON.parse((await readFile('wrangler.jsonc', 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
const prod = 'https://www.lan-party.club';
const dev = 'https://dev.lan-party.club';
const visible = '10000000-0000-4000-8000-000000000034';
const hidden = '20000000-0000-4000-8000-000000000034';
const escaped = value => value.replace(/[.*+?^{}${}()|[\]\\]/g, '\\$&');

async function fixture(environment, run) {
  const directory = await mkdtemp(join(tmpdir(), 'lan-party-site-page-'));
  let app;
  try {
    await writeFile(join(directory, 'index.html'), await readFile('index.html'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'assets', 'fixture.js'), '/* fixture */');
    const { assets, define, vars } = config.env[environment];
    const script = (await build({
      entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', define,
    })).outputFiles[0].text;
    app = new Miniflare(convertV4MiniflareOptions({
      modules: true, script, compatibilityDate: config.compatibility_date, cf: false,
      assets: { directory, binding: 'ASSETS', run_worker_first: assets.run_worker_first, routerConfig: { has_user_worker: true },
        assetConfig: { html_handling: assets.html_handling, not_found_handling: assets.not_found_handling } },
      d1Databases: { DB: randomUUID() },
      bindings: { ...vars, AUTH_ENVIRONMENT: environment,
        AUTH_SESSION_MODE: environment === 'prod' ? 'hosted-prod' : 'hosted-dev' },
    }));
    const db = await app.getD1Database('DB');
    await db.batch([
      'CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT, description TEXT, publication_status TEXT)',
      'CREATE TABLE event_management (event_id TEXT PRIMARY KEY, is_listed INTEGER)',
      'CREATE TABLE news_activity (article_id TEXT)',
      'CREATE TABLE user_nicknames (user_id TEXT, nickname TEXT)',
      `CREATE TABLE news_articles (id TEXT PRIMARY KEY, slug TEXT, title TEXT, excerpt TEXT,
        publication_status TEXT, created_at INTEGER, updated_at INTEGER, published_at INTEGER,
        updated_by_user_id TEXT, content TEXT, language TEXT)`,
      `INSERT INTO events VALUES ('${visible}','Fictional Event','Welcome','published'), ('${hidden}','Hidden Event','Private','published')`,
      `INSERT INTO event_management VALUES ('${visible}',1), ('${hidden}',0)`,
      "INSERT INTO news_articles VALUES ('public','fictional-public','Fictional Public','Welcome','published',0,0,1,NULL,'Welcome','en'), ('draft','fictional-draft','Fictional Draft','Private','draft',0,0,NULL,NULL,'Private','nl')",
    ].map(sql => db.prepare(sql)));
    const origin = environment === 'prod' ? prod : dev;
    await run((path, options) => app.dispatchFetch(origin + path, options), db);
  } finally {
    try {
      await app?.dispose();
    } finally {
      const target = resolve(directory);
      assert.ok(target.startsWith(join(resolve(tmpdir()), 'lan-party-site-page-')));
      await rm(target, { recursive: true, force: true });
    }
  }
}

test('production routes serve correct crawler files, status and first-response previews', () => fixture('prod', async (get, db) => {
  for (const [path, title] of [['/', 'Home'], ['/events', 'Events'], ['/news/', 'News'], ['/privacy', 'Privacy Policy']]) {
    const response = await get(path, { headers: { 'Sec-Fetch-Mode': 'navigate' } });
    const html = await response.text();
    assert.equal(response.status, 200, html.slice(0, 1000));
    assert.equal(response.headers.get('X-Robots-Tag'), null);
    assert.match(html, new RegExp('<title>LAN Party \\| ' + title + '</title>'));
    assert.match(html, new RegExp('rel="canonical" href="' + escaped(prod + (path === '/news/' ? '/news' : path)) + '"'));
    assert.match(html, /name="description"/);
    assert.doesNotMatch(html, /coming soon/);
  }
  for (const path of ['/login', '/account/profile', '/manage/users', '/events/' + visible + '/registration']) {
    const response = await get(path);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  }
  for (const path of ['/missing-page', '/news/fictional-draft', '/events/' + hidden, '/assets/missing.js']) {
    const response = await get(path, { headers: { 'Sec-Fetch-Mode': 'navigate' } });
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /Fictional Draft|Hidden Event/);
  }
  assert.equal((await get('/index.html', { redirect: 'manual' })).headers.get('Location'), '/');
  assert.equal((await get('/assets/fixture.js')).status, 200);
  const robots = await get('/robots.txt');
  assert.match(robots.headers.get('Content-Type'), /^text\/plain/);
  assert.ok((await robots.text()).includes('Sitemap: ' + prod + '/sitemap.xml'));
  const response = await get('/sitemap.xml');
  assert.match(response.headers.get('Content-Type'), /^application\/xml/);
  const urls = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, ['/', '/events', '/news', '/privacy', '/events/' + visible, '/news/fictional-public'].map(path => prod + path));
  assert.equal(await (await get('/sitemap.xml', { method: 'HEAD' })).text(), '');
  await db.prepare("UPDATE news_articles SET publication_status='archived' WHERE id='public'").run();
  assert.doesNotMatch(await (await get('/sitemap.xml')).text(), /fictional-public/);
}));

test('DEV sends noindex on page responses and omits the production sitemap', () => fixture('dev', async get => {
  for (const path of ['/', '/events', '/news/fictional-public', '/events/' + visible, '/account']) {
    const response = await get(path);
    assert.equal(response.status, 200, (await response.text()).slice(0, 1000));
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
  }
  const preview = await get('/news/fictional-public');
  const html = await preview.text();
  assert.match(html, /property="og:image" content="https:\/\/dev\.lan-party\.club\/lan-hall\.jpg"/);
  assert.match(html, /property="og:locale" content="en_GB"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  const robots = await get('/robots.txt');
  assert.match(robots.headers.get('Content-Type'), /^text\/plain/);
  assert.doesNotMatch(await robots.text(), /Sitemap:/);
  const sitemap = await get('/sitemap.xml');
  assert.equal(sitemap.status, 404);
  assert.equal(sitemap.headers.get('X-Robots-Tag'), 'noindex');
}));
