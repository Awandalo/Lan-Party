import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';import App from './src/App';
export const page=()=>renderToStaticMarkup(<MemoryRouter initialEntries={['/privacy']}><App/></MemoryRouter>);
`},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'undefined'}})).outputFiles[0].text;
const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(output,import.meta.filename);const html=compiled.exports.page();
test('privacy is accessible on the default public route without enabling account forms',()=>{assert.match(html,/<h1 id="privacy-title">Privacy Policy/);assert.doesNotMatch(html,/<form|Page not found/);assert.match(html,/href="\/privacy"/);});
test('privacy discloses backup resurrection and no identifying deletion registry without inventing immediate erasure',()=>{assert.match(html,/Restoring an older database backup can restore account data deleted/);assert.match(html,/do not keep a separate identifying deletion registry/);assert.match(html,/not immediately erased/);assert.match(html,/deletion again/);});
test('privacy retains approved public identity/contact and password/MFA scope',()=>{assert.match(html,/LAN Party Organizers/);assert.match(html,/mailto:privacy@lan-party.club/);assert.match(html,/optional MFA/);assert.doesNotMatch(html,/Google sign-in|No automatic account-deletion service/);});
