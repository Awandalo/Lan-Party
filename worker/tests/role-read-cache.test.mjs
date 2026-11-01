import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const built=await build({entryPoints:['src/lib/role-read-cache.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod=new Module(import.meta.filename);mod._compile(built.outputFiles[0].text,import.meta.filename);const {RoleReadCache}=mod.exports;
const state=(id='fictional-a',proof='a',sections=['users','roles','activity'])=>({session:{account:{userId:id},csrfToken:proof.repeat(64)},status:'ready',access:{status:'ready',sections}});
const result=name=>({data:{name},message:''});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
test('return navigation reads synchronously and background refresh deduplicates without blanking data',async()=>{
 const c=new RoleReadCache();c.synchronize(state());c.read('roles','roles',async()=>result('Displayed'));await tick();
 const wait=deferred();let reads=0;c.read('roles','roles',async()=>{reads++;return wait.promise;});c.read('roles','roles',async()=>{reads++;return result('Duplicate');});await tick();
 assert.equal(c.get('roles').data.name,'Displayed');assert.equal(c.get('roles').loading,true);assert.equal(reads,1);
 wait.resolve(result('Updated'));await tick();assert.equal(c.get('roles').data.name,'Updated');
});
test('session, proof, capabilities and validation failures clear every view and fence late results',async()=>{
 for(const next of [{...state(),session:null},{...state(),status:'error'},{...state(),access:{status:'error',sections:[]}},state('fictional-b'),state('fictional-a','b'),state('fictional-a','a',['roles']),{...state(),access:{status:'loading',sections:[]}}]){
  const c=new RoleReadCache();c.synchronize(state());c.read('roles','roles',async()=>result('Private'));await tick();
  const wait=deferred();let signal;c.read('activity','activity',async s=>{signal=s;return wait.promise;});await tick();c.synchronize(next);
  assert.equal(c.get('roles'),undefined);assert.equal(signal.aborted,true);wait.resolve(result('Late'));await tick();assert.equal(c.get('activity'),undefined);
 }
});
test('new validation cancels old requests but keeps same-session content; queued obsolete reads never start',async()=>{
 const c=new RoleReadCache();c.synchronize(state());c.read('roles','roles',async()=>result('Displayed'));await tick();
 let obsolete=0;c.read('roles','roles',async()=>{obsolete++;return result('Obsolete');});
 c.synchronize({...state(),access:{...state().access,revision:1,revalidating:true}});
 assert.equal(c.get('roles').data.name,'Displayed');c.read('roles','roles',async()=>result('Current'));await tick();
 assert.equal(obsolete,0);assert.equal(c.get('roles').data.name,'Current');
});
test('denied, malformed, timeout or failed reads purge cached views and cannot be revived',async()=>{
 const c=new RoleReadCache();c.synchronize(state());c.read('roles','roles',async()=>result('Private'));await tick();
 const wait=deferred();c.read('activity','activity',async()=>wait.promise);
 c.read('roles','roles',async()=>({data:null,message:'Access restricted'}));await tick();
 assert.equal(c.get('activity'),undefined);assert.equal(c.get('roles').data,null);assert.equal(c.get('roles').message,'Access restricted');
 wait.resolve(result('Late'));await tick();assert.equal(c.get('activity'),undefined);
 c.read('roles','roles',async()=>{throw Error('Timeout');});await tick();assert.equal(c.get('roles').data,null);
});
test('late transport ignoring cancellation cannot overwrite a newer validation result',async()=>{
 const c=new RoleReadCache();c.synchronize(state());const wait=deferred();let oldSignal;
 c.read('roles','roles',async signal=>{oldSignal=signal;return wait.promise;});await tick();
 c.synchronize({...state(),access:{...state().access,revision:2}});assert.equal(oldSignal.aborted,true);
 c.read('roles','roles',async()=>result('Current'));await tick();wait.resolve(result('Old authority'));await tick();
 assert.equal(c.get('roles').data.name,'Current');
});
test('bounded cache and endpoint section gates preserve users.view and administrator-only log access',async()=>{
 const c=new RoleReadCache();c.synchronize(state('fictional-a','a',['roles']));let reads=0;
 c.read('/api/manage/users/fictional/roles','roles',async()=>{reads++;return result('Private');});c.read('activity','activity',async()=>{reads++;return result('Private');});await tick();assert.equal(reads,0);
 for(let i=0;i<9;i++){c.read('roles'+i,'roles',async()=>result(i));await tick();}
 assert.equal(c.get('roles0'),undefined);assert.equal(c.get('roles8').data.name,8);
 c.synchronize({...state(),session:null});c.synchronize(state());assert.equal(c.get('roles8'),undefined);
});

test('five-second intent reuse avoids duplicate transport and explicit reload/invalidation bypasses freshness',async()=>{
 let now=10000,reads=0;const c=new RoleReadCache(()=>now);c.synchronize(state());const load=async()=>{reads++;return result('Fictional');};
 c.read('roles','roles',load,5000);await tick();c.read('roles','roles',load,5000);await tick();assert.equal(reads,1);
 now+=5000;c.read('roles','roles',load,5000);await tick();assert.equal(reads,2);
 c.expire('roles');c.read('roles','roles',load,5000);await tick();assert.equal(reads,3);
 c.synchronize({...state(),access:{...state().access,revision:1}});c.read('roles','roles',load,5000);await tick();assert.equal(reads,4);
});
