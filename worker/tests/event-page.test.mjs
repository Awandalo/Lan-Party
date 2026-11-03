import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const origin='http://127.0.0.1:5173';
async function event(f,{status='published',listed=1,title='Fictional LAN',text='Welcome to game night'}={}){
 const l=randomUUID(),id=randomUUID();await f.sql("INSERT INTO locations(id,name,created_at,updated_at) VALUES (?,'Fictional Hall',0,0)",l).run();
 await f.sql('INSERT INTO events(id,location_id,slug,title,description,publication_status,created_at,updated_at) VALUES (?,?,?,?,?,?,0,0)',id,l,id,title,JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text}]}]}),status).run();
 await f.sql("INSERT INTO event_management(event_id,starts_at,ends_at,venue,capacity,max_guests,is_listed) VALUES (?,1,2,'{}',10,1,?)",id,listed).run();return id;
}
const get=(f,id,options)=>f.fetch(origin+'/events/'+id,options);
const meta=(html,key)=>html.match(new RegExp('<meta (?:property|name)="'+key+'" content="([^"]*)"'))?.[1];
test('anonymous initial HTML carries escaped event metadata, canonical/image URLs and the unchanged SPA shell',()=>local(async f=>{
 const id=await event(f,{title:'Fictional "LAN" <script>alert(1)</script> & crew',text:'Welcome <img src=x onerror=evil> & game night'});
 const response=await get(f,id+'?tracking=discarded',{headers:{'If-None-Match':'"fixture-shell"'}}),html=await response.text();
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('ETag'),null);assert.equal(response.headers.get('Last-Modified'),null);
 assert.equal(meta(html,'og:title'),'Fictional &quot;LAN&quot; &lt;script&gt;alert(1)&lt;/script&gt; &amp; crew');
 assert.equal(meta(html,'og:description'),'Welcome &lt;img src=x onerror=evil&gt; &amp; game night');assert.equal(meta(html,'twitter:description'),meta(html,'og:description'));
 assert.equal(meta(html,'og:url'),origin+'/events/'+id);assert.equal(meta(html,'og:image'),origin+'/lan-hall.png');assert.equal(meta(html,'twitter:image'),meta(html,'og:image'));assert.equal(meta(html,'twitter:card'),'summary_large_image');
 assert.ok(html.includes('<link rel="canonical" href="'+origin+'/events/'+id+'">'));assert.ok(html.includes('<div id="root"></div>'));assert.ok(html.includes('src="/src/main.tsx"'));
 assert.equal(html.includes('<script>alert(1)</script>'),false);assert.equal((html.match(/<title>/g)??[]).length,1);assert.equal(html.includes('LAN Party | Home'),false);
 assert.equal((html.match(/name="description"/g)??[]).length,1);
 for(const ua of ['WhatsApp/2.24','facebookexternalhit/1.1','Twitterbot/1.0','Mozilla/5.0']){
  const r=await get(f,id,{headers:{'User-Agent':ua,Accept:'text/html','Sec-Fetch-Mode':'navigate'}});assert.equal(r.status,200);assert.equal(meta(await r.text(),'og:url'),origin+'/events/'+id);
 }
 const head=await get(f,id,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('Cache-Control'),'no-store');
 const trailing=await get(f,id+'/');assert.equal(trailing.status,200);assert.equal(meta(await trailing.text(),'og:url'),origin+'/events/'+id);
 const registration=await get(f,id+'/registration?day=2026-11-13');assert.equal(registration.status,200);assert.equal(meta(await registration.text(),'og:url'),origin+'/events/'+id);
}));
test('Draft, unpublished, cancelled and unknown pages share a generic no-store fallback even with an owner session',()=>local(async f=>{
 const owner=await f.user({genuine:true}),ids=[];
 for(const state of [{status:'draft',listed:0},{status:'published',listed:0},{status:'cancelled',listed:0},{status:'archived',listed:1}])ids.push(await event(f,{...state,title:'Private fictional event',text:'Private fictional description'}));
 ids.push(randomUUID(),'invalid','invalid/extra');
 let reference;
 for(const id of ids){
  const response=await get(f,id,{headers:{Cookie:'__Host-lan_session='+owner.token,'X-LAN-Session-Proof':owner.csrf}}),html=await response.text();
  assert.equal(response.status,404);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(meta(html,'og:url'),origin+'/events');assert.equal(meta(html,'robots'),'noindex');assert.equal(html.includes('Private fictional'),false);
  const tags=html.slice(html.indexOf('<head>'),html.indexOf('</head>'));if(reference)assert.equal(tags,reference);else reference=tags;
 }
 const id=await event(f);assert.equal((await get(f,id)).status,200);await f.sql('UPDATE event_management SET is_listed=0 WHERE event_id=?',id).run();assert.equal((await get(f,id,{headers:{'If-None-Match':'"fixture-shell"'}})).status,404);
 assert.equal((await get(f,id+'/registration')).status,404);
}));
test('metadata omits management/venue data, bounds plain descriptions and does not activate on PROD or aliases',()=>local(async f=>{
 const id=await event(f,{text:'A'.repeat(300)});await f.sql("UPDATE events SET location_visibility='authenticated' WHERE id=?",id).run();
 const html=await(await get(f,id)).text();assert.equal(Array.from(meta(html,'og:description')).length,180);assert.equal(meta(html,'og:description').endsWith('…'),true);assert.equal(html.includes('Fictional Hall'),false);
 for(const host of ['https://www.lan-party.club','https://lan-party-dev.workers.dev','https://preview.example.test']){const r=await f.fetch(host+'/events/'+id);assert.equal(meta(await r.text(),'og:title'),undefined);}
}));
test('missing publication schema returns generic 503 without an event projection',()=>local(async f=>{
 const response=await get(f,randomUUID()),html=await response.text();assert.equal(response.status,503);assert.equal(meta(html,'og:title'),'LAN Party | Events');assert.equal(meta(html,'og:url'),origin+'/events');
},27));
test('existing artwork is a PNG and default/PROD routing stays unchanged',async()=>{
 const art=await readFile('public/lan-hall.png');assert.deepEqual([...art.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const source=await readFile('wrangler.jsonc','utf8'),config=JSON.parse(source.replace(/^\s*\/\/.*$/gm,''));
 assert.deepEqual(config.assets.run_worker_first,['/api','/api/*']);assert.deepEqual(config.env.prod.assets.run_worker_first,['/api','/api/*']);assert.deepEqual(config.env.dev.assets.run_worker_first,['/api','/api/*','/events/*']);
});
