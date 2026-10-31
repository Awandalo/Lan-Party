import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const built=await build({entryPoints:['src/lib/feedback-read-cache.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod=new Module(import.meta.filename);mod._compile(built.outputFiles[0].text,import.meta.filename);const {FeedbackReadCache}=mod.exports;
const state=(id='fictional-a',proof='a',sections=['feedback'])=>({session:{account:{userId:id},csrfToken:proof.repeat(64)},status:'ready',access:{status:'ready',sections,authorization:'a'.repeat(64),revision:1}});
const page=(title='Fictional',closedAt=null)=>({requests:[{title,closedAt}],nextCursor:null});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};

test('feedback return navigation/prefetch reuses fresh content; expiry and explicit reload refetch without blanking',async()=>{
 let now=10000,reads=0;const c=new FeedbackReadCache(()=>now);c.synchronize(state());
 const load=async()=>{reads++;return page();};c.read('inbox',load);c.read('inbox',load);await tick();
 c.read('inbox',load);await tick();assert.equal(reads,1);assert.equal(c.get('inbox').data.requests[0].title,'Fictional');
 now+=5000;const wait=deferred();c.read('inbox',()=>{reads++;return wait.promise;});await tick();
 assert.equal(c.get('inbox').loading,true);assert.equal(c.get('inbox').data.requests[0].title,'Fictional');
 wait.resolve(page('Updated'));await tick();c.expire('inbox');c.read('inbox',load);await tick();assert.equal(reads,3);
});
test('logout, session/proof/authority changes and validation failures clear feedback and fence late transports',async()=>{
 for(const next of [{...state(),session:null},{...state(),status:'error'},{...state(),access:{status:'error',sections:[]}},state('other'),state('fictional-a','b'),state('fictional-a','a',[]),{...state(),access:{...state().access,authorization:'b'.repeat(64)}}]){
  const c=new FeedbackReadCache();c.synchronize(state());c.read('inbox',async()=>page());await tick();
  const wait=deferred();let signal;c.read('thread',s=>{signal=s;return wait.promise;});await tick();
  c.synchronize(next);assert.equal(c.get('inbox'),undefined);assert.equal(signal.aborted,true);wait.resolve(page('Late'));await tick();assert.equal(c.get('thread'),undefined);
 }
});
test('failed or malformed reads erase every feedback view, while successful mutation invalidation fences older reads',async()=>{
 const c=new FeedbackReadCache();c.synchronize(state());c.read('inbox',async()=>page());await tick();
 const wait=deferred();c.read('thread',()=>wait.promise);await tick();c.invalidate();c.read('thread',async()=>page('After mutation'));await tick();wait.resolve(page('Before mutation'));await tick();assert.equal(c.get('thread').data.requests[0].title,'After mutation');
 c.read('failed',async()=>{throw Error('Denied or malformed');});await tick();assert.equal(c.get('inbox'),undefined);assert.equal(c.get('thread'),undefined);assert.equal(c.get('failed').error,'Denied or malformed');
});
test('bounded feedback memory never resurrects closed content at its exact 30-day visibility cutoff',async()=>{
 let now=100000000;const c=new FeedbackReadCache(()=>now);c.synchronize(state());const closedAt=now/1000;
 for(let i=0;i<9;i++){c.read('page'+i,async()=>page('Fictional',closedAt));await tick();}
 assert.equal(c.get('page0'),undefined);assert.ok(c.get('page8').data);now+=2592000000;assert.equal(c.get('page8'),undefined);
 c.read('page8',async()=>({requests:[],nextCursor:null}));await tick();assert.deepEqual(c.get('page8').data.requests,[]);
});
test('read acknowledgement expires lists without restarting the rendered thread or creating an acknowledgement loop',async()=>{
 const c=new FeedbackReadCache();c.synchronize(state());let list=0,thread=0;
 const path='/api/feedback/requests/50000000-0000-4000-8000-000000000001';
 c.read('/api/feedback/requests',async()=>{list++;return page();});c.read(path,async()=>{thread++;return page();});await tick();
 c.expireLists();c.read('/api/feedback/requests',async()=>{list++;return page('Read');});c.read(path,async()=>{thread++;return page();});await tick();assert.equal(list,2);assert.equal(thread,1);
});
test('a denied transport remains a visible error through same-context validation; retry is explicit',async()=>{
 const c=new FeedbackReadCache();c.synchronize(state());const wait=deferred();let reads=0;
 c.read('thread',()=>{reads++;return wait.promise;});await tick();c.fail('thread','Access is restricted.');
 c.synchronize({...state(),access:{...state().access,revision:2}});wait.resolve(page('Old authority'));await tick();
 assert.equal(c.get('thread').error,'Access is restricted.');assert.equal(c.get('thread').loading,false);assert.equal(reads,1);
 c.expire('thread');c.read('thread',async()=>{reads++;return page('Explicit retry');});await tick();assert.equal(reads,2);
});
