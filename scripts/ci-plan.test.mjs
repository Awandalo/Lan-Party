import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { changedPaths, checkDocuments, classify, planEvent, regularDiffPaths, verifyCompletion } from './ci-plan.mjs';

const dev = { event: 'push', ref: 'refs/heads/dev' };
const scenarios = [
  ['ordinary docs', ['README.md', 'TODO.md'], 'docs'],
  ['public frontend', ['src/pages/Home.tsx', 'src/CSS/Home_style.css'], 'frontend'],
  ['events/content', ['src/pages/Events.tsx', 'src/lib/content.ts'], 'frontend'],
  ['raster assets', ['public/images/lan.webp'], 'frontend'],
  ['backend', ['worker/index.ts'], 'full'],
  ['password authentication', ['worker/auth/passwords.ts'], 'full'],
  ['MFA', ['src/components/MfaEnrollment.tsx'], 'full'],
  ['authorization', ['worker/auth/lifecycle-http.ts'], 'full'],
  ['migration', ['migrations/0018_create_account_deletion.sql'], 'full'],
  ['security tests', ['worker/tests/security-rules.test.mjs'], 'full'],
  ['shared fixture', ['worker/tests/fixtures/mfa-enrollment-ui.tsx'], 'full'],
  ['frontend account', ['src/pages/AccountSecurity.tsx'], 'full'],
  ['global styles', ['src/CSS/main.css'], 'full'],
  ['account navigation', ['src/components/Header.tsx'], 'full'],
  ['routing', ['src/App.tsx'], 'full'],
  ['governance', ['AGENTS.md'], 'full'],
  ['security docs', ['docs/MFA_SECURITY_REVIEW.md'], 'full'],
  ['CI documentation', ['docs/CI.md'], 'full'],
  ['dependencies', ['package-lock.json'], 'full'],
  ['deployment', ['wrangler.jsonc'], 'full'],
  ['workflows', ['.github/workflows/ci.yml'], 'full'],
  ['monitor', ['scripts/github-issue-monitor.mjs'], 'full'],
  ['executable public asset', ['public/extra.js'], 'full'],
  ['SVG/HTML', ['public/logo.svg', 'public/index.html'], 'full'],
  ['unknown', ['src/pages/NewPage.tsx'], 'full'],
  ['mixed docs/UI', ['README.md', 'src/pages/Home.tsx'], 'full'],
  ['mixed docs/backend', ['TODO.md', 'worker/auth/sessions.ts'], 'full'],
  ['renamed security path', ['src/lib/auth.tsx', 'src/pages/Home.tsx'], 'full'],
  ['empty comparison', [], 'full'],
];
for (const [label, paths, mode] of scenarios) {
  test(label + ': expected ' + mode, () => assert.equal(classify(paths, dev).mode, mode));
}
test('main PR, main push, manual and unknown event always require full', () => {
  for (const options of [
    { event: 'pull_request', baseBranch: 'main' },
    { event: 'push', ref: 'refs/heads/main' },
    { event: 'workflow_dispatch', ref: 'refs/heads/dev' },
    { event: 'merge_group' },
  ]) assert.equal(classify(['README.md'], options).mode, 'full');
  assert.equal(classify(['README.md'], { ...dev, diffAvailable: false }).mode, 'full');
});
test('all sensitive and unmapped tracked paths default to full', () => {
  const paths = execFileSync('git', ['ls-files', '-z', 'worker', 'migrations', '.github', 'src/lib', 'src/components', 'src/pages'],
    { encoding: 'utf8' }).split('\0').filter(Boolean);
  const publicPaths = new Set(['src/pages/Home.tsx', 'src/pages/Events.tsx', 'src/lib/content.ts',
    'src/components/Footer.tsx', 'src/components/Footer.css']);
  for (const path of paths) if (!publicPaths.has(path)) assert.equal(classify([path], dev).mode, 'full', path);
});
test('invalid/ambiguous inventories fail closed', () => {
  for (const paths of [null, ['../README.md'], ['/README.md'], ['a\\b'], ['a\nb'], ['a//b'], ['a/./b']])
    assert.throws(() => classify(paths, dev));
});
test('completion enforces success and explicit omissions for every plan', () => {
  for (const mode of ['docs', 'frontend', 'full']) {
    const selected = mode === 'docs' ? ['policy', 'docs'] :
      mode === 'frontend' ? ['policy', 'install', 'ui', 'types', 'build'] :
        ['policy', 'install', 'regression', 'types', 'build'];
    const outcomes = Object.fromEntries(['policy', 'docs', 'install', 'ui', 'regression', 'types', 'build']
      .map(name => [name, selected.includes(name) ? 'success' : 'skipped']));
    assert.match(verifyCompletion({ mode }, outcomes), /not a claim/);
    for (const name of selected) {
      for (const state of ['failure', 'cancelled', 'skipped', undefined])
        assert.throws(() => verifyCompletion({ mode }, { ...outcomes, [name]: state }));
    }
    const omitted = mode === 'docs' ? 'regression' : 'docs';
    assert.throws(() => verifyCompletion({ mode }, { ...outcomes, [omitted]: 'success' }));
  }
  assert.throws(() => verifyCompletion({}, {}));
});
test('document checks validate encoding, local targets, deletions and disallow non-doc paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'lan-ci-docs-'));
  try {
    writeFileSync(join(root, 'TODO.md'), '# Tasks');
    writeFileSync(join(root, 'README.md'), '[Tasks](TODO.md#future) [External](https://example.test) [Here](#top)');
    checkDocuments(['README.md', 'PROJECT.md'], root);
    writeFileSync(join(root, 'README.md'), '[Missing](missing.md)');
    assert.throws(() => checkDocuments(['README.md'], root));
    writeFileSync(join(root, 'README.md'), '[Outside](../README.md)');
    assert.throws(() => checkDocuments(['README.md'], root));
    writeFileSync(join(root, 'README.md'), '\uFFFD');
    assert.throws(() => checkDocuments(['README.md'], root));
    assert.throws(() => checkDocuments(['src/App.tsx'], root));
  } finally { rmSync(root, { recursive: true }); }
});
test('real Git multi-commit, rename/deletion, unavailable history and CLI completion', () => {
  const root = mkdtempSync(join(tmpdir(), 'lan-ci-git-'));
  const git = (...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'CI Fixture', GIT_COMMITTER_NAME: 'CI Fixture',
      GIT_AUTHOR_EMAIL: 'ci@example.test', GIT_COMMITTER_EMAIL: 'ci@example.test' },
  }).trim();
  const script = fileURLToPath(new URL('./ci-plan.mjs', import.meta.url));
  const put = (path, body) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), body); };
  const commit = () => { git('add', '--all'); git('-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '--initial-branch=dev');
    put('README.md', '# Start'); put('src/lib/auth.tsx', 'sensitive fixture');
    const before = commit();
    put('README.md', '# Updated'); commit();
    put('TODO.md', '# Tasks'); const after = commit();
    assert.deepEqual(changedPaths(before, after, root).sort(), ['README.md', 'TODO.md']);
    assert.equal(planEvent('push', { before, after }, 'refs/heads/dev', root).mode, 'docs');
    const event = join(root, '.git/event.json'), output = join(root, '.git/output.txt'), summary = join(root, '.git/summary.md'), plan = join(root, '.git/plan.json');
    writeFileSync(event, JSON.stringify({ before, after }));
    const env = { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/dev',
      GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary };
    // Model a standalone Actions step, not an inherited nested Node test worker.
    delete env.NODE_TEST_CONTEXT;
    const cli = (cmd, extra = {}) => execFileSync(process.execPath, [script, cmd, plan],
      { cwd: root, encoding: 'utf8', env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] });
    cli('plan'); assert.equal(readFileSync(output, 'utf8'), 'mode=docs\n');
    cli('docs');
    const results = { RESULT_POLICY: 'success', RESULT_DOCS: 'success', RESULT_INSTALL: 'skipped',
      RESULT_UI: 'skipped', RESULT_REGRESSION: 'skipped', RESULT_TYPES: 'skipped', RESULT_BUILD: 'skipped' };
    cli('verify', results);
    assert.match(readFileSync(summary, 'utf8'), /not selected; not executed/);
    assert.throws(() => cli('verify', { ...results, RESULT_DOCS: 'skipped' }));
    mkdirSync(join(root, 'src/pages'), { recursive: true });
    git('mv', 'src/lib/auth.tsx', 'src/pages/Home.tsx');
    const renamed = commit();
    writeFileSync(plan, JSON.stringify({mode:'full'}));
    put('worker/tests/fixture.test.mjs', "import {test} from 'node:test';test('fixture',()=>{});");
    cli('regression');
    put('worker/tests/fixture.test.mjs', "import {test} from 'node:test';test('fixture',()=>{throw new Error('expected fixture failure')});");
    assert.throws(() => cli('regression')); // Child failures must never become green.
    rmSync(join(root, 'worker'), {recursive:true});
    assert.throws(() => cli('regression')); // Empty test selection is not success.
    const paths = changedPaths(after, renamed, root);
    assert.ok(paths.includes('src/lib/auth.tsx'));
    assert.ok(paths.includes('src/pages/Home.tsx'));
    assert.equal(classify(paths, dev).mode, 'full');
    assert.equal(planEvent('push', { before: '0'.repeat(40), after: renamed }, 'refs/heads/dev', root).mode, 'full');
    assert.equal(planEvent('push', { before: 'f'.repeat(40), after: renamed }, 'refs/heads/dev', root).mode, 'full');
    assert.equal(planEvent('push', { before, after }, 'refs/heads/dev', root).mode, 'full'); // wrong checkout
    assert.equal(planEvent('pull_request', { pull_request: { base: { ref: 'main' } } }, '', root).mode, 'full');
    assert.equal(planEvent('workflow_dispatch', {}, 'refs/heads/dev', root).mode, 'full');
  } finally { rmSync(root, { recursive: true }); }
});

