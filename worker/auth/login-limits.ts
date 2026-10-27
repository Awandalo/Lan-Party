import { fromHex, toHex } from './encoding';
import { serverTime } from './database';

export class LoginLimited extends Error {
  constructor(readonly retryAfter: number) { super('Login temporarily restricted'); }
}
export class LoginBusy extends Error {}
const table = 'registration_rate_limits';
const marks = (n: number) => Array(n).fill('?').join(',');
const seconds = () => Math.floor(Date.now() / 1000);

// Dedicated v2 domains leave registration/recovery and existing DEV counters untouched.
export class LoginLimiter {
  private constructor(private db: D1Database, private key: CryptoKey, private ip: string,
    private clock: () => number) {}
  static async create(db: D1Database, secret: string, ip: string, clock = seconds) {
    const bytes = fromHex(secret, 32);
    if (!bytes) throw new Error('Limiter unavailable');
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new LoginLimiter(db, key, ip, clock);
  }
  private now() { const value = this.clock(); serverTime(value); return value; }
  private async digest(value: unknown) {
    return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', this.key,
      new TextEncoder().encode(JSON.stringify(['lan-party:login:v2', value])))));
  }
  private async signalKeys(scope: 'ip' | 'global', kind: 'volume' | 'failure', now: number) {
    const duration = kind === 'volume' ? 60 : scope === 'ip' ? 900 : 3600;
    const window = Math.floor(now / duration) * duration;
    return { key: await this.digest([kind, scope, window, scope === 'ip' ? this.ip : 'all']), end: window + duration };
  }
  async observe(): Promise<boolean> {
    const now = this.now();
    await this.db.prepare(`DELETE FROM ${table} WHERE key_hash IN
      (SELECT key_hash FROM ${table} WHERE expires_at<=? ORDER BY expires_at LIMIT 100)`).bind(now).run();
    const statements: D1PreparedStatement[] = [], volumeKeys: string[] = [], failureKeys: string[] = [];
    for (const scope of ['ip', 'global'] as const) {
      const volume = await this.signalKeys(scope, 'volume', now), failure = await this.signalKeys(scope, 'failure', now);
      const first = await this.digest([volume.key, 0]), overflow = await this.digest([volume.key, 1]);
      volumeKeys.push(overflow); failureKeys.push(failure.key);
      // Deterministic overflow gives 60 observations without exceeding the schema's 30-hit cap.
      statements.push(this.db.prepare(`INSERT INTO ${table}(key_hash,hits,expires_at) VALUES (?,1,?)
        ON CONFLICT(key_hash) DO UPDATE SET hits=hits+1 WHERE hits<30`).bind(first, volume.end));
      statements.push(this.db.prepare(`INSERT INTO ${table}(key_hash,hits,expires_at) SELECT ?,1,? WHERE changes()=0
        ON CONFLICT(key_hash) DO UPDATE SET hits=min(30,hits+1)`).bind(overflow, volume.end));
    }
    await this.db.batch(statements);
    const row = await this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}
      WHERE key_hash IN (${marks(4)}) AND hits=30 AND expires_at>?`).bind(...volumeKeys, ...failureKeys, now).first<{ n: number }>();
    return (row?.n ?? 0) > 0;
  }
  async reserve(email: string): Promise<LoginReservation> {
    return this.reserveGroups(['pending',[email,this.ip]], [['failure-slot',[email,this.ip],5]]);
  }
  async reserveMfa(userId:string, challenge:string):Promise<LoginReservation> {
    // One expiring account lease coordinates the three sliding failure windows.
    // Restarting a challenge cannot reset the account or account/IP counters.
    return this.reserveGroups(['mfa-pending',userId], [
      ['mfa-challenge',challenge,5],['mfa-pair',[userId,this.ip],5],['mfa-account',userId,10],
    ]);
  }
  private async reserveGroups(identity:unknown, scopes:[string,unknown,number][]):Promise<LoginReservation> {
    const lease=await this.digest(identity);
    const groups=await Promise.all(scopes.map(([name,value,n])=>Promise.all(Array.from({length:n},(_,i)=>this.digest([name,value,i])))));
    const allowed=groups.map(g=>`(SELECT COUNT(*) FROM ${table} WHERE key_hash IN (${marks(g.length)}) AND expires_at>?)<${g.length}`).join(' AND ');
    const deadline = Date.now() + 1000;
    while (true) {
      const now = this.now(), expires = now + 30, owner = await this.digest(['owner', crypto.randomUUID()]);
      const allowance=groups.flatMap(g=>[...g,now]);
      const held = await this.db.batch([this.db.prepare(`INSERT INTO ${table}(key_hash,hits,expires_at)
        SELECT ?,1,? WHERE ${allowed}
        ON CONFLICT(key_hash) DO UPDATE SET hits=1,expires_at=excluded.expires_at
        WHERE ${table}.expires_at<=? RETURNING expires_at`)
        .bind(lease, expires, ...allowance, now),
        this.db.prepare(`INSERT INTO ${table}(key_hash,hits,expires_at) SELECT ?,1,? WHERE changes()=1`).bind(owner, expires)]);
      if (held[0].results.length === 1) {
        const failureSignals = await Promise.all((['ip', 'global'] as const).map(scope => this.signalKeys(scope, 'failure', now)));
        return new LoginReservation(this.db, lease, owner, expires, groups, failureSignals, () => this.now());
      }
      let cooldown=0;
      for(const slots of groups){
        const failed = await this.db.prepare(`SELECT COUNT(*) AS n,MIN(expires_at) AS earliest FROM ${table}
          WHERE key_hash IN (${marks(slots.length)}) AND expires_at>?`).bind(...slots, now).first<{n:number;earliest:number}>();
        if(failed?.n===slots.length)cooldown=Math.max(cooldown,failed.earliest-now);
      }
      if(cooldown>0)throw new LoginLimited(cooldown);
      if (Date.now() >= deadline) throw new LoginBusy('Another check is pending');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

export class LoginReservation {
  constructor(private db: D1Database, private lease: string, private owner: string, private expires: number, private groups: string[][],
    private signals: { key: string; end: number }[], private clock: () => number) {}
  activeCondition(){
    return {sql:`EXISTS(SELECT 1 FROM ${table} WHERE key_hash=? AND hits=1 AND expires_at=? AND expires_at>unixepoch())
      AND EXISTS(SELECT 1 FROM ${table} WHERE key_hash=? AND expires_at=?)`,
      values:[this.owner,this.expires,this.lease,this.expires]};
  }
  async finish(failed: boolean): Promise<boolean> {
    const now = this.clock();
    // An unguessable per-attempt owner row fences completion, including same-second
    // release/reacquisition. Expired owners cannot finalize or remove a newer lease.
    const owned = `EXISTS(SELECT 1 FROM ${table} WHERE key_hash=? AND hits=2 AND expires_at=? AND expires_at>?)`;
    const statements = [this.db.prepare(`UPDATE ${table} SET hits=2 WHERE key_hash=? AND hits=1
      AND expires_at=? AND expires_at>? AND EXISTS(SELECT 1 FROM ${table} WHERE key_hash=? AND expires_at=?) RETURNING key_hash`).bind(this.owner, this.expires, now, this.lease, this.expires)];
    if (failed) {
      for(const slots of this.groups)statements.push(this.db.prepare(`WITH slots(k,n) AS (VALUES ${slots.map((_, i) => `(?,${i})`).join(',')})
        INSERT INTO ${table}(key_hash,hits,expires_at)
        SELECT slots.k,1,? FROM slots LEFT JOIN ${table} existing ON existing.key_hash=slots.k
        WHERE (existing.key_hash IS NULL OR existing.expires_at<=?) AND ${owned}
        ORDER BY slots.n LIMIT 1
        ON CONFLICT(key_hash) DO UPDATE SET hits=1,expires_at=excluded.expires_at WHERE expires_at<=?
        RETURNING key_hash`).bind(...slots, now + 900, now, this.owner, this.expires, now, now));
      for (const signal of this.signals) statements.push(this.db.prepare(`INSERT INTO ${table}(key_hash,hits,expires_at)
        SELECT ?,1,? WHERE ${owned} ON CONFLICT(key_hash) DO UPDATE SET hits=min(30,hits+1)`)
        .bind(signal.key, signal.end, this.owner, this.expires, now));
    }
    statements.push(this.db.prepare(`DELETE FROM ${table} WHERE key_hash=? AND expires_at=? AND ${owned} RETURNING key_hash`)
      .bind(this.lease, this.expires, this.owner, this.expires, now));
    statements.push(this.db.prepare(`DELETE FROM ${table} WHERE key_hash=? AND hits=2 AND expires_at=? RETURNING key_hash`).bind(this.owner, this.expires));
    const result = await this.db.batch(statements);
    return result[0].results.length === 1 && (!failed || result.slice(1,1+this.groups.length).every(r=>r.results.length===1))
      && result[result.length - 2].results.length === 1
      && result[result.length - 1].results.length === 1;
  }
}
