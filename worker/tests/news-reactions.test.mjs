import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { local } from './helpers/role-fixture.mjs';

const proof = user => ({ 'X-LAN-Session-Proof': user.csrf, 'X-CSRF-Token': user.csrf });
const counts = (overrides = {}) => ({ 'thumbs-up': 0, heart: 0, smile: 0, laugh: 0, cry: 0, angry: 0, ...overrides });

async function article(f, status = 'published') {
  const id = randomUUID();
  await f.sql(`INSERT INTO news_articles(id, slug, title, content, excerpt, publication_status, created_at, updated_at, published_at)
    VALUES (?, ?, 'Fictional article', 'Fictional content', 'Fictional excerpt', ?, 1, 1, ?)`,
    id, id, status, status === 'draft' ? null : 1).run();
  return id;
}

const read = (f, id, user) => f.request('news-reactions/' + id, user, undefined, user ? proof(user) : {});
const write = (f, id, user, reaction, headers = {}) =>
  f.request('news-reactions/' + id, user, { reaction }, { ...(user ? proof(user) : {}), ...headers });

async function state(response, expected) {
  assert.equal(response.status, 200, await response.clone().text());
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual(await response.json(), expected);
}

test('article reactions are public counts with exactly one private selection per member', () => local(async f => {
  const id = await article(f);
  const alice = await f.user(), bob = await f.user();
  await state(await read(f, id), { counts: counts(), reaction: null });
  const duplicate = await Promise.all([write(f, id, alice, 'heart'), write(f, id, alice, 'heart')]);
  for (const response of duplicate) await state(response, { counts: counts({ heart: 1 }), reaction: 'heart' });
  const distinct = await Promise.all([write(f, id, alice, 'cry'), write(f, id, alice, 'angry')]);
  for (const response of distinct) assert.equal(response.status, 200);
  assert.equal(await f.sql('SELECT count(*) AS total FROM news_article_reactions WHERE article_id=?', id).first('total'), 1);
  await state(await write(f, id, alice, 'smile'), { counts: counts({ smile: 1 }), reaction: 'smile' });
  await state(await write(f, id, bob, 'laugh'), { counts: counts({ smile: 1, laugh: 1 }), reaction: 'laugh' });
  await state(await read(f, id, alice), { counts: counts({ smile: 1, laugh: 1 }), reaction: 'smile' });
  await state(await f.request('news-reactions/' + id, alice), { counts: counts({ smile: 1, laugh: 1 }), reaction: null });
  for (let attempt = 0; attempt < 2; attempt++) {
    await state(await write(f, id, alice, null), { counts: counts({ laugh: 1 }), reaction: null });
  }
}));

test('writes require live verified membership and proof, and reject invalid or unpublished targets', () => local(async f => {
  const id = await article(f), draft = await article(f, 'draft'), user = await f.user();
  assert.equal((await write(f, id, null, 'heart')).status, 401);
  assert.equal((await write(f, id, user, 'heart', { 'X-LAN-Session-Proof': '' })).status, 401);
  assert.equal((await write(f, id, user, 'heart', { 'X-CSRF-Token': '' })).status, 403);
  assert.equal((await write(f, id, user, 'heart', { Origin: 'https://other.example.test' })).status, 403);
  assert.equal((await write(f, id, user, 'invalid')).status, 400);
  assert.equal((await read(f, draft)).status, 404);
  assert.equal((await write(f, draft, user, 'heart')).status, 404);
  await f.sql('UPDATE users SET email_verified_at=NULL WHERE id=?', user.id).run();
  assert.equal((await write(f, id, user, 'heart')).status, 401);
  await f.sql('UPDATE users SET email_verified_at=unixepoch() WHERE id=?', user.id).run();
  await f.sql('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?', user.digest).run();
  assert.equal((await write(f, id, user, 'heart')).status, 401);
  await state(await read(f, id), { counts: counts(), reaction: null });
}));

test('closed polls still accept reactions and unpublishing hides totals without affecting ballots', () => local(async f => {
  const id = await article(f), user = await f.user(), option = randomUUID();
  await f.sql("INSERT INTO news_polls(article_id, mode) VALUES (?,'single')", id).run();
  await f.sql("INSERT INTO news_poll_options(poll_id,id,label,sort_order) VALUES (?,?,'Fictional choice',0)", id, option).run();
  await f.sql('INSERT INTO news_poll_ballots(poll_id,user_id,revision,updated_at,window_started_at,changes) VALUES (?,?,1,1,1,1)', id, user.id).run();
  await f.sql('INSERT INTO news_poll_selections(poll_id,user_id,option_id) VALUES (?,?,?)', id, user.id, option).run();
  await f.sql('UPDATE news_polls SET closed=1 WHERE article_id=?', id).run();
  await state(await write(f, id, user, 'thumbs-up'), { counts: counts({ 'thumbs-up': 1 }), reaction: 'thumbs-up' });
  assert.equal(await f.sql('SELECT option_id FROM news_poll_selections WHERE poll_id=? AND user_id=?', id, user.id).first('option_id'), option);
  await f.sql("UPDATE news_articles SET publication_status='archived' WHERE id=?", id).run();
  assert.equal((await read(f, id)).status, 404);
  assert.equal((await write(f, id, user, null)).status, 404);
  await f.sql("UPDATE news_articles SET publication_status='published' WHERE id=?", id).run();
  await state(await read(f, id), { counts: counts({ 'thumbs-up': 1 }), reaction: null });
}));

test('account deletion removes the identity link and preserves reactions from multiple deleted users', () => local(async f => {
  const id = await article(f);
  for (let number = 0; number < 2; number++) {
    const user = await f.user();
    assert.equal((await write(f, id, user, 'heart')).status, 200);
    await f.sql(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
      VALUES(?,?,0,'password',unixepoch(),unixepoch()+300)`, user.digest, user.id).run();
    const deletion = await f.fetch('http://127.0.0.1:5173/fixture-news-delete', {
      headers: { 'X-Fixture-Actor': user.id, 'X-Fixture-Digest': user.digest },
    });
    assert.equal(deletion.status, 200, await deletion.clone().text());
    assert.equal(await f.sql('SELECT id FROM users WHERE id=?', user.id).first(), null);
  }
  assert.equal(await f.sql('SELECT count(*) total FROM news_article_reactions WHERE article_id=? AND user_id IS NULL', id).first('total'), 2);
  await state(await read(f, id), { counts: counts({ heart: 2 }), reaction: null });
  await f.sql('DELETE FROM news_articles WHERE id=?', id).run();
  assert.equal(await f.sql('SELECT count(*) total FROM news_article_reactions WHERE article_id=?', id).first('total'), 0);
}));

test('0044 is additive and the previous schema keeps public News readable', () => local(async f => {
  const id = await article(f);
  const before = await f.sql('SELECT * FROM news_articles WHERE id=?', id).first();
  assert.equal((await read(f, id)).status, 503);
  assert.equal((await f.request('news/' + before.slug)).status, 200);
  await f.migrate(44);
  assert.deepEqual(await f.sql('SELECT * FROM news_articles WHERE id=?', id).first(), before);
  await state(await read(f, id), { counts: counts(), reaction: null });
}, 43));
