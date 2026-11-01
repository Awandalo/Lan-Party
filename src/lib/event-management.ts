import {useEffect,useState,useSyncExternalStore} from 'react';
import {useAuth} from './auth';
import type {LocationRow} from './locations';
export type EventVenue=Pick<LocationRow,'name'|'addressLine'|'postalCode'|'city'|'countryCode'|'instructions'|'directionsUrl'>;
export interface ManagedEvent {id:string;title:string;description:string;locationId:string;status:string;registrationStatus:string;startsAt:number|null;endsAt:number|null;venue:EventVenue|null;days:{date:string}[];revision:number|null;financeEnabled:number;rentalCents:number;capacity:number|null;maxGuests:number}
export interface EventCatalogue {events:ManagedEvent[];templates:LocationRow[];canCreate:boolean;canUpdate:boolean}
export interface EventLog {sequence:string;occurredAt:number;operation:string;title:string;actorName:string|null;fields:string}
export async function loadEventRead(href:string,proof:string,signal:AbortSignal){
 try{
  const response=await fetch(href,{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
  if(!response.ok)return {data:null,message:response.status===503?'Events is unavailable. Its database migration may still be awaiting activation.':response.status===403||response.status===401?'Event access is restricted.':'Events could not be loaded. Reload to check again.'};
  const data=await response.json();
  if(href.startsWith('/api/manage/event-activity')){
   if(!Array.isArray(data.entries)||data.entries.length>20||!data.entries.every((e:EventLog)=>e&&/^\d+$/.test(e.sequence)&&Number.isSafeInteger(e.occurredAt)&&typeof e.title==='string'&&['event.create','event.update','event.duplicate'].includes(e.operation)&&(e.actorName===null||typeof e.actorName==='string')&&Array.isArray(JSON.parse(e.fields)))||!(data.nextBefore===null||typeof data.nextBefore==='string'))throw Error('Invalid log');
  }else if(!Array.isArray(data.events)||data.events.length>200||!Array.isArray(data.templates)||typeof data.canCreate!=='boolean'||typeof data.canUpdate!=='boolean'||!data.events.every((e:ManagedEvent)=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.description==='string'&&Array.isArray(e.days)&&e.days.every(d=>typeof d.date==='string')&&(e.revision===null||Number.isInteger(e.revision))))throw Error('Invalid events');
  return {data,message:''};
 }catch{return {data:null,message:'Events could not be loaded. Reload to check again.'};}
}
export function useEventRead<T>(href:string){
 const auth=useAuth(),cache=auth.roleReads,proof=auth.session?.csrfToken,principal=auth.session?.account.userId,revision=auth.administration?.revision;
 const allowed=auth.status==='ready'&&auth.administration?.status==='ready'&&auth.administration.sections.includes('events');
 const [retry,setRetry]=useState(0),result=useSyncExternalStore(cache.subscribe,()=>cache.get(href));
 useEffect(()=>{if(allowed&&proof)cache.read(href,'events',signal=>loadEventRead(href,proof,signal),5000);},[allowed,cache,proof,principal,revision,href,retry]);
 return {data:allowed?result?.data as T??null:null,loading:!allowed||!result||result.loading,message:allowed?result?.message??'':'',reload:()=>{cache.expire(href);setRetry(n=>n+1);}};
}
export function useEventMutation(){
 const auth=useAuth(),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const context=auth.session?.account.userId+':'+auth.session?.csrfToken,[owner,setOwner]=useState(context);
 async function save(body:object){
  if(pending||!auth.session)return false;setPending(true);setOwner(context);setMessage('');
  try{
   const response=await fetch('/api/manage/events',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-LAN-Session-Proof':auth.session.csrfToken,'X-CSRF-Token':auth.session.csrfToken},body:JSON.stringify({...body,operationId:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});
   if(response.ok)return true;
   setMessage([400,409].includes(response.status)?String((await response.json()).error):'The change could not be confirmed. Reload and check Events Logs before trying again.');return false;
  }catch{setMessage('Outcome unknown. Reload and check Events Logs before trying again.');return false;}finally{setPending(false);}
 }
 return {save,pending,message:owner===context?message:''};
}
