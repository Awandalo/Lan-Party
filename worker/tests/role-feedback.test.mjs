import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=await build({entryPoints:['src/lib/role-feedback.ts'],bundle:true,write:false,platform:'node',format:'cjs'}),mod=new Module(import.meta.filename);mod._compile(output.outputFiles[0].text,import.meta.filename);const {RoleFeedback}=mod.exports;
test('feedback survives same-page refresh but navigation clears it permanently, including late responses',()=>{
 const f=new RoleFeedback();f.enter('/member','fictional-session',false);const pending=f.setter();pending('Change saved.');
 f.enter('/member',null,true);assert.equal(f.get(null),'');f.enter('/member','fictional-session',false);assert.equal(f.get('fictional-session'),'Change saved.');
 f.enter('/roles','fictional-session',false);assert.equal(f.get('fictional-session'),'');pending('Late success');assert.equal(f.get('fictional-session'),'');
 f.enter('/member','fictional-session',false);assert.equal(f.get('fictional-session'),'');
});
test('confirmed sign-out, principal and proof changes clear success/error feedback',()=>{
 for(const next of [null,'other-principal','other-proof']){
  const f=new RoleFeedback();f.enter('/roles','fictional-session',false);const pending=f.setter();pending('Conflict');f.enter('/roles',next,false);pending('Late success');assert.equal(f.get(next),'');
 }
});
