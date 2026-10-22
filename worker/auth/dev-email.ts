import { emailAddress } from './accounts';
import { serverTime } from './database';
import { ResendEmailTransport } from './email';
import type { AccountMail, EmailEnvironment, EmailTransport } from './email';

const origin = 'https://dev.lan-party.club';
const sender = 'noreply@auth.lan-party.club';
const defaultDailyAttempts = 60;
export class DevEmailPolicyError extends Error {
  constructor() { super('DEV email policy unavailable or request denied.'); }
}
export class DevEmailBudgetExceeded extends Error {
  constructor() { super('DEV email allowance exhausted.'); }
}

function providerLimit(value: string | undefined, maximum: number): number {
  if (!value || !/^[1-9][0-9]*$/.test(value) || Number(value) > maximum) throw new DevEmailPolicyError();
  return Number(value);
}

// Reuse this check BEFORE hosted registration writes, not merely at delivery.
// Hosted mode is default-disabled; configuration and deployment are separately approved.
export function assertDevEmailRecipient(env: EmailEnvironment, email: string): void {
  try {
    if (env.AUTH_ENVIRONMENT !== 'dev' || env.AUTH_EMAIL_TRANSPORT !== 'resend'
      || env.AUTH_PUBLIC_ORIGIN !== origin || !env.AUTH_DEV_RECIPIENT_ALLOWLIST
      || env.AUTH_DEV_RECIPIENT_ALLOWLIST.length > 8192) throw new DevEmailPolicyError();
    const entries: unknown = JSON.parse(env.AUTH_DEV_RECIPIENT_ALLOWLIST);
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 100) throw new DevEmailPolicyError();
    const allowed = entries.map(entry => emailAddress(entry).toLowerCase());
    if (!allowed.includes(emailAddress(email).toLowerCase())) throw new DevEmailPolicyError();
  } catch { throw new DevEmailPolicyError(); }
}

export async function reserveDevEmailAttempt(db: D1Database, now: number,
  dailyProviderLimit: number, monthlyProviderLimit: number): Promise<void> {
  serverTime(now);
  if (!Number.isSafeInteger(dailyProviderLimit) || dailyProviderLimit < 1 || dailyProviderLimit > 100
    || !Number.isSafeInteger(monthlyProviderLimit) || monthlyProviderLimit < 1 || monthlyProviderLimit > 3000) {
    throw new DevEmailPolicyError();
  }
  const day = Math.floor(now / 86400) * 86400;
  const date = new Date(now * 1000);
  const month = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000;
  if (!Number.isSafeInteger(month)) throw new DevEmailPolicyError();
  // One SQLite statement serializes admission across isolates/actions. The
  // monthly sum examines at most 31 day rows; no raw recipient is persisted.
  // There is no refund/reset/delete API. Failed or uncertain sends retain their slot.
  const reserved = await db.prepare(`INSERT INTO auth_email_daily_budget (utc_day,attempts)
    SELECT ?,1 WHERE (SELECT COALESCE(SUM(attempts),0) FROM auth_email_daily_budget WHERE utc_day>=? AND utc_day<=?)<?
    ON CONFLICT(utc_day) DO UPDATE SET attempts=attempts+1
      WHERE attempts<min(? + COALESCE((SELECT additional_attempts FROM auth_email_budget_extensions WHERE utc_day=?),0),?)
        AND (SELECT COALESCE(SUM(attempts),0) FROM auth_email_daily_budget WHERE utc_day>=? AND utc_day<=?)<?
    RETURNING attempts`)
    .bind(day, month, day, monthlyProviderLimit, defaultDailyAttempts, day, dailyProviderLimit,
      month, day, monthlyProviderLimit).first();
  if (!reserved) throw new DevEmailBudgetExceeded();
}

// Hosted routes select only this wrapper, after the DEV hostname/mode guards.
export class DevResendEmailTransport implements EmailTransport {
  private readonly provider: ResendEmailTransport;
  private readonly dailyProviderLimit: number;
  private readonly monthlyProviderLimit: number;
  constructor(private readonly db: D1Database, private readonly env: EmailEnvironment,
    sendRequest: typeof fetch = fetch, private readonly now = () => Math.floor(Date.now() / 1000)) {
    if (env.AUTH_ENVIRONMENT !== 'dev' || env.AUTH_EMAIL_TRANSPORT !== 'resend'
      || env.AUTH_PUBLIC_ORIGIN !== origin || !env.RESEND_API_KEY) throw new DevEmailPolicyError();
    // Explicit operator-verified allocations; no assumption that advertised
    // limits equal available quota on a shared provider account.
    this.dailyProviderLimit = providerLimit(env.AUTH_EMAIL_PROVIDER_DAILY_LIMIT, 100);
    this.monthlyProviderLimit = providerLimit(env.AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT, 3000);
    this.provider = new ResendEmailTransport(env.RESEND_API_KEY, sender, sendRequest);
  }
  async send(mail: AccountMail): Promise<void> {
    assertDevEmailRecipient(this.env, mail.to);
    const url = new URL(mail.url);
    const path = ['password-setup','password-added','password-changed','mfa-enabled','mfa-disabled','mfa-regenerated','mfa-replaced'].includes(mail.purpose ?? '') ? '/account/security'
      : mail.purpose === 'password-reset' ? '/reset-password' : '/verify-email';
    if (url.origin !== origin || url.username || url.password || url.pathname !== path || url.search) {
      throw new DevEmailPolicyError();
    }
    await reserveDevEmailAttempt(this.db, this.now(), this.dailyProviderLimit, this.monthlyProviderLimit);
    await this.provider.send(mail); // Existing adapter sanitizes failures; never retry.
  }
}
