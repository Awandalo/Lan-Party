import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const adminRole='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7';
const headers=u=>({'X-LAN-Session-Proof':u?.csrf??'a'.repeat(64),'X-CSRF-Token':u?.csrf??'a'.repeat(64)});
const call=(f,u,path='manage/roles',body)=>f.request(path,u,body,headers(u));
async function catalogue(f,u){const r=await call(f,u);assert.equal(r.status,200,await r.clone().text());return r.json();}
async function create(f,u,overrides={}){
 const c=await catalogue(f,u),body={action:'create',revision:c.revision,operationId:randomUUID(),code:'role_'+randomUUID().replaceAll('-',''),name:'Fictional role',description:'Fictional description',active:true,protected:false,permissionIds:[],...overrides};
 return {response:await call(f,u,'manage/roles',body),body};
}
async function edit(f,u,id,overrides={}){
 const c=await catalogue(f,u),role=c.roles.find(r=>r.id===id);
 return call(f,u,'manage/roles',{action:'update',revision:c.revision,operationId:randomUUID(),roleId:id,code:role.code,name:role.name,description:role.description??'',active:!!role.isActive,protected:!!role.isProtected,permissionIds:c.mappings.filter(m=>m.roleId===id).map(m=>m.permissionId),...overrides});
}
async function membership(f,u,target,roleId,action,overrides={}){
 const revision=overrides.revision??(await catalogue(f,u)).revision;
 return call(f,u,'manage/users/'+target.id+'/roles',{action,revision,operationId:randomUUID(),roleId,accountId:target.id,...overrides});
}
test('intrinsic Administrator works without grants; delegated managers cannot read private members or activity',()=>local(async f=>{
 const a=await f.user({genuine:true}),ordinary=await f.user(),d=await f.user({admin:true});
 await f.sql('DELETE FROM role_permissions WHERE role_id=?',adminRole).run();
 assert.equal((await catalogue(f,a)).administrator,true);assert.equal((await create(f,a)).response.status,200);
 assert.equal((await call(f,ordinary)).status,403);assert.equal((await call(f,a,'manage/role-activity')).status,200);
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001' AND permission_id IN (SELECT id FROM permissions WHERE code='users.view')").run();
 assert.equal((await call(f,d,'manage/users/'+a.id+'/roles')).status,403);assert.equal((await call(f,d,'manage/role-activity')).status,403);
 assert.equal((await create(f,d)).response.status,200);
}));
test('delegation cannot manipulate protected grants, roles, membership or promotion through protection capability',()=>local(async f=>{
 const a=await f.user({genuine:true}),d=await f.user({admin:true}),target=await f.user();
 const c=await catalogue(f,a),protectedIds=c.permissions.filter(p=>p.protected).map(p=>p.id);
 for(const id of protectedIds)assert.equal((await create(f,d,{permissionIds:[id]})).response.status,403);
 assert.equal((await create(f,d,{protected:true})).response.status,403);
 const result=await create(f,a,{protected:true});const roleId=(await result.response.json()).roleId;
 assert.equal((await edit(f,d,roleId,{name:'Forbidden'})).status,403);
 assert.equal((await membership(f,d,target,roleId,'assign')).status,403);
 assert.equal((await membership(f,d,target,adminRole,'assign')).status,403);
 assert.equal((await edit(f,a,adminRole,{name:'Forbidden'})).status,403);
 assert.equal((await membership(f,a,a,adminRole,'remove')).status,403);
 const ordinary=(await (await create(f,a)).response.json()).roleId;
 assert.equal((await membership(f,d,d,ordinary,'assign')).status,403);
}));
test('audit and mutations are atomic, minimal, append-only and do not require recent authentication',()=>local(async f=>{
 const a=await f.user({genuine:true});assert.equal(await f.sql('SELECT count(*) n FROM auth_recent_authentication').first('n'),0);
 const {response}=await create(f,a,{name:'Never retain this name',description:'Never retain this description'});assert.equal(response.status,200);
 const roleId=(await response.json()).roleId;
 const log=await (await call(f,a,'manage/role-activity')).json();assert.equal(log.entries.length,1);
 // Current role labels are now a read-time projection, never an audit snapshot.
 assert.equal(log.entries[0].roleName,'Never retain this name');
 assert.ok(!JSON.stringify((await f.sql('SELECT delta FROM role_activity').all()).results).includes('Never retain'));assert.ok(!JSON.stringify(log).includes('@example.test'));
 await assert.rejects(f.sql('UPDATE role_activity SET actor_id=?',randomUUID()).run(),/append-only/);
 await assert.rejects(f.sql('DELETE FROM role_activity').run(),/append-only/);
 const before=await f.sql('SELECT revision FROM rbac_state').first('revision');
 await f.sql("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON role_activity BEGIN SELECT RAISE(ABORT,'fictional audit failure'); END").run();
 assert.equal((await edit(f,a,roleId,{name:'Must roll back'})).status,409);
 assert.equal((await f.sql('SELECT name FROM roles WHERE id=?',roleId).first('name')),'Never retain this name');
 assert.equal(await f.sql('SELECT revision FROM rbac_state').first('revision'),before);
}));
test('stale editors, concurrent role changes and replayed operation IDs cannot partially commit',()=>local(async f=>{
 const a=await f.user({genuine:true});const c=await catalogue(f,a);
 const body={action:'create',revision:c.revision,operationId:randomUUID(),code:'fictional_concurrent',name:'Fictional',description:'',active:true,protected:false,permissionIds:[]};
 const responses=await Promise.all([call(f,a,'manage/roles',body),call(f,a,'manage/roles',{...body,operationId:randomUUID(),code:'fictional_second'})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(await f.sql('SELECT count(*) n FROM role_activity').first('n'),1);
 assert.equal((await call(f,a,'manage/roles',body)).status,409);
}));
test('two administrators removing each other concurrently preserve at least one genuine administrator',()=>local(async f=>{
 const a=await f.user({genuine:true}),b=await f.user({genuine:true});
 const revision=(await catalogue(f,a)).revision;
 const responses=await Promise.all([membership(f,a,b,adminRole,'remove',{revision}),membership(f,b,a,adminRole,'remove',{revision})]);
 assert.equal(responses.filter(r=>r.status===200).length,1);assert.ok(responses.some(r=>[403,409].includes(r.status)));
 assert.equal(await f.sql('SELECT count(*) n FROM user_roles WHERE role_id=?',adminRole).first('n'),1);
}));
test('held-role security edits are denied; harmless labels preserve future grant timestamps',()=>local(async f=>{
 const a=await f.user({genuine:true});const roleId=(await (await create(f,a)).response.json()).roleId;
 await f.sql('INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,?,0)',a.id,roleId).run();
 assert.equal((await edit(f,a,roleId,{active:false})).status,403);
 const p=(await catalogue(f,a)).permissions.find(p=>p.code==='news.create');
 await f.sql('INSERT INTO role_permissions(role_id,permission_id,granted_at) VALUES (?,?,unixepoch()+3600)',roleId,p.id).run();
 const time=await f.sql('SELECT granted_at FROM role_permissions WHERE role_id=?',roleId).first('granted_at');
 assert.equal((await edit(f,a,roleId,{name:'Harmless label'})).status,200);
 assert.equal(await f.sql('SELECT granted_at FROM role_permissions WHERE role_id=?',roleId).first('granted_at'),time);
}));
test('request validation, stale sessions and protected identity replacement fail closed',()=>local(async f=>{
 const a=await f.user({genuine:true});
 assert.equal((await f.request('manage/roles',a,{},{'X-LAN-Session-Proof':a.csrf})).status,403);
 assert.equal((await f.request('manage/roles',a,undefined,{'X-LAN-Session-Proof':'b'.repeat(64)})).status,409);
 assert.equal((await create(f,a,{permissionIds:[randomUUID()]})).response.status,400);
 assert.equal((await create(f,a,{unknown:true})).response.status,400);
 await assert.rejects(f.sql("INSERT OR REPLACE INTO roles(id,code,name,created_at,updated_at) VALUES (?,'forged_admin','Forged',0,0)",adminRole).run(),/immutable/);
 await f.sql('UPDATE auth_sessions SET revoked_at=created_at WHERE user_id=?',a.id).run();assert.equal((await call(f,a)).status,401);
}));
test('RBAC removal between lifecycle precheck and commit cannot remove the final genuine administrator',()=>local(async f=>{
 for(const action of ['deactivate','delete']) {
  const a=await f.user({genuine:true}),b=await f.user({genuine:true});
  // Remove other fixture administrators from the preceding scenario only.
  await f.sql('DELETE FROM user_roles WHERE role_id=? AND user_id NOT IN (?,?)',adminRole,a.id,b.id).run();
  await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",a.digest,a.id).run();
  // The fixture inserts a real, authorized RBAC request after lifecycle
  // prechecks but before its final batch. No clock or production predicate changes.
  const revision=(await catalogue(f,a)).revision;
  const refused=await f.request('auth/lifecycle/'+action,a,action==='delete'?{confirm:'DELETE',acknowledged:true}:{confirm:'DEACTIVATE'},{...headers(a),'X-Fixture-Rbac-Remove':b.id,'X-Fixture-Rbac-Revision':String(revision)});
  assert.equal(refused.headers.get('X-Fixture-Rbac-Status'),'200');
  // A losing final SQL guard deliberately returns the existing uncertain-result
  // response, not the earlier LastAdministrator precheck's 409 response.
  assert.equal(refused.status,503,await refused.clone().text());
  assert.deepEqual(await refused.json(),{error:'The lifecycle result could not be confirmed. No automatic retry was made. Check your account status before trying again.'});
  assert.equal(await f.sql("SELECT count(*) n FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_id=? AND u.status='active' AND u.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle l WHERE l.user_id=u.id)",adminRole).first('n'),1);
  assert.equal(await f.sql('SELECT count(*) n FROM account_lifecycle WHERE user_id=?',a.id).first('n'),0);
  assert.deepEqual(await f.sql('SELECT status,auth_version,first_name,last_name FROM users WHERE id=?',a.id).first(),{status:'active',auth_version:0,first_name:'Fictional',last_name:'Person'});
  assert.equal(await f.sql('SELECT revoked_at FROM auth_sessions WHERE token_digest=?',a.digest).first('revoked_at'),null);
  assert.equal(await f.sql("SELECT count(*) n FROM role_activity WHERE operation='membership.remove' AND actor_id=? AND account_id=?",a.id,b.id).first('n'),1);
  assert.equal(await f.sql('SELECT revision FROM rbac_state').first('revision'),revision+1);
 }
}));
test('audit actor IDs survive approved account deletion without identity data or blocking deletion',()=>local(async f=>{
 const a=await f.user({genuine:true});await f.user({genuine:true});
 assert.equal((await create(f,a)).response.status,200);
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",a.digest,a.id).run();
 const response=await f.request('auth/lifecycle/delete',a,{confirm:'DELETE',acknowledged:true},headers(a));assert.equal(response.status,200,await response.text());
 assert.equal(await f.sql('SELECT count(*) n FROM users WHERE id=?',a.id).first('n'),0);
 assert.equal(await f.sql('SELECT actor_id FROM role_activity').first('actor_id'),a.id);
}));
test('ordinary full MFA session may administer after two-minute assurance expires, but missing assurance is rejected',()=>local(async f=>{
 const a=await f.user({genuine:true}),factor=randomUUID();
 // Fictional ciphertext satisfies storage shape only. This test checks assurance
 // predicates, not TOTP/encryption; existing MFA integration tests cover those.
 await f.sql('INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES (?,?,?,?,?,0,?,unixepoch()-600)',a.id,factor,'22'.repeat(36),'11'.repeat(12),'fixture',randomUUID()).run();
 await f.sql("INSERT INTO auth_session_mfa VALUES (?,?,0,?,'totp',unixepoch()-300,'password',unixepoch()-300)",a.digest,a.id,factor).run();
 assert.equal((await create(f,a)).response.status,200);
 await f.sql('DELETE FROM auth_session_mfa WHERE user_id=?',a.id).run();
 assert.equal((await call(f,a)).status,401);
}));
test('protection capability alone cannot inspect or mutate role administration',()=>local(async f=>{
 const d=await f.user({admin:true});
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001'").run();
 await f.sql("INSERT INTO role_permissions SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='roles.protect_admin'").run();
 assert.equal((await call(f,d)).status,403);assert.equal((await call(f,d,'manage/role-activity')).status,403);
}));
test('legacy disabled, unverified and future-assigned administrators do not satisfy last-admin survival',()=>local(async f=>{
 const a=await f.user({genuine:true}),b=await f.user({genuine:true});
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES (?,?,0,'password',unixepoch(),unixepoch()+300)",a.digest,a.id).run();
 for(const state of ['disabled','unverified','future']) {
  await f.sql("UPDATE users SET status='active',email_verified_at=unixepoch() WHERE id=?",b.id).run();
  await f.sql('UPDATE user_roles SET assigned_at=0 WHERE user_id=?',b.id).run();
  if(state==='disabled')await f.sql("UPDATE users SET status='disabled' WHERE id=?",b.id).run();
  if(state==='unverified')await f.sql('UPDATE users SET email_verified_at=NULL WHERE id=?',b.id).run();
  if(state==='future')await f.sql('UPDATE user_roles SET assigned_at=unixepoch()+3600 WHERE user_id=?',b.id).run();
  const response=await f.request('auth/lifecycle/deactivate',a,{confirm:'DEACTIVATE'},headers(a));assert.equal(response.status,409,state);
  assert.equal(await f.sql('SELECT status FROM users WHERE id=?',a.id).first('status'),'active');
 }
}));
test('catalogue revision and role definitions are one consistent snapshot during concurrent edits',()=>local(async f=>{
 const a=await f.user({genuine:true}),created=await create(f,a,{name:'Revision 1'}),id=(await created.response.json()).roleId;
 const writer=(async()=>{for(let n=2;n<=8;n++)assert.equal((await edit(f,a,id,{name:'Revision '+n})).status,200);})();
 const reader=(async()=>{for(let n=0;n<20;n++){const c=await catalogue(f,a);assert.equal(c.roles.find(r=>r.id===id).name,'Revision '+c.revision);}})();
 await Promise.all([writer,reader]);
}));
test('inactive roles/accounts support revocation but cannot receive new memberships',()=>local(async f=>{
 const a=await f.user({genuine:true}),target=await f.user(),id=(await (await create(f,a)).response.json()).roleId;
 assert.equal((await membership(f,a,target,id,'assign')).status,200);
 assert.equal((await edit(f,a,id,{active:false})).status,200);
 await f.sql("UPDATE users SET status='disabled' WHERE id=?",target.id).run();
 assert.equal((await membership(f,a,target,id,'remove')).status,200);
 assert.equal((await membership(f,a,target,id,'assign')).status,409);
 assert.equal(await f.sql('SELECT status FROM users WHERE id=?',target.id).first('status'),'disabled');
}));

test('sequential multi-role edits and admin disable preserve per-operation audit, revisions and retained roles',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user();const ids=[];for(let i=0;i<3;i++)ids.push((await (await create(f,a)).response.json()).roleId);
 assert.equal((await membership(f,a,u,ids[0],'assign')).status,200);
 const metaResponse=await f.request('auth/lifecycle/member',a,{userId:u.id},headers(a));assert.equal(metaResponse.status,200);const {member}=await metaResponse.json();
 let revision=(await catalogue(f,a)).revision;
 for(const [roleId,action] of [[ids[0],'remove'],[ids[1],'assign'],[ids[2],'assign']]){
  const r=await call(f,a,'manage/users/'+u.id+'/roles',{roleId,action,accountId:u.id,revision,operationId:randomUUID()});assert.equal(r.status,200,await r.clone().text());const b=await r.json();assert.equal(b.revision,revision+1);revision=b.revision;
 }
 const disable=await f.request('auth/lifecycle/command',a,{userId:u.id,action:'disable',version:member.version,issuedAt:member.issuedAt,invitationId:member.invitationId,operationId:randomUUID()},headers(a));assert.equal(disable.status,200,await disable.clone().text());
 assert.equal(await f.sql('SELECT status FROM users WHERE id=?',u.id).first('status'),'disabled');
 assert.deepEqual((await f.sql('SELECT role_id FROM user_roles WHERE user_id=? ORDER BY role_id',u.id).all()).results.map(r=>r.role_id).sort(),ids.slice(1).sort());
 assert.equal(await f.sql("SELECT count(*) n FROM role_activity WHERE account_id=? AND operation LIKE 'membership.%'",u.id).first('n'),4);
 assert.equal(await f.sql("SELECT count(*) n FROM user_activity WHERE target_id=? AND event='account.deactivated'",u.id).first('n'),1);
 assert.equal((await call(f,u)).status,401);
}));
