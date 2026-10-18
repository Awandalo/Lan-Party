import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const code=(await build({entryPoints:['worker/auth/google-profile.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
const {googleNameSuggestions,encodeGoogleProfile,decodeGoogleProfile}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const secret='22'.repeat(32),state='ab'.repeat(32);
test('name suggestions reuse account rules independently and preserve display text',()=>{
 assert.deepEqual(googleNameSuggestions({given_name:'Fictional',family_name:'Tést Person'}),{firstName:'Fictional',lastName:'Tést Person'});
 assert.deepEqual(googleNameSuggestions({given_name:'Fictional',family_name:null}),{firstName:'Fictional'});
 for(const name of ['',123,' Leading','Trailing ','Line\nBreak','x'.repeat(101),'\ud800'])assert.deepEqual(googleNameSuggestions({given_name:name,family_name:name}),{});
});
test('profile hints expire, bind to their original transaction and reject tampering or unrelated keys',async()=>{
 const names={firstName:'Fictional',lastName:'Tester'},value=await encodeGoogleProfile(names,state,1200,secret);
 assert.deepEqual(await decodeGoogleProfile(value,state,secret,1199),names);
 assert.deepEqual(await decodeGoogleProfile(value,state,secret,1200),{});
 assert.deepEqual(await decodeGoogleProfile(value,'cd'.repeat(32),secret,1199),{});
 assert.deepEqual(await decodeGoogleProfile(value,state,'33'.repeat(32),1199),{});
 for(const input of [value+'.extra','x'.repeat(2049),'invalid.payload',value.replace(/^./,value[0]==='a'?'b':'a')])assert.deepEqual(await decodeGoogleProfile(input,state,secret,1199),{});
});
