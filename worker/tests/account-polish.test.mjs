import assert from 'node:assert/strict';
import {test} from 'node:test';import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents: `
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';
 import Footer from './src/components/Footer';import Registration from './src/pages/Registration';
 export const footer=()=>renderToStaticMarkup(<MemoryRouter><Footer/></MemoryRouter>);
 export const registration=()=>renderToStaticMarkup(<MemoryRouter><Registration/></MemoryRouter>);
 `},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{__LAN_BUILD_SHA__:'"abc1234"','import.meta.env.DEV':'true'}});
const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(result.outputFiles[0].text,import.meta.filename);const ui=compiled.exports;
test('footer displays the supplied source build identity and preserves privacy navigation',()=>{const html=ui.footer();assert.match(html,/aria-label="Website build">Build abc1234/);assert.match(html,/href="\/privacy"/);assert.match(html,/Good friends/);assert.doesNotMatch(html,/v0\.386/);});
test('signup retains private account fields, nickname rules and accessible feedback',()=>{const html=ui.registration();for(const field of ['nickname','firstName','lastName','email','password'])assert.match(html,new RegExp('name="'+field+'"'));assert.match(html,/role="status"/);assert.match(html,/Nickname/);});
