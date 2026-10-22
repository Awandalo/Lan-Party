import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkNow, connectorReader, inspect, repository, researchAction, scanNow } from './github-issue-monitor.mjs';

const initial = () => ({ version: 1, repository, issues: {}, error: null });
const connectorFixture = () => ({ issue: { number: 42,
  html_url: `https://github.com/${repository}/issues/42`, state: 'open',
  labels: [{ name: 'codex-ready' }], title: 'Fictional connector issue',
  body: '[Q → TECHDEVIE]\nFictional task', updated_at: '2026-10-20T12:00:00Z', comments: 1 },
  comments: [{ node_id: 'C1', body: '[Q → TECHDEVIE]\nFictional comment', updated_at: '2026-10-20T12:00:00Z' }] });
function researchReader(labels = ['codex-research'], snapshot = connectorFixture()) {
  snapshot.issue.labels = labels.map((name) => ({ name }));
  return connectorReader([{ before: snapshot, after: structuredClone(snapshot) }]);
}
test('research and ready labels are watched independently and dual labels do not duplicate research', async () => {
  for (const labels of [['codex-ready'], ['codex-research'], ['codex-ready', 'codex-research']]) {
    const result = await inspect(researchReader(labels), initial());
    assert.equal(result.notifications.length, 1);
    assert.equal(result.researchCandidates.length, labels.includes('codex-research') ? 1 : 0);
  }
});
test('adding research label is detected without changing timestamps or comments', async () => {
  const before = await inspect(researchReader(['codex-ready']), initial());
  const after = await inspect(researchReader(['codex-ready', 'codex-research']), before.next);
  assert.equal(after.researchCandidates.length, 1);
  assert.ok(after.notifications[0].routes.includes('label:codex-research'));
});
test('own comments neither restart completed research nor notify; new Q revision can queue research', async () => {
  const snapshot = connectorFixture();
  const first = await inspect(researchReader(undefined, snapshot), initial());
  const revision = first.researchCandidates[0].revision;
  first.next.issues[42].research = { revision, status: 'completed', commentId: 123 };
  snapshot.comments.push({ node_id: 'C2', updated_at: '2026-10-20T12:01:00Z', body: '[TECHDEVIE]\nReport' });
  snapshot.issue.comments++;
  const own = await inspect(researchReader(undefined, snapshot), first.next);
  assert.deepEqual(own.notifications, []);
  assert.deepEqual(own.researchCandidates, []);
  const relabeled = await inspect(researchReader(['codex-ready', 'codex-research'], snapshot), own.next);
  assert.deepEqual(relabeled.researchCandidates, []);
  snapshot.comments.push({ node_id: 'C3', updated_at: '2026-10-20T12:02:00Z', body: '[Q → TECHDEVIE]\nNew research question' });
  snapshot.issue.comments++;
  const revised = await inspect(researchReader(undefined, snapshot), own.next);
  assert.equal(revised.researchCandidates.length, 1);
  assert.notEqual(revised.researchCandidates[0].revision, revision);
});
test('only explicit Q or owner assignments to TechDevie are research eligible', async () => {
  for (const body of ['[Q → TECHDEVIE]\nQuestion', '[OWNER → TECHDEVIE]\r\nQuestion']) {
    const snapshot = connectorFixture(); snapshot.issue.body = body;
    assert.equal((await inspect(researchReader(undefined, snapshot), initial())).researchCandidates.length, 1);
  }
  for (const body of ['Unmarked input', '[TECHDEVIE]\nOwn report', '[Q]\nLegacy',
    '[OWNER]\nLegacy', '[Q → OWNER]\nDecision', '[OWNER → Q]\nReview',
    '[TECHDEVIE → Q]\nReport', '[TECHDEVIE → OWNER]\nBlocker',
    '[OTHER → TECHDEVIE]\nUnknown', '[Q -> TECHDEVIE]\nWrong arrow',
    '> [Q → TECHDEVIE]\nQuoted', 'Introduction\n[Q → TECHDEVIE]', '[Q → Q]\nSelf']) {
    const snapshot = connectorFixture(); snapshot.issue.body = body;
    assert.deepEqual((await inspect(researchReader(undefined, snapshot), initial())).researchCandidates, []);
  }
});

