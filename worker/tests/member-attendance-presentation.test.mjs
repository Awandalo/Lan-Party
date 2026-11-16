import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import MemberAttendanceHistory from './src/components/MemberAttendanceHistory';export const render=history=>renderToStaticMarkup(<MemberAttendanceHistory history={history}/>);export {loadMemberRead} from './src/lib/use-member-read';`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'undefined'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);
const event={id:'fictional-event',title:'LAN <friends>',venue:'Example & Hall',days:['2020-11-01','2020-11-03'],achievementsEnabled:false};
test('actual history renders reviewed days, saved venue and qualification with escaped text and no placeholder',()=>{
 const html=mod.exports.render({available:true,events:[event],hasMore:false});
 for(const value of ['LAN &lt;friends&gt;','Example &amp; Hall','01-11-2020, 03-11-2020','Excluded'])assert.ok(html.includes(value));
 assert.equal(html.includes('will appear here'),false);assert.equal(html.includes('No completed attendance'),false);
 assert.ok(mod.exports.render({available:true,events:[{...event,achievementsEnabled:true}],hasMore:false}).includes('Qualifying event'));
});
test('empty, unavailable and bounded history have distinct honest feedback',()=>{
 assert.ok(mod.exports.render({available:true,events:[],hasMore:false}).includes('No completed attendance recorded.'));
 const unavailable=mod.exports.render({available:false,events:[],hasMore:false});assert.ok(unavailable.includes('currently unavailable'));assert.equal(unavailable.includes('No completed attendance'),false);
 assert.ok(mod.exports.render({available:true,events:[event],hasMore:true}).includes('100 most recent attended events'));
});
test('member reader validates the attendance projection and rejects malformed/unavailable snapshots without retaining private data',async()=>{
 const original=globalThis.fetch,member={userId:'fictional',nickname:'Pixel Alice',memberNumber:'1',status:'active',roles:[],email:'fictional@example.test',firstName:'Fictional',lastName:'Person',prefix:null,verified:true,createdAt:0};
 async function read(attendance){globalThis.fetch=async()=>Response.json({member:{...member,attendance}});return mod.exports.loadMemberRead('/api/manage/users/fictional',true,'fictional',new AbortController().signal);}
 try{
  assert.equal((await read({available:true,events:[event],hasMore:false})).data.member.attendance.events.length,1);
  assert.equal((await read({available:false,events:[],hasMore:false})).message,'');
  for(const history of [undefined,{available:false,events:[event],hasMore:false},{available:true,events:[{...event,days:[42]}],hasMore:false},{available:true,events:Array(101).fill(event),hasMore:true}]){const result=await read(history);assert.equal(result.data,null);assert.ok(result.message);}
 }finally{globalThis.fetch=original;}
});
