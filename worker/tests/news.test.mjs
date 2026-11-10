import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {local} from './helpers/role-fixture.mjs';
const doc=text=>({type:'doc',content:[{type:'paragraph',content:text?[{type:'text',text}]:[]}]});
const call=(f,u,body,headers={})=>f.request('manage/news',u,body,{'X-LAN-Session-Proof':u?.csrf??'','X-CSRF-Token':u?.csrf??'',...headers});
async function actor(f,kind='editor'){
 const u=await f.user({genuine:kind==='admin'});await f.sql('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES(?,?,0,0)',u.id,'Fictional '+kind+' '+u.id.slice(0,6)).run();
 if(kind==='editor')await f.sql("INSERT INTO user_roles(user_id,role_id,assigned_at) SELECT ?,id,unixepoch() FROM roles WHERE code='news_editor'",u.id).run();return u;
}
async function create(f,u,title='Crew announcement',content=doc('Bring your favourite games.')){const r=await call(f,u,{action:'create',operationId:randomUUID(),title,content});assert.equal(r.status,200,await r.clone().text());return (await r.json()).id;}
async function article(f,u,id){const r=await f.request('manage/news?id='+id,u,undefined,{'X-LAN-Session-Proof':u.csrf});assert.equal(r.status,200,await r.clone().text());return (await r.json()).article;}
async function change(f,u,a,action,extra={}){return call(f,u,{action,operationId:randomUUID(),id:a.id,revision:a.revision,...extra});}

test('older schemas hide News capabilities and fail closed until the additive migration is installed',()=>local(async f=>{
 const u=await actor(f,'admin'),caps=()=>f.request('manage/capabilities',u,undefined,{'X-LAN-Session-Proof':u.csrf});
 assert.equal((await (await caps()).json()).sections.includes('news'),false);assert.equal((await call(f,u)).status,503);assert.equal((await f.request('news')).status,503);
 await f.migrate(38);assert.equal((await (await caps()).json()).sections.includes('news'),true);assert.equal((await call(f,u)).status,200);
},37));

test('News migration seeds only the assignable editorial role and four existing grants, with atomic rollback',()=>local(async f=>{
 const before=(await f.sql('SELECT * FROM role_permissions ORDER BY role_id,permission_id').all()).results,users=(await f.sql('SELECT * FROM user_roles').all()).results;
 await assert.rejects(f.migrate(38,["SELECT json('forced rollback')"]));assert.equal(await f.sql("SELECT count(*) n FROM roles WHERE code='news_editor'").first('n'),0);
 await f.migrate(38);assert.equal(await f.sql("SELECT count(*) n FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.code='news_editor'").first('n'),0);
 assert.deepEqual((await f.sql('SELECT * FROM user_roles').all()).results,users);
 assert.deepEqual((await f.sql("SELECT * FROM role_permissions WHERE role_id<>'708e77b5-2bab-4b66-8be4-600000000001' ORDER BY role_id,permission_id").all()).results,before);
 assert.deepEqual((await f.sql("SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id WHERE r.code='news_editor' ORDER BY p.code").all()).results.map(r=>r.code),['news.archive','news.create','news.publish','news.update']);
},37));

test('only editors/admins access management, proof/CSRF protect writes and capability discovery includes News',()=>local(async f=>{
 const u=await actor(f),member=await actor(f,'member');
 assert.equal((await call(f,null)).status,401);assert.equal((await call(f,member)).status,403);
 assert.equal((await call(f,u,undefined,{'X-LAN-Session-Proof':''})).status,403);
 assert.equal((await call(f,u,{action:'create',operationId:randomUUID(),title:'No CSRF',content:doc('text')},{'X-CSRF-Token':''})).status,403);
 assert.equal((await call(f,u,undefined,{Origin:'https://evil.example'})).status,403);
 const capabilities=await f.request('manage/capabilities',u,undefined,{'X-LAN-Session-Proof':u.csrf});assert.equal(capabilities.status,200);assert.deepEqual((await capabilities.json()).sections,['news']);
 await f.sql('DELETE FROM user_roles WHERE user_id=?',u.id).run();assert.equal((await call(f,u)).status,403);
}));

