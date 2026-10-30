import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import App from '../../../src/App';
import '../../../src/CSS/main.css';
// Fictional UI transport. It never queries a database or external service;
// real Worker authorization and transaction tests are separate.
const params=new URLSearchParams(location.search),mode=params.get('mode')??'admin';
let revoked=false,revision=0,mutations=0;
const requests:{path:string;start:number;end?:number}[]=[],delay=Math.min(3000,Math.max(0,Number(params.get('delay')??100)));
const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002';
const roles=[{id:'1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7',code:'admin',name:'Administrator',description:'Built-in',isActive:1,isProtected:1},{id:'193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f',code:'user',name:'User',description:'Built-in',isActive:1,isProtected:0},{id:'20000000-0000-4000-8000-000000000001',code:'fictional_news',name:'Fictional News Team',description:'Fictional team',isActive:1,isProtected:0}];
const permissions=['news.create','users.view','roles.manage','roles.protect_admin'].map((code,i)=>({id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),code,description:'Fictional description for '+code,protected:code!=='news.create'}));
let mappings=[{roleId:roles[2].id,permissionId:permissions[0].id,grantedAt:0}];
const assignments=[{roleId:roles[1].id,assignedAt:0}];
const entries:{sequence:string;operationId:string;occurredAt:number;actorId:string;operation:string;roleId:string;accountId:string|null;delta:string}[]=[];
const catalogue=()=>({roles,permissions,mappings,revision,administrator:mode!=='delegated'});
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin),request={path:url.pathname,start:Math.round(performance.now())} as typeof requests[number];requests.push(request);await new Promise(resolve=>setTimeout(resolve,delay));request.end=Math.round(performance.now());
 if(url.pathname==='/api/auth/session')return Response.json({account:{userId:actor,nickname:'Fictional Administrator',memberNumber:'1'},csrfToken:'a'.repeat(64),emailVerified:true});
 if(url.pathname==='/api/manage/capabilities')return Response.json({sections:revoked?[]:mode==='delegated'?['roles']:['users','roles','activity']});
 if(revoked)return Response.json({},{status:403});
 if(url.pathname==='/api/manage/role-activity')return Response.json({entries,nextBefore:null});
 if(url.pathname.endsWith('/roles')){
  if(init?.method==='POST') {
   if(mode==='conflict')return Response.json({},{status:409});
   const body=JSON.parse(String(init.body));mutations++;revision++;
   if(body.action==='create'){const id=crypto.randomUUID();roles.push({id,code:body.code,name:body.name,description:body.description,isActive:Number(body.active),isProtected:Number(body.protected)});mappings.push(...body.permissionIds.map((p:string)=>({roleId:id,permissionId:p,grantedAt:0})));}
   else if(body.action==='update'){Object.assign(roles.find(r=>r.id===body.roleId)!,{name:body.name,description:body.description,isActive:Number(body.active),isProtected:Number(body.protected)});mappings=mappings.filter(m=>m.roleId!==body.roleId);mappings.push(...body.permissionIds.map((p:string)=>({roleId:body.roleId,permissionId:p,grantedAt:0})));}
   else if(body.action==='assign')assignments.push({roleId:body.roleId,assignedAt:0});
   else if(body.action==='remove'){const index=assignments.findIndex(a=>a.roleId===body.roleId);if(index>=0)assignments.splice(index,1);}
   entries.unshift({sequence:String(revision),operationId:body.operationId,occurredAt:1793300000,actorId:actor,operation:body.action,roleId:body.roleId??roles.at(-1)!.id,accountId:body.accountId??null,delta:'{"fields":["name"]}'});
   return Response.json({revision});
  }
  return Response.json({...catalogue(),...(url.pathname.includes('/users/')?{assignments,effectivePermissions:['news.create']}: {})});
 }
 if(url.pathname==='/api/manage/users/'+target)return Response.json({member:{userId:target,nickname:'Fictional Participant',memberNumber:'11',status:'active',roles:[],email:'fictional@example.test',firstName:'Fictional',lastName:'Tester',prefix:null,verified:true,createdAt:1790000000}});
 if(url.pathname==='/api/manage/users')return Response.json({members:[{userId:target,nickname:'Fictional Participant',memberNumber:'11',status:'active',roles:[]}],nextCursor:null});
 throw Error('Unexpected fixture request');
};
const controls=document.createElement('div');controls.innerHTML='<button id="role-revoke">Revoke access</button><button id="role-check-session">Check session</button><output id="role-counters"></output>';document.body.append(controls);
controls.style.overflowWrap='anywhere';
document.querySelector('#role-revoke')!.addEventListener('click',()=>{revoked=true;new BroadcastChannel('lan-auth-invalidation').postMessage('invalidate');});
document.querySelector('#role-check-session')!.addEventListener('click',()=>window.dispatchEvent(new Event('focus')));
setInterval(()=>{document.querySelector('#role-counters')!.textContent=JSON.stringify({revision,mutations,requests});},30);
if(location.pathname.endsWith('.html'))history.replaceState(null,'',params.get('route')??'/manage/roles');
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
