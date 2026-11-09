import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
test('fictional registration preview is restricted to loopback development and canonical hosted DEV',async()=>{
 const previous=globalThis.window;
 try{
  for(const [dev,mode] of [[true,''],[false,''],[false,'hosted-dev'],[false,'hosted-prod']]){
   const result=await build({entryPoints:['src/lib/registration-preview-mode.ts'],bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.env.DEV':String(dev),'import.meta.env.VITE_AUTH_MODE':JSON.stringify(mode)}});
   const {registrationPreviewEnabled}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
   for(const origin of ['http://127.0.0.1:5175','http://localhost:5173','http://[::1]:5175','https://dev.lan-party.club','https://www.lan-party.club','https://lan-party.club','https://lan-party-dev.servok.workers.dev','https://example.test','http://example.test','https://localhost:5175','https://dev.lan-party.club.evil.test','http://dev.lan-party.club']){
    globalThis.window={location:{origin}};
    assert.equal(registrationPreviewEnabled(),dev&&['http://127.0.0.1:5175','http://localhost:5173','http://[::1]:5175'].includes(origin)||mode==='hosted-dev'&&origin==='https://dev.lan-party.club',`${dev}/${mode}/${origin}`);
   }
   delete globalThis.window;assert.equal(registrationPreviewEnabled(),false);
  }
 }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
