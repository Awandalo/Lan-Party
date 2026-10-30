import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {local} from './helpers/role-fixture.mjs';
const get=(f,user)=>f.request('manage/roles',user,undefined,{'X-LAN-Session-Proof':user.csrf});
test('role counts include only active verified current memberships and reveal no identities',()=>local(async f=>{
 const admin=await f.user({genuine:true}),role=randomUUID();
 await f.sql("INSERT INTO roles(id,code,name,is_active,created_at,updated_at) VALUES (?,'fictional_count','Fictional count',1,0,0)",role).run();
 const active=await f.user(),disabled=await f.user(),unverified=await f.user(),future=await f.user(),deactivated=await f.user(),deleting=await f.user();
 const targets=[active,disabled,unverified,future,deactivated,deleting];
 for(const user of targets)await f.sql('INSERT INTO user_roles(user_id,role_id,assigned_at) VALUES (?,?,0)',user.id,role).run();
 await f.sql("UPDATE users SET status='disabled' WHERE id=?",disabled.id).run();await f.sql('UPDATE users SET email_verified_at=NULL WHERE id=?',unverified.id).run();await f.sql('UPDATE user_roles SET assigned_at=unixepoch()+3600 WHERE user_id=?',future.id).run();
 for(const [user,state] of [[deactivated,'deactivated'],[deleting,'deleting']])await f.sql('INSERT INTO account_lifecycle(user_id,state,deactivated_at) VALUES (?,?,0)',user.id,state).run();
 let response=await get(f,admin);assert.equal(response.status,200);let data=await response.json();assert.equal(data.roles.find(r=>r.id===role).assignedMemberCount,1);
 for(const user of targets)assert.ok(!JSON.stringify(data).includes(user.id));
 assert.ok(!JSON.stringify(data).includes('@example.test'));
 await f.sql('UPDATE roles SET is_active=0 WHERE id=?',role).run();data=await (await get(f,admin)).json();assert.equal(data.roles.find(r=>r.id===role).assignedMemberCount,0);
}));
test('roles.manage without users.view receives no count fields; grants are checked on every read',()=>local(async f=>{
 const delegate=await f.user({admin:true}),ordinary=await f.user();
 await f.sql("DELETE FROM role_permissions WHERE role_id='30000000-0000-4000-8000-000000000001' AND permission_id IN (SELECT id FROM permissions WHERE code='users.view')").run();
 let response=await get(f,delegate);assert.equal(response.status,200);assert.ok((await response.json()).roles.every(role=>!Object.hasOwn(role,'assignedMemberCount')));
 assert.equal((await get(f,ordinary)).status,403);
 await f.sql("INSERT INTO role_permissions(role_id,permission_id,granted_at) SELECT '30000000-0000-4000-8000-000000000001',id,0 FROM permissions WHERE code='users.view'").run();
 response=await get(f,delegate);assert.ok((await response.json()).roles.every(role=>Number.isSafeInteger(role.assignedMemberCount)));
}));
