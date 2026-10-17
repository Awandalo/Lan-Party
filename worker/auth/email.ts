import { emailAddress } from './accounts';

export interface VerificationMail { to: string; url: string; expiresAt: number; idempotencyKey: string }
export interface EmailTransport { send(mail: VerificationMail): Promise<void> }
export interface EmailEnvironment {
  AUTH_EMAIL_TRANSPORT?: string;
  AUTH_LOCAL_MAIL_SECRET?: string;
}

// Disposable, bounded local transport. Never writes tokens/recipients to logs or D1.
// Restarting the local isolate loses mail; explicit resend recovers it.
export class LocalEmailTransport implements EmailTransport {
  private readonly messages = new Map<string, VerificationMail>();
  private purge(now: number) {
    for (const [email, mail] of this.messages) if (mail.expiresAt <= now) this.messages.delete(email);
  }
  async send(mail: VerificationMail): Promise<void> {
    const recipient = emailAddress(mail.to).toLowerCase();
    const url = new URL(mail.url);
    if (!recipient.endsWith('.test') || url.protocol !== 'http:'
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Local fictional delivery only');
    this.purge(Math.floor(Date.now() / 1000));
    if (!this.messages.has(mail.idempotencyKey) && this.messages.size >= 50) throw new Error('Local mailbox full');
    this.messages.set(mail.idempotencyKey, { ...mail, to: recipient });
  }
  take(email: string, now: number): { url: string; expiresAt: number } | null {
    this.purge(now);
    const recipient = emailAddress(email).toLowerCase();
    // Delivery completion can reorder concurrent reissues. Retain the bounded
    // messages separately so the HTTP adapter can skip superseded digests in D1.
    for (const [key, mail] of [...this.messages.entries()].reverse()) {
      if (mail.to !== recipient) continue;
      this.messages.delete(key);
      return { url: mail.url, expiresAt: mail.expiresAt };
    }
    return null;
  }
}
export const localMailbox = new LocalEmailTransport();

// Prepared provider adapter, deliberately NOT selected by any application route.
// Future wiring must obtain RESEND_API_KEY through Worker secrets and an approved
// sender/recipient policy. Tests supply a fake fetch; no SDK/dependency is needed.
export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly apiKey: string, private readonly from: string,
    private readonly sendRequest: typeof fetch = fetch) {
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new Error('Invalid email configuration');
    emailAddress(from);
  }
  async send(mail: VerificationMail): Promise<void> {
    emailAddress(mail.to);
    if (new URL(mail.url).protocol !== 'https:') throw new Error('HTTPS verification link required');
    try {
      const response = await this.sendRequest('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json',
          'Idempotency-Key': mail.idempotencyKey },
        body: JSON.stringify({ from: this.from, to: [mail.to], subject: 'Verify your LAN Party email',
          text: `Confirm your LAN Party account email using this link (valid for 24 hours):\n\n${mail.url}\n\nIf you did not request this, ignore this message.` }),
      });
      await response.body?.cancel(); // Never log or propagate provider payloads.
      if (!response.ok) throw new Error('Delivery failed');
    } catch { throw new Error('Email delivery unavailable'); }
  }
}
