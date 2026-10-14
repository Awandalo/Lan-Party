import { execFileSync } from 'node:child_process';
import { pbkdf2Sync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const salt = Buffer.alloc(16, 7);
const hash = pbkdf2Sync('fictional benchmark password', salt, 600000, 32, 'sha256').toString('hex');
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('./passwords.fixture.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  define: { BENCHMARK_RECORD: JSON.stringify(`lp-pbkdf2-sha256-v1$600000$${salt.toString('hex')}$${hash}`) } });

// Read only the direct workerd child of this runner, never unrelated runtime processes.
function powershell(command) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true }).trim();
}
function runtimePid() {
  const ids = JSON.parse(powershell(`@(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${process.pid}' -ErrorAction Stop | Where-Object Name -eq 'workerd.exe' | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress`));
  const list = Array.isArray(ids) ? ids : [ids];
  if (list.length !== 1 || !Number.isSafeInteger(list[0])) throw new Error('Unable to identify one owned workerd process');
  return list[0];
}
function cpuMs(pid) {
  const value = Number(powershell(`(Get-Process -Id ${pid} -ErrorAction Stop).TotalProcessorTime.TotalMilliseconds.ToString([cultureinfo]::InvariantCulture)`));
  if (!Number.isFinite(value)) throw new Error('CPU measurement unavailable');
  return value;
}
async function runtime() {
  const simulator = new Miniflare(convertV4MiniflareOptions({ modules: true, script: outputFiles[0].text,
    compatibilityDate: '2026-10-11', cf: false }));
  const start = performance.now();
  try {
    await simulator.ready;
    const startupMs = performance.now() - start;
    return { simulator, startupMs, pid: runtimePid() };
  } catch (error) { await simulator.dispose(); throw error; }
}
async function measure(instance, operation, kind) {
  const before = cpuMs(instance.pid);
  const start = performance.now();
  const response = await instance.simulator.dispatchFetch(`http://localhost/${operation}`);
  const body = await response.json();
  const dispatchElapsedMs = performance.now() - start;
  if (response.status !== 200) throw new Error('Benchmark request failed');
  const processCpuMs = cpuMs(instance.pid) - before;
  return { operation, kind, workerElapsedMs: body.elapsedMs, dispatchElapsedMs, processCpuMs };
}
function summarize(samples) {
  const sorted = (key) => samples.map((value) => value[key]).sort((a, b) => a - b);
  const output = { count: samples.length };
  for (const key of ['workerElapsedMs', 'dispatchElapsedMs', 'processCpuMs']) {
    const values = sorted(key);
    const middle = Math.floor(values.length / 2);
    output[key] = { median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
      worst: values.at(-1) };
  }
  return output;
}

const samples = [];
const startups = [];
for (const operation of ['hash', 'verify']) {
  const instance = await runtime();
  startups.push(instance.startupMs);
  try {
    samples.push(await measure(instance, 'baseline', 'warm-baseline'));
    await instance.simulator.dispatchFetch(`http://localhost/${operation}`); // excluded warmup
    for (let i = 0; i < 7; i++) samples.push(await measure(instance, operation, 'warm'));
  } finally { await instance.simulator.dispose(); }
  for (let i = 0; i < 3; i++) {
    const cold = await runtime();
    startups.push(cold.startupMs);
    try { samples.push(await measure(cold, operation, 'fresh-runtime-first-crypto')); }
    finally { await cold.simulator.dispose(); }
  }
  console.log(`Completed local ${operation} samples`);
}
const report = { measuredAt: new Date().toISOString(), node: process.version, platform: process.platform,
  cpu: cpus()[0]?.model, iterations: 600000, compatibilityDate: '2026-10-11',
  workerdVersion: require('workerd/package.json').version,
  cpuMeasurement: 'Windows owned-workerd TotalProcessorTime delta, all process threads; includes request plumbing and idle/background work. Not Cloudflare billed invocation CPU.',
  coldMeaning: 'New local workerd process; startup and PID discovery excluded from operation measurements.',
  startupsMs: startups, samples, summary: {} };
for (const operation of ['hash', 'verify']) for (const kind of ['warm', 'fresh-runtime-first-crypto']) {
  report.summary[`${operation}:${kind}`] = summarize(samples.filter((sample) => sample.operation === operation && sample.kind === kind));
}
const directory = new URL('../../.wrangler/benchmarks/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('passwords.json', directory), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
