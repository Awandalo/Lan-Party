import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const timestamp = 1791849600;
const author = randomUUID();
const editor = randomUUID();
const migrations = ['0001_create_event_structure.sql', '0002_create_accounts.sql',
  '0003_create_auth_credentials.sql', '0004_create_authorization.sql',
  '0005_create_registrations.sql', '0006_seed_reference_data.sql', '0007_create_news_articles.sql'];
let simulator;
let db;
let originalSchema;
let originalData;

async function applyMigration(name) {
  const sql = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
  // These migrations have no semicolons or comment delimiters inside SQL literals.
  const statements = sql.replace(/--[^\n]*/g, '').split(';').map((value) => value.trim()).filter(Boolean);
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function existingSchema() {
  return (await db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE tbl_name <> 'news_articles' ORDER BY type, name").all()).results;
}

async function existingData() {
  const snapshot = {};
  // Fixed table names come from the existing schema, never from user input.
  for (const table of ['locations', 'events', 'event_days', 'name_prefixes', 'users',
    'user_auth_providers', 'user_password_credentials', 'roles', 'permissions',
    'user_roles', 'role_permissions', 'registrations', 'registration_days']) {
    snapshot[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()).results;
  }
  return snapshot;
}

async function createUser(id) {
  await db.prepare('INSERT INTO users (id, first_name, last_name, email, email_normalized, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, 'Fictional', 'News tester', `${id}@example.test`, `${id}@example.test`, timestamp, timestamp).run();
}

function article(overrides = {}) {
  return { id: randomUUID(), title: 'Fictional LAN announcement', slug: `news-${randomUUID()}`,
    content: '', excerpt: null, cover_image_key: null, author_user_id: author,
    updated_by_user_id: null, publication_status: 'draft', created_at: timestamp,
    updated_at: timestamp, published_at: null, ...overrides };
}

async function insert(values = article()) {
  const fields = Object.keys(values);
  await db.prepare(`INSERT INTO news_articles (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`)
    .bind(...Object.values(values)).run();
  return values;
}

async function update(id, values) {
  const fields = Object.keys(values);
  return db.prepare(`UPDATE news_articles SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE id = ?`)
    .bind(...Object.values(values), id).run();
}

before(async () => {
  simulator = new Miniflare(convertV4MiniflareOptions({ modules: true,
    script: 'export default { fetch() { return new Response("Local news schema test"); } };',
    d1Databases: { DB: randomUUID() }, cf: false }));
  db = await simulator.getD1Database('DB');
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  for (const migration of migrations.slice(0, -1)) await applyMigration(migration);
  await createUser(author);
  await createUser(editor);
  originalSchema = await existingSchema();
  originalData = await existingData();
  await applyMigration(migrations.at(-1));
});

after(async () => { await simulator?.dispose(); });

test('seven migrations apply and no news articles are seeded', async () => {
  assert.equal(await db.prepare('SELECT count(*) AS total FROM news_articles').first('total'), 0);
  assert.equal(await db.prepare("SELECT strict FROM pragma_table_list WHERE name = 'news_articles'").first('strict'), 1);
});

test('news columns, types, nullability, primary key and draft default match the approved schema', async () => {
  const columns = (await db.prepare('PRAGMA table_info(news_articles)').all()).results;
  assert.deepEqual(columns.map(({ name, type, notnull, pk }) => [name, type, notnull, pk]), [
    ['id', 'TEXT', 1, 1], ['title', 'TEXT', 1, 0], ['slug', 'TEXT', 1, 0],
    ['content', 'TEXT', 1, 0], ['excerpt', 'TEXT', 0, 0], ['cover_image_key', 'TEXT', 0, 0],
    ['author_user_id', 'TEXT', 1, 0], ['updated_by_user_id', 'TEXT', 0, 0],
    ['publication_status', 'TEXT', 1, 0], ['created_at', 'INTEGER', 1, 0],
    ['updated_at', 'INTEGER', 1, 0], ['published_at', 'INTEGER', 0, 0],
  ]);
  const values = article();
  delete values.publication_status;
  await insert(values);
  assert.equal(await db.prepare('SELECT publication_status FROM news_articles WHERE id = ?').bind(values.id).first('publication_status'), 'draft');
});

test('required fields reject null and required fields without defaults reject omission', async () => {
  for (const field of ['id', 'title', 'slug', 'content', 'author_user_id', 'publication_status', 'created_at', 'updated_at']) {
    await assert.rejects(insert(article({ [field]: null })), /NOT NULL constraint failed/);
    if (field !== 'publication_status') {
      const values = article();
      delete values[field];
      await assert.rejects(insert(values), /NOT NULL constraint failed/);
    }
  }
});

test('article IDs and titles reject empty and ASCII whitespace-only values on insert and update', async () => {
  const values = await insert();
  for (const field of ['id', 'title']) {
    for (const blank of ['', ' ', '\t\n\r\v\f ']) {
      await assert.rejects(insert(article({ [field]: blank })), /CHECK constraint failed/);
      await assert.rejects(update(values.id, { [field]: blank }), /CHECK constraint failed/);
    }
  }
});

test('lowercase URL-safe slugs are accepted without normalization', async () => {
  for (const slug of ['hello-world', 'lan2026', '123', 'a', 'lan-2026-preview']) {
    const values = await insert(article({ slug }));
    assert.equal(await db.prepare('SELECT slug FROM news_articles WHERE id = ?').bind(values.id).first('slug'), slug);
  }
});

test('malformed slug formats are rejected on insert and update', async () => {
  const values = await insert();
  for (const slug of ['', ' ', 'LAN-party', '-lan', 'lan-', 'lan--party', '---',
    'lan_party', 'lan.party', 'lan/party', 'lan party', 'län', 'lan\n']) {
    await assert.rejects(insert(article({ slug })), /CHECK constraint failed/);
    await assert.rejects(update(values.id, { slug }), /CHECK constraint failed/);
  }
});

test('duplicate slugs and primary keys are rejected, including slug changes', async () => {
  const first = await insert();
  const second = await insert();
  await assert.rejects(insert(article({ slug: first.slug })), /UNIQUE constraint failed/);
  await assert.rejects(update(second.id, { slug: first.slug }), /UNIQUE constraint failed/);
  await assert.rejects(insert(article({ id: first.id })), /UNIQUE constraint failed/);
});

test('drafts allow empty content and nullable optional fields', async () => {
  const values = await insert();
  const row = await db.prepare('SELECT * FROM news_articles WHERE id = ?').bind(values.id).first();
  assert.equal(row.content, '');
  for (const field of ['excerpt', 'cover_image_key', 'updated_by_user_id', 'published_at']) assert.equal(row[field], null);
});

test('published articles require nonblank content on insert and update', async () => {
  const values = await insert(article({ content: 'Fictional published content', publication_status: 'published', published_at: timestamp }));
  for (const content of ['', ' ', '\t\n\r\v\f ']) {
    await assert.rejects(insert(article({ content, publication_status: 'published', published_at: timestamp })), /CHECK constraint failed/);
    await assert.rejects(update(values.id, { content }), /CHECK constraint failed/);
  }
});

test('publication status accepts only draft, published and archived', async () => {
  const values = await insert();
  await insert(article({ publication_status: 'archived' }));
  for (const publication_status of ['', 'public', 'cancelled', 'Published', ' published ', 'scheduled']) {
    await assert.rejects(insert(article({ publication_status })), /CHECK constraint failed/);
    await assert.rejects(update(values.id, { publication_status }), /CHECK constraint failed/);
  }
});

test('integer timestamps are nonnegative and respect creation ordering', async () => {
  for (const overrides of [{ created_at: -1 }, { updated_at: -1 }, { updated_at: timestamp - 1 },
    { publication_status: 'archived', published_at: -1 },
    { publication_status: 'archived', published_at: timestamp - 1 }]) {
    await assert.rejects(insert(article(overrides)), /CHECK constraint failed/);
  }
  const values = await insert(article({ publication_status: 'archived', published_at: timestamp }));
  for (const field of ['created_at', 'updated_at', 'published_at']) {
    for (const invalid of ['not-a-timestamp', timestamp + 0.5]) {
      await assert.rejects(insert(article({ publication_status: 'archived', [field]: invalid })), /cannot store .* in INTEGER column/);
    }
    await assert.rejects(update(values.id, { [field]: -1 }), /CHECK constraint failed/);
  }
  await assert.rejects(update(values.id, { created_at: timestamp + 1 }), /CHECK constraint failed/);
  await insert(article({ created_at: 0, updated_at: 0 }));
});

test('INSERT rejects publication timestamps after the last update for published and archived articles', async () => {
  for (const publication_status of ['published', 'archived']) {
    await assert.rejects(insert(article({ content: 'Fictional body', publication_status,
      published_at: timestamp + 1, updated_at: timestamp })), /CHECK constraint failed/);
    // Equality is valid, as is a later edit timestamp.
    await insert(article({ content: 'Fictional body', publication_status,
      published_at: timestamp + 1, updated_at: timestamp + 1 }));
    await insert(article({ content: 'Fictional body', publication_status,
      published_at: timestamp + 1, updated_at: timestamp + 2 }));
  }
});

test('UPDATE rejects advancing publication beyond the last update or moving the update before publication', async () => {
  for (const publication_status of ['published', 'archived']) {
    const values = await insert(article({ content: 'Fictional body', publication_status,
      published_at: timestamp + 1, updated_at: timestamp + 2 }));
    await assert.rejects(update(values.id, { published_at: timestamp + 3 }), /CHECK constraint failed/);
    await assert.rejects(update(values.id, { updated_at: timestamp }), /CHECK constraint failed/);
    const row = await db.prepare('SELECT published_at, updated_at FROM news_articles WHERE id = ?').bind(values.id).first();
    assert.deepEqual(row, { published_at: timestamp + 1, updated_at: timestamp + 2 });
  }
});

test('published articles require publication dates and drafts require null dates', async () => {
  await assert.rejects(insert(article({ content: 'Ready', publication_status: 'published' })), /CHECK constraint failed/);
  await assert.rejects(insert(article({ published_at: timestamp })), /CHECK constraint failed/);
  const draft = await insert(article({ content: 'Ready' }));
  await assert.rejects(update(draft.id, { publication_status: 'published' }), /CHECK constraint failed/);
  await assert.rejects(update(draft.id, { published_at: timestamp }), /CHECK constraint failed/);
  const published = await insert(article({ content: 'Ready', publication_status: 'published', published_at: timestamp }));
  await assert.rejects(update(published.id, { published_at: null }), /CHECK constraint failed/);
  await assert.rejects(update(published.id, { publication_status: 'draft' }), /CHECK constraint failed/);
});

test('cover storage references reject blank values and STRICT rejects binary article content', async () => {
  const values = await insert(article({ cover_image_key: 'news/fictional-cover.webp', excerpt: 'Fictional summary', updated_by_user_id: editor }));
  for (const cover_image_key of ['', ' ', '\t\n\r\v\f ']) {
    await assert.rejects(insert(article({ cover_image_key })), /CHECK constraint failed/);
    await assert.rejects(update(values.id, { cover_image_key }), /CHECK constraint failed/);
  }
  for (const field of ['content', 'cover_image_key']) {
    await assert.rejects(insert(article({ [field]: new Uint8Array([1, 2]) })), /cannot store BLOB value in TEXT column/);
  }
});

test('nonexistent author and editor references fail on insert and update', async () => {
  const values = await insert();
  for (const field of ['author_user_id', 'updated_by_user_id']) {
    for (const invalid of [randomUUID(), '']) {
      await assert.rejects(insert(article({ [field]: invalid })), /FOREIGN KEY constraint failed/);
      await assert.rejects(update(values.id, { [field]: invalid }), /FOREIGN KEY constraint failed/);
    }
  }
});

test('author and editor foreign keys restrict both deletes and user ID changes', async () => {
  await insert(article({ updated_by_user_id: editor }));
  const foreignKeys = (await db.prepare('PRAGMA foreign_key_list(news_articles)').all()).results;
  assert.equal(foreignKeys.length, 2);
  for (const field of ['author_user_id', 'updated_by_user_id']) {
    const key = foreignKeys.find((row) => row.from === field);
    assert.equal(key.table, 'users');
    assert.equal(key.to, 'id');
    assert.equal(key.on_delete, 'RESTRICT');
    assert.equal(key.on_update, 'RESTRICT');
  }
  for (const id of [author, editor]) {
    await assert.rejects(db.prepare('DELETE FROM users WHERE id = ?').bind(id).run(), /FOREIGN KEY constraint failed/);
    await assert.rejects(db.prepare('UPDATE users SET id = ? WHERE id = ?').bind(randomUUID(), id).run(), /FOREIGN KEY constraint failed/);
  }
});

test('listing and foreign-key lookup indexes exist without duplicate primary or slug indexes', async () => {
  const indexes = (await db.prepare('PRAGMA index_list(news_articles)').all()).results;
  assert.equal(indexes.length, 5);
  assert.equal(indexes.filter((row) => row.origin === 'pk').length, 1);
  assert.equal(indexes.filter((row) => row.origin === 'u').length, 1);
  for (const [name, expected] of [
    ['news_articles_publication_date_idx', ['publication_status', 'published_at']],
    ['news_articles_author_user_id_idx', ['author_user_id']],
    ['news_articles_updated_by_user_id_idx', ['updated_by_user_id']],
  ]) {
    assert.ok(indexes.some((row) => row.name === name));
    assert.deepEqual((await db.prepare(`PRAGMA index_info(${name})`).all()).results.map((row) => row.name), expected);
  }
  const listing = (await db.prepare('PRAGMA index_xinfo(news_articles_publication_date_idx)').all()).results;
  assert.equal(listing.find((row) => row.name === 'published_at').desc, 1);
});

test('draft publishing, editing and archiving preserve original publication time and control listing visibility', async () => {
  const values = await insert(article({ content: 'Fictional original body' }));
  async function visible() {
    return await db.prepare("SELECT id FROM news_articles WHERE publication_status = 'published' AND id = ? ORDER BY published_at DESC")
      .bind(values.id).first('id');
  }
  assert.equal(await visible(), null);
  await update(values.id, { publication_status: 'published', published_at: timestamp + 1, updated_at: timestamp + 1 });
  assert.equal(await visible(), values.id);
  await update(values.id, { content: 'Fictional edited body', updated_by_user_id: editor, updated_at: timestamp + 2 });
  assert.equal(await db.prepare('SELECT published_at FROM news_articles WHERE id = ?').bind(values.id).first('published_at'), timestamp + 1);
  await update(values.id, { publication_status: 'archived', updated_at: timestamp + 3 });
  assert.equal(await visible(), null);
  assert.equal(await db.prepare('SELECT published_at FROM news_articles WHERE id = ?').bind(values.id).first('published_at'), timestamp + 1);
  await insert(article({ publication_status: 'archived', published_at: null }));
});

test('existing schemas and all event, account and RBAC reference records remain unchanged', async () => {
  assert.deepEqual(await existingSchema(), originalSchema);
  assert.deepEqual(await existingData(), originalData);
  assert.equal(originalData.roles.length, 2);
  assert.equal(originalData.permissions.length, 13);
  assert.equal(originalData.role_permissions.length, 13);
});

test('foreign-key enforcement, references and database integrity remain healthy', async () => {
  assert.equal(await db.prepare('PRAGMA foreign_keys').first('foreign_keys'), 1);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results, []);
  assert.equal(await db.prepare('PRAGMA quick_check').first('quick_check'), 'ok');
});
