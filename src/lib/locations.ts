import {useEffect,useState,useSyncExternalStore} from 'react';
import {useAuth} from './auth';
export interface LocationRow {id:string;name:string;addressLine:string|null;postalCode:string|null;city:string|null;countryCode:string|null;instructions:string|null;capacity:number|null;rentalCents:number;directionsUrl:string|null;active:0|1;revision:number}
export interface LocationLog {sequence:string;occurredAt:number;operation:string;fields:string;locationName:string;actorName:string|null}
export function locationDirections(row:Pick<LocationRow,'addressLine'|'postalCode'|'city'|'countryCode'|'directionsUrl'>){
 if(row.directionsUrl){
  try{const u=new URL(row.directionsUrl),google=['maps.google.com','www.google.com','google.com'].includes(u.hostname);
   if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(google&&(u.hostname==='maps.google.com'||u.pathname==='/maps'||u.pathname.startsWith('/maps/'))||u.hostname==='maps.app.goo.gl'&&u.pathname.length>1))return u.href;
  }catch{/* Invalid drafts never become clickable links. */}
  return null;
 }
 if(!row.addressLine||!row.postalCode||!row.city||!row.countryCode)return null;
 return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent([row.addressLine,row.postalCode,row.city,row.countryCode].join(', '));
}
export const locationComplete=(row:LocationRow)=>!!(row.addressLine&&row.postalCode&&row.city&&row.countryCode&&row.capacity);
export async function loadLocations(href:string,proof:string,signal:AbortSignal){
 try{
  const response=await fetch(href,{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
  if(!response.ok)return {data:null,message:[401,403].includes(response.status)?'Location access is restricted.':'Locations is unavailable. Reload to check the current state.'};
  const data=await response.json(),logs=href.startsWith('/api/manage/location-activity');
  if(logs?!Array.isArray(data.entries)||data.entries.length>20||!data.entries.every((e:LocationLog)=>e&&/^\d+$/.test(e.sequence)&&Number.isSafeInteger(e.occurredAt)&&typeof e.locationName==='string'&&(e.actorName===null||typeof e.actorName==='string')&&typeof e.fields==='string'&&Array.isArray(JSON.parse(e.fields))&&JSON.parse(e.fields).every((f:unknown)=>typeof f==='string')&&['location.create','location.update','location.archive','location.restore'].includes(e.operation))||!(data.nextBefore===null||typeof data.nextBefore==='string')
   :!Array.isArray(data.locations)||data.locations.length>200||!data.locations.every((r:LocationRow)=>r&&typeof r.id==='string'&&typeof r.name==='string'&&Number.isSafeInteger(r.revision)&&[0,1].includes(r.active)&&Number.isSafeInteger(r.rentalCents)&&[r.addressLine,r.postalCode,r.city,r.countryCode,r.instructions,r.directionsUrl].every(v=>v===null||typeof v==='string')&&(r.capacity===null||Number.isSafeInteger(r.capacity))))throw Error('Invalid locations response');
  return {data,message:''};
 }catch{return {data:null,message:'Locations is unavailable. Reload to check the current state.'};}
}
export function useLocationRead<T>(href:string){
 const auth=useAuth(),cache=auth.roleReads,proof=auth.session?.csrfToken,principal=auth.session?.account.userId,revision=auth.administration?.revision;
 const allowed=auth.status==='ready'&&auth.administration?.status==='ready'&&auth.administration.sections.includes('locations');
 const [retry,setRetry]=useState(0),result=useSyncExternalStore(cache.subscribe,()=>cache.get(href));
 useEffect(()=>{if(allowed&&proof)cache.read(href,'locations',signal=>loadLocations(href,proof,signal),5000);},[allowed,cache,proof,principal,revision,href,retry]);
 return {data:allowed?result?.data as T??null:null,loading:!allowed||!result||result.loading,message:allowed?result?.message??'':'',reload:()=>{cache.expire(href);setRetry(n=>n+1);}};
}
export function useLocationMutation(){
 const auth=useAuth(),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const context=auth.session?.account.userId+':'+auth.session?.csrfToken;
 const [owner,setOwner]=useState(context);
 async function save(body:object){
  if(pending||!auth.session)return false;setPending(true);setMessage('');setOwner(context);
  try{
   const r=await fetch('/api/manage/locations',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-LAN-Session-Proof':auth.session.csrfToken,'X-CSRF-Token':auth.session.csrfToken},body:JSON.stringify({...body,operationId:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});
   if(r.ok){setMessage('Location saved.');return true;}
   setMessage(r.status===409?'The location or your access changed. Reload and review before submitting again.':r.status===400?'Check the location fields and try again.':'The change could not be confirmed. Reload and check Locations logs before submitting again.');return false;
  }catch{setMessage('The outcome is unknown. Reload and check Locations logs before submitting again.');return false;}
  finally{setPending(false);}
 }
 return {save,pending,message:owner===context?message:''};
}
