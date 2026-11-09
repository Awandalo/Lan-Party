import {eventEnvironmentEnabled} from './event-environment';
import {feedbackReady} from './feedback-data';
import {eventsReady,readEvents,writeEvent,EventError} from './event-data';
import {deliverRegistrationNotifications} from './event-registration-mail';
import {locationsReady,readLocations,writeLocation,LocationError} from './location-data';
import {memberRead} from './members';
import {readUserActivity} from './user-activity-read';
import {userActivityReady} from './auth/user-activity';
import {sessionCsrfToken} from './auth/csrf';
import {digestToken} from './auth/tokens';
import {fromHex,toHex} from './auth/encoding';
import type { AuthenticationEnvironment } from './auth/http';
import { authOrigin, authRouteEnabled, hosted, loopback } from './auth/environment';
import { readSessionCookie } from './auth/cookies';
import { resolveSession } from './auth/sessions';
import {validAuthMutation} from './auth/environment';
import {isAdministrator,roleSchemaReady,roleCatalogue,roleActivity,roleDeletionState,mutateRole,RoleDenied,RoleInvalid,RoleConflict,RoleAssigned,UUID} from './role-administration';

const sectionPermissions = {
  users: ['users.view', 'users.manage'],
  roles: ['roles.manage'],
  activity: ['roles.protect_admin'],
  events: ['events.create', 'events.update', 'events.publish', 'events.cancel', 'events.manage_registrations'],
} as const;

// Resolve current grants for every request. Role names never imply permissions.
export async function administrationPermissions(db: D1Database, userId: string, now: number) {
  return (await administrationAuthority(db,userId,now)).permissions;
}
async function administrationAuthority(db:D1Database,userId:string,now:number) {
  // Request-local facts only: never cache grants or schema readiness across requests.
  const rolesReady=await roleSchemaReady(db),admin=rolesReady&&await isAdministrator(db,userId);
  if(admin) {
    return {rolesReady,admin,permissions:(await db.prepare('SELECT code FROM permissions').all<{code:string}>()).results.map(p=>p.code)};
  }
  const rows = await db.prepare(`SELECT DISTINCT p.code FROM user_roles ur
    JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE ur.user_id=? AND r.is_active=1 AND ur.assigned_at<=? AND rp.granted_at<=?`)
    .bind(userId, now, now).all<{code: string}>();
  return {rolesReady,admin,permissions:rows.results.map(row => row.code)};
}

