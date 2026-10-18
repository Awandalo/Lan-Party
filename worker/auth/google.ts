import { googleClient, authorizationURL, exchangeGoogle, googleIssuer } from './google-provider';
import type { GoogleConfiguration } from './google-provider';
import type { AuthenticationEnvironment } from './http';
import { authClientIP, authOrigin, authRouteEnabled, emailTransport, hostedDev, recipientAllowed, validAuthMutation } from './environment';
import { readInput } from './registration';
import { validateAccountProfile } from './accounts';
import { LoginLimiter, LoginLimited, LoginBusy } from './login-limits';
import { LoginChallenge, verifyLoginChallenge } from './turnstile';
import { generateToken, digestToken, isValidToken } from './tokens';
import { readSessionCookie, sessionCookie, clearSessionCookie } from './cookies';
import { D1SessionStore, issueSession, resolveSession, revokeSession } from './sessions';
import { hashPassword, isValidPassword, verifyPassword } from './passwords';
import { deliverVerification } from './verification-service';
import type { AccountIdentity } from './contracts';
import { googleProof as proofDigest } from './google-proof';
import { encodeGoogleProfile, decodeGoogleProfile } from './google-profile';

export interface GoogleEnvironment extends AuthenticationEnvironment, GoogleConfiguration { GOOGLE_AUTH_MODE?: string }
interface Flow { state_digest: string; browser_digest: string; purpose: 'signin'|'link'|'reauth'; phase: string;
  verifier: string; nonce: string; user_id: string|null; session_digest: string|null; auth_version: number|null;
  subject: string|null; email: string|null; authoritative: number|null; expires_at: number }
const now = () => Math.floor(Date.now()/1000);
const cookieName = '__Host-lan_google';
class RecentAuthenticationRequired extends Error {
  constructor(readonly method?: string) { super('Confirm your existing sign-in method before continuing.'); }
}
function flowCookie(value: string, local: boolean) {
  return `${local ? 'lan_google_local' : cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${local?'':'; Secure'}`;
}
function profileCookie(value: string, local: boolean, maxAge: number) {
  return `${local?'lan_google_profile_local':'__Host-lan_google_profile'}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${local?'':'; Secure'}`;
}
function profileCookieValue(request: Request) {
  const name=new URL(request.url).protocol==='http:'?'lan_google_profile_local':'__Host-lan_google_profile';
  const values=(request.headers.get('Cookie')??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));
  return values.length===1?values[0].slice(name.length+1):'';
}
function browserToken(request: Request): string|null {
  const name = new URL(request.url).protocol === 'http:' ? 'lan_google_local' : cookieName;
  const values=(request.headers.get('Cookie')??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));
  const value=values[0]?.slice(name.length+1);
  return values.length===1 && value && isValidToken(value) ? value : null;
}
function reply(status: number, body: object, headers: Record<string,string>={}) {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
}
function redirect(path: string, cookie?: string) { return new Response(null,{status:303,
  headers:{Location:path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}}); }
