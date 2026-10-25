import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';
 import AccountSecurity from './src/pages/AccountSecurity';import LocalLogin from './src/components/LocalLogin';import {capturePasswordSetup,mfaSettingsRequested} from './src/lib/google';
 export const page=value=>renderToStaticMarkup(<MemoryRouter initialEntries={['/account/security?google_mfa='+encodeURIComponent(value)]}><AccountSecurity/></MemoryRouter>);
 export const login=()=>renderToStaticMarkup(<MemoryRouter initialEntries={['/login?google=unavailable']}><LocalLogin/></MemoryRouter>);
 export const capture=()=>{capturePasswordSetup();return mfaSettingsRequested();};
 `},plugins:[{name:'fictional-signed-in-session',setup(b){b.onLoad({filter:/[\\/]src[\\/]lib[\\/]auth\.tsx$/},()=>({loader:'ts',contents:`export function useAuth(){return {session:{csrfToken:'a'.repeat(64)},status:'ready',refresh:async()=>true};}`}));}}],bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'true','import.meta.env.VITE_AUTH_MODE':'undefined'}})).outputFiles[0].text;
const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(output,import.meta.filename);const ui=compiled.exports;
test('MFA Google success and failure result pages never start setup or trust a URL as proof',()=>{
 for(const value of ['complete','cancelled','fresh-proof-unavailable','provider-validation','identity-mismatch','session-changed','confirmation-unavailable','untrusted-value','__proto__','constructor','toString']){
  const html=ui.page(value);assert.match(html,/Google confirmation/);assert.match(html,/does not start or retry/);assert.match(html,/href="\/account\/security#mfa"/);assert.doesNotMatch(html,/<form|<input|Set up MFA|otpauth:/);
  if(['untrusted-value','__proto__','constructor','toString'].includes(value))assert.doesNotMatch(html,/untrusted-value|__proto__|constructor|toString/);
 }
});
test('signed-in Google callback failure remains visible instead of redirecting to overview',()=>{
 const html=ui.login();assert.match(html,/Google confirmation unavailable/);assert.match(html,/role="alert"/);assert.match(html,/href="\/account\/security"/);assert.doesNotMatch(html,/<form|<input/);
});
test('startup preserves MFA diagnostic query without capturing it as enrollment intent',()=>{
 const previous=globalThis.window;let replaced=false;
 try{globalThis.window={location:{pathname:'/account/security',search:'?google_mfa=complete',hash:'#mfa'},history:{replaceState(){replaced=true;}}};assert.equal(ui.capture(),false);assert.equal(replaced,false);}
 finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
});
