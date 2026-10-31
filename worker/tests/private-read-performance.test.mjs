import assert from 'node:assert/strict';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';

test('private endpoints deduplicate schema checks per request and schedule feedback cleanup off the foreground path',()=>local(async f=>{
 const admin=await f.user({genuine:true}),member=await f.user();
 const profile=async(path,user)=>{
  const r=await f.request(path,user,undefined,{'X-LAN-Session-Proof':user.csrf,'X-Fixture-Read-Profile':'1'});
  assert.equal(r.status,200,await r.clone().text());
  return r;
 };
 const capabilities=await profile('manage/capabilities',admin);
 assert.equal(capabilities.headers.get('X-Fixture-Role-Schema-Reads'),'1');
 assert.equal(capabilities.headers.get('X-Fixture-Feedback-Schema-Reads'),'1');
 assert.ok(Number(capabilities.headers.get('X-Fixture-Foreground-Queries'))<=8);
 const roles=await profile('manage/roles',admin);assert.equal(roles.headers.get('X-Fixture-Role-Schema-Reads'),'1');
 for(const [path,user] of [['feedback/requests',member],['feedback/unread',member],['manage/feedback',admin]]){
  const r=await profile(path,user);
  assert.equal(r.headers.get('X-Fixture-Feedback-Schema-Reads'),'1');
  assert.equal(r.headers.get('X-Fixture-Background-Cleanup'),'1');
  await f.drain();
 }
}));
