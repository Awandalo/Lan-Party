import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
async function load(path){const r=await build({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs'}),m=new Module(import.meta.filename);m._compile(r.outputFiles[0].text,import.meta.filename);return m.exports;}
const nav=await load('src/lib/navigation.ts'),dto=await load('src/lib/user-activity.ts'),{RoleReadCache}=await load('src/lib/role-read-cache.ts');
test('context menus derive from routes, omit empty areas and retain authorized order',()=>{
 const all=['users','roles','events','activity','userActivity'];
 for(const route of ['/','/events','/privacy','/reactivate'])assert.deepEqual(nav.contextualNavigation(route,all,true),[]);
 assert.deepEqual(nav.contextualNavigation('/manage/users/fictional',all,true).map(x=>x.label),['Overview','Events','Members','Roles & Permissions','Logs']);
 assert.deepEqual(nav.contextualNavigation('/account/security',[],true).map(x=>x.href),['/account','/account/security']);
 assert.deepEqual(nav.contextualNavigation('/account/security',[],false),[]);
 assert.deepEqual(nav.contextualNavigation('/manage/activity',['roles'],true).map(x=>x.label),['Overview','Roles & Permissions']);
 assert.ok(nav.isLogs('/manage/activity'));assert.ok(nav.isLogs('/manage/user-activity'));assert.equal(nav.mainArea('/management'),null);
});
test('User Log contract rejects role payloads and identifying anonymized records',()=>{
 const e={sequence:'1',occurredAt:1793318400,event:'account.deleted',actorKind:'anonymous',dateOnly:1,actorId:null,targetId:null,operationId:null,actorName:null,targetName:null};
 assert.ok(dto.validUserActivity({entries:[e],nextBefore:null}));assert.match(dto.userActivityTime(e),/UTC day; time removed/);
 for(const patch of [{actorId:'fictional'},{actorName:'Former name'},{dateOnly:0},{event:'invitation.delivered'},{sequence:'9223372036854775808'}])assert.equal(dto.validUserActivity({entries:[{...e,...patch}],nextBefore:null}),false);
 assert.equal(dto.validUserActivity({entries:[{roleId:'role',delta:'{}'}],nextBefore:null}),false);
 assert.equal(dto.userActivityLabels['invitation.accepted'],'Provider accepted submission');
});
test('User Log cache never applies late records after role loss or identity switch',async()=>{
 for(const next of ['other','revoked']){
  const cache=new RoleReadCache(),state={session:{account:{userId:'fictional'},csrfToken:'proof'},status:'ready',access:{status:'ready',sections:['userActivity']}};
  cache.synchronize(state);let resolve;const waiting=new Promise(r=>resolve=r);cache.read('/api/manage/user-activity','userActivity',()=>waiting);await new Promise(r=>setImmediate(r));
  cache.synchronize(next==='other'?{...state,session:{...state.session,account:{userId:'other'}}}:{...state,access:{status:'ready',sections:[]}});
  resolve({data:{entries:['private']},message:''});await new Promise(r=>setImmediate(r));assert.equal(cache.get('/api/manage/user-activity'),undefined);
 }
});
