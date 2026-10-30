import {useEffect,useRef,useState} from 'react';
import {useAuth} from './auth';
import type {AccountSnapshot} from './member-save';
export function useMemberLifecycle(userId:string) {
 const auth=useAuth(),context=auth.session?.account.userId+':'+auth.session?.csrfToken+':'+userId;
 const current=useRef(context);current.current=context;
 const [result,setResult]=useState<{context:string;data:AccountSnapshot|null}>({context:'',data:null});
 useEffect(()=>{
  current.current=context;
  const csrf=auth.session?.csrfToken;if(!csrf||!auth.administration?.sections.includes('users'))return;
  const abort=new AbortController();
  void (async()=>{try{
   const r=await fetch('/api/auth/lifecycle/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:abort.signal});
   if(!r.ok||(await r.json()).memberCommands!==true)return;
   const member=await fetch('/api/auth/lifecycle/member',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-CSRF-Token':csrf},body:JSON.stringify({userId}),signal:abort.signal});
   if(!member.ok)return;const b=await member.json(),data=b.member;
   if(!abort.signal.aborted&&Number.isSafeInteger(data?.version)&&Number.isSafeInteger(data.issuedAt)&&typeof data.status==='string'&&(data.invitationId===null||typeof data.invitationId==='string'))setResult({context,data});
  }catch{/* Member viewing/role editing remains available without lifecycle commands. */}})();
  return()=>{abort.abort();current.current='';};
 },[auth.session?.csrfToken,auth.administration?.revision,userId,context]);
 return {data:result.context===context?result.data:null,current:()=>current.current===context};
}
