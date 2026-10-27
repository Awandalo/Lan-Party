import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve('wrangler/package.json'))('esbuild');
const { outputFiles } = await build({ entryPoints: [fileURLToPath(new URL('../auth/email-template.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node' });
const { authenticationEmail } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
test('MFA notifications describe committed changes without secret material or approval links',()=>{
 for(const purpose of ['mfa-enabled','mfa-disabled','mfa-regenerated','mfa-replaced']){
  const mail=authenticationEmail('https://dev.lan-party.club/account/security',purpose);
  assert.match(mail.text,/security notification/);assert.match(mail.text,/If you didn't make this change/);
  assert.doesNotMatch(mail.text,/#|token=|secret=|otpauth:|works once|[A-Z2-7]{26}/);
  assert.throws(()=>authenticationEmail('https://dev.lan-party.club/account/security#private',purpose));
  assert.ok(mail.subject.includes('LAN Party'));
 }
});

test('verification and recovery share branded HTML and explicit plain text without external assets', () => {
  for (const [purpose, path, subject, expiry, action] of [
    ['email-verification', 'verify-email', 'Verify your LAN Party account', '24 hours', 'Continue verification'],
    ['password-reset', 'reset-password', 'Reset your LAN Party password', '30 minutes', 'Reset password'],
  ]) {
    const url = `https://dev.lan-party.club/${path}#user=fictional&token=fictional`;
    const result = authenticationEmail(url, purpose);
    assert.equal(result.subject, subject);
    for (const body of [result.html, result.text]) {
      assert.ok(body.includes('LAN / PARTY')); assert.ok(body.includes(expiry));
      assert.ok(body.includes(action)); assert.ok(body.includes('works once'));
      assert.ok(body.includes('If you did not request this, ignore this email.'));
    }
    assert.ok(result.text.includes(url)); assert.doesNotMatch(result.text, /<[^>]+>/);
    assert.match(result.html, /href="https:\/\/dev\.lan-party\.club\/[^" ]+&amp;token=fictional"/);
    for (const color of ['#101317', '#171c22', '#8de2bd']) assert.ok(result.html.includes(color));
    assert.doesNotMatch(result.html, /<img|<script|<link|<iframe|@import|url\(/i);
    assert.equal((result.html.match(/href=/g) ?? []).length, 2);
    assert.ok(result.html.includes(`${action} securely</a>`));
    assert.doesNotMatch(result.html.replace(/<[^>]*>/g, ''), /https:\/\//);
    for (const body of [result.text, result.html]) assert.ok(body.includes('Contact the LAN Party organizers'));
  }
});


test('template URLs reject unsafe destinations, credentials, queries and purpose crossover', () => {
  for (const url of ['http://dev.lan-party.club/verify-email#proof',
    'https://evil.example.test/verify-email#proof', 'https://dev.lan-party.club.evil.test/verify-email#proof',
    'https://user:password@dev.lan-party.club/verify-email#proof',
    'https://dev.lan-party.club/verify-email?tracking=1#proof',
    'https://dev.lan-party.club/reset-password#proof', 'https://dev.lan-party.club/verify-email',
    'https://dev.lan-party.club/verify-email#proof\n', 'javascript:alert(1)']) {
    assert.throws(() => authenticationEmail(url));
  }
  assert.throws(() => authenticationEmail('https://dev.lan-party.club/reset-password#proof', 'unknown'));
});

test('password-change notifications contain no action tokens',()=>{
 for(const purpose of ['password-changed']){
  const mail=authenticationEmail('https://dev.lan-party.club/account/security',purpose);
  assert.equal(mail.subject,'Your LAN Party password was changed');
  assert.match(mail.text,/no further action is needed/);assert.match(mail.text,/If you didn't make this change, secure your account/);
  for(const body of [mail.text,mail.html]){
   assert.ok(body.includes('Password changed'));
   assert.ok(body.includes('Your LAN Party account password was changed.'));
   assert.doesNotMatch(body,/sessions were signed out|password was updated/);
  }
  assert.doesNotMatch(mail.text,/#|token=|works once/);
  assert.throws(()=>authenticationEmail('https://dev.lan-party.club/account/security#setup=secret',purpose));
 }
});

test('interpolated URL content cannot break HTML attributes or inject markup', () => {
  const url = 'https://dev.lan-party.club/verify-email#x="\'><img/src=x>&token=fictional';
  const { html, text } = authenticationEmail(url);
  assert.doesNotMatch(html, /<img|href="[^"]*"\s*on/i);
  assert.ok(html.includes('&amp;token=fictional'));
  assert.ok(html.includes('&#39;'));
  assert.ok(text.includes(new URL(url).href));
});

test('reactivation invitation requires password and optional MFA, expires once in 30 minutes and has a dedicated safe path',()=>{
 const url='https://dev.lan-party.club/reactivate#'+'a'.repeat(64);
 const mail=authenticationEmail(url,'account-reactivation');
 assert.equal(mail.subject,'Reactivate your LAN Party account');
 for(const body of[mail.text,mail.html]){assert.match(body,/30 minutes/);assert.match(body,/works once/);assert.match(body,/existing password/);assert.match(body,/two-factor authentication/);}
 for(const unsafe of['https://lan-party.club/reactivate#fake','https://dev.lan-party.club/reactivate?token=fake','https://dev.lan-party.club/reset-password#fake'])
 assert.throws(()=>authenticationEmail(unsafe,'account-reactivation'));
});

test('PROD templates accept only the canonical HTTPS origin and preserve safe purpose-specific links',()=>{
 for(const [purpose,path,hash]of [['email-verification','verify-email','#fictional'],['password-reset','reset-password','#fictional'],['account-reactivation','reactivate','#fictional'],['mfa-enabled','account/security','']]){
 const url='https://www.lan-party.club/'+path+hash;const mail=authenticationEmail(url,purpose);assert.ok(mail.text.includes(url));
 for(const origin of ['https://lan-party.club','http://www.lan-party.club','https://www.lan-party.club.evil.test','https://lan-party.servok.workers.dev'])assert.throws(()=>authenticationEmail(origin+'/'+path+hash,purpose));
 }
});