export async function manage(request: Request, env: AuthenticationEnvironment,ctx?:ExecutionContext): Promise<Response> {
  const reply = (status: number, data: object) => Response.json(data, {
    status, headers: {'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'},
  });
  const url = new URL(request.url);
  const members = url.pathname === '/api/manage/users' || url.pathname.startsWith('/api/manage/users/');
  const userLog=url.pathname==='/api/manage/user-activity';
  const locationEndpoint=['/api/manage/locations','/api/manage/location-activity'].includes(url.pathname);
  const locationLog=url.pathname==='/api/manage/location-activity';
  const eventEndpoint=['/api/manage/events','/api/manage/event-activity'].includes(url.pathname);
  const eventLog=url.pathname==='/api/manage/event-activity';
  const deletion=/^\/api\/manage\/roles\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/deletion$/.exec(url.pathname);
  const roleEndpoint=!!deletion||url.pathname==='/api/manage/roles'||url.pathname==='/api/manage/role-activity'||/^\/api\/manage\/users\/[^/]+\/roles$/.test(url.pathname);
  // Preserve the existing trusted-build and exact-origin hosted authentication gate.
  if (!(loopback(url) || hosted(request, env)) || !authRouteEnabled(request, env, env.AUTH_SESSION_MODE)
    || (!members && !roleEndpoint && !userLog && !locationEndpoint && !eventEndpoint && url.pathname !== '/api/manage/capabilities')) return reply(404, {error: 'Not found'});
  if (request.method !== 'GET' && !((roleEndpoint&&!url.pathname.endsWith('role-activity')||locationEndpoint&&!locationLog||eventEndpoint&&!eventLog)&&request.method==='POST')) return reply(405, {error: 'Method not allowed'});
  if((locationEndpoint||eventEndpoint)&&!eventEnvironmentEnabled(request,env))return reply(404,{error:'Not found'});
  if(deletion&&request.method!=='GET')return reply(405,{error:'Method not allowed'});
  try {
    const origin = authOrigin(request, env);
    if ((!members && !roleEndpoint && !userLog && !locationEndpoint && !eventEndpoint && url.search) || request.headers.has('Content-Encoding') || request.headers.get('X-LAN-Request') !== '1'
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
    if ((members||roleEndpoint||userLog||locationEndpoint||eventEndpoint) && submitted === null) return reply(403, {error: 'Session proof required'});
    if (submitted !== null) {
      const bytes = fromHex(submitted, 32);
      const expected = fromHex(await sessionCsrfToken(await digestToken(token!, 'session'), env.AUTH_RATE_LIMIT_SECRET!), 32)!;
      if (!bytes || !crypto.subtle.timingSafeEqual(bytes, expected)) return reply(409, {error: 'Session context changed'});
    }
    const {permissions,rolesReady,admin} = await administrationAuthority(env.DB, account.userId, now);
    if(eventEndpoint){
      if(!sectionPermissions.events.some(p=>permissions.includes(p)))return reply(403,{error:'Event access is restricted'});
      if(!await eventsReady(env.DB))return reply(503,{error:'Events requires its approved database migration'});
      if(request.method==='GET')return reply(200,{...await readEvents(env.DB,url,eventLog,permissions.includes('users.view')),...!eventLog?{templates:(await readLocations(env.DB,new URL('https://local.test/?status=active'))).locations,canCreate:permissions.includes('events.create'),canUpdate:permissions.includes('events.update'),canDelete:admin,canPublish:permissions.includes('events.publish'),canCancel:permissions.includes('events.cancel'),canManageRegistrations:permissions.includes('events.manage_registrations')}:{}});
      const digest=await digestToken(token!,'session');
      if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
      if(url.search||request.headers.get('Content-Type')!=='application/json')throw new EventError(400,'Invalid request');
      const reader=request.body?.getReader();if(!reader)throw new EventError(400,'Invalid request');
      let size=0,body='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new EventError(413,'Request too large');}body+=decoder.decode(value,{stream:true});}
      let raw:unknown;try{raw=JSON.parse(body+decoder.decode());}catch{throw new EventError(400,'Invalid request');}
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new EventError(400,'Invalid request');
      const action=(raw as Record<string,unknown>).action,required=action==='update'?'events.update':action==='publish'||action==='unpublish'?'events.publish':action==='cancel'?'events.cancel':'events.create';
      if(action==='delete'?!admin:!permissions.includes(required))return reply(403,{error:'Event change is restricted'});
      const result=await writeEvent(env.DB,account.userId,digest,raw as Record<string,unknown>);
      if(action==='cancel'&&'revision' in result)ctx?.waitUntil(deliverRegistrationNotifications(request,env,String((raw as Record<string,unknown>).operationId)));
      return reply(200,result);
    }
    if(locationEndpoint){
      if(!permissions.includes('locations.manage'))return reply(403,{error:'Location access is restricted'});
      if(!await locationsReady(env.DB))return reply(503,{error:'Locations requires its approved database migration'});
      if(request.method==='GET')return reply(200,await readLocations(env.DB,url,locationLog));
      const digest=await digestToken(token!,'session');
      if(!await validAuthMutation(request,origin.origin,digest,env.AUTH_RATE_LIMIT_SECRET!))return reply(403,{error:'Request rejected'});
      if(url.search||request.headers.get('Content-Type')!=='application/json')throw new LocationError(400,'Invalid request');
      const reader=request.body?.getReader();if(!reader)throw new LocationError(400,'Invalid request');
      let size=0,body='';const decoder=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false});
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new LocationError(413,'Request too large');}body+=decoder.decode(value,{stream:true});}
      let raw:unknown;try{raw=JSON.parse(body+decoder.decode());}catch{throw new LocationError(400,'Invalid request');}
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new LocationError(400,'Invalid request');
      return reply(200,await writeLocation(env.DB,account.userId,digest,raw as Record<string,unknown>));
    }
    if(userLog){
      if(!await isAdministrator(env.DB,account.userId))return reply(403,{error:'User Log access is restricted'});
      if(!await userActivityReady(env.DB))return reply(503,{error:'User Log is unavailable'});
      return reply(200,await readUserActivity(env.DB,url));
    }
    if(roleEndpoint) {
      if(!rolesReady)return reply(503,{error:'Role administration requires its approved database migration'});
      if(!permissions.includes('roles.manage'))return reply(403,{error:'Role access is restricted'});
      if(deletion){
        if(url.search)throw new RoleInvalid();
        const state=await roleDeletionState(env.DB,deletion[1]);
        return state?reply(200,{state}):reply(404,{error:'Role not found'});
      }
      const membership=url.pathname.startsWith('/api/manage/users/');
      if(membership && !permissions.includes('users.view'))return reply(403,{error:'Member access is restricted'});
      if(url.pathname==='/api/manage/role-activity') {
        if(!await isAdministrator(env.DB,account.userId))return reply(403,{error:'Activity access is restricted'});
        if([...url.searchParams.keys()].some(k=>!['before','date','operation','search'].includes(k)||url.searchParams.getAll(k).length>1))throw new RoleInvalid();
        return reply(200,await roleActivity(env.DB,url.searchParams.get('before'),{date:url.searchParams.get('date')??'',operation:url.searchParams.get('operation')??'',search:url.searchParams.get('search')??'',includeNames:permissions.includes('users.view')}));
      }
      if(url.search)throw new RoleInvalid();
      const target=membership?url.pathname.split('/')[4]:null;
      if(target && !UUID.test(target))throw new RoleInvalid();
      if(request.method==='GET') {
        const catalogue=await roleCatalogue(env.DB,account.userId,permissions.includes('users.view'));
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
      else if(!['create','update','delete'].includes(String(body.action)))throw new RoleInvalid();
      return reply(200,await mutateRole(env.DB,account.userId,digest,body));
    }
    if (members) {
      if (!permissions.includes('users.view')) return reply(403, {error: 'Member access is restricted'});
      const result = await memberRead(env.DB, url); return reply(result.status, result.body);
    }
    const sections = Object.entries(sectionPermissions).filter(([key, required]) => key==='activity'?admin:required.some(p => permissions.includes(p))).map(([key]) => key);
    if(admin&&await userActivityReady(env.DB))sections.push('userActivity');
    if(admin&&await feedbackReady(env.DB))sections.push('feedback');
    if(eventEnvironmentEnabled(request,env)&&permissions.includes('locations.manage')&&await locationsReady(env.DB))sections.push('locations');
    if (!sections.length) return reply(403, {error: 'Administration access is not available'});
    // Cache invalidation hint, never an authorization credential. Section names
    // alone cannot detect loss of users.view while users.manage still exists.
    const authorization=toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([admin,[...new Set(permissions)].sort()])))));
    return reply(200, {sections,authorization});
  } catch(error) {
    if(error instanceof EventError)return reply(error.status,{error:error.message});
    if(error instanceof LocationError)return reply(error.status,{error:error.message});
    if(error instanceof RoleAssigned)return reply(409,{code:'role_assigned',error:'Unassign this role from every member before deleting it, including inactive accounts.'});
    if(error instanceof RoleDenied)return reply(403,{error:'Role change is restricted'});
    if(error instanceof RoleInvalid)return reply(400,{error:'Invalid role request'});
    if(error instanceof RoleConflict)return reply(409,{error:'Role state changed or request was already processed. Reload before trying again.'});
    return reply(503, {error: 'Administration is temporarily unavailable'});
  }
}
