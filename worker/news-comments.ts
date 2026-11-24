import { authOrigin, authRouteEnabled, validAuthMutation } from './auth/environment';
import type { AuthenticationEnvironment } from './auth/http';
import { readInput } from './auth/registration';
import { memberActor } from './event-registration-data';
import { commentAudit, commentsReady, editorActor, moderatorActor, readCommentPage, RECOVERY_SECONDS } from './news-comment-data';
import { editParts, moderationReason, newComment, redactParts, type StoredCommentPart } from './news-comment-text';
import { NewsError } from './news-data';
import { verifiedNewsMember, type NewsMember } from './news-member';
import { UUID } from './role-administration';

const THREAD = "SELECT 1 FROM news_articles WHERE id=? AND publication_status='published'";
const PUBLISHED = `EXISTS(${THREAD})`;
const OPEN = `EXISTS(${THREAD} AND comments_open=1)`;
const POST_WINDOW = 600;
const POST_LIMIT = 5;
const canManage = `(${moderatorActor} OR ${editorActor})`;

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store',
    Vary: 'Cookie, X-LAN-Session-Proof', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' } });
}

function validRevision(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function cursorFrom(url: URL) {
  if (!url.search) return;
  const cursor = url.searchParams.get('before');
  const match = cursor?.match(/^(\d{1,16}):([a-f0-9-]+)$/);
  if ([...url.searchParams].length !== 1 || !match || !validRevision(Number(match[1])) || !UUID.test(match[2])) {
    throw new NewsError(400, 'Invalid comment page');
  }
  return { time: Number(match[1]), id: match[2] };
}

function payload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NewsError(400, 'Invalid comment action');
  return value as Record<string, unknown>;
}

function fields(input: Record<string, unknown>, expected: string[]) {
  if (Object.keys(input).length !== expected.length || expected.some(key => !Object.hasOwn(input, key))) {
    throw new NewsError(400, 'Invalid comment fields');
  }
}

async function updateThread(db: D1Database, articleId: string, viewer: NewsMember, input: Record<string, unknown>) {
  fields(input, ['action', 'open', 'revision']);
  const { open, revision } = input, { userId, digest } = viewer;
  if (typeof open !== 'boolean' || !validRevision(revision)) throw new NewsError(400, 'Invalid thread state');
  if (!await db.prepare(`SELECT 1 WHERE ${canManage}`).bind(userId, digest, userId, digest).first()) {
    throw new NewsError(403, 'Thread management is restricted');
  }
  const [result] = await db.batch([
    db.prepare(`UPDATE news_articles SET comments_open=?,comments_revision=comments_revision+1
      WHERE id=? AND publication_status='published' AND comments_revision=? AND ${canManage}`)
      .bind(Number(open), articleId, revision, userId, digest, userId, digest),
    commentAudit(db, articleId, null, userId, open ? 'open' : 'close', null),
  ]);
  if (!result.meta.changes) throw new NewsError(409, 'Thread changed. Reload before trying again');
}

async function postComment(db: D1Database, articleId: string, viewer: NewsMember, input: Record<string, unknown>) {
  fields(input, ['action', 'id', 'text']);
  const id = input.id;
  if (typeof id !== 'string' || !UUID.test(id)) throw new NewsError(400, 'Invalid comment reference');
  const body = JSON.stringify(newComment(input.text));
  const { userId, digest } = viewer;
  if (!await db.prepare(`SELECT 1 WHERE ${OPEN} AND ${memberActor}`).bind(articleId, userId, digest).first()) {
    throw new NewsError(409, 'Comments are closed or unavailable');
  }
  const [result, existing, eligible] = await db.batch<{ revision?: number; body?: string; ready?: number }>([
    db.prepare(`INSERT INTO news_comments(id,article_id,author_id,body,created_at)
      SELECT ?,?,?,?,unixepoch() WHERE ${OPEN} AND ${memberActor} AND
        (SELECT count(*) FROM news_comments WHERE author_id=? AND created_at>unixepoch()-${POST_WINDOW})<${POST_LIMIT}
      ON CONFLICT(id) DO NOTHING`).bind(id, articleId, userId, body, articleId, userId, digest, userId),
    db.prepare(`SELECT body,revision FROM news_comments WHERE id=? AND article_id=? AND author_id=? AND ${OPEN} AND ${memberActor}`)
      .bind(id, articleId, userId, articleId, userId, digest),
    db.prepare(`SELECT ${OPEN} AND ${memberActor} AS ready`).bind(articleId, userId, digest),
  ]);
  const replay = existing.results[0];
  if (result.meta.changes || replay?.revision === 0 && replay.body === body) return;
  if (!eligible.results[0]?.ready || replay) throw new NewsError(409, 'Comment or thread changed. Reload before trying again');
  throw new NewsError(429, 'Too many comments. Try again in ten minutes');
}

