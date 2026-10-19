type MailPurpose = 'email-verification' | 'password-reset' | 'password-setup' | 'password-added' | 'password-changed';

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;' })[character]!);
}

export function authenticationEmail(link: string, purpose: MailPurpose = 'email-verification') {
  if (!['email-verification', 'password-reset', 'password-setup','password-added','password-changed'].includes(purpose)) throw new Error('Invalid email purpose');
  const url = new URL(link);
  const reset = purpose === 'password-reset';
  const setup = purpose === 'password-setup';
  const notification = purpose === 'password-added' || purpose === 'password-changed';
  const path = setup || notification ? '/account/security' : reset ? '/reset-password' : '/verify-email';
  if (url.origin !== 'https://dev.lan-party.club' || url.username || url.password
    || url.pathname !== path || url.search || (notification ? !!url.hash : !url.hash) || /[\s\u0000-\u001f\u007f]/.test(link)) {
    throw new Error('Invalid authentication email URL');
  }
  const subject = notification ? (purpose === 'password-added' ? 'A password was added to your LAN Party account' : 'Your LAN Party password was changed') : setup ? 'Add a LAN Party password' : reset ? 'Reset your LAN Party password' : 'Verify your LAN Party account';
  const heading = notification ? (purpose === 'password-added' ? 'Password added successfully' : 'Password changed') : setup ? 'Add a password' : reset ? 'Reset your password' : 'Welcome to LAN Party';
  const explanation = notification ? (purpose === 'password-added'
    ? 'A password has been added to your LAN Party account. You can now sign in using your email address and password. If you made this change, no further action is needed.'
    : 'Your LAN Party account password was changed. If you made this change, no further action is needed.') : setup ? 'Return to the browser where you confirmed your Google identity to add a password. Recent Google authentication is also required.' : reset ? 'Choose a new password using this link.'
    : 'Confirm your email to finish setting up your account.';
  const expiry = notification ? "If you didn't make this change, secure your account and contact the LAN Party organizers. Visit LAN Party directly and recover your account if possible." : `This link expires in ${setup ? '10 minutes' : reset ? '30 minutes' : '24 hours'} and works once.`;
  const action = notification ? 'Review account security' : setup ? 'Confirm password setup' : reset ? 'Reset password' : 'Continue verification';
  const security = notification ? 'This is a security notification, not an email confirmation or password reset.' : 'If you did not request this, ignore this email.';
  const support = 'Need a hand? Contact the LAN Party organizers if this link does not work.';
  const href = escapeHTML(url.href);
  return {
    subject,
    text: `LAN / PARTY\n\n${heading}\n\n${explanation} ${expiry}\n\n${action}:\n${url.href}\n\n${support}\n\n${security}`,
    html: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHTML(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#101317;color:#edf1f5;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#101317;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#171c22;border:1px solid #333d49;border-radius:12px;"><tr><td style="padding:32px 24px;">
<p style="margin:0 0 24px;color:#8de2bd;font-size:18px;font-weight:bold;letter-spacing:1px;">LAN / PARTY</p>
<h1 style="margin:0 0 16px;color:#edf1f5;font-size:28px;line-height:1.25;">${escapeHTML(heading)}</h1>
<p style="margin:0 0 12px;color:#aeb9c7;font-size:16px;line-height:1.6;">${escapeHTML(explanation)}</p>
<p style="margin:0 0 24px;color:#aeb9c7;font-size:16px;line-height:1.6;">${escapeHTML(expiry)}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#8de2bd" style="border-radius:8px;"><a href="${href}" style="display:inline-block;padding:16px 24px;color:#101317;font-size:16px;font-weight:bold;text-decoration:none;">${escapeHTML(action)}</a></td></tr></table>
<p style="margin:24px 0 8px;color:#aeb9c7;font-size:14px;line-height:1.6;">If the button does not work, use this link:</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;"><a href="${href}" style="color:#8de2bd;">${escapeHTML(action)} securely</a></p>
<p style="margin:0 0 24px;color:#aeb9c7;font-size:14px;line-height:1.6;">${escapeHTML(support)}</p>
<p style="margin:0;padding-top:20px;border-top:1px solid #333d49;color:#aeb9c7;font-size:13px;line-height:1.6;">${escapeHTML(security)} ${notification?'':'Never share this link. '}LAN Party will never ask you to send your password by email.</p>
</td></tr></table></td></tr></table></body></html>`,
  };
}
