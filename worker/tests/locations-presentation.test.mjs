import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
async function ui(flag){
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import LocationEditor from './src/components/LocationEditor';export {administrationDocumentTitle} from './src/components/RouteFocus';export const editor=creating=>renderToStaticMarkup(<LocationEditor row={{id:'',name:'',addressLine:null,postalCode:null,city:null,countryCode:null,instructions:null,capacity:null,rentalCents:0,directionsUrl:null,active:1,revision:0}} creating={creating} pending={false} message="" onSave={async()=>{}} onCancel={()=>{}}/>);`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':JSON.stringify(flag)}});
 const compiled=new Module(import.meta.filename);compiled.paths=Module._nodeModulePaths(process.cwd());compiled._compile(result.outputFiles[0].text,import.meta.filename);return compiled.exports;
}
test('creation starts a three-step name-only wizard; editing keeps explicit Save and Cancel',async()=>{
 const render=await ui('hosted-dev'),create=render.editor(true),edit=render.editor(false);
 assert.match(create,/Create location progress/);assert.equal((create.match(/<li(?: |>)/g)??[]).length,3);assert.match(create,/aria-current="step"/);assert.match(create,/Review &amp; Create/);assert.match(create,/>Next<\/button>/);assert.doesNotMatch(create,/>Create location<\/button>/);
 assert.match(create,/Location name<input required/);assert.equal((create.match(/ required=""/g)??[]).length,1);
 assert.match(edit,/>Save changes<\/button>/);assert.match(edit,/>Cancel<\/button>/);assert.doesNotMatch(edit,/Create location progress/);
});
test('actual Administration headings determine titles in DEV and PROD without masking unknown or restricted routes',async()=>{
 for(const mode of ['','hosted-dev','hosted-prod']){
  const {administrationDocumentTitle:title}=await ui(mode);
  for(const [path,heading] of [['/manage','Administration'],['/manage/users','Members'],['/manage/locations','Locations'],['/manage/location-activity','Locations Log'],['/manage/roles','Roles & Permissions']])assert.equal(title(path,heading),heading);
  assert.equal(title('/manage/users/fictional','Members'),'Member details');
  assert.equal(title('/manage/users','Page not found'),'Page not found');
  assert.equal(title('/manage/missing','Page not found'),'Page not found');
  assert.equal(title('/manage/locations','Access restricted'),'Access restricted');
  assert.equal(title('/management','Page not found'),null);
 }
});
