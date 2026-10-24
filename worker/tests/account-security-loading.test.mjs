import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';
 import {AuthProvider} from './src/lib/auth';import AccountSecurity from './src/pages/AccountSecurity';import MfaSettings from './src/components/MfaSettings';
 export const page=()=>renderToStaticMarkup(<MemoryRouter initialEntries={['/account/security']}><AuthProvider><AccountSecurity/></AuthProvider></MemoryRouter>);
 export const mfa=()=>renderToStaticMarkup(<MfaSettings csrf={'a'.repeat(64)} methods={null} open={false} disabled={false} onOpen={()=>{}} onBusy={()=>{}} onActivated={async()=>{}}/>);
 `},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'true','import.meta.env.VITE_AUTH_MODE':'undefined'}})).outputFiles[0].text;
const prior=globalThis.window;
try{
 globalThis.window={location:{origin:'http://127.0.0.1',search:'',pathname:'/account/security'}};
 const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(output,import.meta.filename);
 const ui=compiled.exports;
 test('Account Security renders a complete loading shell before authentication resolves, without actionable settings',()=>{
  const html=ui.page();assert.match(html,/<h1>Account security<\/h1>/);assert.match(html,/Connected accounts/);assert.match(html,/Two-factor authentication/);assert.match(html,/Checking your session/);assert.doesNotMatch(html,/<button|Verified|Connected<\/dd>|recovery code remaining/);
 });
 test('independent MFA loading cannot enable actions before methods and server status are available',()=>{
  const html=ui.mfa();assert.match(html,/Checking MFA status/);assert.doesNotMatch(html,/<button|Regenerate recovery codes|Replace authenticator/);
 });
}finally{after(()=>{if(prior===undefined)delete globalThis.window;else globalThis.window=prior;});}