import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import RegistrationCrew from './src/components/RegistrationCrew';import RegistrationSummary from './src/components/RegistrationSummary';import MinimumAttendanceCounter from './src/components/MinimumAttendanceCounter';export const minimum=(days,needed,people)=>renderToStaticMarkup(<MinimumAttendanceCounter days={days} minimum={needed} people={people} selected={true} onSelect={()=>{}}/>);export const summary=(people,places)=>renderToStaticMarkup(<RegistrationSummary people={people} places={places}/>);export const renderWithFilters=()=>renderToStaticMarkup(<RegistrationCrew members={[]} day={null} onReset={()=>{}} filters={<nav aria-label="Filter crew"><button>All days</button></nav>}/>);export const render=(members,day)=>renderToStaticMarkup(<RegistrationCrew members={members} day={day} onReset={()=>{}}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {render,summary,renderWithFilters,minimum}=mod.exports;
test('crew uses shared cards and truthful badge placeholders; selected-day filtering excludes other members/dates',()=>{
 const members=[{id:'a',name:'Pixel <Alice>',days:['2030-11-01','2030-11-03']},{id:'b',name:'Byte Bob',days:['2030-11-02']}];
 const all=render(members,null);assert.ok(all.includes('Pixel &lt;Alice&gt;'));assert.ok(all.includes('Byte Bob'));assert.ok(all.includes('Achievement badge placeholders'));assert.ok(all.includes('Coming later'));assert.ok(all.includes('01-11-2030'));assert.equal(all.includes('<Alice>'),false);
 const filtered=render(members,'2030-11-01');assert.ok(filtered.includes('Pixel &lt;Alice&gt;'));assert.equal(filtered.includes('Byte Bob'),false);assert.equal(filtered.includes('03-11-2030'),false);assert.ok(filtered.includes('Show all days'));assert.equal(filtered.includes('aria-disabled="true"'),false);
 assert.ok(render(members,'2030-11-04').includes('No members are confirmed'));
});
test('own summary counts selected-day confirmations, not event duration or actual attendance',()=>{
 const days=['2026-11-13','2026-11-14','2026-11-15'],people=[{id:'member',name:'You',days}],places=days.map(day=>({personId:'member',day,status:'confirmed'}));
 const html=summary(people,places);assert.ok(html.includes('Registration confirmed'));assert.ok(html.includes('3 of 3 selected days are confirmed.'));assert.ok(html.includes('100%'));assert.ok(html.includes('max="3" value="3"'));assert.equal((html.match(/✓ Confirmed/g)??[]).length,3);assert.ok(html.includes('13-11-2026'));assert.match(html,/<time datetime="2026-11-13"/i);
 const one=summary([{id:'member',name:'You',days:[days[0]]}],places);assert.ok(one.includes('1 of 1 selected day is confirmed.'));assert.ok(one.includes('100%'));
});
test('mixed and waiting summaries retain queue positions and never present waitlisted days as confirmed',()=>{
 const days=['2026-11-13','2026-11-14'],people=[{id:'member',name:'You',days}],places=[{personId:'member',day:days[0],status:'confirmed'},{personId:'member',day:days[1],status:'waitlisted',position:2}];
 const mixed=summary(people,places);assert.ok(mixed.includes('Partly confirmed'));assert.ok(mixed.includes('50%'));assert.ok(mixed.includes('1 day is waitlisted.'));assert.ok(mixed.includes('Group position 2'));assert.equal((mixed.match(/✓ Confirmed/g)??[]).length,1);
 const waiting=summary(people,places.map(p=>({...p,status:'waitlisted',position:3})));assert.ok(waiting.includes('On the waitlist'));assert.ok(waiting.includes('0%'));assert.equal(waiting.includes('✓ Confirmed'),false);
});
test('member and guest confirmations stay independent and guest names remain escaped',()=>{
 const day='2026-11-13',html=summary([{id:'member',name:'You',days:[day]},{id:'guest',name:'Guest <script>',days:[day]}],[{personId:'member',day,status:'confirmed'},{personId:'guest',day,status:'waitlisted',position:1}]);
 assert.ok(html.includes('Registration confirmed'));assert.ok(html.includes('On the waitlist'));assert.ok(html.includes('Guest &lt;script&gt;'));assert.equal(html.includes('<script>'),false);
});
test('large rosters initially render 24 member cards with an explicit show-more control',()=>{
 const members=Array.from({length:1000},(_,i)=>({id:String(i),name:'Fictional member '+i,days:['2030-11-01']})),html=render(members,null);
 assert.equal((html.match(/class="registration-member-card"/g)??[]).length,24);assert.ok(html.includes('Showing 24 of 1000 confirmed members'));assert.ok(html.includes('Show more members'));
});

test('crew filters sit under the section heading without a duplicate bottom reset',()=>{const html=renderWithFilters();assert.ok(html.indexOf('Who is coming</h2>')<html.indexOf('aria-label="Filter crew"'));assert.ok(html.indexOf('aria-label="Filter crew"')<html.indexOf('registration-member-grid'));assert.equal(html.includes('Show all days'),false);assert.equal((html.match(/All days/g)??[]).length,1);});

test('event minimum uses confirmed full-event equivalents, with unique people kept separate',()=>{
 const html=minimum([{confirmed:2},{confirmed:2},{confirmed:3}],15,3);
 assert.ok(html.includes('>2.33</strong>'));assert.ok(html.includes('of 15 needed'));assert.ok(html.includes('Event minimum'));assert.ok(html.includes('Toward minimum'));assert.ok(html.includes('3 people · 7 participant-days'));assert.ok(html.includes('aria-pressed="true"'));
 const full=minimum([{confirmed:1},{confirmed:1},{confirmed:1}],1,1);assert.ok(full.includes('>1</strong>'));assert.ok(full.includes('Minimum reached'));assert.ok(full.includes('1 person · 3 participant-days'));
 const partial=minimum([{confirmed:1},{confirmed:0},{confirmed:0}],1,1);assert.ok(partial.includes('>0.33</strong>'));assert.ok(partial.includes('Toward minimum'));
 const empty=minimum([],1,0);assert.ok(empty.includes('>0</strong>'));assert.ok(empty.includes('Toward minimum'));assert.equal(empty.includes('NaN'),false);
});