test('drafts never appear publicly, publish/unpublish hide direct links and preserve original dates',()=>local(async f=>{
 const u=await actor(f),id=await create(f,u);let a=await article(f,u,id);
 assert.equal((await f.request('news/'+a.slug)).status,404);assert.deepEqual((await (await f.request('news')).json()).articles,[]);
 assert.equal((await change(f,u,a,'publish')).status,200);a=await article(f,u,id);
 await f.sql('UPDATE news_articles SET created_at=0,published_at=1,updated_at=2 WHERE id=?',id).run();
 a=await article(f,u,id);assert.equal((await change(f,u,a,'update',{title:'Edited title',content:doc('Updated content')})).status,200);a=await article(f,u,id);assert.equal(a.publishedAt,1);
 const response=await f.request('news/'+a.slug);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const publicArticle=(await response.json()).article;
 assert.equal(publicArticle.title,'Edited title');assert.ok(publicArticle.editorName.startsWith('Fictional editor'));assert.equal('author_user_id' in publicArticle,false);assert.equal('revision' in publicArticle,false);assert.equal(JSON.stringify(publicArticle).includes('@example.test'),false);
 assert.equal((await change(f,u,a,'unpublish')).status,200);a=await article(f,u,id);assert.equal(a.status,'archived');assert.equal(a.publishedAt,1);assert.equal((await f.request('news/'+a.slug)).status,404);
 assert.equal((await change(f,u,a,'publish')).status,200);assert.equal((await article(f,u,id)).publishedAt,1);
}));

test('independent permissions and genuine Administrator-only permanent deletion are enforced',()=>local(async f=>{
 const u=await actor(f),admin=await actor(f,'admin'),id=await create(f,u),a=await article(f,u,id);
 assert.equal((await change(f,u,a,'delete',{confirmation:a.title})).status,403);
 await f.sql("DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE code='news_editor') AND permission_id=(SELECT id FROM permissions WHERE code='news.publish')").run();
 assert.equal((await change(f,u,a,'publish')).status,403);
 assert.equal((await change(f,admin,a,'delete',{confirmation:'wrong'})).status,400);
 assert.equal((await change(f,admin,a,'delete',{confirmation:a.title})).status,200);
 assert.equal(await f.sql('SELECT count(*) n FROM news_articles WHERE id=?',id).first('n'),0);assert.equal(await f.sql("SELECT count(*) n FROM news_activity WHERE article_id=? AND action='delete'",id).first('n'),1);
}));

test('stale updates and duplicate operations cannot overwrite or create duplicate articles',()=>local(async f=>{
 const u=await actor(f),body={action:'create',operationId:randomUUID(),title:'One announcement',content:doc('hello')};
 const first=await (await call(f,u,body)).json(),again=await (await call(f,u,body)).json();assert.equal(first.id,again.id);assert.equal(again.duplicate,true);
 assert.equal((await call(f,u,{...body,title:'Different payload'})).status,409);const a=await article(f,u,first.id);
 assert.equal((await change(f,u,a,'update',{title:'First edit',content:doc('saved')})).status,200);
 assert.equal((await change(f,u,a,'update',{title:'Stale edit',content:doc('must not save')})).status,409);
 assert.equal((await article(f,u,first.id)).title,'First edit');assert.equal(await f.sql('SELECT count(*) n FROM news_activity WHERE article_id=?',first.id).first('n'),2);
}));

test('empty drafts, malicious documents and unsafe links fail publication/validation without side effects',()=>local(async f=>{
 const u=await actor(f),id=await create(f,u,'Empty draft',doc('')),a=await article(f,u,id);
 assert.equal((await change(f,u,a,'publish')).status,400);
 for(const content of [{type:'script',content:[]},{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'bad',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]}])assert.equal((await change(f,u,a,'update',{title:'Unsafe',content})).status,400);
 assert.equal((await article(f,u,id)).title,'Empty draft');assert.equal(await f.sql('SELECT count(*) n FROM news_activity').first('n'),1);
}));

test('disabled sessions and MFA enrollment fence News access',()=>local(async f=>{
 const u=await actor(f);await f.sql("INSERT INTO auth_totp_factors(user_id,factor_id,secret_ciphertext,secret_nonce,key_id,last_step,recovery_set_id,enabled_at) VALUES(?,?,?,?,?,0,?,0)",u.id,randomUUID(),'11'.repeat(36),'22'.repeat(12),'fictional',randomUUID()).run();assert.equal((await call(f,u)).status,401);
 const b=await actor(f);await f.sql('UPDATE auth_sessions SET revoked_at=unixepoch() WHERE token_digest=?',b.digest).run();assert.equal((await call(f,b)).status,401);
}));

