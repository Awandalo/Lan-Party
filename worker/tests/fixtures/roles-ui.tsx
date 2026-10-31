import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import App from '../../../src/App';
import '../../../src/CSS/main.css';
// Fictional UI transport. It never queries a database or external service;
// real Worker authorization and transaction tests are separate.
const params=new URLSearchParams(location.search),mode=params.get('mode')??sessionStorage.getItem('lan-layout-preview-mode')??'guest';
// Fixture presentation mode only, no identity, grant, token or production cache.
sessionStorage.setItem('lan-layout-preview-mode',mode);
let revoked=false,revision=0,mutations=0,signedOut=false;
let memberState=params.get('account')==='deactivated'?'deactivated':'active',memberVersion=0,invitationId:string|null=null;
const commandResults=new Map<string,string>();
const recipientScenario=params.get('reactivation');let recipientClaims=0,recipientCompletions=0,recipientInspections=0,recipientClaimed=false,recipientVerified=false;
const requests:{path:string;start:number;end?:number}[]=[],delay=Math.min(3000,Math.max(0,Number(params.get('delay')??100)));
const actor='10000000-0000-4000-8000-000000000001',target='10000000-0000-4000-8000-000000000002';
const roles=[{id:'1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7',code:'admin',name:'Administrator',description:'Built-in',isActive:1,isProtected:1},{id:'193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f',code:'user',name:'User',description:'Built-in',isActive:1,isProtected:0},{id:'20000000-0000-4000-8000-000000000001',code:'fictional_news',name:'Fictional News Team',description:'Fictional team',isActive:1,isProtected:0}];
const permissions=['news.create','users.view','roles.manage','roles.protect_admin','events.create','events.update','events.publish','events.cancel','events.manage_registrations','news.update','news.publish','news.archive','locations.manage','users.manage'].map((code,i)=>({id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),code,description:({
 'news.create':'Draft announcements for the community.','users.view':'Browse members and their private account details.','roles.manage':'Manage ordinary roles and their memberships.','roles.protect_admin':'Reserved protection capability; genuine Administrator membership is still required.',
 'events.create':'Create new LAN events.','events.update':'Update event details and schedules.','events.publish':'Make events visible to the community.','events.cancel':'Cancel an event when plans change.','events.manage_registrations':'Manage participant registrations for events.',
 'news.update':'Update existing announcements.','news.publish':'Publish announcements for the crew.','news.archive':'Archive old announcements.','locations.manage':'Maintain event locations.','users.manage':'Carry out authorized member administration.'
 } as Record<string,string>)[code],protected:['users.view','users.manage','roles.manage','roles.protect_admin'].includes(code)}));
