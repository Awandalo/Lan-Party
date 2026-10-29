import {useEffect, useState, useSyncExternalStore} from 'react';
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
 const {session,status,memberReads}=useAuth(),access=useAdministration(),[retry,setRetry]=useState(0);
 const result=useSyncExternalStore(memberReads.subscribe,()=>memberReads.get(href));
 const proof=session?.csrfToken;
 const allowed=!!session && status==='ready' && access.status==='ready' && access.sections.includes('users');
 const revision=access.revision;
 useEffect(()=>{
  if (!allowed || !proof) return;
  memberReads.read(href,async signal=>{
   let data:MemberPage|{member:MemberDetail}|null=null,message='';
   try {
    const response=await fetch(href,{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    if ([401,403].includes(response.status)) message='Member access is restricted. Your account is not allowed to view members.';
    else if (response.status===404) message='Member not found.';
    else if (response.status===400) message='Invalid search or page. Check the search input and start from the first page.';
    else if (response.status===409) message='Your session changed. Reload before viewing members.';
    else if (!response.ok) message='Members are temporarily unavailable. Please try again.';
    else {const value:unknown=await response.json();if(!valid(value,detail))throw Error('Invalid response');data=value;}
   } catch {message='Members are temporarily unavailable. Please try again.';}
   return {data,message};
  });
 // Each validation generation rechecks the private endpoint independently, in
 // parallel with the session/capability reads. In-flight reads are deduplicated.
 },[memberReads,allowed,proof,revision,href,detail,retry]);
 return {data:allowed?result?.data??null:null,message:allowed?result?.message??'':'',loading:!allowed || !result || result.loading,retry:()=>setRetry(n=>n+1)};
}
