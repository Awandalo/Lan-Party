import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
 import EventAttendanceReview from './src/components/EventAttendanceReview';
 import EventFinance from './src/components/EventFinance';
 export const review=(data,view)=>renderToStaticMarkup(<EventAttendanceReview id="fictional" view={view} initial={data} load={async()=>data} onChange={()=>{}}/>);
 export const finance=(data,mode)=>renderToStaticMarkup(<EventFinance id="fictional" title="Fictional LAN" mode={mode} initial={data} load={async()=>data} onChange={()=>{}}/>);
 `},plugins:[{name:'fictional-staff',setup(b){b.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'fictional'}));b.onLoad({filter:/.*/,namespace:'fictional'},()=>({contents:`export const useAuth=()=>({status:'ready',session:{csrfToken:'fictional',account:{userId:'fictional'}},administration:{status:'ready',revision:1}});`,loader:'js'}));}}],bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'undefined'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);
const reviewData={revision:1,ended:true,open:false,canFinance:true,rentalCents:10000,days:['2030-11-01'],people:[{registrationId:'reg',owner:'member',id:'person',name:'Pixel Alice',kind:'Member',confirmed:['2030-11-01'],days:['2030-11-01']}],anonymousDays:[],anonymousPeople:0,deletedAccounts:0,settings:{payment_url:'',instructions:'Fictional saved instructions'},activity:[]};
const financeData={revision:1,ended:true,finalized:false,rentalCents:10000,participantDays:1,dailyRateCents:10000,bills:[],canSkipPaymentEmails:true};

test('returning wizard steps render cached attendance and payment instructions immediately with edits blocked during refresh',()=>{
 const attendance=mod.exports.review(reviewData,'attendance');
 assert.ok(attendance.includes('Pixel Alice'));assert.equal(attendance.includes('Loading attendance review'),false);
 assert.ok(attendance.includes('aria-busy="true"'));assert.match(attendance,/<button[^>]*disabled=""[^>]*>Review days/);
 const instructions=mod.exports.review(reviewData,'instructions');
 assert.ok(instructions.includes('Fictional saved instructions'));assert.ok(instructions.includes('<fieldset disabled=""'));
});
test('both bill and confirmation steps render cached totals without a blank loading panel and cannot finalize during refresh',()=>{
 for(const mode of ['preview','confirm']){
  const html=mod.exports.finance(financeData,mode);
  assert.ok(html.includes('Retained participant-days'));assert.equal(html.includes('Loading bills'),false);
  assert.ok(html.includes('aria-busy="true"'));
  if(mode==='confirm')assert.ok(html.includes('<fieldset disabled=""'));
 }
});
