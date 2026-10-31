import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import SwitchInput from './src/components/SwitchInput';
 export const render=(props)=>renderToStaticMarkup(<label><SwitchInput {...props}/>Fictional confirmation</label>);
 `},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'}})).outputFiles[0].text;
const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(output,import.meta.filename);
test('shared switch retains native required form fields and accessible label association',()=>{
 const html=compiled.exports.render({id:'recovery-saved',name:'confirmed',required:true,defaultChecked:true,'aria-describedby':'fictional-help'});
 assert.match(html,/type="checkbox"/);assert.match(html,/role="switch"/);assert.match(html,/id="recovery-saved"/);assert.match(html,/name="confirmed"/);assert.match(html,/required=""/);assert.match(html,/checked=""/);assert.match(html,/aria-describedby="fictional-help"/);
 assert.ok(html.startsWith('<label>'));assert.ok(html.endsWith('Fictional confirmation</label>'));
});
test('shared switch preserves controlled and disabled confirmation states',()=>{
 const html=compiled.exports.render({checked:false,disabled:true,onChange:()=>{}});
 assert.match(html,/disabled=""/);assert.doesNotMatch(html,/checked=""/);assert.match(html,/aria-hidden="true"/);
});
