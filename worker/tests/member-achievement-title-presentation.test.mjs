import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Title from './src/components/MemberAchievementTitle';export const render=title=>renderToStaticMarkup(<Title title={title}/>);export {loadMemberRead} from './src/lib/use-member-read';`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'undefined'}});
const mod=new Module(import.meta.filename);mod.paths=Module._nodeModulePaths(process.cwd());mod._compile(result.outputFiles[0].text,import.meta.filename);
test('member title renders the same suffix/colors as crew and distinguishes empty from unavailable',()=>{
 for(const [code,rank,suffix]of [['first-lan','iron','the Initiate'],['full-weekend','bronze','the LANner'],['silver','silver','the Dedicated'],['lan-recruit','gold','the Veteran'],['legendary','legendary','the Legend']]){const html=mod.exports.render({available:true,code});assert.ok(html.includes('achievement-'+rank));assert.ok(html.includes(suffix));}
 assert.equal(mod.exports.render({available:true,code:null}),'No achievement title');assert.equal(mod.exports.render({available:false,code:null}),'Unavailable');
});
test('member reader accepts valid title projections and rejects unknown/malformed titles',async()=>{
 const original=globalThis.fetch,member={userId:'fictional',nickname:'Pixel Alice',memberNumber:'1',status:'active',roles:[],email:'fictional@example.test',firstName:'Fictional',lastName:'Person',prefix:null,verified:true,createdAt:0,attendance:{available:true,events:[],hasMore:false}};
 const read=async achievementTitle=>{globalThis.fetch=async()=>Response.json({member:{...member,achievementTitle}});return mod.exports.loadMemberRead('/api/manage/users/fictional',true,'fictional',new AbortController().signal);};
 try{for(const title of [{available:true,code:'first-lan'},{available:true,code:null},{available:false,code:null}])assert.deepEqual((await read(title)).data.member.achievementTitle,title);
 for(const title of [undefined,null,{available:true,code:'unknown'},{available:false,code:'first-lan'},{available:'true',code:null},{available:true,code:42}]){const result=await read(title);assert.equal(result.data,null);assert.ok(result.message);}}finally{globalThis.fetch=original;}
});
