import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import RegistrationRoster from './src/components/RegistrationRoster';export const render=(people,day=null,reviewed=false)=>renderToStaticMarkup(<RegistrationRoster people={people} day={day} reviewed={reviewed} onShowAll={()=>{}}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {render}=mod.exports;
const people=[{id:'alice',owner:'alice',kind:'Member',name:'Pixel Alice',places:[{day:'2030-11-01',status:'confirmed'},{day:'2030-11-02',status:'waitlisted',position:2}]},{id:'nova',owner:'alice',kind:'Invited guest',name:'Guest <Nova>',places:[{day:'2030-11-02',status:'waitlisted',position:2}]}];
test('compact roster starts collapsed and preserves names, guest types and queue positions',()=>{
 const html=render(people);
 assert.ok(html.startsWith('<details class="participant-roster">'));
 assert.ok(html.includes('2 people · All days'));
 assert.ok(html.includes('Pixel Alice'));assert.ok(html.includes('Invited guest'));assert.ok(html.includes('Guest &lt;Nova&gt;'));
 assert.ok(html.includes('01-11-2030'));assert.ok(html.includes('Confirmed'));assert.ok(html.includes('Waiting · position 2'));
 assert.equal(html.includes('Achievements'),false);
});
test('selected-day roster shows only that day and offers the all-days reset; reviewed attendance stays distinct',()=>{
 const html=render(people,'2030-11-02',true);
 assert.equal(html.includes('01-11-2030'),false);assert.ok(html.includes('02-11-2030'));assert.ok(html.includes('>All days</button>'));assert.ok(html.includes('Waiting · position 2'));
 const attended=render(people,'2030-11-01',true);assert.ok(attended.includes('Attended'));assert.equal(attended.includes('Confirmed'),false);
 assert.ok(render([],'2030-11-01').includes('No registrations for 01-11-2030 yet.'));
});