let mappings=[{roleId:roles[2].id,permissionId:permissions[0].id,grantedAt:0}];
roles.push({id:'20000000-0000-4000-8000-000000000002',code:'fictional_events',name:'Fictional Event Planner',description:'Fictional event planning role',isActive:1,isProtected:0});
mappings.push({roleId:roles[3].id,permissionId:permissions.find(p=>p.code==='events.create')!.id,grantedAt:0});
const assignments=[{roleId:roles[1].id,assignedAt:0}];
const entries:{sequence:string;operationId:string;occurredAt:number;actorId:string;operation:string;roleId:string;accountId:string|null;delta:string}[]=[
 {sequence:'2',operationId:'40000000-0000-4000-8000-000000000002',occurredAt:1793361600,actorId:actor,operation:'membership.add',roleId:roles[1].id,accountId:target,delta:JSON.stringify({assigned:{before:false,after:true}})},
 {sequence:'1',operationId:'40000000-0000-4000-8000-000000000001',occurredAt:1793300000,actorId:actor,operation:'role.update',roleId:roles[2].id,accountId:null,delta:JSON.stringify({fields:['description'],active:{before:1,after:1},protected:{before:0,after:0},permissions:{before:[],after:[permissions[0].id]}})}
];
const catalogue=()=>({deletionAvailable:params.get('deletion')!=='unavailable',roles:roles.map((role,index)=>({...role,...(mode==='delegated'?{}:{assignedMemberCount:[1,8,3][index]??0})})),permissions,mappings,revision,administrator:!['delegated','member','guest'].includes(mode)});
if(params.get('log')==='multi')for(let n=25;n>2;n--)entries.push({...entries[0],sequence:String(n)});
if(params.get('log')==='empty')entries.length=0;
window.fetch=async(input,init)=>{
 const url=new URL(String(input),location.origin),request={path:url.pathname,start:Math.round(performance.now())} as typeof requests[number];requests.push(request);await new Promise(resolve=>setTimeout(resolve,delay));request.end=Math.round(performance.now());
 if(recipientScenario&&url.pathname==='/api/auth/session')return recipientVerified?Response.json({account:{userId:target,nickname:'Fictional Participant',memberNumber:'11'},csrfToken:'d'.repeat(64),emailVerified:true}):recipientScenario==='switch-account'?Response.json({account:{userId:actor,nickname:'Fictional Administrator',memberNumber:'1'},csrfToken:'a'.repeat(64),emailVerified:true}):Response.json({},{status:401});
 if(recipientScenario&&url.pathname==='/api/manage/capabilities')return Response.json({sections:recipientScenario==='switch-account'&&!recipientVerified?['users','roles','activity']:[]});
 if(recipientScenario&&url.pathname.startsWith('/api/auth/lifecycle/reactivation/')){
  const origin=recipientScenario==='voluntary'?'voluntary':'administrator';
  if(url.pathname.endsWith('/inspect')){recipientInspections++;return Response.json({available:!['cancelled','expired','replayed'].includes(recipientScenario),claimed:false,origin});}
  if(url.pathname.endsWith('/claim')){recipientClaims++;if(recipientScenario==='late-cancelled')return Response.json({error:'Invitation unavailable. Ask the administrator for a new invitation.'},{status:409});recipientClaimed=true;return Response.json({csrfToken:'d'.repeat(64)});}
  if(url.pathname.endsWith('/status'))return recipientClaimed?Response.json({available:true,mfa:true,origin,csrfToken:'d'.repeat(64)}):Response.json({},{status:401});
  if(url.pathname.endsWith('/complete')){recipientCompletions++;recipientVerified=true;return Response.json({next:'/account'});}
  if(url.pathname.endsWith('/cancel')){recipientClaimed=false;return Response.json({message:'Reactivation cancelled. Your account remains disabled.'});}
 }
 if(url.pathname==='/api/auth/logout'){if(params.get('logout')==='fail')return Response.json({},{status:503});signedOut=true;return Response.json({ok:true});}
 if(url.pathname==='/api/auth/session')return signedOut||mode==='guest'?Response.json({},{status:401}):Response.json({account:{userId:actor,nickname:mode==='member'?'Fictional Member':'Fictional Administrator',memberNumber:'1'},csrfToken:'a'.repeat(64),emailVerified:true});
 if(url.pathname==='/api/manage/capabilities')return Response.json({sections:signedOut||revoked||mode==='member'||mode==='guest'?[]:mode==='delegated'?['roles']:['users','roles','activity','userActivity','events'],authorization:'a'.repeat(64)});
 if(params.get('security')==='visual'&&['/api/auth/mfa/manage/start','/api/auth/mfa/recovery/from-session'].includes(url.pathname))return Response.json({code:'reauth_required',primaryRequired:true,error:'Confirm your sign-in method.'},{status:428});
 if(url.pathname==='/api/auth/security/methods')return params.get('security')==='error'?Response.json({},{status:503}):Response.json({password:true});
 if(url.pathname==='/api/auth/lifecycle/status')return Response.json({available:true,administrator:mode==='admin',memberCommands:mode==='admin',deletionAvailable:false});
 if(url.pathname==='/api/auth/mfa/status')return params.get('security')==='error'?Response.json({},{status:503}):Response.json({enabled:params.get('mfa')!=='disabled',enrollmentAvailable:true});
 if(url.pathname==='/api/auth/security/change-password')return Response.json({error:'Fictional validation response. No password was changed.'},{status:400});
 if(url.pathname==='/api/manage/user-activity'){
  if(mode!=='admin'||revoked||signedOut)return Response.json({},{status:403});
  let rows=[
  {sequence:'2',occurredAt:1793390400,event:'invitation.accepted',actorKind:'system',dateOnly:0,actorId:null,targetId:target,operationId:'fictional-reference',actorName:null,targetName:'Fictional Participant'},
  {sequence:'1',occurredAt:1793318400,event:'account.deleted',actorKind:'anonymous',dateOnly:1,actorId:null,targetId:null,operationId:null,actorName:null,targetName:null},
  ];
  if(params.get('log')==='multi')rows=Array.from({length:25},(_,i)=>({...rows[0],sequence:String(25-i)}));
  if(params.get('log')==='empty')rows=[];
  rows=rows.filter(row=>BigInt(row.sequence)<BigInt(url.searchParams.get('before')??'9223372036854775807')&&(!url.searchParams.get('event')||row.event===url.searchParams.get('event')));
  return Response.json({entries:rows.slice(0,20),nextBefore:rows.length>20?rows[19].sequence:null});
 }
 if(mode==='guest'||mode==='member')return Response.json({},{status:403});
 if(revoked)return Response.json({},{status:403});
 if(url.pathname==='/api/auth/lifecycle/status')return Response.json({available:true,administrator:mode==='admin',memberCommands:mode==='admin'});
 if(url.pathname==='/api/auth/lifecycle/member')return Response.json({member:{version:memberVersion,issuedAt:Math.floor(Date.now()/1000),status:memberState==='active'?'active':'disabled',origin:memberState==='admin-disabled'?'administrator':'voluntary',invitationId,eligible:memberState==='active'?0:1}});
 if(url.pathname==='/api/auth/lifecycle/command'){
  const body=JSON.parse(String(init?.body));if(commandResults.has(body.operationId))return Response.json({outcome:commandResults.get(body.operationId),replayed:true});
  mutations++;let outcome='accepted';
  if(body.action==='disable'){memberState='admin-disabled';memberVersion++;invitationId=null;outcome='disabled';}
  else if(body.action==='cancel'){invitationId=null;outcome='cancelled';}
  else {invitationId=body.operationId;if(params.get('delivery')==='unconfirmed'){outcome='unconfirmed';invitationId=null;}}
  commandResults.set(body.operationId,outcome);return Response.json({outcome});
 }
 if(/^\/api\/manage\/roles\/[^/]+\/deletion$/.test(url.pathname)){if(params.get('deletion')==='error')return Response.json({},{status:503});const roleId=url.pathname.split('/')[4],assigned=params.get('deletion')==='assigned'||[roles[0]?.id,roles[1]?.id,roles[2]?.id].includes(roleId);return Response.json({state:params.get('deletion')==='unavailable'?'unavailable':assigned?'assigned':'available'});}
 if(url.pathname==='/api/manage/role-activity'){
  const start=url.searchParams.get('date')?Date.parse(url.searchParams.get('date')+'T00:00:00Z')/1000:null,action=url.searchParams.get('operation'),search=(url.searchParams.get('search')??'').toLowerCase(),before=BigInt(url.searchParams.get('before')??'9223372036854775807');
  const projected=entries.map(entry=>({...entry,actorName:'Fictional Administrator',accountName:entry.accountId?'Fictional Participant':null,roleName:roles.find(role=>role.id===entry.roleId)?.name??null})).filter(entry=>BigInt(entry.sequence)<before&&(!action||entry.operation===action)&&(start===null||entry.occurredAt>=start&&entry.occurredAt<start+86400)&&JSON.stringify(entry).toLowerCase().includes(search)).sort((a,b)=>Number(BigInt(b.sequence)-BigInt(a.sequence)));
  return Response.json({entries:projected.slice(0,20),nextBefore:projected.length>20?projected[19].sequence:null,permissions:permissions.map(({id,code})=>({id,code}))});
 }
 if(url.pathname.endsWith('/roles')){
  if(init?.method==='POST') {
   if(mode==='conflict')return Response.json({},{status:409});
   const body=JSON.parse(String(init.body));mutations++;revision++;
   if(body.action==='create'){const id=crypto.randomUUID();roles.push({id,code:body.code,name:body.name,description:body.description,isActive:Number(body.active),isProtected:Number(body.protected)});mappings.push(...body.permissionIds.map((p:string)=>({roleId:id,permissionId:p,grantedAt:0})));}
   else if(body.action==='delete'){if(params.get('deletion')==='assigned')return Response.json({code:'role_assigned'},{status:409});roles.splice(roles.findIndex(r=>r.id===body.roleId),1);mappings=mappings.filter(m=>m.roleId!==body.roleId);}
   else if(body.action==='update'){Object.assign(roles.find(r=>r.id===body.roleId)!,{name:body.name,description:body.description,isActive:Number(body.active),isProtected:Number(body.protected)});mappings=mappings.filter(m=>m.roleId!==body.roleId);mappings.push(...body.permissionIds.map((p:string)=>({roleId:body.roleId,permissionId:p,grantedAt:0})));}
   else if(body.action==='assign')assignments.push({roleId:body.roleId,assignedAt:0});
   else if(body.action==='remove'){const index=assignments.findIndex(a=>a.roleId===body.roleId);if(index>=0)assignments.splice(index,1);}
   entries.unshift({sequence:String(entries.length+1),operationId:body.operationId,occurredAt:Math.floor(Date.now()/1000),actorId:actor,operation:({create:'role.create',update:'role.update',delete:'role.delete',assign:'membership.add',remove:'membership.remove'} as Record<string,string>)[body.action],roleId:body.roleId??roles.at(-1)!.id,accountId:body.accountId??null,delta:JSON.stringify(body.action==='assign'||body.action==='remove'?{assigned:{before:body.action==='remove',after:body.action==='assign'}}:{fields:['name','description']})});
   return Response.json({revision});
  }
  return Response.json({...catalogue(),...(url.pathname.includes('/users/')?{assignments,effectivePermissions:['news.create']}: {})});
 }
 if(url.pathname==='/api/manage/users/'+target)return Response.json({member:{userId:target,nickname:'Fictional Participant',memberNumber:'11',status:memberState,roles:assignments.map(a=>roles.find(r=>r.id===a.roleId)!).map(r=>({code:r.code,name:r.name,active:!!r.isActive})),email:'fictional@example.test',firstName:memberState==='deactivated'?null:'Fictional',lastName:memberState==='deactivated'?null:'Tester',prefix:null,verified:true,createdAt:1790000000}});
 if(url.pathname==='/api/manage/users'){
  const empty=params.get('members')==='empty'||url.searchParams.get('roleId')===roles[3]?.id&&params.get('deletion')!=='assigned';
  return Response.json({members:empty?[]:[{userId:target,nickname:'Fictional Participant',memberNumber:'11',status:'active',roles:[]}],nextCursor:!empty&&params.get('members')==='multi'&&!url.searchParams.has('cursor')?'fictional-next':null});
 }
 throw Error('Unexpected fixture request');
};
const preview=document.createElement('div');preview.className='layout-preview-toolbar';preview.innerHTML='<span>Local layout preview · fictional data</span><a href="/after.html?mode=guest&route=/">Public</a><a href="/after.html?mode=member&route=/account">Member</a><a href="/after.html?mode=admin&route=/manage/roles">Administrator</a><a href="/after.html?mode=delegated&route=/manage/roles">Role manager</a>';document.body.append(preview);
const style=document.createElement('style');style.textContent='.layout-preview-toolbar{position:fixed;bottom:12px;right:12px;z-index:50;display:flex;gap:12px;flex-wrap:wrap;max-width:calc(100% - 24px);padding:10px 14px;background:#171c22;border:1px solid #8de2bd;border-radius:9px;font:12px system-ui;box-shadow:0 4px 24px #0008}.layout-preview-toolbar span{color:#aeb9c7}.layout-preview-toolbar a{color:#8de2bd}';document.head.append(style);
const controls=document.createElement('details');controls.innerHTML='<summary>Fictional preview diagnostics</summary><button id="role-revoke">Revoke access</button><button id="role-check-session">Check session</button><output id="role-counters"></output>';document.body.append(controls);
controls.className='layout-preview-diagnostics';
style.textContent+='.layout-preview-diagnostics{margin:1rem 1rem 5rem 264px;font:12px system-ui;color:#aeb9c7}.layout-preview-diagnostics button{margin:10px;padding:8px;cursor:pointer}.layout-preview-diagnostics output{display:block}@media(max-width:900px){.layout-preview-diagnostics{margin-left:1rem}}';
// Keep fixture navigation out of the editor's sticky action area.
style.textContent+='body:has(.role-sticky-actions) .layout-preview-toolbar{display:none}';
controls.style.overflowWrap='anywhere';
document.querySelector('#role-revoke')!.addEventListener('click',()=>{revoked=true;new BroadcastChannel('lan-auth-invalidation').postMessage('invalidate');});
document.querySelector('#role-check-session')!.addEventListener('click',()=>{window.dispatchEvent(new Event('blur'));window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
setInterval(()=>{document.querySelector('#role-counters')!.textContent=JSON.stringify({revision,mutations,requests,recipientInspections,recipientClaims,recipientCompletions});},30);
if(location.pathname.endsWith('.html'))history.replaceState(null,'',(params.get('route')??'/manage/roles')+location.hash);
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
