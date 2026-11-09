import { emailAddress } from './accounts';
import { ResendEmailTransport } from './email';
import type { AccountMail, EmailEnvironment, EmailTransport, EmailReceipt } from './email';
import { reserveDevEmailAttempt } from './dev-email';
import { PROD_AUTH_ORIGIN } from './production';

function limit(value: string | undefined, maximum: number): number {
  if (!value || !/^[1-9][0-9]*$/.test(value) || Number(value) > maximum) {
    throw new Error('Production email configuration unavailable');
  }
  return Number(value);
}
// Same atomic budget/replay/error policy as DEV, on the independent PROD DB.
// Explicit allocations are mandatory. No DEV allowlist or budget extension can
// raise the approved production cap (at most 60/day in this preparation).
export class ProdResendEmailTransport implements EmailTransport {
  private readonly provider: ResendEmailTransport;
  private readonly daily: number;
  private readonly monthly: number;
  constructor(private readonly db: D1Database, private readonly env: EmailEnvironment,
    sendRequest: typeof fetch = fetch, private readonly now = () => Math.floor(Date.now() / 1000)) {
    if (env.AUTH_ENVIRONMENT !== 'prod' || env.AUTH_PUBLIC_ORIGIN !== PROD_AUTH_ORIGIN
      || env.AUTH_EMAIL_TRANSPORT !== 'resend' || !env.RESEND_API_KEY) {
      throw new Error('Production email configuration unavailable');
    }
    const providerDaily = limit(env.AUTH_EMAIL_PROVIDER_DAILY_LIMIT, 100);
    const providerMonthly = limit(env.AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT, 3000);
    this.daily = limit(env.AUTH_PROD_EMAIL_DAILY_LIMIT, Math.min(60, providerDaily));
    this.monthly = limit(env.AUTH_PROD_EMAIL_MONTHLY_LIMIT, providerMonthly);
    this.provider = new ResendEmailTransport(env.RESEND_API_KEY, 'noreply@auth.lan-party.club', sendRequest);
  }
  async send(mail: AccountMail): Promise<EmailReceipt|void> {
    const eventMail=mail.purpose==='event-payment'||mail.purpose==='event-registration';
    if(eventMail&&this.env.EVENTS_MODE!=='enabled')throw new Error('Production event email is not enabled');
    emailAddress(mail.to);
    const url = new URL(mail.url);
    const eventPath=/^\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/registration)?$/.test(url.pathname)
      && (mail.purpose==='event-payment'?url.pathname.endsWith('/registration'):!url.pathname.endsWith('/registration'));
    if(eventMail&&(!eventPath||url.hash))throw new Error('Production event email link denied');
    const path = eventMail&&eventPath?url.pathname:['password-changed','mfa-enabled','mfa-disabled','mfa-regenerated','mfa-replaced'].includes(mail.purpose ?? '')
      ? '/account/security' : mail.purpose === 'account-reactivation' ? '/reactivate'
      : mail.purpose === 'password-reset' ? '/reset-password' : '/verify-email';
    if (url.origin !== PROD_AUTH_ORIGIN || url.username || url.password || url.pathname !== path || url.search) {
      throw new Error('Production email request denied');
    }
    await reserveDevEmailAttempt(this.db, this.now(), this.daily, this.monthly);
    return await this.provider.send(mail); // Failed/uncertain sends count; never retry here.
  }
}
