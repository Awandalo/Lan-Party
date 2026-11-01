import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const output=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router';
 import FeedbackEntry from './src/components/FeedbackEntry';
 import NewFeedbackDialog from './src/components/NewFeedbackDialog';
 import FeedbackAdminTools from './src/components/FeedbackAdminTools';
 import {FeedbackDelta} from './src/components/FeedbackDisplay';
 import {AuthProvider} from './src/lib/auth';import {FeedbackProvider} from './src/lib/feedback';
 export * from './src/lib/feedback';export * from './src/lib/navigation';
 export const dialog=()=>renderToStaticMarkup(<MemoryRouter><AuthProvider><FeedbackProvider><NewFeedbackDialog onClose={()=>{}} onCreated={()=>{}}/></FeedbackProvider></AuthProvider></MemoryRouter>);
 export const adminTools=item=>renderToStaticMarkup(<FeedbackAdminTools item={item} api="/api/manage/feedback/fictional" save={async()=>true} busy={false}/>);
 export const delta=text=>renderToStaticMarkup(<FeedbackDelta text={text}/>);
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

test('member compose uses a named native dialog with required bounded fields and explicit cancel/submit controls',()=>{
 const html=ui.dialog();assert.match(html,/<dialog[^>]*aria-labelledby="feedback-create-heading"/);assert.match(html,/id="feedback-create-heading"/);
 assert.match(html,/maxLength="120"/);assert.match(html,/maxLength="5000"/);assert.match(html,/required=""/);assert.match(html,/>Cancel<\/button>/);assert.match(html,/disabled="">Submit request<\/button>/);assert.match(html,/Close new request/);
});
test('administrator controls retain independent values and never auto-export private request text',()=>{
 const html=ui.adminTools({id:'50000000-0000-4000-8000-000000000001',kind:'bug',title:'Fictional private title',description:'Fictional private description',nickname:'Fictional private nickname',decision:'maybe',progress:'planned',revision:1,githubNumber:null,closedAt:null,createdAt:0,updatedAt:0});
 assert.match(html,/<option value="maybe" selected="">Maybe/);assert.match(html,/<option value="planned" selected="">Planned/);assert.match(html,/Manual publication only/);assert.match(html,/Prepare GitHub issue/);
 assert.doesNotMatch(html,/Fictional private|Copy description|Open GitHub to publish/);
});
test('conversation change details safely render untrusted text and malformed metadata',()=>{
 const html=ui.delta(JSON.stringify({progress:{before:'<script>fictional</script>',after:'<img src=x onerror=fictional>'}}));assert.equal(html.includes('<script'),false);assert.equal(html.includes('<img'),false);assert.ok(html.includes('&lt;script&gt;fictional&lt;/script&gt;'));assert.ok(html.includes('&lt;img src=x onerror=fictional&gt;'));assert.match(ui.delta('not json'),/Change details unavailable/);
});

test('member Feedback routes do not select or expand User Settings; normal account and admin navigation remain intact',()=>{
 for(const path of ['/account/feedback','/account/feedback/new','/account/feedback/50000000-0000-4000-8000-000000000001']){
  assert.equal(ui.mainArea(path),null);assert.deepEqual(ui.contextualNavigation(path,[],true),[]);
 }
 for(const path of ['/account','/account/security','/account/feedback-extra']){
  assert.equal(ui.mainArea(path),'account');assert.deepEqual(ui.contextualNavigation(path,[],true),ui.accountNavigation);
 }
 assert.equal(ui.mainArea('/manage/feedback'),'administration');assert.ok(ui.contextualNavigation('/manage/feedback',['feedback'],true).some(x=>x.href==='/manage/feedback'));
});
test('historical triage presentation includes only independently changed fields',()=>{
 const progress=ui.delta(JSON.stringify({decision:{before:'pending',after:'pending'},progress:{before:'new',after:'planned'}}));
 assert.doesNotMatch(progress,/<dt>Decision<\/dt>|Pending/);assert.match(progress,/<dt>Progress<\/dt>/);assert.match(progress,/New.*Planned/);
 const decision=ui.delta(JSON.stringify({decision:{before:'pending',after:'yes'},progress:{before:'planned',after:'planned'}}));
 assert.match(decision,/<dt>Decision<\/dt>/);assert.doesNotMatch(decision,/<dt>Progress<\/dt>/);
 const both=ui.delta(JSON.stringify({decision:{before:'pending',after:'maybe'},progress:{before:'new',after:'under_review'}}));
 assert.match(both,/<dt>Decision<\/dt>/);assert.match(both,/<dt>Progress<\/dt>/);
 assert.match(ui.delta(JSON.stringify({progress:{before:'new',after:'planned'}})),/<dt>Progress<\/dt>/);
});
test('unchanged, nullable issue links and malformed historical pairs have truthful presentation',()=>{
 assert.match(ui.delta(JSON.stringify({decision:{before:'pending',after:'pending'}})),/No field changes recorded/);
 assert.match(ui.delta(JSON.stringify({issue:{before:null,after:44}})),/None.*44/);
 assert.match(ui.delta(JSON.stringify({issue:{before:44,after:null}})),/44.*None/);
 for(const value of [null,[],{decision:null},{decision:{before:'pending'}}])assert.match(ui.delta(JSON.stringify(value)),/Change details unavailable/);
});
