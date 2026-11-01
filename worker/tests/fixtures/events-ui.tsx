import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router';
import App from '../../../src/App';
import '../../../src/CSS/main.css';
// Fictional browser fixture: intercept all API transport; never reach providers/D1.
const template={id:'10000000-0000-4000-8000-000000000001',name:'Fictional LAN Hall',addressLine:'Example Street 1',postalCode:'0000 AA',city:'Example Town',countryCode:'NL',instructions:'Parking at side entrance',directionsUrl:'',capacity:32,rentalCents:15000,revision:0,active:1};
let rows:Record<string,unknown>[]=[],entries:Record<string,unknown>[]=[],denied=false;
window.fetch=async(input,options)=>{
 const url=new URL(String(input),location.origin);
 if(url.pathname==='/api/auth/session')return Response.json({account:{userId:'fictional-viewer',nickname:'Fictional planner',memberNumber:'11'},csrfToken:'a'.repeat(64),emailVerified:true});
 if(url.pathname==='/api/manage/capabilities')return Response.json({sections:denied?[]:['events'],authorization:(denied?'c':'b').repeat(64)});
 if(denied)return Response.json({},{status:403});
 if(url.pathname==='/api/manage/events'){
  if(options?.method==='POST'){
   const body=JSON.parse(String(options.body)),id=body.id??crypto.randomUUID(),old=rows.find(e=>e.id===id);
   if(old)Object.assign(old,body,{revision:Number(old.revision)+1});else rows.push({...body,id,status:'draft',registrationStatus:'closed',revision:0});
   entries.unshift({sequence:String(entries.length+1),occurredAt:1793500000,operation:'event.'+body.action,fields:'["details"]',title:body.title,actorName:null});return Response.json({id});
  }
  const search=url.searchParams.get('search')??'',status=url.searchParams.get('status')??'all';return Response.json({events:rows.filter(r=>String(r.title).toLowerCase().includes(search.toLowerCase())&&(status==='all'||r.status===status)),templates:[template],canCreate:true,canUpdate:true});
 }
 if(url.pathname==='/api/manage/event-activity')return Response.json({entries,nextBefore:null});
 throw Error('Unexpected transport blocked in Events fixture');
};
const revoke=document.createElement('button');revoke.textContent='Fixture: revoke event access';revoke.style.cssText='position:fixed;right:0;bottom:0;z-index:999';revoke.onclick=()=>{denied=true;new BroadcastChannel('lan-auth-invalidation').postMessage('invalidate');};document.body.append(revoke);
history.replaceState(null,'','/manage/events');createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
