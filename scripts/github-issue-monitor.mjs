import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = 'Awandalo/Lan-Party';
export const journalPath = fileURLToPath(new URL('../.wrangler/github-monitor/GIT_ISSUES.md', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const role = (body) => /^\[(OWNER|Q|TECHDEVIE)\]\r?$/.exec(body.split('\n')[0])?.[1] ?? 'UNRECOGNIZED';
const empty = () => ({ version: 1, repository, issues: {}, error: null });

// The Desktop task obtains both snapshots through the GitHub connector only.
// This module performs no network requests and never reads CLI credentials.
const commentRevision = (comments) => hash(JSON.stringify(comments.map(({ id, updatedAt }) => [id, updatedAt])));
export function connectorReader(snapshots) {
  if (!Array.isArray(snapshots)) throw new Error('invalid_connector_snapshot');
  const records = new Map();
  function normalize({ issue, comments }) {
    if (!issue || !Number.isSafeInteger(issue.number) || issue.number <= 0 ||
        issue.html_url !== `https://github.com/${repository}/issues/${issue.number}` ||
        issue.state !== 'open' || !Array.isArray(issue.labels) ||
        !issue.labels.some((label) => label.name === 'codex-ready') ||
        typeof issue.body !== 'string' || typeof issue.title !== 'string' ||
        !Number.isFinite(Date.parse(issue.updated_at)) || !Array.isArray(comments) ||
        issue.comments !== comments.length) throw new Error('invalid_connector_snapshot');
    const ids = new Set();
    const normalized = comments.map((comment) => {
      if (typeof comment.node_id !== 'string' || !comment.node_id || ids.has(comment.node_id) ||
          typeof comment.body !== 'string' || !Number.isFinite(Date.parse(comment.updated_at))) {
        throw new Error('invalid_connector_snapshot');
      }
      ids.add(comment.node_id);
      return { id: comment.node_id, updatedAt: comment.updated_at, body: comment.body };
    });
    return { number: issue.number, title: issue.title, updatedAt: issue.updated_at,
      state: 'OPEN', labels: { nodes: issue.labels.map(({ name }) => ({ name })) },
      body: issue.body, comments: normalized };
  }
  for (const snapshot of snapshots) {
    const before = normalize(snapshot.before);
    const after = normalize(snapshot.after);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('github_changed_during_read');
    if (records.has(after.number)) throw new Error('invalid_connector_snapshot');
    records.set(after.number, after);
  }
  return {
    async metadata() {
      return [...records.values()].map((item) => ({ number: item.number,
        titleHash: hash(item.title), updatedAt: item.updatedAt,
        commentRevision: commentRevision(item.comments) }));
    },
    async detail(number) {
      if (!records.has(number)) throw new Error('invalid_connector_snapshot');
      return structuredClone(records.get(number));
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

export async function checkNow(reader, path = journalPath) {
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

if (typeof process !== 'undefined' && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.error('Use the GitHub connector and checkNow(connectorReader(snapshots)); CLI GitHub reads are disabled.');
  process.exitCode = 1;
}
