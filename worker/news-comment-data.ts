import type { NewsComment, NewsCommentPage } from '../src/lib/news-comments';
import { eventActor } from './event-data';
import { memberActor } from './event-registration-data';
import type { NewsMember } from './news-member';
import type { StoredCommentPart } from './news-comment-text';

export const RECOVERY_SECONDS = 14 * 86400;
const AUDIT_SECONDS = 90 * 86400;
const PAGE_SIZE = 20;
export const moderatorActor = eventActor('news.moderate_comments');
export const editorActor = eventActor('news.update');

export async function commentsReady(db: D1Database) {
  return !!await db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='news_comment_moderation'").first();
}

interface ThreadRow {
  open: number; threadRevision: number; moderator: number; editor: number;
  id: string | null; author: string | null; own: number; state: NewsComment['state']; body: string | null;
  reason: string | null; revision: number; createdAt: number; edited: number; recoverable: number;
}

export async function readCommentPage(db: D1Database, articleId: string, viewer: NewsMember, cursor?: { time: number; id: string }): Promise<NewsCommentPage | null> {
  const { userId, digest } = viewer;
  const { results } = await db.prepare(`WITH viewer AS (
      SELECT ? AS viewer_id, ${moderatorActor} AS moderator, ${editorActor} AS editor WHERE ${memberActor}
    )
    SELECT a.comments_open AS open, a.comments_revision AS threadRevision, v.moderator, v.editor,
      c.id, CASE WHEN c.state='visible' AND u.status='active' AND NOT EXISTS(SELECT 1 FROM account_lifecycle l WHERE l.user_id=u.id)
        THEN coalesce(n.nickname, '') ELSE NULL END AS author,
      c.author_id=v.viewer_id AS own, c.state, CASE WHEN c.state='visible' THEN c.body END AS body,
      CASE WHEN c.state='removed' THEN (SELECT reason FROM news_comment_moderation m WHERE m.comment_id=c.id
        AND m.action='remove' AND m.occurred_at>unixepoch()-${AUDIT_SECONDS} ORDER BY m.id DESC LIMIT 1) END AS reason,
      c.revision, c.created_at AS createdAt, c.edited_at IS NOT NULL AS edited,
      v.moderator AND c.recovery_until>unixepoch() AS recoverable
    FROM news_articles a CROSS JOIN viewer v
    LEFT JOIN news_comments c ON c.article_id=a.id${cursor ? ' AND (c.created_at,c.id)<(?,?)' : ''}
    LEFT JOIN users u ON u.id=c.author_id LEFT JOIN user_nicknames n ON n.user_id=u.id
    WHERE a.id=? AND a.publication_status='published'
    ORDER BY c.created_at DESC,c.id DESC LIMIT ?`).bind(userId, userId, digest, userId, digest, userId, digest,
      ...(cursor ? [cursor.time,cursor.id] : []), articleId, PAGE_SIZE + 1).all<ThreadRow>();
  const first = results[0];
  if (!first) return null;
  const comments = results.slice(0, PAGE_SIZE).flatMap(row => {
    if (!row.id) return [];
    const parts: StoredCommentPart[] = row.body ? JSON.parse(row.body) : [];
    return [{ id: row.id, author: row.author, own: !!row.own, state: row.state,
      parts: parts.map(part => 'text' in part ? { text: part.text } : { note: part.note }),
      reason: row.reason, revision: row.revision, createdAt: row.createdAt, edited: !!row.edited, recoverable: !!row.recoverable }];
  });
  const last = comments.at(-1);
  return { open: !!first.open, revision: first.threadRevision, moderator: !!first.moderator,
    canManageThread: !!(first.moderator || first.editor), comments,
    next: results.length > PAGE_SIZE && last ? `${last.createdAt}:${last.id}` : null };
}

export function commentAudit(db: D1Database, articleId: string, commentId: string | null,
  actor: string, action: string, reason: string | null) {
  return db.prepare(`INSERT INTO news_comment_moderation(article_id,comment_id,actor_id,action,reason,occurred_at)
    SELECT ?,?,?,?,?,unixepoch() WHERE changes()=1`).bind(articleId, commentId, actor, action, reason);
}

export async function purgeNewsComments(db: D1Database) {
  if (!await commentsReady(db)) return;
  for (let batch = 0; batch < 10; batch++) {
    const result = await db.batch([
      db.prepare(`UPDATE news_comments SET body=NULL,recovery_until=NULL WHERE id IN (
        SELECT id FROM news_comments WHERE recovery_until<=unixepoch() ORDER BY recovery_until LIMIT 500)`),
      db.prepare(`DELETE FROM news_comment_moderation WHERE id IN (
        SELECT id FROM news_comment_moderation WHERE occurred_at<=unixepoch()-${AUDIT_SECONDS} ORDER BY occurred_at LIMIT 500)`),
    ]);
    if (result.every(item => item.meta.changes < 500)) return;
  }
}
