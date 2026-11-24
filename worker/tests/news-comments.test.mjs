import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { local } from './helpers/role-fixture.mjs';

const proof = user => user ? { 'X-LAN-Session-Proof': user.csrf, 'X-CSRF-Token': user.csrf } : {};
const discussion = (f, id, user, input, headers = {}) => f.request('news-comments/' + id, user, input, { ...proof(user), ...headers });
const editorial = (f, user, input) => f.request('manage/news', user, { operationId: randomUUID(), ...input }, proof(user));
const ref = (comment, action) => ({ action, id: comment.id, revision: comment.revision });

async function result(response, status = 200) {
  assert.equal(response.status, status, await response.clone().text());
  return response.json();
}

async function staff(f, code) {
  const user = await f.user();
  await f.sql('INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,0 FROM roles WHERE code=?', user.id, code).run();
  return user;
}

async function article(f, options = {}) {
  const { editor = await staff(f, 'news_editor'), open, poll } = options;
  const title = 'Fictional discussion';
  const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Fictional article' }] }] };
  const { id } = await result(await editorial(f, editor, { action: 'create', title, content,
    ...(open === undefined ? {} : { commentsOpen: open }), ...(poll ? { poll: { mode: 'single', options: ['Yes', 'No'] } } : {}) }));
  const read = async () => (await result(await f.request('manage/news?id=' + id, editor, undefined, proof(editor)))).article;
  const action = async (name, more = {}) => editorial(f, editor, { action: name, id, revision: (await read()).revision, ...more });
  if (options.publish !== false) await result(await action('publish'));
  return { id, editor, action, read, title, content };
}

async function post(f, articleId, user, text, id = randomUUID()) {
  const page = await result(await discussion(f, articleId, user, { action: 'post', id, text }));
  return page.comments.find(comment => comment.id === id);
}

test('0045 gates the feature, preserves existing records, and adds only an unassigned moderation role', () => local(async f => {
  const existing = await article(f);
  const before = await f.sql('SELECT * FROM news_articles WHERE id=?', existing.id).first();
  const beforeRoles = (await f.sql('SELECT * FROM user_roles').all()).results;
  const user = await f.user();
  await result(await discussion(f, existing.id, user), 503);
  await f.migrate(45);
  const { comments_open, comments_revision, ...after } = await f.sql('SELECT * FROM news_articles WHERE id=?', existing.id).first();
  assert.deepEqual(after, before);
  assert.equal(comments_open, 0);
  assert.equal(comments_revision, 0);
  assert.deepEqual((await f.sql('SELECT * FROM user_roles').all()).results, beforeRoles);
  assert.deepEqual((await f.sql(`SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
    JOIN permissions p ON p.id=rp.permission_id WHERE r.code='news_moderator'`).all()).results, [{ code: 'news.moderate_comments' }]);
  const page = await result(await discussion(f, existing.id, user));
  assert.equal(page.open, false);
  assert.deepEqual(page.comments, []);
}, 44));

test('thread setting defaults off, is private, survives republishing and stays separate from poll voting', () => local(async f => {
  const poll = await article(f, { poll: true });
  const member = await f.user();
  const moderator = await staff(f, 'news_moderator');
  await result(await discussion(f, poll.id, null), 401);
  await result(await discussion(f, poll.id, member, undefined, { 'X-LAN-Session-Proof': '' }), 401);
  await result(await discussion(f, poll.id, member, undefined, { Origin: 'https://other.example.test' }), 403);
  assert.equal((await result(await discussion(f, poll.id, member))).open, false);
  await result(await discussion(f, poll.id, member, { action: 'thread', open: true, revision: 0 }), 403);
  // Editors can use the edit switch; closing voting changes neither the switch nor the thread.
  const settings = await poll.read();
  await result(await poll.action('update', { title: poll.title, content: poll.content, commentsOpen: true, commentsRevision: settings.commentsRevision }));
  await result(await poll.action('close-poll'));
  assert.equal((await result(await discussion(f, poll.id, member))).open, true);
  await post(f, poll.id, member, 'Discussion continues after voting closes.');
  const current = await result(await discussion(f, poll.id, moderator));
  const closed = await result(await discussion(f, poll.id, moderator, { action: 'thread', open: false, revision: current.revision }));
  assert.equal(closed.open, false);
  await result(await poll.action('update', { title: poll.title, content: poll.content, commentsOpen: true, commentsRevision: current.revision }), 409);
  const reopened = await result(await discussion(f, poll.id, poll.editor, { action: 'thread', open: true, revision: closed.revision }));
  assert.equal(reopened.open, true);
  await result(await poll.action('unpublish'));
  await result(await discussion(f, poll.id, member), 404);
  await result(await poll.action('publish'));
  assert.equal((await result(await discussion(f, poll.id, member))).open, true);
  assert.equal((await poll.read()).poll.closed, true);
}));

