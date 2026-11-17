import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Picker from './src/components/AchievementTitlePicker';import {achievementAwards} from './src/lib/achievements';const awards=achievementAwards([{eventId:'fictional',startsAt:1,completedAt:2,days:['1','2'],eventDays:['1','2']}]);export const render=props=>renderToStaticMarkup(<Picker awards={awards} choice="automatic" available={true} busy={false} onChange={()=>{}} {...props}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);
test('title picker offers only unlocked titles plus automatic and none with associated label/help',()=>{
 const html=mod.exports.render({});for(const value of ['Automatic (highest unlocked title)','No title','the Initiate','the LANner'])assert.ok(html.includes(value));for(const value of ['the Dedicated','the Veteran','the Legend'])assert.equal(html.includes(value),false);
 const id=html.match(/<select id="([^"]+)"/)[1],help=html.match(/aria-describedby="([^"]+)"/)[1];assert.ok(html.includes('for="'+id+'"'));assert.ok(html.includes('<p id="'+help+'"'));assert.ok(html.includes('value="automatic" selected=""'));
});
test('explicit none remains selected; unavailable migration and pending saves disable editing',()=>{
 assert.ok(mod.exports.render({choice:null}).includes('value="none" selected=""'));assert.ok(mod.exports.render({busy:true}).includes('disabled=""'));const unavailable=mod.exports.render({available:false});assert.ok(unavailable.includes('disabled=""'));assert.ok(unavailable.includes('awaiting its database update'));
});
