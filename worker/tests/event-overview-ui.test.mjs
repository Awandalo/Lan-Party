import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';import EventOverviewActions from './src/components/EventOverviewActions';import EventSections from './src/components/EventSections';export {eventMenuPosition} from './src/components/EventActionsMenu';export const render=(row,access)=>renderToStaticMarkup(<MemoryRouter><EventOverviewActions row={row} access={access} onDelete={()=>{}} onDuplicate={()=>{}} onEdit={()=>{}} onLifecycle={()=>{}}/></MemoryRouter>);export const sections=()=>renderToStaticMarkup(<EventSections/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(bundle.outputFiles[0].text,import.meta.filename);const {render,sections,eventMenuPosition}=mod.exports;
const row={id:'20000000-0000-4000-8000-000000000001',revision:0,status:'draft',listed:0,registrationHistory:0},all={canCreate:true,canUpdate:true,canDelete:true,canPublish:true,canCancel:true},none=Object.fromEntries(Object.keys(all).map(k=>[k,false]));
test('Overview groups secondary actions in a closed accessible menu and retains the primary edit control',()=>{
 const html=render(row,all);assert.ok(html.includes('aria-haspopup="menu" aria-expanded="false"'));assert.ok(html.includes('aria-label="Event actions" aria-hidden="true" inert=""'));assert.equal((html.match(/role="menuitem"/g)??[]).length,4);
 for(const label of ['Delete event','Duplicate','Cancel event','Publish','Edit Draft'])assert.ok(html.includes(label),label);
 assert.equal(html.includes('View public page'),false);assert.ok(html.includes('class="event-primary-actions"'));
});
test('published/terminal states retain the correct public/edit hierarchy and lifecycle actions',()=>{
 const html=render({...row,status:'published',listed:1},all);assert.ok(html.includes('Unpublish'));assert.ok(html.includes('href="/events/'+row.id+'"'));assert.ok(html.includes('View public page'));assert.ok(html.includes('>Edit event</button>'));
 const terminal=render({...row,status:'cancelled'},all);assert.equal((terminal.match(/role="menuitem"/g)??[]).length,2);for(const label of ['Cancel event','Publish','Edit event','View public page'])assert.equal(terminal.includes(label),false,label);
});
test('history and current permissions control menu availability without bypassing disabled actions',()=>{
 const history=render({...row,registrationHistory:1},all);assert.equal((history.match(/ disabled=""/g)??[]).length,2);assert.equal((history.match(/Unavailable: this event has registration history./g)??[]).length,2);
 const noAccess=render(row,none);assert.equal(noAccess.includes('aria-haspopup="menu"'),false);assert.equal(noAccess.includes('Edit Draft'),false);
 const update=render(row,{...none,canUpdate:true});assert.equal(update.includes('aria-haspopup="menu"'),false);assert.ok(update.includes('Edit Draft'));
 const publisher=render(row,{...none,canPublish:true});assert.equal((publisher.match(/role="menuitem"/g)??[]).length,1);assert.ok(publisher.includes('Publish'));assert.equal(publisher.includes('Delete event'),false);
});
test('future sections are explicitly unavailable and introduce no navigation or pretend panels',()=>{
 const html=sections();assert.ok(html.includes('aria-current="page">Overview'));assert.equal((html.match(/disabled=""/g)??[]).length,2);assert.equal((html.match(/Coming later/g)??[]).length,2);assert.equal(html.includes('href='),false);assert.equal(html.includes('role="tab"'),false);
});

test('short-viewport placement keeps a flipped menu below the sticky header and inside horizontal bounds',()=>{
 const rect={top:201.5,bottom:245.5,left:37},space={width:553,height:320,headerBottom:69,menuWidth:288,menuHeight:196,gap:8};
 const position=eventMenuPosition(rect,space);assert.equal(position.above,true);assert.equal(rect.top-space.gap-position.height,81);assert.ok(rect.top-space.gap-position.height>=space.headerBottom+12);
 const narrow={...space,width:305,height:844,menuWidth:241},below=eventMenuPosition({top:100,bottom:144,left:250},narrow);assert.equal(below.above,false);assert.ok(250+below.left+narrow.menuWidth<=305-12);assert.ok(250+below.left>=12);
});