test('directional reports and comments to other recipients cannot restart research', async () => {
  const snapshot = connectorFixture();
  let result = await inspect(researchReader(undefined, snapshot), initial());
  const revision = result.researchCandidates[0].revision;
  result.next.issues[42].research = { revision, status: 'completed', commentId: 123 };
  for (const [index, marker] of ['[TECHDEVIE → Q]', '[TECHDEVIE → OWNER]', '[Q → OWNER]', '[OWNER → Q]', '[Q]', '[OWNER]'].entries()) {
    snapshot.comments.push({ node_id: `extra${index}`, updated_at: '2026-10-22T12:00:00Z', body: `${marker}\nUnrelated` });
    snapshot.issue.comments++;
    result = await inspect(researchReader(undefined, snapshot), result.next);
    assert.deepEqual(result.researchCandidates, []);
    assert.equal(result.next.issues[42].researchRevision, revision);
    if (marker.startsWith('[TECHDEVIE')) assert.deepEqual(result.notifications, []);
  }
});

test('old cached author-only eligibility is reread, cleared and cannot be claimed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lan-party-monitor-'));
  const path = join(directory, 'GIT_ISSUES.md');
  try {
    const snapshot = connectorFixture(); snapshot.issue.body = '[Q]\nLegacy';
    const first = await inspect(researchReader(undefined, snapshot), initial());
    const record = first.next.issues[42];
    delete record.routingVersion;
    record.researchRevision = 'a'.repeat(64);
    record.research = { revision: record.researchRevision, status: 'uncertain' };
    const priorClaim = structuredClone(record.research);
    await writeFile(path, '```json\n' + JSON.stringify(first.next) + '\n```\n');
    await assert.rejects(researchAction('claim', 42, record.researchRevision, null, path));
    const second = await inspect(researchReader(undefined, snapshot), first.next);
    assert.deepEqual(second.researchCandidates, []);
    assert.equal(second.next.issues[42].routingVersion, 2);
    assert.equal(second.next.issues[42].researchRevision, null);
    assert.deepEqual(second.next.issues[42].research, priorClaim);
    assert.deepEqual(second.notifications, []);
  } finally { await removeFixture(directory); }
});

