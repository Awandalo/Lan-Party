import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const built=await build({entryPoints:['src/lib/member-read-cache.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod=new Module(import.meta.filename);mod._compile(built.outputFiles[0].text,import.meta.filename);const {MemberReadCache}=mod.exports;
const state=(id='fictional-a',proof='a')=>({session:{account:{userId:id},csrfToken:proof.repeat(64)},status:'ready',access:{status:'ready',sections:['users']}});
const page=name=>({data:{members:[{nickname:name}],nextCursor:null},message:''});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve};};
test('same-context focus checks retain content and deduplicate reads while loading',async()=>{
 const c=new MemberReadCache();c.synchronize(state());c.read('list',async()=>page('Fictional'));await tick();
 const wait=deferred();let reads=0;c.synchronize({...state(),access:{...state().access,revalidating:true}});
 c.read('list',async()=>{reads++;return wait.promise;});c.read('list',async()=>{reads++;return page('Duplicate');});
 await tick();assert.equal(c.get('list').data.members[0].nickname,'Fictional');assert.equal(c.get('list').loading,true);assert.equal(reads,1);
 wait.resolve(page('Updated'));await tick();assert.equal(c.get('list').data.members[0].nickname,'Updated');
});
test('logout, expiry, principal/proof changes, permission denial and validation failures erase cached private content',async()=>{
 for(const next of [{...state(),session:null},{...state(),status:'error'},{...state(),access:{status:'error',sections:[]}},{...state(),access:{status:'ready',sections:[]}},state('fictional-b'),state('fictional-a','b')]){
  const c=new MemberReadCache();c.synchronize(state());c.read('detail',async()=>page('Private'));await tick();const wait=deferred();let signal;
  c.read('detail',async s=>{signal=s;return wait.promise;});await tick();c.synchronize(next);assert.equal(c.get('detail'),undefined);assert.equal(signal.aborted,true);
  wait.resolve(page('Late private'));await tick();assert.equal(c.get('detail'),undefined);
 }
});
test('a new validation fences earlier pending reads while retaining already displayed content',async()=>{
 const c=new MemberReadCache();c.synchronize(state());c.read('list',async()=>page('Displayed'));await tick();
 const wait=deferred();let signal;c.read('list',async s=>{signal=s;return wait.promise;});await tick();
 c.synchronize({...state(),access:{...state().access,revision:1,revalidating:true}});
 assert.equal(signal.aborted,true);assert.equal(c.get('list').data.members[0].nickname,'Displayed');
 c.read('list',async()=>({data:null,message:'Revoked'}));await tick();wait.resolve(page('Authorized before revocation'));await tick();
 assert.equal(c.get('list').data,null);assert.equal(c.get('list').message,'Revoked');
});
test('route validation supersedes a queued read before transport starts',async()=>{
 const c=new MemberReadCache();c.synchronize(state());let reads=0;
 c.read('list',async()=>{reads++;return page('Superseded');});
 c.synchronize({...state(),access:{...state().access,revision:1}});
 c.read('list',async()=>{reads++;return page('Current');});await tick();
 assert.equal(reads,1);assert.equal(c.get('list').data.members[0].nickname,'Current');
});
test('failed member reads purge every cached view and fence outstanding responses',async()=>{
 const c=new MemberReadCache();c.synchronize(state());c.read('list',async()=>page('Private'));await tick();
 const wait=deferred();c.read('detail',async()=>wait.promise);c.read('list',async()=>({data:null,message:'Denied'}));await tick();
 assert.equal(c.get('list').data,null);assert.equal(c.get('list').message,'Denied');assert.equal(c.get('detail'),undefined);
 wait.resolve(page('Late'));await tick();assert.equal(c.get('detail'),undefined);
});
test('return navigation can immediately read a bounded cache without crossing contexts',async()=>{
 const c=new MemberReadCache();c.synchronize(state());
 for(let i=0;i<9;i++){c.read('page'+i,async()=>page('Fictional '+i));await tick();}
 assert.equal(c.get('page0'),undefined);assert.equal(c.get('page8').data.members[0].nickname,'Fictional 8');
 c.synchronize({...state(),session:null});c.synchronize(state());assert.equal(c.get('page8'),undefined);
});
