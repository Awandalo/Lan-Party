import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const built=await build({entryPoints:['src/lib/session-validation.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod=new Module(import.meta.filename);mod._compile(built.outputFiles[0].text,import.meta.filename);const {SessionValidation}=mod.exports;
const session=(id='fictional-a',csrf='a')=>({account:{userId:id,nickname:'Fictional',memberNumber:'1'},csrfToken:csrf.repeat(64),emailVerified:true});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){const calls=[],states=[];const transport=(path,options)=>{const d=deferred();calls.push({path,options,...d});return d.promise};const model=new SessionValidation(s=>states.push(s),transport,true);return{model,calls,states};}
async function ready(f,sections=['users','roles','events']){const p=f.model.refresh();f.calls.at(-1).resolve(Response.json(session()));await tick();f.calls.at(-1).resolve(Response.json({sections}));await p;}
test('session then one capability request; overlapping navigation deduplicates and same-context hints never disappear',async()=>{
 const f=fixture();await ready(f);assert.equal(f.calls.length,2);const p=f.model.refresh(),q=f.model.refresh();assert.equal(p,q);assert.deepEqual(f.model.state.access.sections,['users','roles','events']);
 assert.equal(f.calls.length,3);f.calls[2].resolve(Response.json(session()));await tick();assert.equal(f.calls.length,4);assert.deepEqual(f.model.state.access.sections,['users','roles','events']);f.calls[3].resolve(Response.json({sections:['events']}));await p;assert.deepEqual(f.model.state.access.sections,['events']);
});
test('forced refresh fences older session and capability responses in either order',async()=>{
 const f=fixture();const old=f.model.refresh(),newer=f.model.refresh(true);f.calls[1].resolve(Response.json(session('new')));await tick();f.calls[2].resolve(Response.json({sections:['events']}));await newer;f.calls[0].resolve(Response.json(session('old')));await old;assert.equal(f.model.state.session.account.userId,'new');assert.equal(f.calls.length,3);
 const pending=f.model.refresh();f.calls.at(-1).resolve(Response.json(session('new')));await tick();const oldCap=f.calls.at(-1);const next=f.model.refresh(true);f.calls.at(-1).resolve(Response.json(session('third')));await tick();f.calls.at(-1).resolve(Response.json({sections:['roles']}));await next;oldCap.resolve(Response.json({sections:['users']}));await pending;assert.deepEqual(f.model.state.access.sections,['roles']);
});
test('principal or CSRF context changes clear hints before new capabilities; cross-tab invalidation fences pending reads',async()=>{
 const f=fixture();await ready(f);let p=f.model.refresh();f.calls.at(-1).resolve(Response.json(session('fictional-b')));await tick();assert.deepEqual(f.model.state.access.sections,[]);assert.equal(f.model.state.access.status,'loading');f.model.invalidate();f.calls.at(-1).resolve(Response.json({sections:['roles']}));await p;assert.equal(f.model.state.session,null);
 await ready(f);p=f.model.refresh();f.calls.at(-1).resolve(Response.json(session('fictional-a','b')));await tick();assert.deepEqual(f.model.state.access.sections,[]);f.calls.at(-1).resolve(Response.json({sections:[]}));await p;
});
test('401/403, 503, network and timeout have distinct outcomes with no retry loops',async()=>{
 for(const failure of [401,403,503,'network','timeout']){
 const f=fixture();await ready(f);const p=f.model.refresh();f.calls.at(-1).resolve(Response.json(session()));await tick();const c=f.calls.at(-1);if(typeof failure==='number')c.resolve(new Response('{}',{status:failure}));else c.reject(new DOMException('Fictional failure',failure==='timeout'?'TimeoutError':'NetworkError'));await p;
 assert.equal(f.calls.length,4);assert.deepEqual(f.model.state.access.sections,[]);assert.equal(f.model.state.access.status,[401,403].includes(failure)?'ready':'error');assert.equal(f.model.state.session===null,failure===401);
 }
});
test('session denial/outage never starts capabilities or restores old grants',async()=>{
 for(const status of [401,403,503]){const f=fixture();await ready(f);const p=f.model.refresh();f.calls.at(-1).resolve(new Response('{}',{status}));await p;assert.equal(f.calls.length,3);assert.equal(f.model.state.session,null);assert.equal(f.model.state.status,status===503?'error':'ready');}
});
test('production auth refresh never requests administration capabilities',async()=>{const calls=[];const f=new SessionValidation(()=>{},async path=>{calls.push(path);return Response.json(session())},false);await f.refresh();assert.deepEqual(calls,['/api/auth/session']);assert.deepEqual(f.state.access.sections,[]);});
test('session-context conflict clears identity, sends correlation proof and never retries',async()=>{const f=fixture();await ready(f);const p=f.model.refresh();f.calls.at(-1).resolve(Response.json(session()));await tick();assert.equal(f.calls.at(-1).options.headers['X-LAN-Session-Proof'],session().csrfToken);f.calls.at(-1).resolve(new Response('{}',{status:409}));await p;assert.equal(f.model.state.session,null);assert.equal(f.model.state.status,'error');assert.deepEqual(f.model.state.access.sections,[]);assert.equal(f.calls.length,4);});
test('confirmed logout immediately clears state and fences old responses without another request',async()=>{const f=fixture();await ready(f);const pending=f.model.refresh();const old=f.calls.at(-1);f.model.signedOut();old.resolve(Response.json(session()));await pending;assert.equal(f.model.state.session,null);assert.equal(f.model.state.status,'ready');assert.deepEqual(f.model.state.access.sections,[]);assert.equal(f.calls.length,3);});
test('capability outage does not report a valid login or MFA refresh as failed authentication',async()=>{const f=fixture();const p=f.model.refresh();f.calls[0].resolve(Response.json(session()));await tick();f.calls[1].resolve(new Response('{}',{status:503}));assert.equal(await p,true);assert.equal(f.model.state.status,'ready');assert.equal(f.model.state.access.status,'error');assert.deepEqual(f.model.state.access.sections,[]);});
test('one validation revision covers background session and capability checks without removing current access',async()=>{
 const f=fixture();await ready(f);const initial=f.model.state.access.revision,p=f.model.refresh();const revision=f.model.state.access.revision;
 assert.ok(revision>initial);assert.equal(f.model.state.access.revalidating,true);
 f.calls.at(-1).resolve(Response.json(session()));await tick();assert.equal(f.model.state.access.revision,revision);
 f.calls.at(-1).resolve(Response.json({sections:['users']}));await p;assert.equal(f.model.state.access.revision,revision);assert.equal(f.model.state.access.revalidating,undefined);
});
