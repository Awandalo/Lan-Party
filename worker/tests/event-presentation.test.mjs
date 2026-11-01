import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import EventDescription from './src/components/EventDescription';import EventEditor from './src/components/EventEditor';export {eventInstant,eventLocalTime,eventDates} from './src/lib/event-time';export {eventLink} from './src/lib/event-content';export {RoleReadCache} from './src/lib/role-read-cache';export {logDestination,contextualNavigation} from './src/lib/navigation';export const editor=()=>renderToStaticMarkup(<EventEditor row={null} duplicate={false} templates={[]} pending={false} message="" onSave={async()=>{}} onCancel={()=>{}}/>);export const render=source=>renderToStaticMarkup(<EventDescription source={source}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'"hosted-dev"'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {render,editor,eventLink,eventInstant,eventLocalTime,eventDates,RoleReadCache,logDestination,contextualNavigation}=mod.exports;
test('description supports safe headings, emphasis, actual lists and links; untrusted HTML remains escaped text',()=>{
 const html=render('# Welcome\n**Games** and *friends*\n- cables\n- chairs\n1. setup\n2. play\n[Venue](https://example.test/maps)\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
 for(const fragment of ['<h3>Welcome</h3>','<strong>Games</strong>','<em>friends</em>','<ul><li>cables</li><li>chairs</li></ul>','<ol><li>setup</li><li>play</li></ol>','href="https://example.test/maps"','&lt;script&gt;alert(1)&lt;/script&gt;','&lt;img src=x onerror=alert(1)&gt;'])assert.ok(html.includes(fragment),fragment);
 for(const url of ['javascript:alert(1)','data:text/html,x','https://name:pass@example.test'])assert.equal(eventLink(url),null);
 assert.equal(render('[Bad](javascript:evil)'),'<div class="event-description"><p>[Bad](javascript:evil)</p></div>');
});
test('Netherlands event times round trip independent of browser zone, rejecting DST gaps and folds',()=>{
 assert.equal(eventLocalTime(Date.UTC(2030,0,5,18,30)/1000),'2030-01-05T19:30');assert.equal(eventInstant('2030-01-05T19:30'),Date.UTC(2030,0,5,18,30)/1000);
 assert.equal(eventInstant('2030-07-05T19:30'),Date.UTC(2030,6,5,17,30)/1000);for(const input of ['2030-03-31T02:30','2030-10-27T02:30','2030-02-30T12:00','invalid'])assert.equal(eventInstant(input),null);
});
test('Events-only accounts reach central Logs; losing the permission clears private cached events and fences late responses',async()=>{
 assert.equal(logDestination('/manage/logs',['events']).path,'/manage/event-activity');assert.equal(logDestination('/manage/event-activity',[]),null);assert.ok(contextualNavigation('/manage/events',['events'],true).some(n=>n.href==='/manage/logs'));
 const cache=new RoleReadCache(),state={session:{account:{userId:'fictional'},csrfToken:'proof'},status:'ready',access:{status:'ready',sections:['events']}};cache.synchronize(state);cache.read('/api/manage/events','events',async()=>({data:{private:true},message:''}));await new Promise(r=>setImmediate(r));assert.equal(cache.get('/api/manage/events').data.private,true);
 let resolve;const wait=new Promise(r=>{resolve=r;});cache.read('/api/manage/event-activity','events',()=>wait);await new Promise(r=>setImmediate(r));cache.synchronize({...state,access:{status:'ready',sections:[]}});resolve({data:{private:true},message:''});await new Promise(r=>setImmediate(r));assert.equal(cache.get('/api/manage/events'),undefined);assert.equal(cache.get('/api/manage/event-activity'),undefined);
});

test('inclusive Netherlands days handle midnight, month/year boundaries and DST without fixed-hour stepping',()=>{
 const seconds=value=>Date.parse(value)/1000;
 assert.deepEqual(eventDates(seconds('2030-11-13T17:00:00Z'),seconds('2030-11-15T18:00:00Z')),['2030-11-13','2030-11-14','2030-11-15']);
 assert.deepEqual(eventDates(seconds('2030-03-30T23:00:00Z'),seconds('2030-03-31T22:00:00Z')),['2030-03-31','2030-04-01']);
 assert.deepEqual(eventDates(seconds('2030-10-26T22:00:00Z'),seconds('2030-10-27T23:00:00Z')),['2030-10-27','2030-10-28']);
 assert.deepEqual(eventDates(seconds('2030-12-31T20:00:00Z'),seconds('2031-01-01T00:00:00Z')),['2030-12-31','2031-01-01']);
 assert.deepEqual(eventDates(seconds('2030-11-12T23:30:00Z'),seconds('2030-11-13T00:30:00Z')),['2030-11-13']);
});
test('compact creation has a completed-Location selector, two steps and no superseded manual controls',()=>{
 const html=editor();for(const label of ['Choose a completed Location','Event name','Start (Netherlands time)','End (Netherlands time)','Event description','Review &amp; Create'])assert.ok(html.includes(label),label);
 for(const label of ['Attendance date','Day capacity','Add attendance day','Venue rental (€)','Allow guests when registration launches','Street and number'])assert.equal(html.includes(label),false,label);
 assert.ok(html.includes('Only logged-in members can invite accountless guests'));
});
