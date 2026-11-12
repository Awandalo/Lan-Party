import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import RegistrationCrew from './src/components/RegistrationCrew';import RegistrationSummary from './src/components/RegistrationSummary';import MinimumAttendanceCounter from './src/components/MinimumAttendanceCounter';import AttendanceTimeline from './src/components/AttendanceTimeline';export const timeline=(days,places)=>renderToStaticMarkup(<AttendanceTimeline days={days} places={places}/>);export const minimum=(days,needed,people)=>renderToStaticMarkup(<MinimumAttendanceCounter days={days} minimum={needed} people={people} selected={true} onSelect={()=>{}}/>);export const summary=(people,places)=>renderToStaticMarkup(<RegistrationSummary people={people} places={places}/>);export const renderWithFilters=()=>renderToStaticMarkup(<RegistrationCrew members={[]} day={null} onReset={()=>{}} filters={<nav aria-label="Filter crew"><button>All days</button></nav>}/>);export const render=(members,day,counts)=>renderToStaticMarkup(<RegistrationCrew members={members} counts={counts} day={day} onReset={()=>{}}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);const {render,summary,renderWithFilters,minimum,timeline}=mod.exports;
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


test('person timeline distinguishes internal gaps from unselected days outside the confirmed range',()=>{
 const days=['2030-11-01','2030-11-02','2030-11-03','2030-11-04','2030-11-05'];
 const html=timeline(days,[{day:days[1],status:'confirmed'},{day:days[3],status:'confirmed'}]);
 const states=[...html.matchAll(/class="attendance-step attendance-([a-z]+)"/g)].map(match=>match[1]);
 assert.deepEqual(states,['outside','confirmed','gap','confirmed','outside']);
 assert.equal((html.match(/datetime=/gi)??[]).length,5);assert.ok(html.includes('02-11-2030'));assert.ok(html.includes('Not attending'));
 assert.ok(html.includes('--next-day-color:var(--attendance-gap)'));assert.ok(html.includes('--next-day-color:var(--attendance-confirmed)'));
 const endpoints=timeline(days,[{day:days[0],status:'confirmed'},{day:days[4],status:'confirmed'}]);
 assert.equal((endpoints.match(/attendance-step attendance-gap/g)??[]).length,3);
});

test('person timeline keeps single-day, empty and waitlisted attendance truthful',()=>{
 const days=['2030-11-01','2030-11-02','2030-11-03'];
 const single=timeline(days,[{day:days[1],status:'confirmed'}]);assert.equal(single.includes('attendance-step attendance-gap'),false);
 const empty=timeline(days,[]);assert.equal((empty.match(/attendance-step attendance-outside/g)??[]).length,3);assert.equal(empty.includes('>Confirmed<'),false);
 const waiting=timeline(days,[{day:days[0],status:'confirmed'},{day:days[1],status:'waitlisted',position:2},{day:days[2],status:'confirmed'}]);
 assert.ok(waiting.includes('attendance-step attendance-waiting'));assert.ok(waiting.includes('Waitlisted · group 2'));assert.equal((waiting.match(/>Confirmed</g)??[]).length,2);
});

test('crew renders optional public prefixes beside escaped nicknames while retaining nickname initials',()=>{
 const html=render([{id:'a',name:'Pixel Alice',prefix:'LAN Legend',days:['2030-11-01']}],null);assert.ok(html.includes('LAN Legend'));assert.ok(html.includes('Pixel Alice'));assert.ok(html.includes('>PA</div>'));
 const escaped=render([{id:'a',name:'Pixel Alice',prefix:'<b>Mr.</b>',days:['2030-11-01']}],null);assert.ok(escaped.includes('&lt;b&gt;Mr.&lt;/b&gt;'));assert.equal(escaped.includes('<b>Mr.</b>'),false);
});

test('crew appends a validated coloured highest-tier suffix independently of the selected badge and escapes display names',()=>{const html=render([{id:'a',name:'Sebas <script>',rankCode:'lan-recruit',badgeCode:'first-lan',days:['2030-11-01']}],null);assert.ok(html.includes('Sebas &lt;script&gt;'));assert.ok(html.includes('achievement-gold'));assert.ok(html.includes('the Veteran'));assert.ok(html.includes('/images/achievements/iron.png'));assert.equal(html.includes('the Initiate'),false);const none=render([{id:'a',name:'Sebas',rankCode:'unknown',badgeCode:null,days:['2030-11-01']}],null);assert.equal(none.includes('achievement-suffix'),false);});

test('crew avatar uses the chosen showcase badge, independently of rank; absent or unknown choices retain initials',()=>{const member={id:'a',name:'Pixel Alice',rankCode:'legendary',days:['2030-11-01']};const badge=render([{...member,badgeCode:'full-weekend'}],null);assert.match(badge,/<div class="registration-member-avatar registration-member-avatar-badge" aria-hidden="true"><img src="\/images\/achievements\/bronze.png" alt=""\/><\/div>/);assert.equal(badge.includes('>PA</div>'),false);assert.equal((badge.match(/<img src="\/images\/achievements\/bronze.png"/g)??[]).length,1);assert.ok(badge.includes('the Legend'));for(const badgeCode of [null,undefined,'invalid']){const plain=render([{...member,badgeCode}],null);assert.ok(plain.includes('>PA</div>'));assert.equal(plain.includes('registration-member-avatar-badge'),false);}});

test('crew summary includes anonymous guests while keeping member cards and selected-day totals distinct',()=>{const members=[{id:'a',name:'Pixel Alice',days:['2030-11-01','2030-11-02']},{id:'b',name:'Byte Bob',days:['2030-11-01']}],counts={members:2,guests:1,total:3,days:[{date:'2030-11-01',members:2,guests:0,total:2},{date:'2030-11-02',members:1,guests:1,total:2}]};const all=render(members,null,counts);assert.match(all,/2 members · 1 guest · 3 total/);assert.equal((all.match(/class="registration-member-card"/g)??[]).length,2);const selected=render(members,'2030-11-02',counts);assert.match(selected,/1 member · 1 guest · 2 total/);assert.equal(selected.includes('Byte Bob'),false);assert.match(render(members,'2030-11-01',counts),/2 members · 0 guests · 2 total/);});
