import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import RolePermissions from './src/components/RolePermissions';
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';
 import {AuthProvider} from './src/lib/auth';import AccountSecurity from './src/pages/AccountSecurity';import MfaSettings from './src/components/MfaSettings';import MfaManagement from './src/components/MfaManagement';import MfaEnrollment from './src/components/MfaEnrollment';import SecurityActionIcon from './src/components/SecurityActionIcon';import {LifecycleProof} from './src/components/AccountLifecycle';
 export const permissions=()=>renderToStaticMarkup(<RolePermissions catalogue={{permissions:[{id:'fictional-event',code:'events.create',description:'Fictional event permission',protected:false},{id:'fictional-news',code:'news.create',description:'Fictional news permission',protected:false}],roles:[],mappings:[],administrator:false}} ids={['fictional-news']} editing={false} onChange={()=>{}}/>);
 export const proof=()=>renderToStaticMarkup(<LifecycleProof csrf={'a'.repeat(64)} onConfirmed={async()=>{}} onCancel={()=>{}}/>);
 export const enrollment=()=>renderToStaticMarkup(<MfaEnrollment csrf={'a'.repeat(64)} open={false} disabled={false}/>);
 export const trash=()=>renderToStaticMarkup(<SecurityActionIcon action="trash"/>);
 export const management=()=>renderToStaticMarkup(<MfaManagement csrf={'a'.repeat(64)} methods={{password:true}} open={false} disabled={false} onOpen={()=>{}} onBusy={()=>{}} onActivated={async()=>{}}/>);
 export const page=()=>renderToStaticMarkup(<MemoryRouter initialEntries={['/account/security']}><AuthProvider><AccountSecurity/></AuthProvider></MemoryRouter>);
 export const mfa=()=>renderToStaticMarkup(<MfaSettings csrf={'a'.repeat(64)} methods={null} open={false} disabled={false} onOpen={()=>{}} onBusy={()=>{}} onActivated={async()=>{}}/>);
 `},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'true','import.meta.env.VITE_AUTH_MODE':'undefined'}})).outputFiles[0].text;
const prior=globalThis.window;
try{
 globalThis.window={location:{origin:'http://127.0.0.1',search:'',pathname:'/account/security'}};
 const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(output,import.meta.filename);
 const ui=compiled.exports;
 test('permission categories start collapsed even when a saved role has grants',()=>{const html=ui.permissions();assert.doesNotMatch(html,/aria-expanded="true"/);assert.ok((html.match(/aria-expanded="false"/g)??[]).length>=2);assert.match(html,/>Expand all<\/button>/);assert.match(html,/aria-label="Write news"[^>]*checked=""/);});
 test('Account Security renders a complete loading shell before authentication resolves, without actionable settings',()=>{
  const html=ui.page();assert.match(html,/<h1>Account security<\/h1>/);assert.match(html,/Sign-in method/);assert.match(html,/Two-factor authentication/);assert.match(html,/Checking your session/);assert.doesNotMatch(html,/<button|Verified|Connected<\/dd>|recovery code remaining/);
 });
 test('independent MFA loading cannot enable actions before methods and server status are available',()=>{
  const html=ui.mfa();assert.match(html,/Checking MFA status/);assert.doesNotMatch(html,/<button|Regenerate recovery codes|Replace authenticator/);
 });
 test('lifecycle password confirmation keeps Confirm and Cancel in one action row',()=>{const html=ui.proof();assert.match(html,/class="lifecycle-actions"/);assert.match(html,/Confirm and continue<\/button><button[^>]+>Cancel/);assert.equal((html.match(/>Cancel</g)??[]).length,1);});
 test('MFA enrollment and enabled management retain accessible shield toggles while closed',()=>{
  assert.match(ui.enrollment(),/aria-label="Set up MFA"/);assert.match(ui.enrollment(),/aria-expanded="false"/);
  assert.match(ui.management(),/aria-label="Manage MFA"/);assert.match(ui.trash(),/aria-hidden="true"/);
 });
 test('authenticator management starts collapsed with accessible controls and does not unmount its operation views',()=>{
  const html=ui.management();assert.match(html,/aria-expanded="false"/);assert.match(html,/aria-controls="mfa-options"/);assert.match(html,/<div id="mfa-options" hidden="">/);assert.match(html,/Regenerate recovery codes/);assert.match(html,/Replace authenticator/);
 });
}finally{after(()=>{if(prior===undefined)delete globalThis.window;else globalThis.window=prior;});}