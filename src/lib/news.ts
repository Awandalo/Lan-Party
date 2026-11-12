import {useEffect,useState} from 'react';
export interface PollSummary {mode:'single'|'multiple';closed:boolean;locked:boolean;revision:number;voters:number;options:{id:string;label:string;votes:number}[]}
export interface PollDraft {mode:'single'|'multiple';options:string[]}
export interface NewsArticle {kind?:'poll';poll?:PollSummary;id:string;slug:string;title:string;excerpt:string|null;status:'draft'|'published'|'archived';createdAt:number;updatedAt:number;publishedAt:number|null;editorName:string|null;content?:string;revision?:number}
export interface NewsResponse {articles?:NewsArticle[];article?:NewsArticle;hasMore?:boolean;permissions?:string[];administrator?:boolean;id?:string}
export async function newsRequest(path:string,proof?:string,body?:object,signal?:AbortSignal):Promise<NewsResponse>{
 const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1',...proof?{'X-LAN-Session-Proof':proof}:{},...body?{'Content-Type':'application/json','X-CSRF-Token':proof??''}:{}},...body?{body:JSON.stringify(body)}:{},signal:signal??AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Error(data.error??'News unavailable');return data;
}
export function useNews(path:string){const [state,setState]=useState<{data:NewsResponse|null;loading:boolean;error:string}>({data:null,loading:true,error:''});useEffect(()=>{const c=new AbortController();setState({data:null,loading:true,error:''});void newsRequest(path,undefined,undefined,AbortSignal.any([c.signal,AbortSignal.timeout(15000)])).then(data=>{if(!c.signal.aborted)setState({data,loading:false,error:''});}).catch(e=>{if(!c.signal.aborted)setState({data:null,loading:false,error:e instanceof Error?e.message:'News unavailable'});});return()=>c.abort();},[path]);return state;}
export const newsDate=(timestamp:number)=>new Date(timestamp*1000).toLocaleDateString('en-GB',{timeZone:'Europe/Amsterdam',day:'numeric',month:'short',year:'numeric'});
