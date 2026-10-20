import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkNow, inspect, repository } from './github-issue-monitor.mjs';

const initial = () => ({ version: 1, repository, issues: {}, error: null });
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
