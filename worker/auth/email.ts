import { emailAddress } from './accounts';
import { authenticationEmail } from './email-template';

export interface AccountMail { to: string; url: string; expiresAt: number; idempotencyKey: string;
  purpose?: 'email-verification' | 'password-reset' | 'password-changed' | 'mfa-enabled' | 'mfa-disabled' | 'mfa-regenerated' | 'mfa-replaced' | 'account-reactivation' }
export interface EmailTransport { send(mail: AccountMail): Promise<void> }
export interface EmailEnvironment {
  AUTH_EMAIL_TRANSPORT?: string;
  AUTH_LOCAL_MAIL_SECRET?: string;
  // Prepared hosted-DEV contract. These fields do not enable application routes.
  AUTH_ENVIRONMENT?: string;
  AUTH_PUBLIC_ORIGIN?: string;
  RESEND_API_KEY?: string;
  AUTH_DEV_RECIPIENT_ALLOWLIST?: string;
  AUTH_EMAIL_PROVIDER_DAILY_LIMIT?: string;
  AUTH_EMAIL_PROVIDER_MONTHLY_LIMIT?: string;
}

// Disposable, bounded local transport. Never writes tokens/recipients to logs or D1.
// Restarting the local isolate loses mail; explicit resend recovers it.
export class LocalEmailTransport implements EmailTransport {
  private readonly messages = new Map<string, AccountMail>();
  private purge(now: number) {
    for (const [email, mail] of this.messages) if (mail.expiresAt <= now) this.messages.delete(email);
  }
  async send(mail: AccountMail): Promise<void> {
    const recipient = emailAddress(mail.to).toLowerCase();
    const url = new URL(mail.url);
    if (!recipient.endsWith('.test') || url.protocol !== 'http:'
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Local fictional delivery only');
    this.purge(Math.floor(Date.now() / 1000));
    if (!this.messages.has(mail.idempotencyKey) && this.messages.size >= 50) throw new Error('Local mailbox full');
    this.messages.set(mail.idempotencyKey, { ...mail, to: recipient });
  }
  take(email: string, now: number, purpose: AccountMail['purpose'] = 'email-verification'): { url: string; expiresAt: number } | null {
    this.purge(now);
    const recipient = emailAddress(email).toLowerCase();
    // Delivery completion can reorder concurrent reissues. Retain the bounded
    // messages separately so the HTTP adapter can skip superseded digests in D1.
    for (const [key, mail] of [...this.messages.entries()].reverse()) {
      if (mail.to !== recipient || (mail.purpose ?? 'email-verification') !== purpose) continue;
      this.messages.delete(key);
      return { url: mail.url, expiresAt: mail.expiresAt };
    }
    return null;
  }
}
export const localMailbox = new LocalEmailTransport();

// Provider adapter selected only through the guarded DEV transport wrapper.
// RESEND_API_KEY comes from Worker secrets; the wrapper enforces sender, recipient
// and shared sending policy. Tests inject fake fetch; no SDK/dependency is needed.
export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly apiKey: string, private readonly from: string,
    private readonly sendRequest: typeof fetch = fetch) {
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error('Invalid email configuration');
    emailAddress(from);
  }
  async send(mail: AccountMail): Promise<void> {
    emailAddress(mail.to);
    try {
      const template = authenticationEmail(mail.url, mail.purpose);
      // Native Workers fetch must not receive this transport as its receiver.
      const sendRequest = this.sendRequest;
      const response = await sendRequest('https://api.resend.com/emails', {
        // Workers supports manual redirects; never forward credentials elsewhere.
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': mail.idempotencyKey },
        body: JSON.stringify({ from: this.from, to: [mail.to], ...template }),
      });
      await response.body?.cancel(); // Never log or propagate provider payloads.
      if (!response.ok) throw new Error('Delivery failed');
    } catch { throw new Error('Email delivery unavailable'); }
  }
}
