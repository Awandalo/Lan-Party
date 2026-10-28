import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import App from '../../../src/App';
import '../../../src/CSS/main.css';
// Fictional browser fixture only: no requests reach an external provider/database.
const params=new URLSearchParams(location.search),mode=params.get('mode')??'viewer';
let identity='A',denied=false,fail=false,signedOut=false,requests=0,pending=0;
const rows=Array.from({length:24},(_,i)=>({userId:'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),nickname:i===0?'Slow Member':i===1?'Fast Member':'Member '+String(i+1).padStart(2,'0'),memberNumber:String(i+11),status:'active',roles:[{code:'reader',name:'Member viewer',active:true}]}));
window.fetch=async(input)=>{
 const url=new URL(String(input),location.origin),who=identity;requests++;pending++;
 const search=url.searchParams.get('search')??'';
 await new Promise(resolve=>setTimeout(resolve,search.toLowerCase()==='slow'?1200:200));
 pending--;
 if(url.pathname==='/api/auth/session' && signedOut)return Response.json({},{status:401});
 if(url.pathname==='/api/auth/session')return Response.json({account:{userId:'fictional-'+who,nickname:'Viewer '+who,memberNumber:'1'},csrfToken:(who==='A'?'a':'b').repeat(64),emailVerified:true});
 if(url.pathname==='/api/manage/capabilities')return Response.json({sections:denied?[]:['users']},{status:denied?403:200});
 if(url.pathname.startsWith('/api/manage/users')){
  if(denied||mode==='manage-only')return Response.json({},{status:403});
  if(fail)return Response.json({},{status:503});
  const id=url.pathname.split('/')[4];
  if(id){const row=rows.find(r=>r.userId===id);return row?Response.json({member:{...row,nickname:row.nickname+' '+who,email:'fictional-'+who.toLowerCase()+'@example.test',firstName:'Fictional '+who,lastName:'Tester',prefix:null,createdAt:1790000000,verified:true}}):Response.json({},{status:404});}
  const filtered=rows.filter(r=>!search || (url.searchParams.get('kind')==='number'?r.memberNumber===search.replace(/^#/,'').replace(/^0+/,''):r.nickname.toLowerCase().startsWith(search.toLowerCase())));
  const offset=url.searchParams.has('cursor')?20:0;
  return Response.json({members:filtered.slice(offset,offset+20).map(r=>({...r,nickname:r.nickname+' '+who})),nextCursor:offset===0&&filtered.length>20?'fictional-next':null});
 }
 throw Error('External transport forbidden in fixture');
};
const controls=document.createElement('div');controls.style='position:fixed;right:0;bottom:0;background:white;color:black;z-index:999;font:12px monospace';
controls.innerHTML='<button id="member-revoke">Revoke access</button><button id="member-switch">Switch identity</button><button id="member-outage">API outage</button><button id="member-expire">Expire session</button><output id="member-counters"></output>';document.body.append(controls);
const invalidate=()=>new BroadcastChannel('lan-auth-invalidation').postMessage('invalidate');
document.querySelector('#member-revoke')!.addEventListener('click',()=>{denied=true;invalidate();});
document.querySelector('#member-switch')!.addEventListener('click',()=>{identity=identity==='A'?'B':'A';invalidate();});
document.querySelector('#member-expire')!.addEventListener('click',()=>{signedOut=true;invalidate();});
document.querySelector('#member-outage')!.addEventListener('click',()=>{fail=true;invalidate();});
setInterval(()=>{document.querySelector('#member-counters')!.textContent=JSON.stringify({requests,pending,identity,denied,fail,overflow:document.documentElement.scrollWidth>innerWidth});},50);
if(location.pathname.endsWith('.html'))history.replaceState(null,'',params.get('route')??'/manage/users');
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
