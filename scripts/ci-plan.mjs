import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exact allowlists: a new path needs review, otherwise it receives full regression.
const documents = new Set(['README.md', 'PROJECT.md', 'TODO.md']);
const publicUI = new Set([
  'src/pages/Home.tsx', 'src/pages/Events.tsx', 'src/lib/content.ts',
  'src/CSS/Home_style.css', 'src/CSS/Events_style.css',
  'src/components/Footer.tsx', 'src/components/Footer.css',
]);
const asset = (path) => /^public\/[a-zA-Z0-9/_-]+\.(png|jpg|jpeg|webp|avif|ico|woff2?)$/.test(path);
const validPath = (path) => typeof path === 'string' && path.length > 0 &&
  !path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part => part === '..' || part === '.' || !part) &&
  !/[\u0000-\u001f\u007f]/.test(path);

export function classify(paths, { event, baseBranch, ref, diffAvailable = true } = {}) {
  if (!Array.isArray(paths) || paths.some(path => !validPath(path))) throw new Error('Invalid changed-path inventory');
  const changed = [...new Set(paths)].sort();
  const plan = (mode, reason) => ({ mode, reason, paths: changed });
  if (event === 'workflow_dispatch') return plan('full', 'Manual full regression');
  if (event === 'pull_request' && baseBranch === 'main' || ref === 'refs/heads/main')
    return plan('full', 'Main promotion requires full regression');
  if (event !== 'push' || ref !== 'refs/heads/dev') return plan('full', 'Unknown event or target');
  if (!diffAvailable || changed.length === 0) return plan('full', 'Missing or empty comparison');
  const kinds = new Set(changed.map(path => documents.has(path) ? 'docs' :
    publicUI.has(path) || asset(path) ? 'frontend' : path.startsWith('worker/') ? 'backend' : 'unknown'));
  if (kinds.size !== 1) return plan('full', 'Mixed impact');
  if (kinds.has('docs')) return plan('docs', 'Reviewed ordinary documentation only');
  if (kinds.has('frontend')) return plan('frontend', 'Reviewed public UI only');
  // All current Worker routes/modules involve shared auth or database boundaries.
  return plan('full', kinds.has('backend') ? 'Backend/security regression' : 'Unknown or security-sensitive path');
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
export function changedPaths(before, after, cwd = process.cwd()) {
  const sha = /^[a-f0-9]{40}$/;
  if (!sha.test(before ?? '') || /^0+$/.test(before) || !sha.test(after ?? '')) throw new Error('Invalid comparison');
  // Restrict to ancestor pushes; rewritten/unavailable history falls back to full.
  git(['merge-base', '--is-ancestor', before, after], cwd);
  return regularDiffPaths(git(['diff', '--raw', '--no-abbrev', '--no-renames', '-z', before, after, '--'], cwd));
}

// Symlinks, submodules, executable/type changes and malformed inventories cannot
// receive reduced coverage, even if their path appears on the allowlist.
export function regularDiffPaths(raw) {
  if (!raw) return [];
  if (!raw.endsWith('\0')) throw new Error('Incomplete Git path inventory');
  const entries = raw.slice(0, -1).split('\0');
  if (entries.length % 2) throw new Error('Invalid Git diff inventory');
  const paths = [];
  for (let i = 0; i < entries.length; i += 2) {
    if (!/^:(?:000000|100644) (?:000000|100644) [a-f0-9]{40} [a-f0-9]{40} [ADM]$/.test(entries[i]))
      throw new Error('Non-regular or ambiguous changed file');
    paths.push(entries[i + 1]);
  }
  return paths;
}

export function planEvent(eventName, event, ref, cwd = process.cwd()) {
  if (eventName !== 'push') return classify([], { event: eventName, baseBranch: event.pull_request?.base?.ref, ref });
  try {
    if (event.after !== git(['rev-parse', 'HEAD'], cwd).trim()) throw new Error('Unexpected checkout');
    return classify(changedPaths(event.before, event.after, cwd), { event: eventName, ref });
  } catch {
    // No API file-list caps, shallow-history guesses or partial successful plans.
    return classify([], { event: eventName, ref, diffAvailable: false });
  }
}

export function checkDocuments(paths, root = process.cwd()) {
  for (const path of paths) {
    if (!documents.has(path)) throw new Error('Non-document in documentation plan');
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) continue; // A deliberate deletion has no links to validate.
    const body = readFileSync(absolute, 'utf8');
    if (body.includes('\uFFFD') || body.includes('\0')) throw new Error('Invalid documentation encoding');
    // Check explicit relative Markdown links; external links/anchors are not fetched.
    for (const [, link] of body.matchAll(/(?<!!)\[[^\]\n]*\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(link)) continue;
      const target = decodeURIComponent(link.split('#')[0]);
      if (!target) continue;
      const destination = resolve(dirname(absolute), target);
      const local = relative(root, destination);
      if (local === '..' || local.startsWith('..' + sep) || !existsSync(destination))
        throw new Error('Missing or outside-repository documentation target');
    }
  }
}

const expected = {
  docs: ['policy', 'docs'],
  frontend: ['policy', 'install', 'ui', 'types', 'build'],
  full: ['policy', 'install', 'regression', 'types', 'build'],
};
export function verifyCompletion(plan, outcomes) {
  if (!expected[plan.mode]) throw new Error('Missing or invalid CI plan');
  for (const name of ['policy', 'docs', 'install', 'ui', 'regression', 'types', 'build']) {
    const want = expected[plan.mode].includes(name) ? 'success' : 'skipped';
    if (outcomes[name] !== want) throw new Error('CI check did not complete as planned: ' + name);
  }
  return 'Validated ' + plan.mode + ' plan; this is not a claim that omitted suites ran.';
}

function cli(command, planPath) {
  if (!planPath) throw new Error('A plan file is required');
  if (command === 'plan') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    const plan = planEvent(process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_REF);
    writeFileSync(planPath, JSON.stringify(plan));
    appendFileSync(process.env.GITHUB_OUTPUT, 'mode=' + plan.mode + '\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '### CI coverage plan\n\n- Mode: **' + plan.mode + '**\n- Reason: ' + plan.reason +
      '\n- Changed paths: ' + plan.paths.length +
      '\n- Full regression: ' + (plan.mode === 'full' ? 'required' : 'not selected; not executed') + '\n');
    console.log('Selected CI coverage: ' + plan.mode + ' (' + plan.reason + ')');
    return;
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  if (command === 'docs') {
    if (plan.mode !== 'docs' || !plan.paths.length) throw new Error('Invalid documentation plan');
    checkDocuments(plan.paths);
    console.log('Changed documentation encoding and explicit local link targets validated.');
  } else if (command === 'regression') {
    if (plan.mode !== 'full') throw new Error('Full regression not selected');
    const tests = readdirSync('worker/tests').filter(name => name.endsWith('.test.mjs')).sort().map(name => 'worker/tests/' + name);
    if (!tests.length) throw new Error('No regression tests discovered');
    execFileSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
  } else if (command === 'verify') {
    const outcomes = Object.fromEntries(['policy', 'docs', 'install', 'ui', 'regression', 'types', 'build'].map(name => [name, process.env['RESULT_' + name.toUpperCase()]]));
    const message = verifyCompletion(plan, outcomes);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n### Completion\n\n' + message + '\n');
    console.log(message);
  } else throw new Error('Unknown CI command');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli(process.argv[2], process.argv[3]);
