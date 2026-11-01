import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const built=await build({stdin:{resolveDir:process.cwd(),contents:`
 export {prefetchLog} from './src/lib/use-navigation-prefetch';
 export {logDestination} from './src/lib/navigation';
 export {loadRoleRead} from './src/lib/roles';
 export {loadUserActivity} from './src/lib/use-user-activity';
 export {RoleReadCache} from './src/lib/role-read-cache';
 `},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'true','import.meta.env.VITE_AUTH_MODE':'"hosted-dev"'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(built.outputFiles[0].text,import.meta.filename);
const {prefetchLog,logDestination,loadRoleRead,loadUserActivity,RoleReadCache}=mod.exports;
const proof='a'.repeat(64),sections=['activity','userActivity'];
const state=(allowed=sections,id='fictional')=>({session:{account:{userId:id},csrfToken:proof},status:'ready',access:{sections:allowed,status:'ready',authorization:'b'.repeat(64)}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const page={entries:[],nextBefore:null};
async function transport(run){const original=globalThis.fetch,calls=[];globalThis.fetch=async(path,options)=>{calls.push({path,options});return Response.json(page);};try{await run(calls);}finally{globalThis.fetch=original;}}

test('Logs intent resolves the same landing destination and independently gates each log tab',()=>{
 assert.equal(logDestination('/manage/logs',sections).section,'activity');
 assert.equal(logDestination('/manage/logs',['userActivity']).section,'userActivity');
 assert.equal(logDestination('/manage/activity',['userActivity']),null);
 assert.equal(logDestination('/manage/user-activity',['activity']),null);
 assert.equal(logDestination('/manage/logs',['roles','users']),null);
 assert.equal(logDestination('/manage/users',sections),null);
});
test('prefetch and mount share one authorized request for each log and retain data during stale refresh',()=>transport(async calls=>{
 let now=10000;const c=new RoleReadCache(()=>now);c.synchronize(state());
 for(const [path,api,section,load] of [['/manage/logs','/api/manage/role-activity','activity',s=>loadRoleRead('/api/manage/role-activity','activity',proof,s)],['/manage/user-activity','/api/manage/user-activity','userActivity',s=>loadUserActivity('/api/manage/user-activity',proof,s)]]){
  const before=calls.length;prefetchLog(path,sections,c,proof);prefetchLog(path,sections,c,proof);await tick();
  assert.deepEqual(c.get(api).data,page);c.read(api,section,load,5000);await tick();assert.equal(calls.length,before+1);
  const call=calls.at(-1);assert.equal(call.path,api);assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.redirect,'error');assert.equal(call.options.headers['X-LAN-Session-Proof'],proof);
  now+=5000;let complete;const wait=new Promise(resolve=>{complete=resolve;});c.read(api,section,()=>wait,5000);await tick();assert.deepEqual(c.get(api).data,page);assert.equal(c.get(api).loading,true);complete({data:page,message:''});await tick();
 }
}));
test('User Log-only access prefetches its landing page and never reads Role Activity',()=>transport(async calls=>{
 const c=new RoleReadCache();c.synchronize(state(['userActivity']));prefetchLog('/manage/logs',['userActivity'],c,proof);prefetchLog('/manage/activity',['userActivity'],c,proof);await tick();assert.deepEqual(calls.map(c=>c.path),['/api/manage/user-activity']);
 c.synchronize(state(['roles']));prefetchLog('/manage/logs',['roles'],c,proof);await tick();assert.equal(calls.length,1);assert.equal(c.get('/api/manage/user-activity'),undefined);
}));
test('filters use separate cache entries and explicit reload bypasses fresh User Log data',()=>transport(async calls=>{
 const c=new RoleReadCache();c.synchronize(state());const api='/api/manage/user-activity',filtered=api+'?event=account.created';
 prefetchLog('/manage/user-activity',sections,c,proof);await tick();
 c.read(filtered,'userActivity',s=>loadUserActivity(filtered,proof,s),5000);await tick();assert.equal(calls.length,2);assert.deepEqual(c.get(api).data,page);
 c.expire(api);c.read(api,'userActivity',s=>loadUserActivity(api,proof,s),5000);await tick();assert.equal(calls.length,3);
}));
test('denied and malformed User Log prefetch erase other cached log data without retrying',async()=>{
 for(const response of [()=>new Response('{}',{status:403}),()=>Response.json({entries:[{event:'invented'}],nextBefore:null})]){
  const original=globalThis.fetch,c=new RoleReadCache();c.synchronize(state());let calls=0;
  try{globalThis.fetch=async()=>{calls++;return Response.json(page);};prefetchLog('/manage/activity',sections,c,proof);await tick();globalThis.fetch=async()=>{calls++;return response();};prefetchLog('/manage/user-activity',sections,c,proof);await tick();assert.equal(c.get('/api/manage/role-activity'),undefined);assert.equal(c.get('/api/manage/user-activity').data,null);assert.ok(c.get('/api/manage/user-activity').message);assert.equal(calls,2);}finally{globalThis.fetch=original;}
 }
});