async function changeComment(db: D1Database, articleId: string, viewer: NewsMember,
  input: Record<string, unknown>, secret: string) {
  const { id, revision, action } = input, { userId, digest } = viewer;
  if (typeof id !== 'string' || !UUID.test(id) || !validRevision(revision)) throw new NewsError(400, 'Invalid comment reference');
  const isAuthorAction = action === 'edit' || action === 'delete';
  const base = ['action', 'id', 'revision'];
  const extra = action === 'edit' ? ['parts'] : action === 'redact' ? ['part', 'start', 'end', 'reason'] : action === 'remove' ? ['reason'] : [];
  fields(input, [...base, ...extra]);
  if (!isAuthorAction && !await db.prepare(`SELECT 1 WHERE ${moderatorActor}`).bind(userId, digest).first()) {
    throw new NewsError(403, 'Comment moderation is restricted');
  }
  const guard = isAuthorAction ? `author_id=? AND ${OPEN} AND ${memberActor}` : `${PUBLISHED} AND ${moderatorActor}`;
  const values = isAuthorAction ? [userId, articleId, userId, digest] : [articleId, userId, digest];
  const condition = `id=? AND article_id=? AND revision=? AND ${guard}`;
  const identity = [id, articleId, revision, ...values];
  const targetState = action === 'restore' ? "state='removed' AND body IS NOT NULL AND recovery_until>unixepoch()" : "state='visible'";
  const find = `FROM news_comments WHERE ${condition} AND ${targetState}`;
  let reason: string | null = null;
  let update: D1PreparedStatement;
  if (action === 'edit' || action === 'redact') {
    const row = await db.prepare(`SELECT body ${find}`).bind(...identity).first<{ body: string }>();
    if (!row) throw new NewsError(409, 'Comment or thread changed. Reload before trying again');
    const parts: StoredCommentPart[] = JSON.parse(row.body);
    let revised: StoredCommentPart[];
    if (action === 'edit') revised = await editParts(parts, input.parts, secret, id);
    else {
      reason = moderationReason(input.reason);
      revised = await redactParts(parts, input.part, input.start, input.end, reason, secret, id);
    }
    update = db.prepare(`UPDATE news_comments SET body=?,revision=revision+1${action === 'edit' ? ',edited_at=unixepoch()' : ''}
      WHERE ${condition} AND ${targetState}`).bind(JSON.stringify(revised), ...identity);
  } else {
    if (action === 'remove') reason = moderationReason(input.reason);
    const changes = action === 'delete' ? "state='deleted',body=NULL" : action === 'restore' ? "state='visible',recovery_until=NULL" :
      `state='removed',recovery_until=unixepoch()+${RECOVERY_SECONDS}`;
    update = db.prepare(`UPDATE news_comments SET ${changes},revision=revision+1 WHERE ${condition} AND ${targetState}`).bind(...identity);
  }
  const [result] = isAuthorAction ? [await update.run()] :
    await db.batch([update, commentAudit(db, articleId, id, userId, String(action), reason)]);
  if (!result.meta.changes) throw new NewsError(409, 'Comment or thread changed. Reload before trying again');
}

export async function newsComments(request: Request, env: AuthenticationEnvironment) {
  const url = new URL(request.url), id = url.pathname.slice('/api/news-comments/'.length);
  if (!UUID.test(id) || !authRouteEnabled(request, env, env.AUTH_SESSION_MODE)) return reply(404, { error: 'Thread not found' });
  if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  try {
    const origin = authOrigin(request, env).origin;
    if (request.headers.has('Content-Encoding') || request.headers.get('X-LAN-Request') !== '1' ||
        request.headers.has('Origin') && request.headers.get('Origin') !== origin ||
        request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') return reply(403, { error: 'Request rejected' });
    const viewer = await verifiedNewsMember(request, env), secret = env.AUTH_RATE_LIMIT_SECRET;
    if (!viewer || !secret) return reply(401, { error: 'Sign in with a verified account to view comments' });
    if (!await commentsReady(env.DB)) return reply(503, { error: 'Comments are awaiting their database migration' });
    if (request.method === 'POST') {
      if (url.search || !await validAuthMutation(request, origin, viewer.digest, secret)) return reply(403, { error: 'Request rejected' });
      let input: Record<string, unknown>;
      try { input = payload(await readInput(request)); } catch { return reply(400, { error: 'Invalid comment action' }); }
      if (input.action === 'post') await postComment(env.DB, id, viewer, input);
      else if (input.action === 'thread') await updateThread(env.DB, id, viewer, input);
      else if (typeof input.action === 'string' && ['edit', 'delete', 'redact', 'remove', 'restore'].includes(input.action)) {
        await changeComment(env.DB, id, viewer, input, secret);
      } else return reply(400, { error: 'Invalid comment action' });
    }
    const page = await readCommentPage(env.DB, id, viewer, cursorFrom(url));
    return page ? reply(200, page) : reply(404, { error: 'Thread not found' });
  } catch (error) {
    return error instanceof NewsError ? reply(error.status, { error: error.message }) :
      reply(503, { error: 'Comments could not be confirmed. Reload before trying again' });
  }
}