test('public list is bounded, newest published first and title changes do not change stable slugs',()=>local(async f=>{
 const u=await actor(f),ids=[];for(let i=0;i<4;i++){const id=await create(f,u,'Repeated title');ids.push(id);const a=await article(f,u,id);assert.equal((await change(f,u,a,'publish')).status,200);await f.sql('UPDATE news_articles SET created_at=0,published_at=?,updated_at=max(updated_at,?) WHERE id=?',i+1,i+1,id).run();}
 const r=await (await f.request('news?limit=3')).json();assert.equal(r.articles.length,3);assert.equal(r.hasMore,true);assert.deepEqual(r.articles.map(a=>a.id),[ids[3],ids[2],ids[1]]);assert.equal('content' in r.articles[0],false);assert.equal(new Set(r.articles.map(a=>a.slug)).size,3);
 const a=await article(f,u,ids[0]);assert.equal((await change(f,u,a,'update',{title:'New title',content:doc('changed')})).status,200);assert.equal((await article(f,u,ids[0])).slug,a.slug);
 assert.equal((await f.request('news?limit=5000')).status,400);
}));

test('transaction rechecks session and permission revocation before saving or auditing',()=>local(async f=>{
 for(const fence of ['permission','session']){
  const u=await actor(f),id=await create(f,u),a=await article(f,u,id);
  const r=await call(f,u,{action:'update',operationId:randomUUID(),id,revision:a.revision,title:'Must not save',content:doc('no')},{'X-Fixture-Registration-Fence':fence,'X-Fixture-Payment-Commit':'1','X-Fixture-Actor':u.id,'X-Fixture-Digest':u.digest});
  assert.equal(r.status,409,await r.clone().text());assert.equal(await f.sql('SELECT title FROM news_articles WHERE id=?',id).first('title'),a.title);assert.equal(await f.sql('SELECT count(*) n FROM news_activity WHERE article_id=?',id).first('n'),1);
 }
}));

test('actual account deletion anonymizes News attribution and audit actors while retaining published content',()=>local(async f=>{
 const u=await actor(f),id=await create(f,u),a=await article(f,u,id);assert.equal((await change(f,u,a,'publish')).status,200);
 await f.sql("INSERT INTO auth_recent_authentication(session_digest,user_id,auth_version,method,authenticated_at,expires_at) VALUES(?,?,0,'password',unixepoch(),unixepoch()+300)",u.digest,u.id).run();
 const removed=await f.fetch('http://127.0.0.1:5173/fixture-news-delete',{headers:{'X-Fixture-Actor':u.id,'X-Fixture-Digest':u.digest}});assert.equal(removed.status,200,await removed.clone().text());
 const stored=await f.sql('SELECT author_user_id,updated_by_user_id,publication_status FROM news_articles WHERE id=?',id).first();assert.deepEqual(stored,{author_user_id:null,updated_by_user_id:null,publication_status:'published'});
 assert.equal(await f.sql('SELECT count(*) n FROM news_activity WHERE article_id=? AND actor_id IS NOT NULL',id).first('n'),0);
 assert.equal((await (await f.request('news/'+a.slug)).json()).article.editorName,null);
}));

test('anonymous page metadata exposes only published posts, escapes HTML and returns 404 after unpublish',()=>local(async f=>{
 const u=await actor(f),id=await create(f,u,'<script>News & games</script>'),a=await article(f,u,id),url='http://127.0.0.1:5173/news/'+a.slug;
 assert.equal((await f.fetch(url)).status,404);assert.equal((await change(f,u,a,'publish')).status,200);
 const response=await f.fetch(url);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const html=await response.text();assert.ok(html.includes('&lt;script&gt;News &amp; games&lt;/script&gt;'));assert.equal(html.includes('<script>News'),false);assert.equal(html.includes('@example.test'),false);
 assert.equal((await f.fetch(url,{method:'HEAD'})).status,200);assert.equal((await change(f,u,await article(f,u,id),'unpublish')).status,200);assert.equal((await f.fetch(url)).status,404);
}));