test('members can edit and delete only their own open-thread comments, with safe text and a stable placeholder', () => local(async f => {
  const { id, editor } = await article(f, { open: true });
  const member = await f.user(), other = await f.user();
  await f.sql("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,'Fictional Fox',0,0)", member.id).run();
  const c = await post(f, id, member, '  <b>Text</b>\nsecond line  ');
  const publicPage = await result(await discussion(f, id, other));
  assert.deepEqual(publicPage.comments[0].parts, [{ text: '<b>Text</b>\nsecond line' }]);
  assert.equal(publicPage.comments[0].author, 'Fictional Fox');
  assert.equal(publicPage.comments[0].own, false);
  assert.ok(!JSON.stringify(publicPage).includes(member.id));
  await result(await discussion(f, id, other, { ...ref(c, 'edit'), parts: ['Not mine'] }), 409);
  await result(await discussion(f, id, editor, { ...ref(c, 'remove'), reason: 'Editorial role only' }), 403);
  await result(await discussion(f, id, member, { ...ref(c, 'edit'), parts: ['\0'] }), 400);
  const edited = (await result(await discussion(f, id, member, { ...ref(c, 'edit'), parts: ['Updated'] }))).comments[0];
  assert.equal(edited.edited, true);
  const page = await result(await discussion(f, id, editor));
  const closed = await result(await discussion(f, id, editor, { action: 'thread', open: false, revision: page.revision }));
  await result(await discussion(f, id, member, { ...ref(edited, 'edit'), parts: ['Closed'] }), 409);
  await result(await discussion(f, id, member, ref(edited, 'delete')), 409);
  await result(await discussion(f, id, member, { action: 'post', id: randomUUID(), text: 'Closed' }), 409);
  await result(await discussion(f, id, editor, { action: 'thread', open: true, revision: closed.revision }));
  const deleted = (await result(await discussion(f, id, member, ref(edited, 'delete')))).comments[0];
  assert.equal(deleted.state, 'deleted');
  assert.equal(deleted.id, c.id);
  assert.equal(deleted.author, null);
  assert.deepEqual(deleted.parts, []);
  assert.equal(await f.sql('SELECT body FROM news_comments WHERE id=?', c.id).first('body'), null);
}));

test('partial redaction is server-owned, rejects stale author edits and blocks reintroducing removed text', () => local(async f => {
  const { id } = await article(f, { open: true });
  const member = await f.user(), moderator = await staff(f, 'news_moderator');
  const c = await post(f, id, member, 'Keep this blocked passage and the rest.');
  const changed = await result(await discussion(f, id, moderator, { ...ref(c, 'redact'), part: 0, start: 10, end: 25, reason: 'Fictional moderation reason' }));
  const redacted = changed.comments[0];
  assert.deepEqual(redacted.parts, [{ text: 'Keep this ' }, { note: 'Fictional moderation reason' }, { text: ' and the rest.' }]);
  assert.equal(redacted.edited, false);
  assert.ok(!JSON.stringify(changed).includes('digest'));
  assert.ok(!(await f.sql('SELECT body FROM news_comments WHERE id=?', c.id).first('body')).includes('blocked passage'));
  await result(await discussion(f, id, member, { ...ref(c, 'edit'), parts: ['Stale save'] }), 409);
  await result(await discussion(f, id, member, { ...ref(redacted, 'edit'), parts: ['Good', { note: 'Override' }, 'Text'] }), 400);
  await result(await discussion(f, id, member, { ...ref(redacted, 'edit'), parts: ['BLOCKED ', 'PASSAGE elsewhere'] }), 400);
  const edited = (await result(await discussion(f, id, member, { ...ref(redacted, 'edit'), parts: ['Edited ', ' content'] }))).comments[0];
  assert.deepEqual(edited.parts, [{ text: 'Edited ' }, { note: 'Fictional moderation reason' }, { text: ' content' }]);
  assert.ok(edited.edited);
  const audit = (await f.sql('SELECT action,reason,actor_id FROM news_comment_moderation WHERE comment_id=?', c.id).all()).results;
  assert.deepEqual(audit, [{ action: 'redact', reason: 'Fictional moderation reason', actor_id: moderator.id }]);
}));

