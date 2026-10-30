import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({entryPoints:['src/lib/member-save.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),mod=new Module(import.meta.filename);
mod._compile(result.outputFiles[0].text,import.meta.filename);const {saveMemberChanges,toggleRoleChange}=mod.exports;
const command={operationId:'fictional-command',action:'invite'},role={roleId:'fictional-role',operationId:'fictional-operation',accountId:'member',revision:7,action:'remove'};
test('one Save commits roles first and gives accurate partial delivery feedback',async()=>{
 const requests=[],transport=async(path,init)=>{requests.push({path,body:JSON.parse(init.body)});return path.endsWith('/roles')?Response.json({revision:8}):Response.json({outcome:'unconfirmed'});};
 const r=await saveMemberChanges(transport,'csrf','member',[role],command,()=>true);
 assert.deepEqual(requests.map(r=>r.path),['/api/manage/users/member/roles','/api/auth/lifecycle/command']);assert.equal(requests[1].body.operationId,command.operationId);
 assert.equal(r.roleSaved,true);assert.equal(r.accountSaved,false);assert.equal(r.uncertain,true);assert.match(r.message,/Role change saved/);assert.match(r.message,/cancelled/);
});
test('role failure and changed actor/route stop subsequent writes',async()=>{
 for(const status of [409,200]){const calls=[];let current=true;const r=await saveMemberChanges(async(path)=>{calls.push(path);if(status===200)current=false;return Response.json({revision:8},{status});},'csrf','member',[role],command,()=>current);assert.equal(calls.length,1);assert.equal(r.accountSaved,false);}
 let calls=0;await saveMemberChanges(async()=>{calls++;return Response.json({});},'csrf','member',[role],command,()=>false);assert.equal(calls,0);
});
test('network uncertainty never automatically retries; completion differs from invitation acceptance',async()=>{
 let calls=0;const r=await saveMemberChanges(async()=>{calls++;throw Error('fictional lost response');},'csrf','member',[],command,()=>true);assert.equal(calls,1);assert.equal(r.uncertain,true);assert.match(r.message,/unknown/);
 for(const outcome of ['accepted','completed','cancelled','disabled','pending']){const x=await saveMemberChanges(async()=>Response.json({outcome}),'csrf','member',[],command,()=>true);assert.equal(x.accountSaved,outcome!=='pending');if(outcome==='accepted')assert.match(x.message,/remains disabled/);if(outcome==='completed')assert.match(x.message,/is active/);}
});
test('multiple removals and additions use fresh revisions and then disable once',async()=>{
 const roles=[{...role,roleId:'new',operationId:'new-operation',action:'assign'},{...role,roleId:'old-a',operationId:'old-a-operation'},{...role,roleId:'old-b',operationId:'old-b-operation'}],requests=[];
 const r=await saveMemberChanges(async(path,init)=>{const body=JSON.parse(init.body);requests.push(body);return path.endsWith('/roles')?Response.json({revision:body.revision+1}):Response.json({outcome:'disabled'});},'csrf','member',roles,{...command,action:'disable'},()=>true);
 assert.deepEqual(requests.slice(0,3).map(r=>[r.roleId,r.revision]),[['old-a',7],['old-b',8],['new',9]]);assert.equal(requests[3].action,'disable');assert.deepEqual(r.savedRoleIds,['old-a','old-b','new']);assert.equal(r.accountSaved,true);
});
test('partial multi-role conflict reports saved IDs and never dispatches the remaining role or account intent',async()=>{
 let calls=0;const r=await saveMemberChanges(async()=>{calls++;return calls===1?Response.json({revision:8}):Response.json({},{status:409});},'csrf','member',[role,{...role,roleId:'second'},{...role,roleId:'third'}],command,()=>true);
 assert.equal(calls,2);assert.deepEqual(r.savedRoleIds,['fictional-role']);assert.equal(r.accountSaved,false);assert.match(r.message,/1 of 3/);
});
test('inverse staging collapses to no-op and duplicate commands never reach transport',async()=>{
 let changes=toggleRoleChange([],'assigned',true);assert.equal(changes[0].action,'remove');changes=toggleRoleChange(changes,'assigned',true);assert.deepEqual(changes,[]);
 changes=toggleRoleChange([],'new',false);assert.equal(changes[0].action,'assign');assert.deepEqual(toggleRoleChange(changes,'new',false),[]);
 let calls=0;const r=await saveMemberChanges(async()=>{calls++;},'csrf','member',[role,role],command,()=>true);assert.equal(calls,0);assert.match(r.message,/Duplicate/);
});
