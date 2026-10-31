import {useEffect,useState,useSyncExternalStore} from 'react';
import {useAuth} from './auth';
export interface Role {id:string;code:string;name:string;description:string|null;isActive:number;isProtected:number;assignedMemberCount?:number}
export interface Catalogue {revision:number;administrator:boolean;deletionAvailable?:boolean;roles:Role[];permissions:{id:string;code:string;description:string;protected:boolean}[];mappings:{roleId:string;permissionId:string;grantedAt:number}[];assignments?:{roleId:string;assignedAt:number}[];effectivePermissions?:string[]}
export const builtIn=(role:Role)=>['1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7','193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f'].includes(role.id);
function validRead(value:unknown,activity:boolean):boolean {
 if(!value||typeof value!=='object')return false;
 const data=value as Catalogue&{entries:unknown[];nextBefore:unknown};
 if(activity)return Array.isArray(data.entries)&&data.entries.length<=20&&data.entries.every(entry=>{
  if(!entry||typeof entry!=='object')return false;const e=entry as Record<string,unknown>;
  return typeof e.sequence==='string'&&Number.isSafeInteger(e.occurredAt)&&['actorId','operation','roleId','delta','operationId'].every(k=>typeof e[k]==='string')&&(e.accountId===null||typeof e.accountId==='string')&&['actorName','accountName','roleName'].every(k=>e[k]===undefined||e[k]===null||typeof e[k]==='string');
 })&&(data.nextBefore===null||typeof data.nextBefore==='string')&&(data.permissions===undefined||Array.isArray(data.permissions)&&data.permissions.length<=100&&data.permissions.every(p=>p&&typeof p.id==='string'&&typeof p.code==='string'));
 return Number.isSafeInteger(data.revision)&&typeof data.administrator==='boolean'&&(data.deletionAvailable===undefined||typeof data.deletionAvailable==='boolean')&&Array.isArray(data.roles)&&data.roles.length<=200
  &&data.roles.every(r=>r.assignedMemberCount===undefined||Number.isSafeInteger(r.assignedMemberCount)&&r.assignedMemberCount>=0)
  &&data.roles.every(r=>r&&['id','code','name'].every(k=>typeof r[k as 'id'|'code'|'name']==='string')&&(r.description===null||typeof r.description==='string')&&[0,1].includes(r.isActive)&&[0,1].includes(r.isProtected))
  &&Array.isArray(data.permissions)&&data.permissions.length<=100&&data.permissions.every(p=>p&&typeof p.id==='string'&&typeof p.code==='string'&&typeof p.description==='string'&&typeof p.protected==='boolean')
  &&Array.isArray(data.mappings)&&data.mappings.length<=20000&&data.mappings.every(m=>m&&typeof m.roleId==='string'&&typeof m.permissionId==='string'&&Number.isSafeInteger(m.grantedAt))
  &&(data.assignments===undefined||Array.isArray(data.assignments)&&data.assignments.every(a=>a&&typeof a.roleId==='string'&&Number.isSafeInteger(a.assignedAt)))
  &&(data.effectivePermissions===undefined||Array.isArray(data.effectivePermissions)&&data.effectivePermissions.every(p=>typeof p==='string'));
}
export function useRoleRead<T>(href:string,section:'roles'|'activity'='roles') {
 const auth=useAuth(),proof=auth.session?.csrfToken,principal=auth.session?.account.userId;
 const {roleReads}=auth;
 const sections=auth.administration?.sections.join(',');
 const allowed=auth.status==='ready'&&auth.administration?.status==='ready'&&auth.administration.sections.includes(section)&&(!href.startsWith('/api/manage/users/')||auth.administration.sections.includes('users'));
 const revision=auth.administration?.revision;
 const [retry,setRetry]=useState(0);
 const result=useSyncExternalStore(roleReads.subscribe,()=>roleReads.get(href));
 useEffect(()=>{
  if(!allowed||!proof)return;
  roleReads.read(href,section,signal=>loadRoleRead(href,section,proof,signal),5000);
 },[roleReads,allowed,proof,principal,href,revision,retry,section,sections]);
 return {data:allowed?(result?.data as T??null):null,message:allowed?result?.message??'':'',loading:!allowed||!result||result.loading,reload:()=>{roleReads.expire(href);setRetry(n=>n+1);}};
}
export function useRoleMutation(){
 const auth=useAuth(),[pending,setPending]=useState(false),setMessage=auth.setRoleFeedback;
 async function save(href:string,body:object,successMessage='Change saved.'){
  if(pending||!auth.session)return false;setPending(true);setMessage('');
  try{
   const response=await fetch(href,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-LAN-Session-Proof':auth.session.csrfToken,'X-CSRF-Token':auth.session.csrfToken},body:JSON.stringify({...body,operationId:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});
   if(!response.ok){const result=await response.json().catch(()=>null);setMessage(response.status===409&&result?.code==='role_assigned'?'Unassign this role from every member before deleting it, including inactive accounts.':response.status===409?'The state changed or this operation was processed. Reload and review before submitting again.':response.status===403?'This change is restricted.':'The change could not be confirmed. Reload and inspect the activity log before submitting again.');return false;}
   setMessage(successMessage);return true;
  }catch{setMessage('The outcome is unknown. Reload and inspect the activity log before submitting again.');return false;}
  finally{setPending(false);await auth.invalidateAdministration();}
 }
 return {save,pending,message:auth.roleFeedback};
}

export async function loadRoleRead(href:string,section:'roles'|'activity',proof:string,signal:AbortSignal) {
   let data:unknown=null,message='';
   try{
    const response=await fetch(href,{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof},signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    if(response.ok){const value:unknown=await response.json();if(!validRead(value,section==='activity'))throw Error('Invalid role response');data=value;}
    else message=[401,403].includes(response.status)?'Access is restricted.':'Role information is unavailable. Reload to check the current state.';
   }catch{message='Role information is unavailable. Reload to check the current state.';}
   return {data,message};
}
