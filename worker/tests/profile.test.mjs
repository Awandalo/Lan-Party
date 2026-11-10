import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {local} from './helpers/role-fixture.mjs';

async function member(f,name='Pixel Alice'){
 const u=await f.user();await f.sql('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES(?,?,0,0)',u.id,name).run();return u;
}
const request=(f,u,body,headers={})=>f.request('auth/profile',u,body,{'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??'',...headers});
async function read(f,u){const r=await request(f,u);assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('Cache-Control'),'no-store');return r.json();}
const update=(snapshot,patch={})=>({...snapshot.profile,revision:snapshot.revision,...patch});

test('profile reads only the authenticated owner and returns the eight ordered optional prefixes',()=>local(async f=>{
 const a=await member(f),b=await member(f,'Byte Bob'),s=await read(f,a);
 assert.equal(s.profile.nickname,'Pixel Alice');assert.equal(s.profile.prefixId,null);assert.equal(s.canChangeNickname,true);assert.equal(s.nicknameAvailableAt,null);
 assert.deepEqual(s.prefixes.map(p=>p.label),['Mr.','Mrs.','Apache Helicopter.','Pastafarier.','TechnoViking.','NPC.','LAN Legend','Chaos Goblin']);
 assert.equal(JSON.stringify(s).includes(b.id),false);assert.equal(JSON.stringify(s).includes('@example.test'),false);
 assert.equal((await request(f,a,update(s,{userId:b.id}))).status,400);
 assert.equal((await request(f,null)).status,401);
 assert.equal((await request(f,a,undefined,{'X-LAN-Session-Proof':b.csrf})).status,403);
 assert.equal((await request(f,a,undefined,{Origin:'https://example.test'})).status,403);
 assert.equal((await request(f,a,update(s),{'X-CSRF-Token':''})).status,403);
}));

test('profile atomically changes private names, nickname and public prefix without changing identity, authority or session',()=>local(async f=>{
 const u=await member(f),s=await read(f,u),before=(await f.sql('SELECT id,auth_version,email,email_verified_at,status FROM users WHERE id=?',u.id).first()),number=await f.sql('SELECT member_number FROM member_numbers WHERE user_id=?',u.id).first('member_number');
 const response=await request(f,u,update(s,{nickname:'Pixel Alice V2',firstName:'Fictional Alice',lastName:'Example Person',prefixId:s.prefixes[6].id}));assert.equal(response.status,200,await response.clone().text());
 const after=await response.json();assert.equal(after.profile.firstName,'Fictional Alice');assert.equal(after.profile.lastName,'Example Person');assert.equal(after.profile.prefixId,s.prefixes[6].id);assert.equal(after.canChangeNickname,false);
 assert.deepEqual(await f.sql('SELECT id,auth_version,email,email_verified_at,status FROM users WHERE id=?',u.id).first(),before);assert.equal(await f.sql('SELECT member_number FROM member_numbers WHERE user_id=?',u.id).first('member_number'),number);
 assert.equal(await f.sql('SELECT count(*) n FROM user_roles WHERE user_id=?',u.id).first('n'),0);assert.equal(await f.sql('SELECT revoked_at FROM auth_sessions WHERE token_digest=?',u.digest).first('revoked_at'),null);
 const stored=await f.sql('SELECT nickname_changed_at,updated_at FROM user_nicknames WHERE user_id=?',u.id).first();assert.equal(after.nicknameAvailableAt,stored.nickname_changed_at+14*86400);
 assert.equal((await request(f,u,update(after))).status,200);assert.deepEqual(await f.sql('SELECT nickname_changed_at,updated_at FROM user_nicknames WHERE user_id=?',u.id).first(),stored);
}));

test('cooldown preserves name/prefix edits and enforces the exact database-clock boundary',()=>local(async f=>{
 const u=await member(f),s=await read(f,u);let r=await request(f,u,update(s,{nickname:'Alice New'}));assert.equal(r.status,200);let changed=await r.json();
 assert.equal((await request(f,u,update(changed,{nickname:'ALICE NEW'}))).status,409);
 r=await request(f,u,update(changed,{firstName:'Changed Privately',prefixId:s.prefixes[7].id}));assert.equal(r.status,200);changed=await r.json();assert.equal(changed.profile.firstName,'Changed Privately');assert.equal(changed.canChangeNickname,false);
 await f.sql('UPDATE user_nicknames SET nickname_changed_at=unixepoch()-? WHERE user_id=?',14*86400,u.id).run();changed=await read(f,u);assert.equal(changed.canChangeNickname,true);
 assert.equal((await request(f,u,update(changed,{nickname:'Alice Later'}))).status,200);
}));

test('nickname collisions and stale snapshots never partially update private fields',()=>local(async f=>{
 const a=await member(f),b=await member(f,'Byte Bob'),s=await read(f,a),before=await f.sql('SELECT first_name,last_name,name_prefix_id,updated_at FROM users WHERE id=?',a.id).first();
 const collision=await request(f,a,update(s,{nickname:'BYTE BOB',firstName:'Must Not Commit'}));assert.equal(collision.status,409,await collision.clone().text());
 assert.deepEqual(await f.sql('SELECT first_name,last_name,name_prefix_id,updated_at FROM users WHERE id=?',a.id).first(),before);assert.equal(await f.sql('SELECT nickname_changed_at FROM user_nicknames WHERE user_id=?',a.id).first('nickname_changed_at'),null);
 assert.equal((await request(f,a,update(s,{firstName:'Other Tab'}))).status,200);assert.equal((await request(f,a,update(s,{lastName:'Stale Overwrite'}))).status,409);
 assert.equal((await read(f,b)).profile.nickname,'Byte Bob');
}));

test('invalid/reserved names and unsupported or newly inactive prefixes are rejected',()=>local(async f=>{
 const u=await member(f),s=await read(f,u);
 for(const patch of [{nickname:'Admin'},{nickname:'<script>'},{firstName:' '},{lastName:'Name\u0000'},{prefixId:randomUUID()},{prefixId:'<b>Mr.</b>'},{email:'changed@example.test'}])assert.equal((await request(f,u,update(s,patch))).status,400);
 await f.sql('UPDATE name_prefixes SET is_active=0 WHERE id=?',s.prefixes[0].id).run();assert.equal((await request(f,u,update(s,{prefixId:s.prefixes[0].id}))).status,400);
 assert.equal((await read(f,u)).profile.nickname,'Pixel Alice');
}));

test('saved inactive prefix remains selectable unchanged while revoked/disabled accounts lose profile access',()=>local(async f=>{
 const u=await member(f),s=await read(f,u);assert.equal((await request(f,u,update(s,{prefixId:s.prefixes[0].id}))).status,200);
 await f.sql('UPDATE name_prefixes SET is_active=0 WHERE id=?',s.prefixes[0].id).run();const current=await read(f,u);assert.equal(current.prefixes.find(p=>p.id===s.prefixes[0].id).active,false);
 assert.equal((await request(f,u,update(current,{lastName:'Still Private'}))).status,200);
 await f.sql('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?',u.digest).run();assert.equal((await request(f,u)).status,401);
 const disabled=await member(f,'Disabled Person');await f.sql("UPDATE users SET status='disabled',updated_at=unixepoch() WHERE id=?",disabled.id).run();assert.equal((await request(f,disabled)).status,401);
}));

test('MFA enrollment fences an older unassured session from both reading and changing a profile',()=>local(async f=>{
 const u=await member(f),s=await read(f,u);
 await f.sql("INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES(?,?,?,?,?,0,?,0)",u.id,randomUUID(),'11'.repeat(36),'22'.repeat(12),'fictional',randomUUID()).run();
 assert.equal((await request(f,u)).status,401);assert.equal((await request(f,u,update(s,{firstName:'Must Not Commit'}))).status,401);
 assert.equal(await f.sql('SELECT first_name FROM users WHERE id=?',u.id).first('first_name'),'Fictional');
}));

test('0037 catalogue migration is additive, transactional and required before profile activation',()=>local(async f=>{
 const u=await member(f),legacy=randomUUID();await f.sql("INSERT INTO name_prefixes(id,label,created_at,updated_at) VALUES(?,'Historical prefix',0,0)",legacy).run();await f.sql('UPDATE users SET name_prefix_id=? WHERE id=?',legacy,u.id).run();
 const before=await f.sql('SELECT * FROM users ORDER BY id').all(),grants=await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all();assert.equal((await request(f,u)).status,503);
 await assert.rejects(f.migrate(37,["SELECT json('forced rollback')"]));assert.equal(await f.sql('SELECT count(*) n FROM name_prefixes').first('n'),1);
 await f.migrate(37);assert.deepEqual((await f.sql('SELECT * FROM users ORDER BY id').all()).results,before.results);assert.deepEqual((await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all()).results,grants.results);assert.equal(await f.sql('SELECT count(*) n FROM name_prefixes').first('n'),9);
 const current=await read(f,u);assert.equal(current.profile.prefixId,legacy);assert.equal(current.prefixes.find(p=>p.id===legacy).active,false);assert.equal((await request(f,u,update(current,{firstName:'Preserved Legacy Selection'}))).status,200);
},36));
