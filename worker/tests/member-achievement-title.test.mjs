import assert from 'node:assert/strict';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
import {paymentExample,proof} from './helpers/payment-info-fixture.mjs';
async function completed(f){const s=await paymentExample(f);await s.end();const r=await s.command('finalize',{confirmation:'Fictional payment info LAN'},s.planner);assert.equal(r.status,200,await r.clone().text());return s;}
async function detail(f,s,owner=s.member){const r=await f.request('manage/users/'+owner.id,s.admin,undefined,proof(s.admin));assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('cache-control'),'no-store');return(await r.json()).member;}

test('member details use the resolved saved title independently of badge and expose only the public title code',()=>local(async f=>{
 const s=await completed(f);assert.deepEqual((await detail(f,s)).achievementTitle,{available:true,code:'full-weekend'});
 const save=(revision,selectedTitleCode)=>f.request('auth/display-case',s.member,{revision,selectedCode:'full-weekend',selectedTitleCode},proof(s.member));
 assert.equal((await save(0,'first-lan')).status,200);let row=await detail(f,s);assert.deepEqual(row.achievementTitle,{available:true,code:'first-lan'});assert.equal(row.nickname,'Pixel Alice');
 assert.equal((await save(1,null)).status,200);assert.deepEqual((await detail(f,s)).achievementTitle,{available:true,code:null});
 assert.equal((await save(2,'automatic')).status,200);assert.deepEqual((await detail(f,s)).achievementTitle,{available:true,code:'full-weekend'});
 await f.sql("UPDATE member_achievement_showcase SET selected_title_code='legendary' WHERE user_id=?",s.member.id).run();
 assert.deepEqual((await detail(f,s)).achievementTitle,{available:true,code:'full-weekend'});
 assert.deepEqual((await detail(f,s,s.outsider)).achievementTitle,{available:true,code:null});
 const before=await f.sql('SELECT * FROM member_achievement_showcase WHERE user_id=?',s.member.id).first();await detail(f,s);assert.deepEqual(await f.sql('SELECT * FROM member_achievement_showcase WHERE user_id=?',s.member.id).first(),before);
 const listing=await(await f.request('manage/users',s.admin,undefined,proof(s.admin))).json();assert.ok(listing.members.every(m=>!('achievementTitle' in m)));assert.equal(/awards|progress|earnedAt|selected_code|selected_title_code/.test(JSON.stringify((await detail(f,s)).achievementTitle)),false);
}));

test('member title retains users.view, current session and session-proof boundaries',()=>local(async f=>{
 const s=await completed(f),path='manage/users/'+s.member.id;
 assert.equal((await f.request(path)).status,401);assert.equal((await f.request(path,s.member,undefined,proof(s.member))).status,403);assert.equal((await f.request(path,s.admin)).status,403);
 await f.sql('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?',s.admin.digest).run();assert.equal((await f.request(path,s.admin,undefined,proof(s.admin))).status,401);
}));

test('pre-0042 member details preserve the automatic title',()=>local(async f=>{
 const s=await completed(f);assert.deepEqual((await detail(f,s)).achievementTitle,{available:true,code:'full-weekend'});
},41));

test('pre-achievement schemas report title unavailable without breaking member details',()=>local(async f=>{
 const admin=await f.user({genuine:true}),member=await f.user();const r=await f.request('manage/users/'+member.id,admin,undefined,proof(admin));assert.equal(r.status,200);assert.deepEqual((await r.json()).member.achievementTitle,{available:false,code:null});
},23));
