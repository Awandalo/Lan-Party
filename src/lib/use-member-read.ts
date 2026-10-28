import {useEffect, useState} from 'react';
import {useAuth} from './auth';
import {useAdministration} from './administration';
import {isMemberNumber} from './member-number';
import type {MemberDetail, MemberPage, MemberSummary} from './members';
function member(value: MemberSummary): boolean {
 return !!value && typeof value.userId==='string' && (value.nickname===null || typeof value.nickname==='string')
  && isMemberNumber(value.memberNumber) && ['active','disabled','deactivated','deleting'].includes(value.status)
  && Array.isArray(value.roles) && value.roles.every(r=>r && typeof r.code==='string' && typeof r.name==='string' && typeof r.active==='boolean');
}
function valid(value: unknown, detail: boolean): value is MemberPage | {member:MemberDetail} {
 if (!value || typeof value!=='object') return false;
 if (detail) {const row=(value as {member:MemberDetail}).member;return member(row) && typeof row.email==='string'
  && [row.firstName,row.lastName,row.prefix].every(v=>v===null || typeof v==='string') && typeof row.verified==='boolean' && Number.isSafeInteger(row.createdAt);}
 const page=value as MemberPage;return Array.isArray(page.members) && page.members.length<=50 && page.members.every(member)
  && (page.nextCursor===null || typeof page.nextCursor==='string' && page.nextCursor.length<=140);
}
export function useMemberRead(href: string, detail: boolean) {
 const {session,status}=useAuth(),access=useAdministration(),[retry,setRetry]=useState(0);
 const [result,setResult]=useState<{session:typeof session;access:typeof access;href:string;retry:number;data:MemberPage|{member:MemberDetail}|null;message:string} | null>(null);
 useEffect(()=>{
  setResult(null);
  if (!session || status!=='ready' || access.status!=='ready' || access.revalidating || !access.sections.includes('users')) return;
  const abort=new AbortController();
  void (async()=>{
   let data:MemberPage|{member:MemberDetail}|null=null,message='';
   try {
    const response=await fetch(href,{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':session.csrfToken},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])});
    if ([401,403].includes(response.status)) message='Member access is restricted. Your account is not allowed to view members.';
    else if (response.status===404) message='Member not found.';
    else if (response.status===400) message='Invalid search or page. Check the search input and start from the first page.';
    else if (response.status===409) message='Your session changed. Reload before viewing members.';
    else if (!response.ok) message='Members are temporarily unavailable. Please try again.';
    else {const value:unknown=await response.json();if(!valid(value,detail))throw Error('Invalid response');data=value;}
   } catch {message='Members are temporarily unavailable. Please try again.';}
   if(!abort.signal.aborted)setResult({session,access,href,retry,data,message});
  })();
  return()=>abort.abort();
 },[session,status,access,href,detail,retry]);
 // Match the complete validation snapshot during render, before effects can run.
 // Old private results must not flash when principal, grants, route or query change.
 const current=result?.session===session && result.access===access && result.href===href && result.retry===retry;
 const allowed=!!session && status==='ready' && access.status==='ready' && !access.revalidating && access.sections.includes('users');
 return {data:allowed && current?result.data:null,message:allowed && current?result.message:'',loading:!allowed || !current,retry:()=>setRetry(n=>n+1)};
}
