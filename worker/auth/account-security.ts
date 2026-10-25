import type {AuthenticationEnvironment} from './http';
import {authClientIP,authOrigin,authRouteEnabled,validAuthMutation} from './environment';
import {readInput} from './registration';
import {LoginLimiter,LoginLimited,LoginBusy} from './login-limits';
import {LoginChallenge,verifyLoginChallenge} from './turnstile';
import {digestToken} from './tokens';
import {readSessionCookie,clearSessionCookie} from './cookies';
import {resolveSession} from './sessions';
import {hashPassword,isValidPassword,verifyPassword} from './passwords';
import type {AccountIdentity} from './contracts';
import {passwordNotice} from './password-notification';
import {RecentMfaRequired,requireRecentMfa} from './mfa-assurance';
const now=()=>Math.floor(Date.now()/1000);
const reply=(status:number,body:object,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer',...headers}});
class SessionRequired extends Error {}
async function current(request:Request,env:AuthenticationEnvironment){
 const token=readSessionCookie(request),account=token?await resolveSession(env.DB,token,now()):null;
 if(!account||account.emailVerifiedAt===null||!token)throw new SessionRequired();
 return {account,digest:await digestToken(token,'session')};
}
async function grant(db:D1Database,account:AccountIdentity,digest:string){
 const time=now();
 const row=await db.prepare(`INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at)
 SELECT ?,id,auth_version,'password',?,? FROM users WHERE id=? AND status='active' AND auth_version=?
 AND EXISTS(SELECT 1 FROM auth_sessions WHERE token_digest=? AND user_id=users.id AND auth_version=users.auth_version AND revoked_at IS NULL AND expires_at>?)
 ON CONFLICT(session_digest) DO UPDATE SET method=excluded.method,authenticated_at=excluded.authenticated_at,expires_at=excluded.expires_at RETURNING session_digest`)
 .bind(digest,time,time+300,account.userId,account.authVersion,digest,time).first();
 if(!row)throw Error('Account changed');
}
export async function accountSecurity(request:Request,env:AuthenticationEnvironment):Promise<Response>{
 const url=new URL(request.url),action=url.pathname.split('/').pop();
 if(!['methods','reauth-password','change-password'].includes(action??'')||!authRouteEnabled(request,env,env.AUTH_SESSION_MODE))return reply(404,{error:'Not found'});
 if(request.method!==(action==='methods'?'GET':'POST'))return reply(405,{error:'Method not allowed'});
 try{
 const origin=authOrigin(request,env);
 if(url.search||request.headers.has('Content-Encoding')||request.headers.get('X-LAN-Request')!=='1'
 ||request.headers.has('Origin')&&request.headers.get('Origin')!==origin.origin
 ||request.headers.has('Sec-Fetch-Site')&&request.headers.get('Sec-Fetch-Site')!=='same-origin')return reply(403,{error:'Request rejected'});
 const {account,digest}=await current(request,env);
 if(action==='methods'){
 const password=!!await env.DB.prepare('SELECT user_id FROM user_password_credentials WHERE user_id=?').bind(account.userId).first();
 return reply(200,{password});
 }
 if(request.headers.get('Origin')!==origin.origin||request.headers.get('Content-Type')?.split(';')[0].trim()!=='application/json'
 ||!env.AUTH_RATE_LIMIT_SECRET||!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET))return reply(403,{error:'Request rejected'});
 const input=await readInput(request) as Record<string,unknown>;
 if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'Invalid request'});
 const mfa=action==='change-password'?await requireRecentMfa(env.DB,account,digest):null;
    if (action==='reauth-password' || action==='change-password') {
      if (Object.keys(input).some(k=>!(action==='change-password'?['password','newPassword','turnstileToken']:['password','turnstileToken']).includes(k)) || typeof input.password!=='string') return reply(400,{error:'Invalid request'});
      if(action==='change-password' && (typeof input.newPassword!=='string'||!isValidPassword(input.newPassword)))return reply(400,{error:'Use a 12–128 character new password.'});
      const user=await env.DB.prepare('SELECT email_normalized AS email FROM users WHERE id=?').bind(account.userId).first<{email:string}>();
      const limit=await LoginLimiter.create(env.DB,env.AUTH_RATE_LIMIT_SECRET!,authClientIP(request,env).toLowerCase());
      if (await limit.observe() || input.turnstileToken!==undefined) await verifyLoginChallenge(env.DB,env,input.turnstileToken,origin.hostname);
      const held=await limit.reserve(user!.email);let finished=false;
      try {
        const credential=await env.DB.prepare('SELECT password_hash FROM user_password_credentials WHERE user_id=?').bind(account.userId).first<string>('password_hash');
        const ok=!!credential && await verifyPassword(input.password,credential,env.PASSWORD_PEPPER);
        if (!await held.finish(!ok)) throw new Error('Expired authentication'); finished=true;
        if (!ok) return reply(401,{error:'Authentication could not be confirmed'});
        if(action==='change-password'){
          const hash=await hashPassword(input.newPassword as string,env.PASSWORD_PEPPER),time=now();
          const result=await env.DB.prepare(`UPDATE user_password_credentials SET password_hash=?,password_changed_at=?,updated_at=?
            WHERE user_id=? AND password_hash=? AND EXISTS(SELECT 1 FROM users u JOIN auth_sessions s ON s.user_id=u.id
              WHERE u.id=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.auth_version=?
              AND s.token_digest=? AND s.auth_version=u.auth_version AND s.revoked_at IS NULL AND s.expires_at>?) AND ${mfa!.sql} RETURNING user_id`)
            .bind(hash,time,time,account.userId,credential,account.userId,account.authVersion,digest,now(),...mfa!.values).first();
          if(!result){await requireRecentMfa(env.DB,account,digest);return reply(409,{error:'Your account changed. Sign in again before trying.'});}
          const notification=await passwordNotice(request,env,account,'password-changed');
          return reply(200,{next:'/login',notification},{'Set-Cookie':clearSessionCookie()});
        }
        await grant(env.DB,account,digest); return reply(200,{message:'Recent authentication confirmed for five minutes.'});
      } finally { if(!finished)await held.finish(false); }
    }
return reply(404,{error:'Not found'});
 }catch(error){
 if(error instanceof SessionRequired)return reply(401,{error:"Sign in again."});
 if(error instanceof RecentMfaRequired)return reply(428,{code:'mfa_required',error:'Confirm two-factor authentication before changing your password.'});
 if(error instanceof LoginChallenge)return reply(403,{code:error.invalid?'challenge_failed':'challenge_required',siteKey:error.siteKey,error:'Complete the security check.'});
 if(error instanceof LoginLimited)return reply(429,{error:'Try again later'},{'Retry-After':String(error.retryAfter)});
 if(error instanceof LoginBusy)return reply(503,{error:'Another check is pending'},{'Retry-After':'1'});
 return reply(503,{error:'Account security is unavailable. Sign in again or retry explicitly later.'});
 }
}
