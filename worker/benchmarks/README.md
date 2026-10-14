# Local password benchmark

Run `node worker/benchmarks/passwords.mjs` on Windows. It bundles a benchmark-only
Worker in memory, starts owned local workerd processes and executes fictional
password operations. It does not read Wrangler credentials, deploy, access remote
D1 or send requests to DEV/PROD. Windows process-counter access may require tool
approval outside the Codex sandbox. Raw results are written to the ignored
`.wrangler/benchmarks/passwords.json`; no passwords or hashes are written there.

## Measurements — 2026-10-13

Windows, AMD Ryzen 9 9900X, Node v24.21.0, workerd 1.20261006.1, compatibility date
2026-10-11, PBKDF2-HMAC-SHA-256 at 600,000 iterations. Each operation had seven
warm samples after an excluded warmup and three first-crypto samples in newly
started runtimes. Hash and verify were measured separately. Verification used an
independent Node-generated fictional hash at the same cost.

| Operation | Samples | Worker elapsed median / worst (ms) | Process CPU median / worst (ms) |
| --- | --- | --- | --- |
| Hash, warm | 7 | 143 / 148 | 140.625 / 156.250 |
| Verify, warm | 7 | 156 / 179 | 156.250 / 171.875 |
| Hash, fresh runtime | 3 | 147 / 161 | 156.250 / 156.250 |
| Verify, fresh runtime | 3 | 149 / 149 | 140.625 / 156.250 |

Warm elapsed samples, in measurement order:

- Hash: 143, 143, 142, 142, 148, 142, 148 ms.
- Verify: 141, 154, 156, 150, 160, 179, 156 ms.
- Fresh-runtime hash: 147, 143, 161 ms; verify: 149, 145, 149 ms.

Runtime startup ranged from 297.6–344.5 ms and is excluded from the operation
measurements. Fresh runtime means a new local process, not a measured Cloudflare
edge cold start. Cold operations were not consistently slower than warm ones;
host scheduling/frequency and the small sample count can affect these results.
Baseline requests consumed zero measurable process CPU; their dispatch elapsed
times were 21.2 and 4.7 ms. Dispatch elapsed includes local request plumbing;
the table's elapsed column uses timers inside the benchmark Worker.

CPU is the delta of Windows `Get-Process` `TotalProcessorTime` for the exact
workerd child owned by the runner. It includes all workerd process threads,
request plumbing and any background work between snapshots. It excludes Node,
esbuild and the PowerShell observer. Observed counters incremented in 15.625 ms
steps, so their precision cannot resolve a 10 ms budget. These are actual local
process CPU measurements, **not Cloudflare billed per-invocation CPU**. Elapsed
time and CPU are reported separately; neither is substituted for the other.

## Free suitability and alternatives

[Cloudflare's current limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time)
document 10 ms CPU per Workers Free HTTP request. Local median process CPU is
roughly 14–16 times that budget. This is strong negative evidence: do not treat
the current design as verified viable on Free or expose password endpoints on
that assumption. Edge CPU accounting/hardware were not measured; an exact edge
verdict requires separately approved non-production validation and per-invocation
CPU evidence. Local Miniflare does not enforce the deployed Free CPU allowance.

[Cloudflare's timer documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/)
explains that local timers advance during computation while deployed timers can
remain frozen until I/O. For an approved deployed validation, use actual CPU
metrics/log evidence rather than inferring CPU from `performance.now()`.

Keep 600,000 iterations and the current algorithm pending owner review. Options:

- Workers Paid could retain the current password design with a larger CPU budget,
  but changes the free-tier goal and still needs deployed measurement/rate limits.
- An audited Argon2id implementation could improve password-storage resistance,
  but adds a Workers-compatible dependency/WASM and memory costs; it must be
  benchmarked and is not assumed to fit Free. Changing the algorithm needs review.
- Moving password hashing/authentication to another backend/provider introduces
  an external service, privacy/operational responsibilities and potentially cost.
  OIDC-only login could remove local password hashing but changes the approved
  email/password-first product scope. Neither is implemented or recommended as
  an automatic architecture change.

This benchmark is a reproducible local experiment, not a production load test.
