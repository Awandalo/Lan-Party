import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const builtin=['1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7','193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f'];
const headers=u=>({'X-LAN-Session-Proof':u.csrf,'X-CSRF-Token':u.csrf});
const call=(f,u,body,path='manage/roles')=>f.request(path,u,body,headers(u));
const catalogue=async(f,u)=>(await call(f,u)).json();
async function create(f,u,patch={}){
 const c=await catalogue(f,u),body={action:'create',revision:c.revision,operationId:randomUUID(),code:'role_'+randomUUID().replaceAll('-',''),name:'Fictional custom role',description:'Private fictional label',active:true,protected:false,permissionIds:[],...patch};
 const r=await call(f,u,body);assert.equal(r.status,200,await r.clone().text());return (await r.json()).roleId;
}
async function deletion(f,u,id,patch={}){return call(f,u,{action:'delete',roleId:id,revision:(await catalogue(f,u)).revision,operationId:randomUUID(),confirmed:true,...patch});}

test('deletion preflight reports all assignments without member identities and preserves role read/write boundaries',()=>local(async f=>{
 const a=await f.user({genuine:true}),d=await f.user({admin:true}),u=await f.user(),id=await create(f,a);
 const path='manage/roles/'+id+'/deletion';
 const revision=(await catalogue(f,a)).revision;
 for(const actor of [a,d]){const r=await call(f,actor,undefined,path);assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');assert.deepEqual(await r.json(),{state:'available'});}
 assert.equal((await call(f,u,undefined,path)).status,403);
 assert.equal((await f.request(path,a)).status,403);
 assert.equal((await call(f,a,{},path)).status,405);
 assert.equal((await call(f,a,undefined,path+'?unexpected=1')).status,400);
 assert.equal((await call(f,a,undefined,'manage/roles/'+randomUUID()+'/deletion')).status,404);
 await f.sql("UPDATE users SET status='disabled',email_verified_at=NULL WHERE id=?",u.id).run();
 await f.sql('INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,?,unixepoch()+3600)',u.id,id).run();
 assert.deepEqual(await(await call(f,a,undefined,path)).json(),{state:'assigned'});
 assert.deepEqual(await(await call(f,d,undefined,path)).json(),{state:'assigned'});
 for(const roleId of builtin)assert.deepEqual(await(await call(f,a,undefined,'manage/roles/'+roleId+'/deletion')).json(),{state:'protected'});
 assert.equal((await catalogue(f,a)).revision,revision);
 assert.equal(await f.sql('SELECT count(*) n FROM user_roles WHERE role_id=?',id).first('n'),1);
 await f.sql('UPDATE auth_sessions SET revoked_at=created_at WHERE user_id=?',a.id).run();
 assert.equal((await call(f,a,undefined,path)).status,401);
}));

test('0022 preserves populated audit bytes, sequence, constraints and append-only guards; old schema refuses deletion',()=>local(async f=>{
 const a=await f.user({genuine:true}),id=await create(f,a);
 assert.equal((await catalogue(f,a)).deletionAvailable,false);
 assert.equal((await deletion(f,a,id)).status,409);
 const before=(await f.sql('SELECT * FROM role_activity ORDER BY sequence').all()).results;
 await f.sql("UPDATE sqlite_sequence SET seq=100 WHERE name='role_activity'").run();
 await assert.rejects(f.migrate(22,["SELECT json('fictional migration failure')"]));
 assert.deepEqual((await f.sql('SELECT * FROM role_activity ORDER BY sequence').all()).results,before);
 assert.equal((await catalogue(f,a)).deletionAvailable,false);
 assert.equal(await f.sql("SELECT count(*) n FROM sqlite_schema WHERE name IN ('role_activity_next','role_activity_sequence_backup')").first('n'),0);
 await assert.rejects(f.sql("UPDATE role_activity SET delta='{}'").run(),/append-only/);
 await f.migrate(22);
 assert.deepEqual((await f.sql('SELECT * FROM role_activity ORDER BY sequence').all()).results,before);
 assert.equal(await f.sql("SELECT seq FROM sqlite_sequence WHERE name='role_activity'").first('seq'),100);
 assert.equal((await catalogue(f,a)).deletionAvailable,true);
 await assert.rejects(f.sql("UPDATE role_activity SET delta='{}'").run(),/append-only/);
 await assert.rejects(f.sql('DELETE FROM role_activity').run(),/append-only/);
 await assert.rejects(f.sql("INSERT OR REPLACE INTO role_activity SELECT * FROM role_activity").run(),/append-only/);
 await assert.rejects(f.sql('DELETE FROM roles WHERE id=?',builtin[1]).run(),/immutable/);
 assert.equal((await deletion(f,a,id)).status,200);
 assert.equal(await f.sql("SELECT sequence FROM role_activity WHERE operation='role.delete'").first('sequence'),101);
},21));

test('deletion removes only an unassigned ordinary role, records minimal history and rejects replay/missing roles',()=>local(async f=>{
 const a=await f.user({genuine:true}),c=await catalogue(f,a),p=c.permissions.find(p=>!p.protected);
 const id=await create(f,a,{permissionIds:[p.id]}),other=await create(f,a,{permissionIds:[p.id]});
 const member=await f.user();await f.sql('INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,?,0)',member.id,other).run();
 const memberships=(await f.sql('SELECT * FROM user_roles ORDER BY user_id,role_id').all()).results;
 const untouched=(await f.sql('SELECT * FROM role_permissions WHERE role_id=?',other).all()).results;
 const revision=(await catalogue(f,a)).revision,body={action:'delete',roleId:id,revision,operationId:randomUUID(),confirmed:true};
 assert.equal((await call(f,a,body)).status,200);
 assert.equal(await f.sql('SELECT id FROM roles WHERE id=?',id).first('id'),null);
 assert.equal(await f.sql('SELECT count(*) n FROM role_permissions WHERE role_id=?',id).first('n'),0);
 assert.deepEqual((await f.sql('SELECT * FROM role_permissions WHERE role_id=?',other).all()).results,untouched);
 assert.deepEqual((await f.sql('SELECT * FROM user_roles ORDER BY user_id,role_id').all()).results,memberships);
 const row=await f.sql('SELECT * FROM role_activity WHERE operation_id=?',body.operationId).first();
 assert.equal(row.operation,'role.delete');assert.equal(row.role_id,id);assert.equal(row.actor_id,a.id);assert.equal(row.revision,revision+1);
 assert.deepEqual(JSON.parse(row.delta),{deleted:{before:false,after:true},permissions:{before:[p.id],after:[]}});
 assert.ok(!JSON.stringify(row).includes('Private fictional label'));
 assert.equal((await call(f,a,body)).status,409);assert.equal((await deletion(f,a,randomUUID())).status,409);
 const log=await (await call(f,a,undefined,'manage/role-activity?operation=role.delete')).json();
 assert.equal(log.entries.length,1);assert.equal(log.entries[0].roleName,null);
}));

test('built-in, protected and privileged roles cannot be deleted; confirmation, RBAC, CSRF and sessions are enforced',()=>local(async f=>{
 const a=await f.user({genuine:true}),d=await f.user({admin:true}),u=await f.user();
 const protectedRole=await create(f,a,{protected:true}),c=await catalogue(f,a),privileged=await create(f,a,{permissionIds:[c.permissions.find(p=>p.protected).id]});
 for(const actor of [a,d])for(const id of [...builtin,protectedRole,privileged])assert.equal((await deletion(f,actor,id)).status,403);
 const id=await create(f,a);
 assert.equal((await deletion(f,a,id,{confirmed:false})).status,400);
 assert.equal((await deletion(f,a,id,{accountId:u.id})).status,400);
 assert.equal((await deletion(f,u,id)).status,403);
 assert.equal((await f.request('manage/roles',a,{action:'delete',roleId:id,confirmed:true}, {'X-LAN-Session-Proof':a.csrf})).status,403);
 assert.equal((await deletion(f,d,id)).status,200);
 const second=await create(f,a);await f.sql('UPDATE auth_sessions SET revoked_at=created_at WHERE user_id=?',a.id).run();
 assert.equal((await deletion(f,a,second)).status,401);
}));

test('all assignments block deletion, including disabled, unverified, future and held-role assignments',()=>local(async f=>{
 const a=await f.user({genuine:true}),id=await create(f,a);
 for(const state of ['disabled','unverified','future','self']){
  const u=state==='self'?a:await f.user();
  if(state==='disabled')await f.sql("UPDATE users SET status='disabled' WHERE id=?",u.id).run();
  if(state==='unverified')await f.sql('UPDATE users SET email_verified_at=NULL WHERE id=?',u.id).run();
  await f.sql('INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,?,unixepoch()+?)',u.id,id,state==='future'?3600:0).run();
  const revision=(await catalogue(f,a)).revision,r=await deletion(f,a,id);assert.equal(r.status,409);assert.equal((await r.json()).code,'role_assigned');
  assert.equal(await f.sql('SELECT revision FROM rbac_state').first('revision'),revision);
  assert.equal(await f.sql('SELECT count(*) n FROM user_roles WHERE user_id=? AND role_id=?',u.id,id).first('n'),1);
  await f.sql('DELETE FROM user_roles WHERE user_id=? AND role_id=?',u.id,id).run();
 }
 assert.equal((await deletion(f,a,id)).status,200);
}));

test('assignment/deletion and duplicate-delete races have one winner; failed audit rolls back grants and role',()=>local(async f=>{
 const a=await f.user({genuine:true}),u=await f.user(),id=await create(f,a),revision=(await catalogue(f,a)).revision;
 const del={action:'delete',roleId:id,revision,operationId:randomUUID(),confirmed:true};
 const assign={action:'assign',accountId:u.id,roleId:id,revision,operationId:randomUUID()};
 const responses=await Promise.all([call(f,a,del),call(f,a,assign,'manage/users/'+u.id+'/roles')]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const exists=await f.sql('SELECT id FROM roles WHERE id=?',id).first('id');
 assert.equal(await f.sql('SELECT count(*) n FROM user_roles WHERE role_id=?',id).first('n'),exists?1:0);
 const second=await create(f,a),rev=(await catalogue(f,a)).revision;
 const duplicates=await Promise.all([0,1].map(()=>call(f,a,{...del,roleId:second,revision:rev,operationId:randomUUID()})));
 assert.deepEqual(duplicates.map(r=>r.status).sort(),[200,409]);
 const p=(await catalogue(f,a)).permissions.find(p=>!p.protected),third=await create(f,a,{permissionIds:[p.id]}),before=(await catalogue(f,a)).revision;
 await f.sql("CREATE TRIGGER fixture_delete_audit_failure BEFORE INSERT ON role_activity WHEN NEW.operation='role.delete' BEGIN SELECT RAISE(ABORT,'fictional failure'); END").run();
 assert.equal((await deletion(f,a,third)).status,409);
 assert.equal(await f.sql('SELECT count(*) n FROM roles WHERE id=?',third).first('n'),1);
 assert.equal(await f.sql('SELECT count(*) n FROM role_permissions WHERE role_id=?',third).first('n'),1);
 assert.equal((await catalogue(f,a)).revision,before);
}));

test('a deleted custom role identifier can be recreated with a new identity and its own activity',()=>local(async f=>{
 const a=await f.user({genuine:true}),code='event_planner',id=await create(f,a,{code,name:'Event Planner',description:'Fictional test role'});
 assert.equal((await deletion(f,a,id)).status,200);
 const replacement=await create(f,a,{code,name:'Event Planner',description:'Fictional test role'});
 assert.notEqual(replacement,id);
 assert.equal(await f.sql('SELECT count(*) n FROM roles WHERE code=?',code).first('n'),1);
 assert.equal(await f.sql("SELECT count(*) n FROM role_activity WHERE role_id=? AND operation='role.delete'",id).first('n'),1);
 assert.equal(await f.sql("SELECT count(*) n FROM role_activity WHERE role_id=? AND operation='role.create'",replacement).first('n'),1);
}));
