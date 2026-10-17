import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ACCOUNT = '11ddea61be41a70883d6c703d2a9a3d6';
const ZONE = '83c0841a468b8368704d7ad48313707c';
const ZONE_NAME = 'lan-party.club';
const ROOT = `https://api.cloudflare.com/client/v4/zones/${ZONE}`;
const WORKFLOW = 'Awandalo/Lan-Party/.github/workflows/configure-resend-dns.yml@refs/heads/main';

// Public verification material, copied in full from the owner's approved record.
export const DKIM = 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDG4H9v90dlePxl3MXNQhTKxebkuZEYyFDtQ7ptSPukTs4U8EoBjrKrIuF3Ib2l+Pa8/LMKDIXLf8Z8pHWgARMpLKtbROz/TTVVW9TsfEEjnKXb0nqonRNvOuELAolUrxxw7/6n2v7VIrlokfLei+bMLNuV6Nr5ZpwLxlgeoOXFAwIDAQAB';
export const RECORDS = Object.freeze([
  { type: 'TXT', name: 'resend._domainkey.auth.lan-party.club', content: DKIM, ttl: 1, proxied: false },
  { type: 'CNAME', name: 'rsend.auth.lan-party.club', content: 'rsend-euw1.forge.rmta.net', ttl: 1, proxied: false },
  { type: 'CNAME', name: 'send.auth.lan-party.club', content: 'send.forge.rmta.net', ttl: 1, proxied: false },
  { type: 'TXT', name: '_dmarc.auth.lan-party.club', content: 'v=DMARC1; p=none;', ttl: 1, proxied: false },
].map(Object.freeze));

export function assertTrustedRun(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || env.GITHUB_REPOSITORY !== 'Awandalo/Lan-Party' || env.GITHUB_REF !== 'refs/heads/main'
    || env.GITHUB_REF_TYPE !== 'branch' || env.GITHUB_REF_PROTECTED !== 'true'
    || env.GITHUB_WORKFLOW_REF !== WORKFLOW || !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? '')
    || env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA || env.GITHUB_RUN_ATTEMPT !== '1') {
    throw new Error('Only a fresh manual run of the reviewed workflow on protected main is permitted.');
  }
}

function hostname(value) { return typeof value === 'string' ? value.toLowerCase().replace(/\.$/, '') : ''; }
// Cloudflare can return TXT content as quoted DNS character strings. Join those
// strings without altering the actual value; unquoted values compare exactly.
function txt(value) {
  if (typeof value !== 'string' || !value.startsWith('"')) return value;
  const parts = value.match(/"(?:\\[\s\S]|[^"\\])*"/g);
  if (!parts || parts.join('') !== value.replace(/"\s+"/g, '""')) return null;
  return parts.map(part => part.slice(1, -1).replace(/\\([0-9]{3}|[\s\S])/g,
    (_, escaped) => /^[0-9]{3}$/.test(escaped) ? String.fromCharCode(Number(escaped)) : escaped)).join('');
}
export function matches(record, expected) {
  return record.type === expected.type && hostname(record.name) === expected.name
    && record.ttl === 1 && record.proxied === false
    && (expected.type === 'TXT' ? txt(record.content) === expected.content
      : hostname(record.content) === expected.content);
}

export async function publishResendDNS({ token, fetcher = fetch, report = () => {} }) {
  if (typeof token !== 'string' || !token || /\s/.test(token)) throw new Error('DNS API token unavailable or invalid.');
  // Only fixed-zone reads and four fixed record POST bodies exist. No update,
  // delete, Worker, database, arbitrary endpoint or caller-supplied record API.
  async function api(suffix = '', body) {
    let response;
    try {
      response = await fetcher(ROOT + suffix, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch { throw new Error(`Cloudflare ${body ? 'creation outcome uncertain' : 'read failed'}; stop, inspect before any fresh dispatch. No retry performed.`); }
    let data;
    try { data = await response.json(); } catch { throw new Error('Unexpected Cloudflare response; stop and inspect.'); }
    if (!response.ok || data.success !== true) {
      // Never print upstream messages, response bodies, headers or exceptions.
      const codes = Array.isArray(data.errors) ? data.errors.map(e => e.code).filter(Number.isInteger).join(',') : '';
      throw new Error(`Cloudflare HTTP ${response.status}; error codes ${codes || 'unavailable'}. Stop; no retry performed.`);
    }
    return data;
  }
  const zone = (await api()).result;
  if (zone?.id !== ZONE || zone.name !== ZONE_NAME || zone.status !== 'active' || zone.account?.id !== ACCOUNT) {
    throw new Error('Account/active zone mismatch; no records created.');
  }
  async function inspect(expected) {
    const data = await api(`/dns_records?name=${encodeURIComponent(expected.name)}&per_page=100`);
    if (!Array.isArray(data.result) || !(data.result_info?.total_pages === 1
      || (data.result.length === 0 && data.result_info?.total_pages === 0))
      || data.result_info.total_count !== data.result.length
      || data.result.some(r => hostname(r.name) !== expected.name)) {
      throw new Error(`Incomplete or unexpected DNS inventory for ${expected.name}; stop.`);
    }
    if (data.result.length === 0) return null;
    if (data.result.length !== 1 || !matches(data.result[0], expected)
      || !/^[0-9a-f]{32}$/.test(data.result[0].id ?? '')) {
      throw new Error(`Conflicting records at ${expected.name}; no overwrite or deletion performed.`);
    }
    return data.result[0];
  }
  // Detect conflicts anywhere in the fixed plan before performing the first write.
  for (const expected of RECORDS) await inspect(expected);
  const results = [];
  for (const expected of RECORDS) {
    let record = await inspect(expected); // Recheck immediately before each write.
    const action = record ? 'existing' : 'created';
    if (!record) {
      // TXT uses quoted DNS character-string syntax in the API; these quotes
      // are representation only and do not become part of the published value.
      const body = expected.type === 'TXT' ? { ...expected, content: JSON.stringify(expected.content) } : expected;
      record = (await api('/dns_records', body)).result;
      // Record a returned ID immediately for investigation of partial completion.
      if (/^[0-9a-f]{32}$/.test(record?.id ?? '')) report(`${expected.name}: returned creation ID ${record.id}`);
      if (!record || !matches(record, expected) || !/^[0-9a-f]{32}$/.test(record.id ?? '')) {
        throw new Error(`Unexpected creation result for ${expected.name}; inspect before any fresh dispatch.`);
      }
    }
    report(`${action}: ${expected.type} ${expected.name}; ID ${record.id}; TTL Auto; DNS Only`);
    results.push({ action, id: record.id, ...expected });
    const readback = await inspect(expected);
    if (readback?.id !== record.id) throw new Error(`Readback mismatch for ${expected.name}; stop.`);
  }
  report('All four records match the approved values in Cloudflare. Public DNS and websites require separate read-only verification.');
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error('This workflow accepts no command-line inputs.');
    assertTrustedRun(process.env);
    const report = line => {
      console.log(line);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n\n`);
    };
    await publishResendDNS({ token: process.env.CLOUDFLARE_DNS_API_TOKEN, report });
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'DNS operation failed; inspect the run.');
    process.exitCode = 1;
  }
}
