import {createContext,useContext,useCallback,useEffect,useRef,useState} from 'react';
import type {ReactNode} from 'react';
import {useLocation} from 'react-router';
import {useAuth} from './auth';
export const FEEDBACK_UI_AVAILABLE=import.meta.env.DEV||import.meta.env.VITE_AUTH_MODE==='hosted-dev';
export const decisions=['pending','yes','no','maybe'] as const;
export const progressStates=['new','under_review','planned','in_progress','completed','closed'] as const;
export const feedbackLabel=(v:string)=>v.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
export interface FeedbackItem {id:string;kind:'bug'|'feature';title:string;description?:string;decision:string;progress:string;revision:number;githubNumber:number|null;closedAt:number|null;createdAt:number;updatedAt:number;unread?:boolean;nickname?:string|null;memberNumber?:string|null}
export interface FeedbackEvent {sequence:string;actorKind:string;anonymized:number;kind:string;body:string|null;delta:string|null;occurredAt:number}
export interface FeedbackPage {requests:FeedbackItem[];nextCursor:string|null}
export interface FeedbackDetail {request:FeedbackItem;events:FeedbackEvent[];nextBefore:string|null;through:string}
export function validFeedbackRead(value:unknown):boolean {
 if(!value||typeof value!=='object')return false;
 const data=value as Record<string,unknown>,item=(v:unknown)=>{if(!v||typeof v!=='object')return false;const r=v as FeedbackItem;return /^[a-f0-9-]{36}$/.test(r.id)&&typeof r.title==='string'&&['bug','feature'].includes(r.kind)&&decisions.includes(r.decision as typeof decisions[number])&&progressStates.includes(r.progress as typeof progressStates[number])&&Number.isSafeInteger(r.revision)&&r.revision>0;};
 if('requests'in data)return Array.isArray(data.requests)&&data.requests.length<=20&&data.requests.every(item)&&(data.nextCursor===null||typeof data.nextCursor==='string');
 return item(data.request)&&typeof(data.request as FeedbackItem).description==='string'&&Array.isArray(data.events)&&data.events.length<=50&&data.events.every(v=>v&&typeof v.sequence==='string'&&/^[1-9][0-9]*$/.test(v.sequence)&&['created','reply','triage','github_link'].includes(v.kind)&&['member','administrator'].includes(v.actorKind)&&(v.body===null||typeof v.body==='string')&&(v.delta===null||typeof v.delta==='string'))&&typeof data.through==='string'&&/^(0|[1-9][0-9]*)$/.test(data.through)&&(data.nextBefore===null||typeof data.nextBefore==='string');
}
export class FeedbackFailure extends Error {constructor(message:string,readonly uncertain=false){super(message);}}
interface FeedbackAccess {memberUnread:number;adminUnread:number;refresh:()=>void;request:<T>(path:string,body?:object,signal?:AbortSignal)=>Promise<T>;context:string}
const Context=createContext<FeedbackAccess>({memberUnread:0,adminUnread:0,context:'',refresh:()=>{},request:async()=>{throw new FeedbackFailure('Feedback is unavailable.');}});
export function FeedbackProvider({children}:{children:ReactNode}){
 const auth=useAuth(),{pathname}=useLocation(),proof=auth.session?.csrfToken,context=auth.session?auth.session.account.userId+':'+proof:'';
 const [version,setVersion]=useState(0),[counts,setCounts]=useState({context:'',memberUnread:0,adminUnread:0});const lastFocus=useRef(0);
 const request=useCallback(async<T,>(path:string,body?:object,signal?:AbortSignal):Promise<T>=>{
  if(!proof||!FEEDBACK_UI_AVAILABLE)throw new FeedbackFailure('Please log in.');
  let response:Response;
  try{response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof,...(body?{'Content-Type':'application/json','X-CSRF-Token':proof}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)])});}
  catch{throw new FeedbackFailure(body?'The outcome could not be confirmed. Retry the same operation or check the saved state before changing it.':'Feedback could not be loaded.',!!body);}
  const data=await response.json().catch(()=>null);
  if(!response.ok){if([401,403].includes(response.status))void auth.refresh();throw new FeedbackFailure(typeof data?.error==='string'?data.error:'Feedback is unavailable. Reload to check the current state.');}
  if(!data||typeof data!=='object')throw new FeedbackFailure('Invalid feedback response.',!!body);return data as T;
 },[proof,auth.refresh]);
 const refresh=useCallback(()=>setVersion(v=>v+1),[]);
 useEffect(()=>{if(!context||!FEEDBACK_UI_AVAILABLE)return;const controller=new AbortController();
  void request<{memberUnread:number;adminUnread:number}>('/api/feedback/unread',undefined,controller.signal).then(value=>{if(!controller.signal.aborted&&Number.isSafeInteger(value.memberUnread)&&Number.isSafeInteger(value.adminUnread)&&value.memberUnread>=0&&value.adminUnread>=0)setCounts({context,...value});}).catch(()=>{if(!controller.signal.aborted)setCounts({context,memberUnread:0,adminUnread:0});});return()=>controller.abort();
 },[context,pathname,version,request]);
 useEffect(()=>{const focus=()=>{if(Date.now()-lastFocus.current<5000||document.visibilityState==='hidden')return;lastFocus.current=Date.now();refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[refresh]);
 const current=context&&counts.context===context?counts:{memberUnread:0,adminUnread:0};
 return <Context value={{...current,refresh,request,context}}>{children}</Context>;
}
export function useFeedback(){const value=useContext(Context);if(!value)throw Error('Missing FeedbackProvider');return value;}
export function useFeedbackRead<T>(path:string){
 const {request,context}=useFeedback(),[version,setVersion]=useState(0),[state,setState]=useState<{key:string;data:T|null;error:string}>({key:'',data:null,error:''}),key=context+':'+path+':'+version;
 useEffect(()=>{if(!context)return;const controller=new AbortController();void request<T>(path,undefined,controller.signal).then(data=>{if(!validFeedbackRead(data))throw new FeedbackFailure('Invalid feedback response.');if(!controller.signal.aborted)setState({key,data,error:''});}).catch(error=>{if(!controller.signal.aborted)setState({key,data:null,error:error.message});});return()=>controller.abort();},[key,path,context,request]);
 return {data:state.key===key?state.data:null,error:state.key===key?state.error:'',loading:state.key!==key,reload:()=>setVersion(v=>v+1)};
}
export const PUBLIC_ISSUE_URL='https://github.com/Awandalo/Lan-Party/issues/new';
// Blank technical scaffold: never auto-copy private submission text or identities.
export const publicFeedbackTemplate='Problem / value:\n\nExpected behavior:\n\nActual behavior / reproduction:\n\nProposed scope:\n\nExclusions:\n\nAcceptance criteria:\n\nReview questions:\n\nPlanning only; implementation requires owner authorization.';