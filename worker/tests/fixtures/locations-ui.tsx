import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import App from '../../../src/App';
import '../../../src/CSS/main.css';
import type {LocationRow} from '../../../src/lib/locations';
// In-memory fictional data only; every unexpected transport is blocked.
const params=new URLSearchParams(location.search);
if(params.has('mode'))sessionStorage.setItem('locations-fixture-mode',params.get('mode')!);
const allSections=sessionStorage.getItem('locations-fixture-mode')==='admin';
let denied=false;
let rows:LocationRow[]=[{id:'10000000-0000-4000-8000-000000000001',name:'Fictional LAN Hall',addressLine:'Example Street 1',postalCode:'0000 AA',city:'Example Town',countryCode:'NL',instructions:'Parking at the side entrance.\nBring a power strip.',capacity:32,rentalCents:15000,directionsUrl:null,active:1,revision:0}];
const entries:object[]=[];
window.fetch=async(input,options)=>{
 const url=new URL(String(input),location.origin);
 if(url.pathname==='/api/auth/session')return Response.json({account:{userId:'fictional-viewer',nickname:'Fictional manager',memberNumber:'11'},csrfToken:'a'.repeat(64),emailVerified:true});
 if(url.pathname==='/api/manage/capabilities')return Response.json({sections:denied?[]:allSections?['users','roles','locations']:['locations'],authorization:(denied?'c':'b').repeat(64)});
 if(denied)return Response.json({},{status:403});
 if(url.pathname==='/api/manage/users')return Response.json({members:[{userId:'10000000-0000-4000-8000-000000000011',nickname:'Fictional member',memberNumber:'11',status:'active',roles:[]}],nextCursor:null});
 if(url.pathname==='/api/manage/users/10000000-0000-4000-8000-000000000011')return Response.json({member:{userId:'10000000-0000-4000-8000-000000000011',nickname:'Fictional member',memberNumber:'11',status:'active',roles:[],email:'fictional@example.test',firstName:'Fictional',lastName:'Person',prefix:null,verified:true,createdAt:0}});
 if(url.pathname==='/api/manage/locations'){
  if(options?.method==='POST'){
   const body=JSON.parse(String(options.body)),id=body.id??crypto.randomUUID(),old=rows.find(r=>r.id===id);
   if(body.action==='create')rows.push({...body,id,active:1,revision:0});
   else if(old){if(body.action==='archive'||body.action==='restore')old.active=body.action==='restore'?1:0;else Object.assign(old,body);old.revision++;}
   entries.unshift({sequence:String(entries.length+1),occurredAt:1793500000,operation:'location.'+body.action,fields:JSON.stringify([body.action==='update'?'name':'active']),locationName:body.name??old?.name,actorName:'Fictional manager'});
   return Response.json({id});
  }
  const status=url.searchParams.get('status')??'active',search=url.searchParams.get('search')??'';
  return Response.json({locations:rows.filter(r=>(status==='all'||r.active===(status==='active'?1:0))&&r.name.toLowerCase().includes(search.toLowerCase())).map(r=>({...r,...Object.fromEntries(['addressLine','postalCode','city','countryCode','instructions','directionsUrl'].map(k=>[k,r[k as keyof LocationRow]||null]))}))});
 }
 if(url.pathname==='/api/manage/location-activity')return Response.json({entries,nextBefore:null});
 if(url.pathname==='/api/feedback/unread')return Response.json({unread:0});
 throw Error('Unexpected transport blocked in Locations fixture');
};
const controls=document.createElement('button');controls.textContent='Fixture: revoke locations access';controls.style.cssText='position:fixed;right:0;bottom:0;z-index:999';controls.onclick=()=>{denied=true;new BroadcastChannel('lan-auth-invalidation').postMessage('invalidate');};document.body.append(controls);
if(location.pathname.endsWith('.html'))history.replaceState(null,'',params.get('route')??'/manage/locations');
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
