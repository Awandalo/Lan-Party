import {useEffect, useState, useSyncExternalStore} from 'react';
import {useAuth} from './auth';
import {useAdministration} from './administration';
import {isMemberNumber} from './member-number';
import {ACHIEVEMENTS} from './achievements';
import type {MemberDetail, MemberPage, MemberSummary} from './members';
function member(value: MemberSummary): boolean {
 return !!value && typeof value.userId==='string' && (value.nickname===null || typeof value.nickname==='string')
  && isMemberNumber(value.memberNumber) && ['active','disabled','deactivated','admin-disabled','deleting'].includes(value.status)
  && Array.isArray(value.roles) && value.roles.every(r=>r && typeof r.code==='string' && typeof r.name==='string' && typeof r.active==='boolean');
}
function validAttendance(history:MemberDetail['attendance']):boolean {
 return !!history && typeof history.available==='boolean' && typeof history.hasMore==='boolean' && Array.isArray(history.events) && history.events.length<=100 && (history.available || !history.events.length&&!history.hasMore) && history.events.every(event=>event && typeof event.id==='string' && typeof event.title==='string' && (event.venue===null||typeof event.venue==='string') && typeof event.achievementsEnabled==='boolean' && Array.isArray(event.days) && event.days.length>0 && event.days.every(day=>typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)));
}
function validTitle(title:MemberDetail['achievementTitle']):boolean {
 return !!title&&typeof title.available==='boolean'&&(title.code===null||title.available&&ACHIEVEMENTS.some(def=>def.code===title.code));
}
function valid(value: unknown, detail: boolean): value is MemberPage | {member:MemberDetail} {
 if (!value || typeof value!=='object') return false;
 if (detail) {const row=(value as {member:MemberDetail}).member;return member(row) && typeof row.email==='string'
  && [row.firstName,row.lastName,row.prefix].every(v=>v===null || typeof v==='string') && typeof row.verified==='boolean' && Number.isSafeInteger(row.createdAt) && validAttendance(row.attendance) && validTitle(row.achievementTitle);}
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
  memberReads.read(href,signal=>loadMemberRead(href,detail,proof,signal),5000);
 // Mutations advance the view revision; unchanged route/focus checks keep it stable. Identity/access failures still clear and fence reads.
 },[memberReads,allowed,proof,revision,href,detail,retry]);
 return {data:allowed?result?.data??null:null,message:allowed?result?.message??'':'',loading:!allowed || !result || result.loading,retry:()=>{memberReads.expire(href);setRetry(n=>n+1);}};
}

export async function loadMemberRead(href:string,detail:boolean,proof:string,signal:AbortSignal) {
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
}