async function current(request: Request, env: GoogleEnvironment) {
  const token=readSessionCookie(request), account=token?await resolveSession(env.DB,token,now()):null;
  if (!account || account.emailVerifiedAt===null || !token) throw new Error('Sign in required');
  return {account, token, digest:await digestToken(token,'session')};
}
async function recent(db: D1Database, account: AccountIdentity, digest: string, method?: string) {
  const row=await db.prepare(`SELECT method FROM auth_recent_authentication WHERE user_id=? AND session_digest=?
    AND auth_version=? AND authenticated_at<=? AND expires_at>?`).bind(account.userId,digest,account.authVersion,now(),now()).first<{method:string}>();
  if (!row || (method && row.method!==method)) throw new RecentAuthenticationRequired(method);
}
async function grant(db: D1Database, account: AccountIdentity, digest: string, method: 'password'|'google', authenticatedAt = now()) {
  const time=authenticatedAt;
  const row=await db.prepare(`INSERT INTO auth_recent_authentication
    (session_digest,user_id,auth_version,method,authenticated_at,expires_at)
    SELECT ?,id,auth_version,?,?,? FROM users WHERE id=? AND status='active' AND auth_version=?
    AND EXISTS(SELECT 1 FROM auth_sessions WHERE token_digest=? AND user_id=users.id AND revoked_at IS NULL AND expires_at>?)
    ON CONFLICT(session_digest) DO UPDATE SET method=excluded.method,authenticated_at=excluded.authenticated_at,expires_at=excluded.expires_at
    RETURNING session_digest`).bind(digest,method,time,time+300,account.userId,account.authVersion,digest,now()).first();
  if (!row) throw new Error('Account changed');
}
async function signedIn(env: GoogleEnvironment, account: AccountIdentity, request: Request) {
  if (account.emailVerifiedAt===null) return redirect('/verify-email');
  const session=await issueSession(new D1SessionStore(env.DB),account,now());
  const previous=readSessionCookie(request);
  if (previous) await revokeSession(new D1SessionStore(env.DB),previous,now());
  return redirect('/account',sessionCookie(session.token));
}
async function flowFor(request: Request, env: GoogleEnvironment, phase: string, state?: string) {
  const browser=browserToken(request); if (!browser) throw new Error('Missing transaction');
  const digest=await proofDigest(browser);
  const rows=await env.DB.prepare(`SELECT * FROM auth_oidc_transactions WHERE browser_digest=? AND phase=? AND expires_at>?
    ${state?'AND state_digest=?':''}`).bind(...(state?[digest,phase,now(),await proofDigest(state)]:[digest,phase,now()])).all<Flow>();
  if (rows.results.length!==1) throw new Error('Transaction unavailable');
  return rows.results[0];
}
async function consumeReady(env: GoogleEnvironment, flow: Flow) {
  return env.DB.prepare(`UPDATE auth_oidc_transactions SET phase='consumed',verifier='',nonce=''
    WHERE state_digest=? AND phase='ready' AND expires_at>? RETURNING state_digest`).bind(flow.state_digest,now());
}
export async function googleAuthentication(request: Request, env: GoogleEnvironment): Promise<Response> {
  const url=new URL(request.url), action=url.pathname.split('/').pop();
  if (!authRouteEnabled(request,env,env.AUTH_SESSION_MODE) || !authRouteEnabled(request,env,env.GOOGLE_AUTH_MODE)) return reply(404,{error:'Not found'});
  if (request.method!==(['callback','methods','profile'].includes(action??'')?'GET':'POST')) return reply(405,{error:'Method not allowed'});
  try {
    const origin=authOrigin(request,env); googleClient(env);
    if (action==='callback') {
      const state=url.searchParams.get('state');
      if (!state || !isValidToken(state)) throw new Error('Invalid callback');
      const flow=await flowFor(request,env,'pending',state);
      const held=await env.DB.prepare(`UPDATE auth_oidc_transactions SET phase='exchanging' WHERE state_digest=?
        AND phase='pending' AND expires_at>? RETURNING state_digest`).bind(flow.state_digest,now()).first();
      if (!held) throw new Error('Replayed callback');
      // Claimed before network: uncertain exchange is never automatically retried.
      const identity=await exchangeGoogle(env,url,state,flow.nonce,flow.verifier,origin.origin+'/api/auth/google/callback',flow.purpose==='reauth');
      if (!recipientAllowed(request,env,identity.email)) throw new Error('Identity unavailable');
      if (flow.purpose!=='signin') {
        const session=await current(request,env);
        if (session.account.userId!==flow.user_id || session.digest!==flow.session_digest || session.account.authVersion!==flow.auth_version) throw new Error('Session changed');
        if (flow.purpose==='reauth') {
          const linked=await env.DB.prepare(`SELECT id FROM user_auth_providers WHERE user_id=? AND provider='google'
            AND identity_namespace IN ('https://accounts.google.com','accounts.google.com') AND provider_subject=?`).bind(flow.user_id,identity.subject).first();
          if (!linked) throw new Error('Wrong identity');
          await grant(env.DB,session.account,session.digest,'google',identity.authenticatedAt);
          await env.DB.prepare(`UPDATE auth_oidc_transactions SET phase='consumed',verifier='',nonce='' WHERE state_digest=?`).bind(flow.state_digest).run();
          return redirect('/account/security');
        }
        await recent(env.DB,session.account,session.digest);
        // A different account owning this email is never silently merged.
        const collision=await env.DB.prepare('SELECT id FROM users WHERE email_normalized=? AND id<>?').bind(identity.email,flow.user_id).first();
        if (collision) throw new Error('Identity unavailable');
        const linkedResult = await env.DB.batch([
          env.DB.prepare(`UPDATE auth_oidc_transactions SET phase='consumed',verifier='',nonce='' WHERE state_digest=? AND phase='exchanging'
            AND expires_at>? AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=? AND status='active')
            AND EXISTS(SELECT 1 FROM auth_recent_authentication r JOIN auth_sessions s ON s.token_digest=r.session_digest
              WHERE r.session_digest=? AND r.expires_at>? AND s.revoked_at IS NULL AND s.expires_at>?)
            RETURNING state_digest`).bind(flow.state_digest,now(),flow.user_id,flow.auth_version,session.digest,now(),now()),
          env.DB.prepare(`INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at)
            SELECT ?,?,'google',?,?,? WHERE changes()=1`).bind(crypto.randomUUID(),flow.user_id,googleIssuer,identity.subject,now()),
          env.DB.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND changes()=1').bind(now(),flow.user_id),
        ]);
        if (linkedResult[1].meta.changes!==1) throw new Error('Account changed');
        // The generation change revoked every old session. Replace only this
        // proven caller's session; never reread and adopt a later generation.
        const replacement=await issueSession(new D1SessionStore(env.DB),
          {...session.account,authVersion:session.account.authVersion+1},now());
        return redirect('/account/security',sessionCookie(replacement.token));
      }
      const linked=await env.DB.prepare(`SELECT u.id AS userId,u.status,u.auth_version AS authVersion,u.email_verified_at AS emailVerifiedAt
        FROM users u JOIN user_auth_providers p ON p.user_id=u.id WHERE p.provider='google'
        AND p.identity_namespace IN ('https://accounts.google.com','accounts.google.com') AND p.provider_subject=?`).bind(identity.subject).first<AccountIdentity>();
      if (linked) {
        if (linked.status!=='active') throw new Error('Identity unavailable');
        await env.DB.prepare(`UPDATE auth_oidc_transactions SET phase='consumed',verifier='',nonce='' WHERE state_digest=?`).bind(flow.state_digest).run();
        return signedIn(env,linked,request);
      }
      await env.DB.prepare(`UPDATE auth_oidc_transactions SET phase='ready',subject=?,email=?,authoritative=?,verifier='',nonce=''
        WHERE state_digest=? AND phase='exchanging' AND expires_at>?`).bind(identity.subject,identity.email,identity.authoritative?1:0,flow.state_digest,now()).run();
      const response=redirect('/google-complete');
      response.headers.append('Set-Cookie',profileCookie(await encodeGoogleProfile(
        {firstName:identity.firstName,lastName:identity.lastName},flow.state_digest,flow.expires_at,env.AUTH_RATE_LIMIT_SECRET!),
        !hostedDev(request,env),Math.max(0,flow.expires_at-now())));
      return response;
    }
    if (url.search) return reply(400,{error:'Invalid request'});
    if (action==='profile') {
      if(request.headers.get('X-LAN-Request')!=='1'
        || (request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin)
        || (request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')) return reply(403,{error:'Request rejected'});
      const flow=await flowFor(request,env,'ready');
      return reply(200,await decodeGoogleProfile(profileCookieValue(request),flow.state_digest,env.AUTH_RATE_LIMIT_SECRET!,now()));
    }
    if (action==='methods') {
      const {account}=await current(request,env);
      const password=await env.DB.prepare('SELECT user_id FROM user_password_credentials WHERE user_id=?').bind(account.userId).first();
      const google=await env.DB.prepare("SELECT id FROM user_auth_providers WHERE user_id=? AND provider='google'").bind(account.userId).first();
      return reply(200,{password:!!password,google:!!google});
    }
    if (request.headers.get('Origin')!==origin.origin || request.headers.get('X-LAN-Request')!=='1'
      || request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json' || request.headers.has('Content-Encoding')
      || (request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site')!=='same-origin')) return reply(403,{error:'Request rejected'});
    const input=await readInput(request) as Record<string,unknown>;
    if (!input || typeof input!=='object' || Array.isArray(input)) return reply(400,{error:'Invalid request'});
    // Bounded expired-context cleanup; no raw provider codes/tokens are logged.
    for (const table of ['auth_oidc_transactions','auth_recent_authentication','auth_password_setup'])
      await env.DB.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expires_at<=? LIMIT 50)`).bind(now()).run();
    if (action==='start') {
      const purpose=input.purpose;
      if (!['signin','link','reauth'].includes(purpose as string) || Object.keys(input).some(k=>!['purpose','turnstileToken'].includes(k))) return reply(400,{error:'Invalid request'});
      const limiter=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET!,authClientIP(request,env).toLowerCase());
      if (await limiter.observe() || input.turnstileToken!==undefined) await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
      let session: Awaited<ReturnType<typeof current>>|undefined;
      if (purpose!=='signin') {
        session=await current(request,env);
        if (!await validAuthMutation(request,origin.origin,session.digest,env.AUTH_RATE_LIMIT_SECRET!)) return reply(403,{error:'Request rejected'});
        if (purpose==='link') await recent(env.DB,session.account,session.digest);
      }
      const browser=generateToken(),state=generateToken(),nonce=generateToken(),verifier=generateToken(),time=now();
      // Bound simultaneous transactions, including callers who discard cookies.
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_oidc_transactions WHERE expires_at>?').bind(time).first<number>('n');
      if ((count??0)>=500) return reply(503,{error:'Google sign-in is busy. Try later.'});
      await env.DB.prepare(`INSERT INTO auth_oidc_transactions(state_digest,browser_digest,purpose,phase,verifier,nonce,user_id,session_digest,auth_version,created_at,expires_at)
        SELECT ?,?,?,'pending',?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM auth_oidc_transactions WHERE expires_at>?)<500 RETURNING state_digest`)
        .bind(await proofDigest(state),await proofDigest(browser),purpose,verifier,nonce,session?.account.userId??null,session?.digest??null,
          session?.account.authVersion??null,time,time+600,time).first().then(row=>{if(!row)throw new Error('Busy');});
      const response=reply(200,{url:await authorizationURL(env,origin.origin+'/api/auth/google/callback',state,nonce,verifier,purpose==='reauth',purpose==='link')},
        {'Set-Cookie':flowCookie(browser,!hostedDev(request,env))});
      response.headers.append('Set-Cookie',profileCookie('',!hostedDev(request,env),0));
      return response;
    }
    if (action==='complete') {
      if (!authRouteEnabled(request,env,env.REGISTRATION_MODE) || Object.keys(input).sort().join(',')!=='firstName,lastName,nickname') return reply(400,{error:'Invalid request'});
      const flow=await flowFor(request,env,'ready');
      const profile=validateAccountProfile({nickname:input.nickname,firstName:input.firstName,lastName:input.lastName,email:flow.email});
      if (!recipientAllowed(request,env,profile.email)) throw new Error('Identity unavailable');
      const {registrationLimiter}=await import('./registration-limits');
      const limit=await registrationLimiter(env.DB,env.AUTH_RATE_LIMIT_SECRET!,now());
      await limit('global','all');await limit('ip',authClientIP(request,env));await limit('account',profile.emailNormalized);
      const id=crypto.randomUUID(),time=now();
      try {
        await env.DB.batch([await consumeReady(env,flow),
          env.DB.prepare(`INSERT INTO users(id,first_name,last_name,email,email_normalized,email_verified_at,created_at,updated_at)
            SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`).bind(id,profile.firstName,profile.lastName,profile.email,profile.emailNormalized,flow.authoritative?time:null,time,time),
          env.DB.prepare('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) SELECT ?,?,?,? WHERE changes()=1').bind(id,profile.nickname,time,time),
          env.DB.prepare(`INSERT INTO user_auth_providers(id,user_id,provider,identity_namespace,provider_subject,linked_at)
            SELECT ?,?,'google',?,?,? WHERE changes()=1`).bind(crypto.randomUUID(),id,googleIssuer,flow.subject,time),
        ]).then(result=>{if(result[3].meta.changes<1)throw new Error('Transaction unavailable');});
      } catch { return reply(400,{error:'Unable to complete registration. Sign in to your existing account to connect Google, or try another nickname.'}); }
      const account={userId:id,status:'active' as const,authVersion:0,emailVerifiedAt:flow.authoritative?time:null};
      if (!flow.authoritative) {
        await deliverVerification(env.DB,account,profile.email,origin.origin,emailTransport(request,env),time);
        return reply(200,{next:'/verify-email'},{'Set-Cookie':profileCookie('',!hostedDev(request,env),0)});
      }
      const session=await issueSession(new D1SessionStore(env.DB),account,time);
      const response=reply(200,{next:'/account'},{'Set-Cookie':sessionCookie(session.token)});
      response.headers.append('Set-Cookie',profileCookie('',!hostedDev(request,env),0));
      return response;
    }
    const session=await current(request,env),{account,digest}=session;
    if (!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!)) return reply(403,{error:'Request rejected'});
    if (action==='reauth-password') {
      if (Object.keys(input).some(k=>!['password','turnstileToken'].includes(k)) || typeof input.password!=='string') return reply(400,{error:'Invalid request'});
      const user=await env.DB.prepare('SELECT email_normalized AS email FROM users WHERE id=?').bind(account.userId).first<{email:string}>();
      const limit=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET!,authClientIP(request,env).toLowerCase());
      if (await limit.observe() || input.turnstileToken!==undefined) await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
      const held=await limit.reserve(user!.email);let finished=false;
      try {
        const credential=await env.DB.prepare('SELECT password_hash FROM user_password_credentials WHERE user_id=?').bind(account.userId).first<string>('password_hash');
        const ok=!!credential && await verifyPassword(input.password,credential,env.PASSWORD_PEPPER);
        if (!await held.finish(!ok)) throw new Error('Expired authentication'); finished=true;
        if (!ok) return reply(401,{error:'Authentication could not be confirmed'});
        await grant(env.DB,account,digest,'password'); return reply(200,{message:'Recent authentication confirmed for five minutes.'});
      } finally { if(!finished)await held.finish(false); }
    }
    if (action==='unlink') {
      if (Object.keys(input).length) return reply(400,{error:'Invalid request'});
      await recent(env.DB,account,digest,'password');
      const result=await env.DB.batch([
        env.DB.prepare(`DELETE FROM user_auth_providers WHERE user_id=? AND provider='google'
          AND EXISTS(SELECT 1 FROM users u JOIN user_password_credentials c ON c.user_id=u.id WHERE u.id=?
            AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.auth_version=?)
          AND EXISTS(SELECT 1 FROM auth_recent_authentication r JOIN auth_sessions s ON s.token_digest=r.session_digest
            WHERE r.session_digest=? AND r.method='password' AND r.expires_at>? AND s.revoked_at IS NULL AND s.expires_at>?) RETURNING id`)
          .bind(account.userId,account.userId,account.authVersion,digest,now(),now()),
        env.DB.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND changes()=1').bind(now(),account.userId),
      ]);
      return result[0].results.length===1?reply(200,{next:'/login'},{'Set-Cookie':clearSessionCookie()}):reply(400,{error:'Keep another usable sign-in method.'});
    }
    if (action==='request-password') {
      if (Object.keys(input).length) return reply(400,{error:'Invalid request'});
      await recent(env.DB,account,digest,'google');
      const row=await env.DB.prepare(`SELECT email,email_normalized FROM users WHERE id=? AND auth_version=? AND status='active'
        AND NOT EXISTS(SELECT 1 FROM user_password_credentials WHERE user_id=users.id)
        AND EXISTS(SELECT 1 FROM user_auth_providers WHERE user_id=users.id AND provider='google')`).bind(account.userId,account.authVersion).first<{email:string;email_normalized:string}>();
      if (!row || !recipientAllowed(request,env,row.email)) throw new Error('Unavailable');
      // Reuse the existing persistent delivery limiter and shared budget wrapper.
      const {registrationLimiter}=await import('./registration-limits');
      const limit=await registrationLimiter(env.DB,env.AUTH_RATE_LIMIT_SECRET!,now(),'password-forgot');
      await limit('global','all');await limit('ip',authClientIP(request,env));await limit('account',row.email_normalized);
      const token=generateToken(),hash=await proofDigest(token),time=now();
      await env.DB.batch([
        env.DB.prepare('UPDATE auth_password_setup SET revoked_at=max(created_at,?) WHERE user_id=? AND revoked_at IS NULL').bind(time,account.userId),
        env.DB.prepare(`INSERT INTO auth_password_setup(token_digest,user_id,session_digest,auth_version,email_normalized,created_at,expires_at)
          VALUES (?,?,?,?,?,?,?)`).bind(hash,account.userId,digest,account.authVersion,row.email_normalized,time,time+600),
      ]);
      try { await emailTransport(request,env).send({to:row.email,url:origin.origin+'/account/security#setup='+token,
        expiresAt:time+600,idempotencyKey:'password-setup-'+hash,purpose:'password-setup'}); }
      catch {await env.DB.prepare('UPDATE auth_password_setup SET revoked_at=? WHERE token_digest=?').bind(now(),hash).run();}
      return reply(202,{message:'If eligible, a confirmation email was requested. No automatic retry was made.'});
    }
    if (action==='add-password') {
      await recent(env.DB,account,digest,'google');
      if (Object.keys(input).sort().join(',')!=='password,token' || typeof input.token!=='string' || !isValidToken(input.token)
        || typeof input.password!=='string' || !isValidPassword(input.password)) return reply(400,{error:'Use a valid confirmation and a 12–128 character password.'});
      const time=now(),tokenHash=await proofDigest(input.token);
      const guard=`token_digest=? AND user_id=? AND session_digest=? AND auth_version=? AND expires_at>?
        AND consumed_at IS NULL AND revoked_at IS NULL AND email_normalized=(SELECT email_normalized FROM users WHERE id=?)`;
      const args=[tokenHash,account.userId,digest,account.authVersion,time,account.userId];
      if (!await env.DB.prepare(`SELECT token_digest FROM auth_password_setup WHERE ${guard}`).bind(...args).first()) return reply(400,{error:'Confirmation unavailable'});
      const hash=await hashPassword(input.password,env.PASSWORD_PEPPER);
      const result=await env.DB.batch([
        env.DB.prepare(`UPDATE auth_password_setup SET consumed_at=? WHERE ${guard}
          AND EXISTS(SELECT 1 FROM auth_recent_authentication r JOIN auth_sessions s ON s.token_digest=r.session_digest
            WHERE r.session_digest=? AND r.method='google' AND r.expires_at>? AND s.revoked_at IS NULL AND s.expires_at>?)
          AND EXISTS(SELECT 1 FROM users WHERE id=? AND auth_version=? AND status='active')
          AND NOT EXISTS(SELECT 1 FROM user_password_credentials WHERE user_id=?) RETURNING token_digest`)
          .bind(now(),...args.slice(0,4),now(),account.userId,digest,now(),now(),account.userId,account.authVersion,account.userId),
        env.DB.prepare(`INSERT INTO user_password_credentials(user_id,password_hash,password_changed_at,created_at,updated_at)
          SELECT ?,?,?,?,? WHERE changes()=1`).bind(account.userId,hash,now(),now(),now()),
        env.DB.prepare('UPDATE users SET auth_version=auth_version+1,updated_at=? WHERE id=? AND changes()=1').bind(now(),account.userId),
      ]);
      return result[0].results.length===1?reply(200,{next:'/login'},{'Set-Cookie':clearSessionCookie()}):reply(400,{error:'Confirmation unavailable'});
    }
    return reply(404,{error:'Not found'});
  } catch (error) {
    if (action==='callback') return redirect('/login?google=unavailable');
    if (error instanceof RecentAuthenticationRequired) return reply(428,{code:'reauth_required',
      method:error.method??'existing',error:error.message});
    if (error instanceof LoginChallenge) return reply(403,{code:error.invalid?'challenge_failed':'challenge_required',siteKey:error.siteKey,error:'Complete the security check.'});
    if (error instanceof LoginLimited) return reply(429,{error:'Try again later'},{'Retry-After':String(error.retryAfter)});
    if (error instanceof LoginBusy) return reply(503,{error:'Another check is pending'},{'Retry-After':'1'});
    return reply(503,{error:'Google or account security is unavailable. Sign in again or retry explicitly later.'});
  }
}
