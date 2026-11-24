import { isNewsReaction, reactionChoices, type NewsReaction, type NewsReactionState } from '../src/lib/news-reactions';
import { authOrigin, authRouteEnabled, validAuthMutation } from './auth/environment';
import type { AuthenticationEnvironment } from './auth/http';
import { readInput } from './auth/registration';
import { memberActor } from './event-registration-data';
import { verifiedNewsMember, type NewsMember } from './news-member';
import { UUID } from './role-administration';

const publishedArticle = "SELECT 1 FROM news_articles WHERE id=? AND publication_status='published'";
const writeGuard = `EXISTS(${publishedArticle}) AND ${memberActor}`;

interface ReactionRow { reaction: NewsReaction | null; total: number; selected: number; verified: number }

function reply(status: number, body: unknown) {
  return Response.json(body, { status, headers: {
    'Cache-Control': 'no-store', 'Vary': 'Cookie, X-LAN-Session-Proof',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  } });
}

function readReactions(db: D1Database, articleId: string, viewer?: NewsMember) {
  return db.prepare(`WITH viewer AS (SELECT ? AS user_id WHERE ${memberActor})
    SELECT r.reaction, COUNT(r.reaction) AS total,
      MAX(CASE WHEN r.user_id = viewer.user_id THEN 1 ELSE 0 END) AS selected,
      MAX(viewer.user_id IS NOT NULL) AS verified
    FROM news_articles a
    LEFT JOIN news_article_reactions r ON r.article_id = a.id
    LEFT JOIN viewer ON 1=1
    WHERE a.id=? AND a.publication_status='published'
    GROUP BY r.reaction`).bind(viewer?.userId ?? null, viewer?.userId ?? null, viewer?.digest ?? null, articleId);
}

function reactionResponse(rows: ReactionRow[], viewer?: NewsMember) {
  if (!rows.length) return reply(404, { error: 'Article not found' });
  if (viewer && !rows[0].verified) return reply(401, { error: 'Sign in again' });
  const counts = Object.fromEntries(reactionChoices.map(({ id }) => [id, 0])) as NewsReactionState['counts'];
  let reaction: NewsReaction | null = null;
  for (const row of rows) {
    if (!row.reaction) continue;
    counts[row.reaction] = row.total;
    if (row.selected) reaction = row.reaction;
  }
  return reply(200, { counts, reaction } satisfies NewsReactionState);
}

export async function newsReactions(request: Request, env: AuthenticationEnvironment) {
  const url = new URL(request.url);
  const articleId = url.pathname.slice('/api/news-reactions/'.length);
  if (!UUID.test(articleId) || !authRouteEnabled(request, env, env.AUTH_SESSION_MODE)) return reply(404, { error: 'Article not found' });
  if (request.method !== 'GET' && request.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  try {
    const origin = authOrigin(request, env).origin;
    const wantsOwn = request.method === 'POST' || request.headers.has('X-LAN-Session-Proof');
    if (url.search || request.headers.has('Content-Encoding') ||
        (wantsOwn && request.headers.get('X-LAN-Request') !== '1') ||
        (request.headers.has('Origin') && request.headers.get('Origin') !== origin) ||
        (wantsOwn && request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin')) {
      return reply(403, { error: 'Request rejected' });
    }
    const viewer = wantsOwn ? await verifiedNewsMember(request, env) : undefined;
    if (wantsOwn && !viewer) return reply(401, { error: 'Sign in with a verified account to react' });
    const ready = await env.DB.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='news_article_reactions'").first();
    if (!ready) return reply(503, { error: 'Reactions are awaiting their database migration' });

    const read = readReactions(env.DB, articleId, viewer);
    if (request.method === 'GET') return reactionResponse((await read.all<ReactionRow>()).results, viewer);
    if (!viewer || !await validAuthMutation(request, origin, viewer.digest, env.AUTH_RATE_LIMIT_SECRET!)) {
      return reply(403, { error: 'Request rejected' });
    }
    let input: unknown;
    try { input = await readInput(request); } catch { return reply(400, { error: 'Choose a reaction' }); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).length !== 1 || !Object.hasOwn(input, 'reaction')) {
      return reply(400, { error: 'Choose a reaction' });
    }
    const { reaction } = input as { reaction: unknown };
    if (reaction !== null && !isNewsReaction(reaction)) return reply(400, { error: 'Choose a reaction' });

    // Set the requested state atomically. Duplicate requests never add another reaction.
    const write = reaction === null
      ? env.DB.prepare(`DELETE FROM news_article_reactions WHERE article_id=? AND user_id=? AND ${writeGuard}`)
        .bind(articleId, viewer.userId, articleId, viewer.userId, viewer.digest)
      : env.DB.prepare(`INSERT INTO news_article_reactions(article_id, user_id, reaction)
          SELECT ?,?,? WHERE ${writeGuard}
          ON CONFLICT(article_id, user_id) DO UPDATE SET reaction=excluded.reaction
          WHERE reaction<>excluded.reaction`).bind(articleId, viewer.userId, reaction, articleId, viewer.userId, viewer.digest);
    const [, result] = await env.DB.batch<ReactionRow>([write, read]);
    return reactionResponse(result.results, viewer);
  } catch {
    return reply(503, { error: 'Reactions could not be confirmed. Reload before trying again' });
  }
}
