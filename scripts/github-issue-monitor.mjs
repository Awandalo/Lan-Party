import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = 'Awandalo/Lan-Party';
export const journalPath = fileURLToPath(new URL('../.wrangler/github-monitor/GIT_ISSUES.md', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const role = (body) => /^\[(OWNER|Q|TECHDEVIE)\]\r?$/.exec(body.split('\n')[0])?.[1] ?? 'UNRECOGNIZED';
const empty = () => ({ version: 1, repository, issues: {}, error: null });

// Fixed read-only GraphQL queries; issue content is never used as executable input.
const metadataQuery = `query($cursor:String) {
  repository(owner:"Awandalo",name:"Lan-Party") {
    issues(first:100,after:$cursor,states:OPEN,labels:["codex-ready"]) {
      nodes { number title updatedAt comments(first:100) {
        nodes { id updatedAt } pageInfo { hasNextPage endCursor }
      } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
const commentMetadataQuery = `query($number:Int!,$cursor:String) {
  repository(owner:"Awandalo",name:"Lan-Party") {
    issue(number:$number) { comments(first:100,after:$cursor) {
      nodes { id updatedAt } pageInfo { hasNextPage endCursor }
    } }
  }
}`;
const commentRevision = (comments) => hash(JSON.stringify(comments.map(({ id, updatedAt }) => [id, updatedAt])));
const detailQuery = `query($number:Int!,$cursor:String) {
  repository(owner:"Awandalo",name:"Lan-Party") {
    issue(number:$number) {
      body updatedAt state labels(first:100) { nodes { name } }
      comments(first:100,after:$cursor) {
        nodes { id updatedAt body }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

export function githubReader(gh = process.env.ProgramFiles ? join(process.env.ProgramFiles, 'GitHub CLI', 'gh.exe') : 'gh') {
  function query(document, variables = {}) {
    const args = ['api', '--hostname', 'github.com', 'graphql', '-f', `query=${document}`];
    for (const [key, value] of Object.entries(variables)) {
      if (value !== null) args.push('-F', `${key}=${value}`);
    }
    // Never echo command output, authentication failures, or provider response bodies.
    const response = JSON.parse(execFileSync(gh, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    if (response.errors || !response.data?.repository) throw new Error('github_read_failed');
    return response.data.repository;
  }
  return {
    async metadata() {
      const result = [];
      let cursor = null;
      do {
        const page = query(metadataQuery, { cursor }).issues;
        for (const item of page.nodes) {
          const comments = [...item.comments.nodes];
          let commentCursor = item.comments.pageInfo.hasNextPage ? item.comments.pageInfo.endCursor : null;
          while (commentCursor) {
            const additional = query(commentMetadataQuery, { number: item.number, cursor: commentCursor }).issue.comments;
            comments.push(...additional.nodes);
            commentCursor = additional.pageInfo.hasNextPage ? additional.pageInfo.endCursor : null;
          }
          result.push({ number: item.number, titleHash: hash(item.title), updatedAt: item.updatedAt, commentRevision: commentRevision(comments) });
        }
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
      } while (cursor);
      return result;
    },
    async detail(number) {
      let cursor = null;
      let result;
      const comments = [];
      do {
        const page = query(detailQuery, { number, cursor }).issue;
        if (!page) throw new Error('github_read_failed');
        if (result && result.updatedAt !== page.updatedAt) throw new Error('github_changed_during_read');
        result = page;
        comments.push(...page.comments.nodes);
        cursor = page.comments.pageInfo.hasNextPage ? page.comments.pageInfo.endCursor : null;
      } while (cursor);
      return { ...result, comments };
    },
  };
}

export async function inspect(reader, previous, timestamp = new Date().toISOString()) {
  if (previous.version !== 1 || previous.repository !== repository || !previous.issues) throw new Error('invalid_journal');
  const next = structuredClone(previous);
  const notifications = [];
  for (const item of await reader.metadata()) {
    if (!Number.isSafeInteger(item.number) || item.number <= 0) throw new Error('invalid_metadata');
    const prior = previous.issues[item.number];
    const revision = `${item.updatedAt}:${item.titleHash}:${item.commentRevision}`;
    if (prior?.revision === revision) continue;
    const detail = await reader.detail(item.number);
    if (detail.updatedAt !== item.updatedAt) throw new Error('github_changed_during_read');
    if (commentRevision(detail.comments) !== item.commentRevision) throw new Error('github_changed_during_read');
    if (detail.state !== 'OPEN' || !detail.labels.nodes.some((label) => label.name === 'codex-ready')) continue;
    const bodyHash = hash(detail.body);
    const routes = [];
    const bodyRole = role(detail.body);
    if ((prior?.bodyHash !== bodyHash || prior?.titleHash !== item.titleHash) && bodyRole !== 'TECHDEVIE') routes.push(`issue:${bodyRole}`);
    const comments = {};
    for (const comment of detail.comments) {
      const fingerprint = hash(`${comment.updatedAt}\n${comment.body}`);
      comments[comment.id] = fingerprint;
      const marker = role(comment.body);
      if (prior?.comments[comment.id] !== fingerprint && marker !== 'TECHDEVIE') routes.push(`comment:${marker}`);
    }
    if (routes.length) notifications.push({ number: item.number, url: `https://github.com/${repository}/issues/${item.number}`, routes });
    next.issues[item.number] = {
      revision, titleHash: item.titleHash, bodyHash, comments,
      lastCommentId: detail.comments.at(-1)?.id ?? null,
      lastNotifiedRevision: routes.length ? revision : prior?.lastNotifiedRevision ?? null,
      status: routes.length ? 'reported' : 'seen', inspectedAt: timestamp,
    };
  }
  next.error = null;
  next.checkedAt = timestamp;
  return { next, notifications };
}

export async function checkNow(reader = githubReader(), path = journalPath) {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, 'wx'); // No overlapping check or automatic stale-lock recovery.
  async function save(state) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `# GitHub issue monitoring cache\n\nNo issue contents or credentials are stored here.\n\n\u0060\u0060\u0060json\n${JSON.stringify(state, null, 2)}\n\u0060\u0060\u0060\n`, { flag: 'wx' });
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  try {
    let previous = empty();
    try {
      const markdown = await readFile(path, 'utf8');
      const contents = /\u0060\u0060\u0060json\n([\s\S]*?)\n\u0060\u0060\u0060/.exec(markdown);
      if (!contents) throw new Error('invalid_journal');
      previous = JSON.parse(contents[1]);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try {
      const result = await inspect(reader, previous);
      await save(result.next);
      return result.notifications;
    } catch {
      // Retain all successful revision markers; a failed fetch never marks work processed.
      await save({ ...previous, error: { code: 'check_failed', at: new Date().toISOString() } });
      throw new Error('GitHub check failed; nothing new marked processed. Inspect access/network availability manually.');
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const notifications = await checkNow();
    if (notifications.length) console.log(JSON.stringify({ notifications }));
  } catch {
    console.error('GitHub monitor check failed; no new revisions were acknowledged. Check the local journal and permissions.');
    process.exitCode = 1;
  }
}
