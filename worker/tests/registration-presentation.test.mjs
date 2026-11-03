import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import RegistrationCrew from './src/components/RegistrationCrew';export const render=(members,day)=>renderToStaticMarkup(<RegistrationCrew members={members} day={day} onReset={()=>{}}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {render}=mod.exports;
test('crew uses shared cards and truthful badge placeholders; selected-day filtering excludes other members/dates',()=>{
 const members=[{id:'a',name:'Pixel <Alice>',days:['2030-11-01','2030-11-03']},{id:'b',name:'Byte Bob',days:['2030-11-02']}];
 const all=render(members,null);assert.ok(all.includes('Pixel &lt;Alice&gt;'));assert.ok(all.includes('Byte Bob'));assert.ok(all.includes('Achievement badge placeholders'));assert.ok(all.includes('Coming later'));assert.ok(all.includes('01-11-2030'));assert.equal(all.includes('<Alice>'),false);
 const filtered=render(members,'2030-11-01');assert.ok(filtered.includes('Pixel &lt;Alice&gt;'));assert.equal(filtered.includes('Byte Bob'),false);assert.equal(filtered.includes('03-11-2030'),false);assert.ok(filtered.includes('Show all days'));assert.equal(filtered.includes('aria-disabled="true"'),false);
 assert.ok(render(members,'2030-11-04').includes('No members are confirmed'));
});
