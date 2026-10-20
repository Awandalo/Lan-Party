import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = 'Awandalo/Lan-Party';
export const journalPath = fileURLToPath(new URL('../.wrangler/github-monitor/GIT_ISSUES.md', import.meta.url));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const role = (body) => /^\[(OWNER|Q|TECHDEVIE)\]\r?$/.exec(body.split('\n')[0])?.[1] ?? 'UNRECOGNIZED';
const empty = () => ({ version: 1, repository, issues: {}, error: null });
export const watchedLabels = ['codex-ready', 'codex-research'];
const labelsFor = (nodes) => watchedLabels.filter((name) => nodes.some((label) => label.name === name));

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
        !labelsFor(issue.labels).length ||
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
        commentRevision: commentRevision(item.comments),
        labelRevision: hash(labelsFor(item.labels.nodes).join(',')) }));
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
  const researchCandidates = [];
  function queueResearch(number, record) {
    if (!record?.watchLabels?.includes('codex-research') || !record.researchRevision) return;
    const state = record.research;
    if (state?.status === 'completed' && state.revision === record.researchRevision) return;
    researchCandidates.push({ number, revision: record.researchRevision,
      url: `https://github.com/${repository}/issues/${number}`,
      claimRevision: state?.revision ?? null,
      blocked: Boolean(state && state.status !== 'completed'), status: state?.status ?? 'queued' });
  }
  for (const item of await reader.metadata()) {
    if (!Number.isSafeInteger(item.number) || item.number <= 0) throw new Error('invalid_metadata');
    const prior = previous.issues[item.number];
    const revision = `${item.updatedAt}:${item.titleHash}:${item.commentRevision}${item.labelRevision ? `:${item.labelRevision}` : ''}`;
    if (prior?.revision === revision) { queueResearch(item.number, prior); continue; }
    const detail = await reader.detail(item.number);
    if (detail.updatedAt !== item.updatedAt) throw new Error('github_changed_during_read');
    if (commentRevision(detail.comments) !== item.commentRevision) throw new Error('github_changed_during_read');
    const labels = labelsFor(detail.labels.nodes);
    if (detail.state !== 'OPEN' || !labels.length) continue;
    if (item.labelRevision && item.labelRevision !== hash(labels.join(','))) throw new Error('github_changed_during_read');
    const bodyHash = hash(detail.body);
    const routes = [];
    const bodyRole = role(detail.body);
    if (prior && JSON.stringify(prior.watchLabels ?? ['codex-ready']) !== JSON.stringify(labels)) {
      routes.push(...labels.map((label) => `label:${label}`));
    }
    if ((prior?.bodyHash !== bodyHash || prior?.titleHash !== item.titleHash) && bodyRole !== 'TECHDEVIE') routes.push(`issue:${bodyRole}`);
    const comments = {};
    const researchComments = [];
    for (const comment of detail.comments) {
      const fingerprint = hash(`${comment.updatedAt}\n${comment.body}`);
      comments[comment.id] = fingerprint;
      const marker = role(comment.body);
      if (marker !== 'TECHDEVIE') researchComments.push([comment.id, fingerprint]);
      if (prior?.comments[comment.id] !== fingerprint && marker !== 'TECHDEVIE') routes.push(`comment:${marker}`);
    }
    if (routes.length) notifications.push({ number: item.number, url: `https://github.com/${repository}/issues/${item.number}`, routes });
    const record = next.issues[item.number] = {
      revision, titleHash: item.titleHash, bodyHash, comments,
      lastCommentId: detail.comments.at(-1)?.id ?? null,
      lastNotifiedRevision: routes.length ? revision : prior?.lastNotifiedRevision ?? null,
      status: routes.length ? 'reported' : 'seen', inspectedAt: timestamp,
      watchLabels: labels, research: prior?.research ?? null,
      researchRevision: labels.includes('codex-research') && ['Q', 'OWNER'].includes(bodyRole)
        ? hash(JSON.stringify([item.titleHash, bodyHash, researchComments])) : null,
    };
    queueResearch(item.number, record);
  }
  next.error = null;
  next.checkedAt = timestamp;
  return { next, notifications, researchCandidates };
}

async function updateJournal(transform, path) {
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
    if (previous.version !== 1 || previous.repository !== repository || !previous.issues) throw new Error('invalid_journal');
    try {
      const result = await transform(previous);
      await save(result.next);
      return result;
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

export async function scanNow(reader, path = journalPath) {
  const { notifications, researchCandidates } = await updateJournal((previous) => inspect(reader, previous), path);
  return { notifications, researchCandidates };
}

export async function checkNow(reader, path = journalPath) {
  return (await scanNow(reader, path)).notifications;
}

// Local cache claims coordinate reporting only; they grant no implementation authority.
export async function researchAction(action, number, revision, commentId = null, path = journalPath) {
  if (!Number.isSafeInteger(number) || number <= 0 || !/^[a-f0-9]{64}$/.test(revision) ||
      !['claim', 'complete', 'failed', 'uncertain', 'attention'].includes(action)) throw new Error('invalid_research_action');
  if (action === 'complete' && (!Number.isSafeInteger(commentId) || commentId <= 0)) throw new Error('invalid_comment_id');
  const result = await updateJournal((previous) => {
    const next = structuredClone(previous);
    const record = next.issues[number];
    if (!record?.watchLabels?.includes('codex-research') || !record.researchRevision) throw new Error('research_not_eligible');
    const prior = record.research;
    if (action === 'attention') {
      if (!prior || prior.status === 'completed' || prior.revision !== revision) throw new Error('research_claim_mismatch');
      const notify = !prior.attentionReported;
      prior.attentionReported = true;
      return { next, value: { notify } };
    }
    if (action === 'claim') {
      if (record.researchRevision !== revision) throw new Error('research_revision_changed');
      if (prior && (prior.status !== 'completed' || prior.revision === revision)) {
        return { next, value: { claimed: false, status: prior.status } };
      }
      record.research = { revision, status: 'in_progress', startedAt: new Date().toISOString() };
      return { next, value: { claimed: true, status: 'in_progress' } };
    }
    if (prior?.status !== 'in_progress' || prior.revision !== revision) throw new Error('research_claim_mismatch');
    record.research = { ...prior, status: action === 'complete' ? 'completed' : action,
      updatedAt: new Date().toISOString(), ...(action === 'complete' ? { commentId } : {}) };
    return { next, value: { status: record.research.status } };
  }, path);
  return result.value;
}

if (typeof process !== 'undefined' && process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.error('Use the GitHub connector and checkNow(connectorReader(snapshots)); CLI GitHub reads are disabled.');
  process.exitCode = 1;
}
