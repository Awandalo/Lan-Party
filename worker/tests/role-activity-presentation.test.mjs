import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({entryPoints:['src/lib/role-activity.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),mod=new Module(import.meta.filename);mod._compile(result.outputFiles[0].text,import.meta.filename);const {activityChanges,membershipAction}=mod.exports;
test('activity details do not invent historical metadata and preserve the original record',()=>{
 const entry={operation:'role.update',delta:JSON.stringify({fields:['name','description'],active:{before:1,after:1},permissions:{before:[],after:['fictional']}})},before=structuredClone(entry);
 assert.deepEqual(activityChanges(entry,[{id:'fictional',code:'news.create'}]),[{field:'Role name',before:'Not retained',after:'Not retained'},{field:'Description',before:'Not retained',after:'Not retained'},{field:'Permissions',before:'None',after:'Write news'}]);assert.deepEqual(entry,before);
});
test('membership and flag deltas have readable before/after values, with safe malformed-record fallback',()=>{
 assert.deepEqual(activityChanges({operation:'membership.remove',delta:'{"assigned":{"before":true,"after":false}}'}),[{field:'Membership',before:'Assigned',after:'Not assigned'}]);
 assert.deepEqual(activityChanges({operation:'role.update',delta:'{"active":{"before":1,"after":0},"protected":{"before":0,"after":1}}'}),[{field:'Role status',before:'Active',after:'Inactive'},{field:'Administrator protection',before:'Ordinary',after:'Protected'}]);
 assert.deepEqual(activityChanges({operation:'role.update',delta:'invalid JSON'}),[]);
});
test('membership wording identifies role and member with safe unavailable-name fallbacks',()=>{
 const entry={operation:'membership.add',roleName:'Administrator',accountName:'Fictional Member'};
 assert.equal(membershipAction(entry),'Administrator assigned to Fictional Member');
 assert.equal(membershipAction({...entry,operation:'membership.remove'}),'Administrator removed from Fictional Member');
 assert.equal(membershipAction({...entry,accountName:null}),'Administrator assigned to Former or unavailable member');
 assert.equal(membershipAction({...entry,roleName:null}),'Unavailable role assigned to Fictional Member');
 assert.equal(membershipAction({...entry,operation:'role.update'}),null);
});

test('deleted role details describe removal without retaining its historical name',()=>{
 assert.deepEqual(activityChanges({operation:'role.delete',roleName:null,delta:'{"deleted":{"before":false,"after":true},"permissions":{"before":["fictional"],"after":[]}}'},[{id:'fictional',code:'news.create'}]),[{field:'Role',before:'Existed',after:'Deleted'},{field:'Permissions',before:'Write news',after:'None'}]);
});
