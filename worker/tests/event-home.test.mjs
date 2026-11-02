import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const compiled=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';import Home from './src/pages/Home';import PublicEventCard from './src/components/PublicEventCard';import {setEvents} from './src/lib/public-events';export const home=events=>{setEvents(events);return renderToStaticMarkup(<MemoryRouter><Home/></MemoryRouter>)};export const card=event=>renderToStaticMarkup(<MemoryRouter><PublicEventCard event={event}/></MemoryRouter>);`},plugins:[{name:'fictional-public-events',setup(build){build.onResolve({filter:/public-events$/},()=>({path:'public-events',namespace:'fictional'}));build.onLoad({filter:/.*/,namespace:'fictional'},()=>({contents:`let events=[];export const setEvents=value=>{events=value};export const usePublicEvents=()=>({events,loading:false,message:''});export const eventTime=()=>'Fictional Netherlands dates';`,loader:'js'}));}}],bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env':'{}'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(compiled.outputFiles[0].text,import.meta.filename);const {home,card}=mod.exports;
const event={id:'20000000-0000-4000-8000-000000000001',title:'Fictional weekend LAN',startsAt:1,endsAt:2,registrationStatus:'closed',venue:null,days:[{date:'2030-11-01',remaining:32}]};
test('Home removes the redundant hero CTA only when an event exists and retains full-list navigation',()=>{
 const html=home([event]);assert.equal(html.includes('Explore events'),false);assert.ok(html.includes('View event'));assert.ok(html.includes('Browse all events'));assert.ok(html.includes('href="/events/'+event.id+'"'));assert.ok(html.includes('href="/events"'));
 assert.ok(html.includes('class="home-event-artwork" src="/lan-hall.png" alt="Rows of gaming setups at a LAN party"'));assert.ok(card(event).includes('src="/lan-hall.png" alt="Rows of gaming setups at a LAN party"'));
});
test('Home keeps a useful Events CTA when no upcoming event is available',()=>{
 const html=home([]);assert.ok(html.includes('Explore events'));assert.ok(html.includes('Visit the events page'));assert.equal(html.includes('class="home-event-artwork"'),false);
});
