import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import EventDescription from './src/components/EventDescription';import EventEditor from './src/components/EventEditor';export {eventInputErrors,formatEventDateEntry,eventInputFromInstant,eventInputDate,resolveEventInput} from './src/lib/event-date-input';export {eventInstant,eventLocalTime,eventDates} from './src/lib/event-time';export {validateEventDocument,eventDocument} from './src/lib/event-document';export {eventLink} from './src/lib/event-content';export {RoleReadCache} from './src/lib/role-read-cache';export {routeLabel,logDestination,contextualNavigation} from './src/lib/navigation';export const editor=()=>renderToStaticMarkup(<EventEditor row={null} duplicate={false} templates={[]} pending={false} message="" onSave={async()=>{}} onCancel={()=>{}}/>);export const render=source=>renderToStaticMarkup(<EventDescription source={source}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'"hosted-dev"'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {eventInputErrors,formatEventDateEntry,eventInputFromInstant,eventInputDate,resolveEventInput,render,editor,validateEventDocument,eventDocument,eventLink,eventInstant,eventLocalTime,eventDates,RoleReadCache,routeLabel,logDestination,contextualNavigation}=mod.exports;
test('description supports safe headings, emphasis, actual lists and links; untrusted HTML remains escaped text',()=>{
 const html=render('# Welcome\n**Games** and *friends*\n- cables\n- chairs\n1. setup\n2. play\n[Venue](https://example.test/maps)\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>');
 for(const fragment of ['<h2>Welcome</h2>','<strong>Games</strong>','<em>friends</em>','<ul><li><p>cables</p></li><li><p>chairs</p></li></ul>','<li><p>setup</p></li><li><p>play</p></li>','href="https://example.test/maps"','&lt;script&gt;alert(1)&lt;/script&gt;','&lt;img src=x onerror=alert(1)&gt;'])assert.ok(html.includes(fragment),fragment);
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
test('creation restores three steps and removes Finance while reserving settings for page two',()=>{
 const html=editor();for(const label of ['Choose a completed Location','Event name','Start (Netherlands time)','End (Netherlands time)','Event description','Attendance &amp; guests','Review &amp; Create'])assert.ok(html.includes(label),label);
 for(const label of ['Attendance date','Day capacity','Add attendance day','Enable Finance','Maximum invited guests per member','Minimum participants'])assert.equal(html.includes(label),false,label);
 assert.equal((html.match(/aria-current="step"/g)??[]).length,1);
});
test('allowlisted rich text supports tables, headings and marks while rejecting executable or unbounded input',()=>{
 const cell=(type,text)=>({type,attrs:{colspan:1,rowspan:1,colwidth:null},content:[{type:'paragraph',content:[{type:'text',text}]}]});
 const doc={type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'LAN',marks:[{type:'bold'},{type:'underline'}]}]},{type:'paragraph',content:[{type:'text',text:'Venue',marks:[{type:'link',attrs:{href:'https://example.test',target:'_blank',rel:'noopener',class:null,title:null}}]}]},{type:'table',content:[{type:'tableRow',content:[cell('tableHeader','Day'),cell('tableHeader','Game')]},{type:'tableRow',content:[cell('tableCell','Friday'),cell('tableCell','<script>alert(1)</script>')]}]}]};
 const canonical=validateEventDocument(doc),html=render(JSON.stringify(canonical));for(const fragment of ['<h2>','<strong>','<u>','<table>','<th scope="col">','Friday','&lt;script&gt;alert(1)&lt;/script&gt;'])assert.ok(html.includes(fragment),fragment);
 assert.deepEqual(canonical.content[1].content[0].marks[0].attrs,{href:'https://example.test/'});
 const bad=[{type:'doc',content:[{type:'iframe',attrs:{src:'https://example.test'}}]},{type:'doc',attrs:{onclick:'evil'},content:[]},{type:'doc',content:[{type:'paragraph',attrs:{style:'color:red'},content:[]}]},{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'bad',marks:[{type:'link',attrs:{href:'javascript:evil'}}]}]}]},{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x'.repeat(8001)}]}]}];for(const value of bad)assert.throws(()=>validateEventDocument(value));
 assert.equal(render('<b onclick=evil>plain</b>').includes('&lt;b onclick=evil&gt;plain&lt;/b&gt;'),true);
 assert.equal(eventDocument('**Legacy bold**').content[0].content[0].marks[0].type,'bold');
});

