import {memberRead} from './members';
import {sessionCsrfToken} from './auth/csrf';
import {digestToken} from './auth/tokens';
import {fromHex} from './auth/encoding';
import type { AuthenticationEnvironment } from './auth/http';
import { authOrigin, authRouteEnabled, hostedDev, loopback } from './auth/environment';
import { readSessionCookie } from './auth/cookies';
import { resolveSession } from './auth/sessions';
import {validAuthMutation} from './auth/environment';
import {isAdministrator,roleSchemaReady,roleCatalogue,roleActivity,mutateRole,RoleDenied,RoleInvalid,RoleConflict,UUID} from './role-administration';

const sectionPermissions = {
  users: ['users.view', 'users.manage'],
  roles: ['roles.manage'],
  activity: ['roles.protect_admin'],
  events: ['events.create', 'events.update', 'events.publish', 'events.cancel', 'events.manage_registrations'],
} as const;

// Resolve current grants for every request. Role names never imply permissions.
export async function administrationPermissions(db: D1Database, userId: string, now: number) {
  if(await roleSchemaReady(db) && await isAdministrator(db,userId)) {
    return (await db.prepare('SELECT code FROM permissions').all<{code:string}>()).results.map(p=>p.code);
  }
  const rows = await db.prepare(`SELECT DISTINCT p.code FROM user_roles ur
    JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=? AND r.is_active=1 AND ur.assigned_at<=? AND rp.granted_at<=?`)
    .bind(userId, now, now).all<{code: string}>();
  return rows.results.map(row => row.code);
}

export async function manage(request: Request, env: AuthenticationEnvironment): Promise<Response> {
  const reply = (status: number, data: object) => Response.json(data, {
    status, headers: {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'},
  });
  const url = new URL(request.url);
  const members = url.pathname === '/api/manage/users' || url.pathname.startsWith('/api/manage/users/');
  const roleEndpoint=url.pathname==='/api/manage/roles'||url.pathname==='/api/manage/role-activity'||/^\/api\/manage\/users\/[^/]+\/roles$/.test(url.pathname);
  // This first iteration is DEV/local only; PROD activation requires separate approval.
  if (!(loopback(url) || hostedDev(request, env)) || !authRouteEnabled(request, env, env.AUTH_SESSION_MODE)
    || (!members && !roleEndpoint && url.pathname !== '/api/manage/capabilities')) return reply(404, {error: 'Not found'});
  if (request.method !== 'GET' && !(roleEndpoint && request.method==='POST' && !url.pathname.endsWith('role-activity'))) return reply(405, {error: 'Method not allowed'});
  try {
    const origin = authOrigin(request, env);
    if ((!members && !roleEndpoint && url.search) || request.headers.has('Content-Encoding') || request.headers.get('X-LAN-Request') !== '1'
      || request.headers.has('Origin') && request.headers.get('Origin') !== origin.origin
      || request.headers.has('Sec-Fetch-Site') && request.headers.get('Sec-Fetch-Site') !== 'same-origin') {
      return reply(403, {error: 'Request rejected'});
    }
    const now = Math.floor(Date.now()/1000), token = readSessionCookie(request);
    const account = token ? await resolveSession(env.DB, token, now) : null;
    if (!account || account.emailVerifiedAt === null) return reply(401, {error: 'Please log in'});
    // Optional correlation proof prevents applying user B's grants to user A's
    // session snapshot if another tab changes cookies between the two reads.
    const submitted = request.headers.get('X-LAN-Session-Proof');
    if ((members||roleEndpoint) && submitted === null) return reply(403, {error: 'Session proof required'});
    if (submitted !== null) {
      const bytes = fromHex(submitted, 32);
      const expected = fromHex(await sessionCsrfToken(await digestToken(token!, 'session'), env.AUTH_RATE_LIMIT_SECRET!), 32)!;
      if (!bytes || !crypto.subtle.timingSafeEqual(bytes, expected)) return reply(409, {error: 'Session context changed'});
    }
    const permissions = await administrationPermissions(env.DB, account.userId, now);
    if(roleEndpoint) {
      if(!await roleSchemaReady(env.DB))return reply(503,{error:'Role administration requires its approved database migration'});
      if(!permissions.includes('roles.manage'))return reply(403,{error:'Role access is restricted'});
      const membership=url.pathname.startsWith('/api/manage/users/');
      if(membership && !permissions.includes('users.view'))return reply(403,{error:'Member access is restricted'});
      if(url.pathname==='/api/manage/role-activity') {
        if(!await isAdministrator(env.DB,account.userId))return reply(403,{error:'Activity access is restricted'});
        if([...url.searchParams.keys()].some(k=>k!=='before')||url.searchParams.getAll('before').length>1)throw new RoleInvalid();
        return reply(200,await roleActivity(env.DB,url.searchParams.get('before')));
      }
      if(url.search)throw new RoleInvalid();
      const target=membership?url.pathname.split('/')[4]:null;
      if(target && !UUID.test(target))throw new RoleInvalid();
      if(request.method==='GET') {
        const catalogue=await roleCatalogue(env.DB,account.userId);
        if(!target)return reply(200,catalogue);
        if(!await env.DB.prepare('SELECT 1 FROM users WHERE id=?').bind(target).first())return reply(404,{error:'Member not found'});
        const assignments=(await env.DB.prepare('SELECT role_id AS roleId,assigned_at AS assignedAt FROM user_roles WHERE user_id=? ORDER BY role_id').bind(target).all()).results;
        const eligible=!!await env.DB.prepare("SELECT 1 FROM users WHERE id=? AND status='active' AND email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=users.id)").bind(target).first();
        return reply(200,{...catalogue,assignments,effectivePermissions:eligible?await administrationPermissions(env.DB,target,now):[]});
      }
      const digest=await digestToken(token!,'session');
      if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
      const reader=request.body?.getReader();if(!reader)throw new RoleInvalid();
      let bytes=0,parts='';const decoder=new TextDecoder();
      for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();throw new RoleInvalid();}parts+=decoder.decode(value,{stream:true});}
      let body:Record<string,unknown>;try{body=JSON.parse(parts+decoder.decode());}catch{throw new RoleInvalid();}
      if(!body||typeof body!=='object'||Array.isArray(body))throw new RoleInvalid();
      if(membership) {if(body.accountId!==target||!['assign','remove'].includes(String(body.action)))throw new RoleInvalid();}
      else if(!['create','update'].includes(String(body.action)))throw new RoleInvalid();
      return reply(200,await mutateRole(env.DB,account.userId,digest,body));
    }
    if (members) {
      if (!permissions.includes('users.view')) return reply(403, {error: 'Member access is restricted'});
      const result = await memberRead(env.DB, url); return reply(result.status, result.body);
    }
    const admin=await roleSchemaReady(env.DB)&&await isAdministrator(env.DB,account.userId);
    const sections = Object.entries(sectionPermissions).filter(([key, required]) => key==='activity'?admin:required.some(p => permissions.includes(p))).map(([key]) => key);
    if (!sections.length) return reply(403, {error: 'Administration access is not available'});
    return reply(200, {sections});
  } catch(error) {
    if(error instanceof RoleDenied)return reply(403,{error:'Role change is restricted'});
    if(error instanceof RoleInvalid)return reply(400,{error:'Invalid role request'});
    if(error instanceof RoleConflict)return reply(409,{error:'Role state changed or request was already processed. Reload before trying again.'});
    return reply(503, {error: 'Administration is temporarily unavailable'});
  }
}
