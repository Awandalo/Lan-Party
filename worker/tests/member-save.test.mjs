import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({entryPoints:['src/lib/member-save.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),mod=new Module(import.meta.filename);
mod._compile(result.outputFiles[0].text,import.meta.filename);const {saveMemberChanges}=mod.exports;
const command={operationId:'fictional-command',action:'invite'},role={operationId:'fictional-role',action:'remove'};
test('one Save commits role first and gives accurate partial delivery feedback',async()=>{
 const requests=[];const transport=async(path,init)=>{requests.push({path,body:JSON.parse(init.body)});return path.endsWith('/roles')?Response.json({}):Response.json({outcome:'unconfirmed'});};
 const r=await saveMemberChanges(transport,'fictional-csrf','fictional-member',role,command,()=>true);
 assert.deepEqual(requests.map(r=>r.path),['/api/manage/users/fictional-member/roles','/api/auth/lifecycle/command']);assert.equal(requests[1].body.operationId,command.operationId);
 assert.equal(r.roleSaved,true);assert.equal(r.accountSaved,false);assert.equal(r.uncertain,true);assert.match(r.message,/Role change saved/);assert.match(r.message,/cancelled/);
});
test('role failure and changed actor/route stop the subsequent invitation',async()=>{
 for(const [status,current] of [[409,true],[200,false]]){const calls=[];const r=await saveMemberChanges(async(path)=>{calls.push(path);return Response.json({},{status});},'csrf','member',role,command,()=>current);assert.equal(calls.length,1);assert.equal(r.accountSaved,false);}
});
test('network uncertainty never automatically retries; completion is distinct from invitation acceptance',async()=>{
 let calls=0;const r=await saveMemberChanges(async()=>{calls++;throw Error('fictional lost response');},'csrf','member',null,command,()=>true);assert.equal(calls,1);assert.equal(r.uncertain,true);assert.match(r.message,/unknown/);
 for(const outcome of ['accepted','completed','cancelled','disabled','pending']){const x=await saveMemberChanges(async()=>Response.json({outcome}),'csrf','member',null,command,()=>true);assert.equal(x.accountSaved,outcome!=='pending');if(outcome==='accepted')assert.match(x.message,/remains disabled/);if(outcome==='completed')assert.match(x.message,/is active/);}
});
