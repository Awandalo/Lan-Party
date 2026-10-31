import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=await build({entryPoints:['src/lib/role-presentation.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
const mod=new Module(import.meta.filename);mod._compile(output.outputFiles[0].text,import.meta.filename);
const {roleDraft,draftValid,normalizeRoleDraft,defaultRoleCode,enabledGroups,permissionLabel,sameRoleDraft,roleIcon}=mod.exports;
const catalogue={roles:[],permissions:[{id:'one',code:'events.create'},{id:'two',code:'events.publish'},{id:'three',code:'news.create'}],mappings:[{roleId:'fictional',permissionId:'one',grantedAt:0},{roleId:'fictional',permissionId:'two',grantedAt:0}]};
test('friendly grouping retains permission IDs and cannot grant a category implicitly',()=>{
 const original=structuredClone(catalogue),draft=roleDraft(catalogue);assert.deepEqual(draft.permissionIds,[]);
 assert.deepEqual(enabledGroups(catalogue,draft.permissionIds),[]);assert.deepEqual(catalogue,original);
 const existing=roleDraft(catalogue,{id:'fictional',code:'fictional',name:'Fictional',description:null,isActive:1,isProtected:0});
 assert.deepEqual(existing.permissionIds,['one','two']);assert.deepEqual(enabledGroups(catalogue,existing.permissionIds),['events']);assert.equal(permissionLabel('events.create'),'Create events');assert.deepEqual(catalogue,original);
});
test('wizard normalizes metadata before enforcing backend identifier and text boundaries',()=>{
 const draft={...roleDraft(catalogue),code:defaultRoleCode('Fictional Event Crew'),name:'Fictional Event Crew'};assert.equal(draft.code,'fictional_event_crew');assert.equal(draftValid(draft),true);
 for(const code of ['x','1crew','crew_','Uppercase','a'.repeat(41)])assert.equal(draftValid({...draft,code}),false);
 for(const name of ['','   ','New\nline','a'.repeat(81)])assert.equal(draftValid({...draft,name}),false);
 for(const name of [' Leading','Trailing ']){assert.equal(draftValid({...draft,name}),true);assert.equal(normalizeRoleDraft({...draft,name}).name,name.trim());}
 assert.equal(draftValid({...draft,description:'a'.repeat(401)}),false);
});
test('dirty state ignores permission order and resets when edits return to the saved values',()=>{
 const baseline={...roleDraft(catalogue),code:'fictional',name:'Fictional',permissionIds:['one','two']};
 assert.equal(sameRoleDraft(baseline,{...baseline,permissionIds:['two','one']}),true);
 for(const delta of [{name:'Changed'},{description:'Changed'},{active:false},{protected:true},{permissionIds:['one']},{permissionIds:['one','two','three']}])assert.equal(sameRoleDraft(baseline,{...baseline,...delta}),false);
 assert.equal(sameRoleDraft(baseline,structuredClone(baseline)),true);
});
test('role icons follow saved category and immutable identity, never names or protection flags',()=>{
 const role={id:'fictional',code:'fictional',name:'Fictional role',isActive:1,isProtected:0,description:null};
 assert.equal(roleIcon(catalogue,role),'calendar');
 assert.equal(roleIcon(catalogue,{...role,name:'Administrator',isProtected:1}),'calendar');
 assert.equal(roleIcon(catalogue,{...role,id:'1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7'}),'shield');
 assert.equal(roleIcon(catalogue,{...role,id:'193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f'}),'users');
 const mixed={...catalogue,mappings:[...catalogue.mappings,{roleId:role.id,permissionId:'three',grantedAt:0}]};
 assert.equal(roleIcon(mixed,role),'grid');
 assert.equal(roleIcon({...catalogue,mappings:[]},role),'grid');
 assert.equal(roleIcon({permissions:[{id:'manage',code:'roles.manage'}],mappings:[{roleId:role.id,permissionId:'manage',grantedAt:0}]},role),'grid');
});