test('moderators can remove and recover on closed threads; text and audit expire independently', () => local(async f => {
  const { id } = await article(f, { open: true });
  const member = await f.user(), moderator = await staff(f, 'news_moderator');
  const c = await post(f, id, member, 'Fictional private recovery text');
  const open = await result(await discussion(f, id, moderator));
  await result(await discussion(f, id, moderator, { action: 'thread', open: false, revision: open.revision }));
  const remove = item => discussion(f, id, moderator, { ...ref(item, 'remove'), reason: 'Fictional reason' });
  const hidden = (await result(await remove(c))).comments[0];
  assert.equal(hidden.recoverable, true);
  assert.deepEqual(hidden.parts, []);
  assert.equal(hidden.reason, 'Fictional reason');
  assert.equal(hidden.author, null);
  assert.equal((await result(await discussion(f, id, member))).comments[0].recoverable, false);
  const interval = await f.sql(`SELECT c.recovery_until-m.occurred_at AS seconds FROM news_comments c
    JOIN news_comment_moderation m ON m.comment_id=c.id WHERE c.id=?`, c.id).first('seconds');
  assert.equal(interval, 14 * 86400);
  const restored = (await result(await discussion(f, id, moderator, ref(hidden, 'restore')))).comments[0];
  assert.deepEqual(restored.parts, c.parts);
  const expired = (await result(await remove(restored))).comments[0];
  await f.sql('UPDATE news_comments SET recovery_until=unixepoch() WHERE id=?', c.id).run();
  await result(await discussion(f, id, moderator, ref(expired, 'restore')), 409);
  const maintenance = () => f.fetch('http://127.0.0.1:5173/fixture-news-comment-maintenance');
  assert.equal((await maintenance()).status, 200);
  assert.deepEqual(await f.sql('SELECT body,recovery_until FROM news_comments WHERE id=?', c.id).first(), { body: null, recovery_until: null });
  assert.equal(await f.sql('SELECT count(*) AS n FROM news_comment_moderation WHERE comment_id=?', c.id).first('n'), 3);
  await f.sql('UPDATE news_comment_moderation SET occurred_at=unixepoch()-90*86400 WHERE comment_id=?', c.id).run();
  assert.equal((await result(await discussion(f, id, member))).comments[0].reason, null);
  assert.equal((await maintenance()).status, 200);
  assert.equal(await f.sql('SELECT count(*) AS n FROM news_comment_moderation WHERE comment_id=?', c.id).first('n'), 0);
  assert.equal((await result(await discussion(f, id, member))).comments[0].state, 'removed');
}));

test('posting is bounded and replay-safe, and cursor paging handles tied timestamps', () => local(async f => {
  const { id } = await article(f, { open: true });
  const member = await f.user(), fixedId = randomUUID();
  const input = { action: 'post', id: fixedId, text: 'Fictional replay' };
  for (const r of await Promise.all([discussion(f, id, member, input), discussion(f, id, member, input)])) await result(r);
  for (let i = 0; i < 4; i++) await post(f, id, member, 'Fictional additional comment');
  await result(await discussion(f, id, member, { ...input, id: randomUUID() }), 429);
  await result(await discussion(f, id, member, input));
  await f.sql('UPDATE news_comments SET created_at=unixepoch()-601').run();
  await post(f, id, member, 'After the rate window');
  for (let i = 0; i < 20; i++) {
    await f.sql('INSERT INTO news_comments(id,article_id,author_id,body,created_at) VALUES(?,?,?,?,1)',
      randomUUID(), id, member.id, JSON.stringify([{ text: 'Fictional page example' }])).run();
  }
  const first = await result(await discussion(f, id, member));
  const second = await result(await f.request('news-comments/' + id + '?before=' + encodeURIComponent(first.next), member, undefined, proof(member)));
  assert.equal(first.comments.length, 20);
  assert.equal(second.comments.length, 6);
  assert.equal(new Set([...first.comments, ...second.comments].map(c => c.id)).size, 26);
  assert.equal(second.next, null);
}));

test('deactivation blocks access and deletion preserves comment text without former identity', () => local(async f => {
  const { id } = await article(f, { open: true });
  const member = await f.user(), observer = await f.user();
  await f.sql("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,'Former Nickname',0,0)", member.id).run();
  const c = await post(f, id, member, 'Fictional retained comment');
  await f.sql("UPDATE users SET status='disabled' WHERE id=?", member.id).run();
  await result(await discussion(f, id, member), 401);
  assert.equal((await result(await discussion(f, id, observer))).comments[0].author, null);
  const removedAccount = await f.user();
  await f.sql("INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,'Deleted Nickname',0,0)", removedAccount.id).run();
  const retained = await post(f, id, removedAccount, 'Fictional retained after deletion');
  await f.sql(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
    VALUES(?,?,0,'password',unixepoch(),unixepoch()+300)`, removedAccount.digest, removedAccount.id).run();
  const deleted = await f.fetch('http://127.0.0.1:5173/fixture-news-delete', {
    headers: { 'X-Fixture-Actor': removedAccount.id, 'X-Fixture-Digest': removedAccount.digest },
  });
  assert.equal(deleted.status, 200, await deleted.clone().text());
  const page = await result(await discussion(f, id, observer));
  assert.deepEqual(page.comments.find(item => item.id === c.id).parts, c.parts);
  const anonymized = page.comments.find(item => item.id === retained.id);
  assert.equal(anonymized.author, null);
  assert.deepEqual(anonymized.parts, retained.parts);
  assert.doesNotMatch(JSON.stringify(page), /Former Nickname|Deleted Nickname/);
  assert.equal(await f.sql('SELECT author_id FROM news_comments WHERE id=?', retained.id).first('author_id'), null);
}));