// Keep this dependency-free: the policy suite runs before npm ci.
test('workflow preserves required context, trigger coverage and mandatory completion gate', () => {
  const yaml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(yaml, /^name: CI$/m);
  assert.match(yaml, /  frontend:\n(?:    #.*\n)*    name: TypeScript and build/);
  assert.match(yaml, /pull_request:\n    branches: \[main\]/);
  assert.match(yaml, /push:\n    branches: \[dev\]/);
  assert.match(yaml, /  workflow_dispatch:/);
  assert.doesNotMatch(yaml, /paths-ignore:|paths:|continue-on-error:|pull_request_target:/);
  assert.match(yaml, /fetch-depth: 0/);
  assert.match(yaml, /Enforce selected coverage completion\n        if: always\(\)/);
  for (const id of ['policy','plan','docs','install','ui','regression','types','build'])
    assert.equal((yaml.match(new RegExp('        id: '+id+'\\r?\\n', 'g')) ?? []).length, 1, id);
  assert.match(yaml, /node scripts\/ci-plan.mjs verify/);
  assert.match(yaml, /contents: read/);
  assert.doesNotMatch(yaml, /wrangler deploy|secrets\./);
});

test('symlinks, submodules, executable files and truncated Git inventories cannot select reduced coverage', () => {
  const sha = 'a'.repeat(40);
  const diff = (mode) => ':' + mode + ' 100644 ' + sha + ' ' + sha + ' M\0README.md\0';
  assert.deepEqual(regularDiffPaths(diff('100644')), ['README.md']);
  for (const mode of ['120000','160000','100755']) assert.throws(() => regularDiffPaths(diff(mode)));
  assert.throws(() => regularDiffPaths(diff('100644').slice(0, -1)));
  assert.throws(() => regularDiffPaths('bad\0README.md\0'));
});
