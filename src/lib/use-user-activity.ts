import {useEffect,useState,useSyncExternalStore} from 'react';
import {useAuth} from './auth';
import {validUserActivity} from './user-activity';
import type {UserActivityPage} from './user-activity';
export function useUserActivity(href:string){
 const auth=useAuth(),cache=auth.roleReads,proof=auth.session?.csrfToken,principal=auth.session?.account.userId;
 const allowed=auth.status==='ready'&&auth.administration?.status==='ready'&&auth.administration.sections.includes('userActivity');
 const revision=auth.administration?.revision,[retry,setRetry]=useState(0);
 const result=useSyncExternalStore(cache.subscribe,()=>cache.get(href));
 useEffect(()=>{
  if(!allowed||!proof)return;
  cache.read(href,'userActivity',async signal=>{
   try{
    const response=await fetch(href,{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    if([401,403,409].includes(response.status))return {data:null,message:'Access is restricted. Reload to check your current session.'};
    if(!response.ok)throw Error();const data:unknown=await response.json();if(!validUserActivity(data))throw Error();
    return {data,message:''};
   }catch{return {data:null,message:'User Log is unavailable. Check again later.'};}
  });
 },[cache,href,allowed,proof,principal,revision,retry]);
 return {data:allowed?result?.data as UserActivityPage|null:null,message:allowed?result?.message??'':'',loading:!allowed||!result||result.loading,reload:()=>setRetry(n=>n+1)};
}
