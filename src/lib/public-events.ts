import {AUTH_UI_AVAILABLE,authUIEnabled} from './auth-mode';
import {useEffect,useState} from 'react';
import type {EventVenue} from './event-management';
export const PUBLIC_EVENTS_AVAILABLE=AUTH_UI_AVAILABLE&&authUIEnabled();
export interface PublicEvent {id:string;title:string;description?:string;startsAt:number;endsAt:number;registrationStatus:string;venue:EventVenue|null;days:{date:string;remaining:number}[]}
export const eventTime=(value:number)=>new Date(value*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam',dateStyle:'medium',timeStyle:'short'});
export async function loadPublicEvents(href:string,signal:AbortSignal,proof?:string){
 const response=await fetch(href,{credentials:proof?'same-origin':'omit',redirect:'error',headers:proof?{'X-LAN-Request':'1','X-LAN-Session-Proof':proof}:{},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
 if(!response.ok)throw Error(response.status===404?'Event not found':response.status===401||response.status===409?'Session changed. Reload to check this event.':'Events could not be loaded. Please try again.');
 return response.json();
}
// Anonymous collection reads also work outside AuthProvider (public previews).
export function usePublicEvents(period:'upcoming'|'past',next=false){
 const href='/api/events?'+new URLSearchParams({period,...next?{limit:'1'}:{}}),[state,setState]=useState<{href:string;events:PublicEvent[];message:string}|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!PUBLIC_EVENTS_AVAILABLE)return;const controller=new AbortController();let current=true;loadPublicEvents(href,controller.signal).then(data=>{if(!Array.isArray(data.events))throw Error('Invalid events');if(current)setState({href,events:data.events,message:''});}).catch(error=>{if(current)setState({href,events:[],message:String(error.message)});});return()=>{current=false;controller.abort();};},[href,retry]);
 return {events:state?.href===href?state.events:[],message:state?.href===href?state.message:'',loading:PUBLIC_EVENTS_AVAILABLE&&state?.href!==href,reload:()=>setRetry(n=>n+1)};
}
