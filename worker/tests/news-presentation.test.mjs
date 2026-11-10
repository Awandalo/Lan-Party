import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createRequire,Module} from 'node:module';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const compiled=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import{renderToStaticMarkup}from'react-dom/server';import{MemoryRouter}from'react-router';import{NewsReading,NewsCards}from'./src/components/NewsReading';export const article=(article,preview=false)=>renderToStaticMarkup(<NewsReading article={article} preview={preview}/>);export const cards=articles=>renderToStaticMarkup(<MemoryRouter><NewsCards articles={articles}/></MemoryRouter>);export{newsShareLinks}from'./src/components/NewsPublicShare';export{contextualNavigation}from'./src/lib/navigation';`},bundle:true,packages:'external',platform:'node',format:'cjs',write:false,loader:{'.css':'empty'},define:{'import.meta.env.DEV':'false','import.meta.env.VITE_AUTH_MODE':'undefined'}});
const m=new Module(import.meta.filename);m.paths=Module._nodeModulePaths(process.cwd());m._compile(compiled.outputFiles[0].text,import.meta.filename);const ui=m.exports;
const article={id:'fictional',slug:'crew-news',title:'<script>Title</script>',excerpt:'Crew news',status:'published',createdAt:0,publishedAt:1,updatedAt:2,editorName:'Pixel Alice',content:JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Safe & bold',marks:[{type:'bold'}]}]}]})};
test('public article safely renders shared formatting, dates and display-name updates without editorial sharing',()=>{
 const html=ui.article(article);assert.ok(html.includes('&lt;script&gt;Title&lt;/script&gt;'));assert.ok(html.includes('<strong>Safe &amp; bold</strong>'));assert.ok(html.includes('Pixel Alice'));assert.ok(html.includes('Updated on'));assert.equal(html.includes('WhatsApp'),false);assert.equal(html.includes('Discord'),false);assert.equal(html.includes('<script>Title'),false);
 assert.equal(ui.article({...article,editorName:null}).includes('Pixel Alice'),false);assert.equal(ui.article({...article,updatedAt:1}).includes('Updated on'),false);assert.ok(ui.article(article,true).includes('<h2>'));
});
test('public cards use stable post links while role-aware navigation exposes only permitted News administration',()=>{
 const html=ui.cards([article]);assert.ok(html.includes('href="/news/crew-news"'));assert.equal(html.includes('Publish'),false);
 assert.deepEqual(ui.contextualNavigation('/manage/news',['news'],true).map(x=>x.label),['Overview','News']);assert.deepEqual(ui.contextualNavigation('/manage/news',[],true),[]);assert.deepEqual(ui.contextualNavigation('/manage/news',['news'],false),[]);
});

test('public share composers preserve the canonical URL and encode article text as data',()=>{
 const title='Crew & games? #1 + café',url='https://example.test/news/crew-games';
 const links=ui.newsShareLinks(title,url);assert.deepEqual(links.map(x=>x.label),['WhatsApp','Facebook','X','Bluesky','LinkedIn','E-mail']);
 for(const link of links){const parsed=new URL(link.href);assert.ok(['https:','mailto:'].includes(parsed.protocol));const values=[...parsed.searchParams.values()];assert.ok(values.some(value=>value.includes(url)));}
 assert.equal(new URL(links[0].href).searchParams.get('text'),title+'\n'+url);
 assert.equal(new URL(links[2].href).searchParams.get('text'),title);
 assert.equal(new URL(links[2].href).searchParams.get('url'),url);
 assert.equal(new URL(ui.newsShareLinks('Title\r\nBcc: nobody@example.test',url)[5].href).searchParams.get('subject'),'Title  Bcc: nobody@example.test');
});
