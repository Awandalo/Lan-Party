import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';
 import FeedbackEntry from './src/components/FeedbackEntry';
 import {AuthProvider} from './src/lib/auth';import {FeedbackProvider} from './src/lib/feedback';
 export * from './src/lib/feedback';export * from './src/lib/navigation';
 export const entry=()=>renderToStaticMarkup(<MemoryRouter><AuthProvider><FeedbackProvider><FeedbackEntry/></FeedbackProvider></AuthProvider></MemoryRouter>);
 `},bundle:true,packages:'external',write:false,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env.DEV':'true','import.meta.env.VITE_AUTH_MODE':'"hosted-dev"'}})).outputFiles[0].text;
const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(output,import.meta.filename);const ui=compiled.exports;
test('feedback entry has an accessible bug link and no duplicate Settings destination',()=>{
 const html=ui.entry();assert.match(html,/aria-label="Feedback"/);assert.match(html,/href="\/account\/feedback"/);assert.match(html,/title="Feedback"/);
 assert.ok(!ui.accountNavigation.some(x=>x.href.includes('feedback')));
 assert.ok(ui.contextualNavigation('/manage/feedback',['feedback'],true).some(x=>x.href==='/manage/feedback'));
 assert.ok(!ui.contextualNavigation('/manage/feedback',['roles'],true).some(x=>x.href==='/manage/feedback'));
});
test('manual GitHub brief is a blank technical scaffold and opens only the fixed repository without private URL parameters',()=>{
 assert.equal(ui.PUBLIC_ISSUE_URL,'https://github.com/Awandalo/Lan-Party/issues/new');assert.ok(!ui.PUBLIC_ISSUE_URL.includes('?'));
 for(const heading of ['Problem / value','Expected behavior','Acceptance criteria','implementation requires owner authorization'])assert.ok(ui.publicFeedbackTemplate.includes(heading));
 assert.doesNotMatch(ui.publicFeedbackTemplate,/@example|userId|requestId|Fictional|token|email/);
});
test('private feedback DTOs reject malformed or oversized pages and events',()=>{
 const row={id:'50000000-0000-4000-8000-000000000001',kind:'bug',title:'Fictional',decision:'pending',progress:'new',revision:1};
 assert.equal(ui.validFeedbackRead({requests:[row],nextCursor:null}),true);
 for(const value of [{requests:Array(21).fill(row),nextCursor:null},{requests:[{...row,progress:'unknown'}],nextCursor:null},{request:{...row,description:'Test'},events:[{sequence:'bad'}],through:'1',nextBefore:null}])assert.equal(ui.validFeedbackRead(value),false);
});