test('date entry rejects malformed years/calendar dates and preserves exact legacy instants',()=>{
 for(const date of ['01/01/101223','01/01/1012','31/02/2027','29/02/2027','00/01/2027','01/13/2027'])assert.equal(eventInputDate(date),null,date);
 assert.equal(eventInputDate('29/02/2028'),'2028-02-29');
 const legacy=Date.parse('2030-11-03T19:32:17Z')/1000,input=eventInputFromInstant(legacy);assert.deepEqual(input,{date:'03/11/2030',hour:'20',minute:'32'});assert.equal(resolveEventInput(input,legacy),legacy);
 assert.throws(()=>resolveEventInput({...input,hour:'21'},legacy),/00, 15, 30 or 45/);
 assert.equal(resolveEventInput({...input,minute:'45'},legacy),Date.parse('2030-11-03T19:45:00Z')/1000);
 for(const value of [{date:'31/03/2030',hour:'02',minute:'30'},{date:'27/10/2030',hour:'02',minute:'30'}])assert.throws(()=>resolveEventInput(value),/daylight saving/);
 const fold=Date.parse('2030-10-27T01:30:17Z')/1000;assert.equal(resolveEventInput(eventInputFromInstant(fold),fold),fold);
 for(const hour of ['24','-1','9'])assert.throws(()=>resolveEventInput({...input,hour}),/24-hour/);
});

test('continuous and pasted date entry inserts predictable separators without changing the calendar value',()=>{
 for(const [input,expected] of [['',''],['2','2'],['22','22'],['221','22/1'],['2210','22/10'],['22102027','22/10/2027'],['22/10/2027','22/10/2027'],['22.10.2027','22/10/2027'],['22101984','22/10/1984'],['2210202712','22/10/2027']])assert.equal(formatEventDateEntry(input),expected);
 assert.equal(eventInputDate(formatEventDateEntry('22101984')),null);
 assert.equal(eventInputDate(formatEventDateEntry('22102027')),'2027-10-22');
});

test('correcting a date clears its error independently from unfinished time controls',()=>{
 const bad={date:'01/01/0989',hour:'',minute:''};assert.ok(eventInputErrors(bad).date);
 const corrected={...bad,date:'01/01/2027'},errors=eventInputErrors(corrected);assert.equal(errors.date,'');assert.ok(errors.hour);assert.ok(errors.minute);
 assert.deepEqual(eventInputErrors({...corrected,hour:'12',minute:'15'}),{date:'',hour:'',minute:''});
 const invalidDay=eventInputErrors({date:'31/02/2027',hour:'12',minute:'15'});assert.ok(invalidDay.date);assert.equal(invalidDay.hour,'');assert.equal(invalidDay.minute,'');
 const legacy=Date.parse('2030-11-03T19:32:17Z')/1000,input=eventInputFromInstant(legacy);assert.deepEqual(eventInputErrors(input,legacy),{date:'',hour:'',minute:''});
 const changed=eventInputErrors({...input,date:'04/11/2030'},legacy);assert.equal(changed.date,'');assert.equal(changed.hour,'');assert.ok(changed.minute);
});

test('public event detail breadcrumbs identify the event area instead of repeating the site name',()=>{assert.equal(routeLabel('/events'),'Events');assert.equal(routeLabel('/events/20000000-0000-4000-8000-000000000001'),'Event details');assert.equal(routeLabel('/events/id/unknown'),'LAN Party');});