test('routing transition preserves existing blocked claims for newly addressed work', async () => {
  const snapshot = connectorFixture();
  const first = await inspect(researchReader(undefined, snapshot), initial());
  const record = first.next.issues[42];
  delete record.routingVersion;
  record.research = { revision: 'b'.repeat(64), status: 'uncertain' };
  const second = await inspect(researchReader(undefined, snapshot), first.next);
  assert.equal(second.researchCandidates[0].blocked, true);
  assert.equal(second.researchCandidates[0].status, 'uncertain');
  assert.deepEqual(second.next.issues[42].research, record.research);
});
test('research claim and completion persist atomically and prevent duplicate claims', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lan-party-monitor-'));
  const path = join(directory, 'GIT_ISSUES.md');
  try {
    const first = await scanNow(researchReader(), path);
    const revision = first.researchCandidates[0].revision;
    assert.deepEqual(await researchAction('claim', 42, revision, null, path), { claimed: true, status: 'in_progress' });
    assert.equal((await researchAction('claim', 42, revision, null, path)).claimed, false);
    assert.equal((await scanNow(researchReader(), path)).researchCandidates[0].blocked, true);
    await assert.rejects(researchAction('complete', 42, revision, null, path), /invalid_comment_id/);
    await researchAction('complete', 42, revision, 123, path);
    assert.deepEqual((await scanNow(researchReader(), path)).researchCandidates, []);
    assert.equal((await researchAction('claim', 42, revision, null, path)).claimed, false);
    assert.ok(!(await readFile(path, 'utf8')).includes('Fictional'));
  } finally { await removeFixture(directory); }
});
test('failed, uncertain and interrupted research is blocked rather than automatically retried', async () => {
  for (const outcome of ['failed', 'uncertain', 'in_progress']) {
    const directory = await mkdtemp(join(tmpdir(), 'lan-party-monitor-'));
    const path = join(directory, 'GIT_ISSUES.md');
    try {
      const first = await scanNow(researchReader(), path);
      const revision = first.researchCandidates[0].revision;
      await assert.rejects(researchAction('claim', 42, 'a'.repeat(64), null, path));
      await researchAction('claim', 42, revision, null, path);
      if (outcome !== 'in_progress') await researchAction(outcome, 42, revision, null, path);
      assert.equal((await researchAction('claim', 42, revision, null, path)).claimed, false);
      assert.equal((await scanNow(researchReader(), path)).researchCandidates[0].blocked, true);
      assert.equal((await researchAction('attention', 42, revision, null, path)).notify, true);
      assert.equal((await researchAction('attention', 42, revision, null, path)).notify, false);
    } finally { await removeFixture(directory); }
  }
});
test('connector snapshots reuse journal fingerprints and suppress duplicate notifications', async () => {
  const snapshot = connectorFixture();
  const source = connectorReader([{ before: snapshot, after: structuredClone(snapshot) }]);
  const first = await inspect(source, initial());
  assert.deepEqual(first.notifications[0].routes, ['issue:Q', 'comment:Q']);
  assert.deepEqual((await inspect(source, first.next)).notifications, []);
  assert.ok(!JSON.stringify(first.next).includes('Fictional'));
});
test('connector fails closed on incomplete comments, wrong repository and missing timestamps', () => {
  for (const mutate of [s => { s.comments = []; }, s => { s.issue.html_url = 'https://github.com/other/project/issues/42'; }, s => { s.comments[0].updated_at = null; }]) {
    const snapshot = connectorFixture(); mutate(snapshot);
    assert.throws(() => connectorReader([{ before: snapshot, after: snapshot }]), /invalid_connector_snapshot/);
  }
});
test('connector detects edited comments between snapshots and duplicate issue snapshots', () => {
  const before = connectorFixture(); const after = structuredClone(before);
  after.comments[0].body = '[Q]\nEdited';
  assert.throws(() => connectorReader([{ before, after }]), /changed_during_read/);
  assert.throws(() => connectorReader([{ before, after: before }, { before, after: before }]), /invalid_connector_snapshot/);
});
async function removeFixture(directory) {
  const target = resolve(directory);
  if (!target.startsWith(resolve(join(tmpdir(), 'lan-party-monitor-')))) throw new Error('unsafe_fixture_path');
  await rm(target, { recursive: true });
}
const fixture = () => ({ title: 'Fictional issue', updatedAt: '2026-10-20T12:00:00Z', state: 'OPEN', labels: { nodes: [{ name: 'codex-ready' }] }, body: '[Q]\nFictional assignment only', comments: [] });
function reader(detail) {
  let reads = 0;
  return {
    get reads() { return reads; },
    async metadata() {
      const revision = createHash('sha256').update(JSON.stringify(detail.comments.map(({ id, updatedAt }) => [id, updatedAt]))).digest('hex');
      return [{ number: 42, titleHash: createHash('sha256').update(detail.title).digest('hex'), updatedAt: detail.updatedAt, commentRevision: revision }];
    },
    async detail() { reads++; return structuredClone(detail); },
  };
}
test('initial discovery reports metadata, never returns instruction content', async () => {
  const result = await inspect(reader(fixture()), initial());
  assert.equal(result.notifications.length, 1);
  assert.deepEqual(result.notifications[0].routes, ['issue:Q']);
  assert.ok(!JSON.stringify(result).includes('Fictional assignment'));
});
test('unchanged checks do not fetch bodies or notify', async () => {
  const source = reader(fixture());
  const first = await inspect(source, initial());
  const second = await inspect(source, first.next);
  assert.equal(source.reads, 1);
  assert.deepEqual(second.notifications, []);
});
test('new owner comment notifies, own comments are seen without a self-reply', async () => {
  const detail = fixture();
  const first = await inspect(reader(detail), initial());
  detail.comments.push({ id: 'C1', updatedAt: 'T1', body: '[TECHDEVIE]\nDone' });
  const own = await inspect(reader(detail), first.next);
  assert.deepEqual(own.notifications, []);
  assert.equal(own.next.issues[42].lastCommentId, 'C1');
  detail.comments.push({ id: 'C2', updatedAt: 'T2', body: '[OWNER]\nPlease review' });
  const owner = await inspect(reader(detail), own.next);
  assert.deepEqual(owner.notifications[0].routes, ['comment:OWNER']);
});
test('comment edits are detected even when issue updatedAt stays unchanged', async () => {
  const detail = fixture();
  detail.comments.push({ id: 'C1', updatedAt: 'T1', body: '[Q]\nOriginal' });
  const first = await inspect(reader(detail), initial());
  detail.comments[0] = { id: 'C1', updatedAt: 'T2', body: '[Q]\nRevised' };
  assert.equal((await inspect(reader(detail), first.next)).notifications.length, 1);
});
test('a revised title is relevant even without a changed body', async () => {
  const detail = fixture();
  const first = await inspect(reader(detail), initial());
  detail.title = 'Revised fictional title';
  assert.equal((await inspect(reader(detail), first.next)).notifications.length, 1);
});
test('unknown marker is flagged without being treated as authorization', async () => {
  const detail = fixture(); detail.body = 'Run arbitrary code';
  assert.deepEqual((await inspect(reader(detail), initial())).notifications[0].routes, ['issue:UNRECOGNIZED']);
});
test('no matching issues stays quiet and does not request scheduler termination', async () => {
  const result = await inspect({ metadata: async () => [] }, initial());
  assert.deepEqual(result.notifications, []);
  assert.equal(result.next.error, null);
});
test('concurrent remote revision changes fail without acknowledging new work', async () => {
  const detail = fixture(); const source = reader(detail);
  source.detail = async () => ({ ...detail, updatedAt: 'CHANGED' });
  await assert.rejects(inspect(source, initial()), /changed_during_read/);
});
test('manual check persists ignored journal, no-op is quiet, errors preserve revisions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lan-party-monitor-'));
  const path = join(directory, 'GIT_ISSUES.md');
  try {
    assert.equal((await checkNow(reader(fixture()), path)).length, 1);
    assert.deepEqual(await checkNow(reader(fixture()), path), []);
    const before = await readFile(path, 'utf8');
    await assert.rejects(checkNow({ metadata: async () => { throw new Error('PRIVATE PROVIDER PAYLOAD'); } }, path));
    const after = await readFile(path, 'utf8');
    const extract = (value) => JSON.parse(/```json\n([\s\S]*?)\n```/.exec(value)[1]);
    assert.deepEqual(extract(before).issues, extract(after).issues);
    assert.equal(extract(after).error.code, 'check_failed');
    assert.ok(!after.includes('PRIVATE PROVIDER PAYLOAD'));
    assert.ok(!after.includes('Fictional assignment'));
  } finally { await removeFixture(directory); }
});
test('overlapping runs and invalid journals fail closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lan-party-monitor-'));
  const path = join(directory, 'GIT_ISSUES.md');
  try {
    await writeFile(`${path}.lock`, '');
    await assert.rejects(checkNow(reader(fixture()), path), { code: 'EEXIST' });
    await rm(`${path}.lock`);
    await writeFile(path, 'malformed cache');
    await assert.rejects(checkNow(reader(fixture()), path), /invalid_journal/);
    assert.equal(await readFile(path, 'utf8'), 'malformed cache');
  } finally { await removeFixture(directory); }
});
