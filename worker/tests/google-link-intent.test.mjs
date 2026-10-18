import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const code=(await build({entryPoints:['src/lib/google-link-intent.ts'],bundle:true,write:false,format:'esm',platform:'node'})).outputFiles[0].text;
const {GoogleLinkIntent}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('link continuation requires explicit intent, matches the session and consumes once',()=>{
 const intent=new GoogleLinkIntent();assert.equal(intent.consume('session-a',0),false);
 intent.begin('session-a',100);assert.equal(intent.consume('session-a',101),true);
 assert.equal(intent.consume('session-a',102),false);
 intent.begin('session-a',100);assert.equal(intent.consume('session-b',101),false);
 assert.equal(intent.consume('session-a',102),false);
});
test('expired linking intent fails closed and a remounted page has no continuation',()=>{
 const intent=new GoogleLinkIntent();intent.begin('session-a',100);
 assert.equal(intent.consume('session-a',300100),false);
 assert.equal(new GoogleLinkIntent().consume('session-a',101),false);
});
