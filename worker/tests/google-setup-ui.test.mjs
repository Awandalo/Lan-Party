import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const code=(await build({entryPoints:['src/lib/google.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
const ui=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('Google reauthentication return expands setup without retaining a password or email token',()=>{
 const previous=globalThis.window;
 try{
  for(const [hash,expected] of [['#add-password',true],['#setup='+'ab'.repeat(32),false],['#add-password&other=1',false],['',false]]){
   let replaced;globalThis.window={location:{pathname:'/account/security',hash},history:{replaceState(_a,_b,path){replaced=path;}}};
   ui.capturePasswordSetup();assert.equal(ui.passwordSetupRequested(),expected);assert.equal(replaced,'/account/security');
   ui.clearPasswordSetup();assert.equal(ui.passwordSetupRequested(),false);
  }
  assert.equal(ui.passwordSetupToken,undefined);
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
