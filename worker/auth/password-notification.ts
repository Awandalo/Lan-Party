import type { AccountIdentity } from './contracts';
import type { AuthenticationEnvironment } from './http';
import { authOrigin, emailTransport } from './environment';

export async function passwordNotice(request: Request, env: AuthenticationEnvironment, account: AccountIdentity,
  purpose: 'password-added'|'password-changed'|'mfa-enabled'|'mfa-disabled'|'mfa-regenerated'|'mfa-replaced') {
  // Call only after a committed, ownership-authorized credential write. A reset
  // proof also authorizes notifying its current address; it does not verify email.
  try {
    const row=await env.DB.prepare(`SELECT email FROM users WHERE id=? AND auth_version=? AND status='active'`)
      .bind(account.userId,account.authVersion+1).first<{email:string}>();
    if(!row)throw new Error('Notification unavailable');
    await emailTransport(request,env).send({to:row.email,url:authOrigin(request,env).origin+'/account/security',
      expiresAt:Math.floor(Date.now()/1000)+86400,purpose,idempotencyKey:`security-${purpose}-${account.userId}-${account.authVersion+1}`});
    return 'attempted';
  } catch { console.warn(purpose.startsWith('mfa-')?'auth.mfa_notification_unconfirmed':'auth.password_notification_unconfirmed');return 'unconfirmed'; }
}
