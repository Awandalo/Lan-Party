import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const code=await build({entryPoints:['src/lib/event-panel-reads.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {EventPanelReads}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));

test('fast tab returns reuse selected-event reads; stale tabs refresh and concurrent requests deduplicate',async()=>{
 let now=0,count=0;const reads=new EventPanelReads(()=>now);reads.synchronize('event:session:permissions:revision');
 const load=async()=>({revision:++count});
 const [first,second]=await Promise.all([reads.read('participants',load),reads.read('participants',load)]);
 assert.equal(first,second);assert.equal(count,1);
 now=4999;assert.equal(await reads.read('participants',load),first);
 await reads.read('finance',load);assert.equal(count,2);
 now=5000;assert.equal((await reads.read('participants',load)).revision,3);
 assert.equal((await reads.read('finance',load)).revision,2);
});
test('event, session, permissions and revision switches abort pending reads and fence late responses',async()=>{
 for(const context of ['different-event','different-session','different-permissions','different-revision','']){
  const reads=new EventPanelReads();reads.synchronize('original');let finish,signal;
  const old=reads.read('participants',s=>{signal=s;return new Promise(resolve=>{finish=resolve;});});await Promise.resolve();
  reads.synchronize(context);assert.equal(signal.aborted,true);
  const latest=context?await reads.read('participants',async()=>({revision:2})):null;
  finish({revision:1});await assert.rejects(old,{name:'AbortError'});
  if(context)assert.equal(await reads.read('participants',async()=>{throw Error('Must reuse newest');}),latest);
  else await assert.rejects(reads.read('finance',async()=>{throw Error('Must not request');}),{name:'AbortError'});
 }
});
test('writes invalidate both tabs and abort in-flight data; read errors clear other privileged snapshots',async()=>{
 const reads=new EventPanelReads();reads.synchronize('event');let count=0;
 await reads.read('participants',async()=>({revision:++count}));await reads.read('finance',async()=>({revision:++count}));
 reads.invalidate();assert.equal((await reads.read('participants',async()=>({revision:++count}))).revision,3);
 await assert.rejects(reads.read('finance',async()=>{throw Error('Access denied');}),/Access denied/);
 assert.equal((await reads.read('participants',async()=>({revision:++count}))).revision,4);
 let finish,signal;const pending=reads.read('finance',s=>{signal=s;return new Promise(resolve=>{finish=resolve;});});await Promise.resolve();reads.invalidate();assert.equal(signal.aborted,true);finish({});await assert.rejects(pending,{name:'AbortError'});
});

test('expired snapshots are immediately readable during refresh and rapid return joins the in-flight read',async()=>{
 let now=0;const reads=new EventPanelReads(()=>now);reads.synchronize('event');
 const original=await reads.read('finance',async()=>({revision:1}));now=5001;
 assert.equal(reads.peek('finance'),original);
 let finish;const pending=reads.read('finance',()=>new Promise(resolve=>{finish=resolve;}));await Promise.resolve();
 assert.equal(reads.peek('finance'),original);
 const returning=reads.read('finance',async()=>{throw Error('Duplicate transport');});
 finish({revision:2});assert.equal((await pending).revision,2);assert.equal(await returning,reads.peek('finance'));
 now=10002;await assert.rejects(reads.read('finance',async()=>{throw Error('Access denied');}),/Access denied/);assert.equal(reads.peek('finance'),undefined);
});
test('synchronous snapshots never survive an event/access change or mutation invalidation',async()=>{
 const reads=new EventPanelReads();reads.synchronize('event:account:proof:access');await reads.read('participants',async()=>({revision:1}));
 reads.synchronize('other-event:account:proof:access');assert.equal(reads.peek('participants'),undefined);
 await reads.read('finance',async()=>({revision:2}));reads.invalidate();assert.equal(reads.peek('finance'),undefined);
});
