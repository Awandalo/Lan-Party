import assert from 'node:assert/strict';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
import {paymentExample,proof} from './helpers/payment-info-fixture.mjs';
async function completed(f){const s=await paymentExample(f);await s.end();const r=await s.command('finalize',{confirmation:'Fictional payment info LAN'},s.planner);assert.equal(r.status,200,await r.clone().text());return s;}
const view=(f,s,body,headers={})=>f.request('auth/display-case',s.member,body,{...proof(s.member),...headers});
async function read(f,s){const r=await view(f,s);assert.equal(r.status,200);return r.json();}
async function crew(f,s){const r=await f.request('event-registration/'+s.id,s.member,undefined,proof(s.member));assert.equal(r.status,200);return(await r.json()).crew.find(m=>m.id===s.member.id);}

test('title selection persists independently of badge, including no title and legacy badge saves',()=>local(async f=>{
 const s=await completed(f);assert.equal((await read(f,s)).selectedTitleCode,'automatic');assert.equal((await crew(f,s)).rankCode,'full-weekend');
 assert.equal((await view(f,s,{revision:0,selectedCode:'full-weekend',selectedTitleCode:'first-lan'})).status,200);
 assert.equal((await read(f,s)).selectedTitleCode,'first-lan');assert.equal((await crew(f,s)).rankCode,'first-lan');assert.equal((await crew(f,s)).badgeCode,'full-weekend');
 assert.equal((await view(f,s,{revision:1,selectedCode:null})).status,200);assert.equal((await read(f,s)).selectedTitleCode,'first-lan');
 assert.equal((await view(f,s,{revision:2,selectedCode:'full-weekend',selectedTitleCode:null})).status,200);assert.equal((await crew(f,s)).rankCode,null);assert.equal((await crew(f,s)).badgeCode,'full-weekend');
 assert.equal((await view(f,s,{revision:3,selectedCode:'first-lan',selectedTitleCode:'automatic'})).status,200);assert.equal((await crew(f,s)).rankCode,'full-weekend');
 assert.equal(await f.sql('SELECT nickname FROM user_nicknames WHERE user_id=?',s.member.id).first('nickname'),'Pixel Alice');
}));

test('title saves reject locked choices, extra fields, missing CSRF, stale revisions and revoked sessions',()=>local(async f=>{
 const s=await completed(f);for(const code of ['silver','lan-recruit','legendary','unknown',42,{}])assert.equal((await view(f,s,{revision:0,selectedCode:null,selectedTitleCode:code})).status,400);
 const body={revision:0,selectedCode:null,selectedTitleCode:'first-lan'};
 assert.equal((await view(f,s,body,{'X-CSRF-Token':''})).status,403);assert.equal((await view(f,s,{...body,userId:s.outsider.id})).status,400);
 assert.equal(await f.sql('SELECT count(*) n FROM member_achievement_showcase').first('n'),0);
 assert.equal((await view(f,s,body)).status,200);assert.equal((await view(f,s,{...body,selectedTitleCode:null})).status,409);
 assert.equal((await f.request('auth/display-case',s.outsider,body,proof(s.outsider))).status,400);
 await f.sql('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?',s.member.digest).run();assert.equal((await view(f,s,{...body,revision:1})).status,401);
}));

test('concurrent title saves and transaction-time session revocation preserve the winning preference',()=>local(async f=>{
 const s=await completed(f),responses=await Promise.all(['first-lan',null].map(selectedTitleCode=>view(f,s,{revision:0,selectedCode:null,selectedTitleCode})));assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const current=await read(f,s);const denied=await view(f,s,{revision:current.revision,selectedCode:null,selectedTitleCode:'automatic'},{'X-Fixture-Registration-Fence':'session','X-Fixture-Payment-Commit':'1','X-Fixture-Actor':s.member.id,'X-Fixture-Digest':s.member.digest});assert.equal(denied.status,409);
 assert.equal(await f.sql('SELECT selected_title_code FROM member_achievement_showcase WHERE user_id=?',s.member.id).first('selected_title_code'),current.selectedTitleCode);
}));

test('an ineligible saved title falls back to highest unlocked; explicit no-title remains empty',()=>local(async f=>{
 const s=await completed(f);assert.equal((await view(f,s,{revision:0,selectedCode:null,selectedTitleCode:'first-lan'})).status,200);
 await f.sql("UPDATE member_achievement_showcase SET selected_title_code='legendary' WHERE user_id=?",s.member.id).run();assert.equal((await read(f,s)).selectedTitleCode,'automatic');assert.equal((await crew(f,s)).rankCode,'full-weekend');
 assert.equal((await view(f,s,{revision:1,selectedCode:null,selectedTitleCode:null})).status,200);assert.equal((await crew(f,s)).rankCode,null);
}));

test('0042 preserves badge choices and grants, rolls back atomically and keeps pre-migration badge clients working',()=>local(async f=>{
 const s=await completed(f);assert.equal((await view(f,s,{revision:0,selectedCode:'first-lan'})).status,200);
 const before=await f.sql('SELECT * FROM member_achievement_showcase WHERE user_id=?',s.member.id).first(),grants=(await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all()).results;
 assert.equal((await read(f,s)).titleSelectionAvailable,false);assert.equal((await view(f,s,{revision:1,selectedCode:null,selectedTitleCode:null})).status,503);
 await assert.rejects(f.migrate(42,["SELECT json('Fictional migration failure')"]));assert.equal((await read(f,s)).titleSelectionAvailable,false);
 await f.migrate(42);assert.deepEqual(await f.sql('SELECT * FROM member_achievement_showcase WHERE user_id=?',s.member.id).first(),{...before,selected_title_code:'automatic'});assert.deepEqual((await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all()).results,grants);
 assert.equal((await read(f,s)).titleSelectionAvailable,true);await assert.rejects(f.sql("UPDATE member_achievement_showcase SET selected_title_code='unknown' WHERE user_id=?",s.member.id).run(),/CHECK/);
 assert.equal((await view(f,s,{revision:1,selectedCode:'first-lan',selectedTitleCode:null})).status,200);
},41));
