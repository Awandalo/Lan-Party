export interface AccountSnapshot {version:number;issuedAt:number;status:string;origin:string|null;invitationId:string|null;eligible:number}
export interface AccountCommand {operationId:string;userId:string;action:'invite'|'disable'|'cancel';version:number;issuedAt:number;invitationId:string|null}
export interface RoleChange {roleId:string;action:'assign'|'remove'}
export interface RoleCommand extends RoleChange {operationId:string;accountId:string;revision:number}
export interface MemberSaveResult {roleSaved:boolean;savedRoleIds:string[];accountSaved:boolean;accountOutcome?:string;message:string;uncertain:boolean}
export function toggleRoleChange(changes:RoleChange[],roleId:string,assigned:boolean):RoleChange[] {
 return changes.some(c=>c.roleId===roleId)?changes.filter(c=>c.roleId!==roleId):[...changes,{roleId,action:assigned?'remove':'assign'}];
}
export const accountOutcomeLabels:Record<string,string>={accepted:'Invitation requested; account remains disabled until recipient verification.',disabled:'Account disabled. Sessions and pending operations revoked.',cancelled:'Pending invitation cancelled. Account remains disabled.',completed:'Recipient already completed reactivation. Account is active.',superseded:'This invitation was replaced by a newer request.',unconfirmed:'Email delivery was not confirmed. This unfinished attempt was cancelled.',pending:'Invitation result is pending or unknown. No automatic resend was made.'};
export async function saveMemberChanges(transport:typeof fetch,csrf:string,userId:string,roles:RoleCommand[],account:AccountCommand|null,current:()=>boolean):Promise<MemberSaveResult> {
 const savedRoleIds:string[]=[];
 const summary=()=>savedRoleIds.length===1&&roles.length===1?'Role change saved. ':savedRoleIds.length?savedRoleIds.length+' of '+roles.length+' role changes saved. ':'';
 const result=(message:string,uncertain=false,accountSaved=false,accountOutcome?:string)=>({roleSaved:savedRoleIds.length>0,savedRoleIds:[...savedRoleIds],accountSaved,accountOutcome,message:summary()+message,uncertain});
 if(new Set(roles.map(r=>r.roleId)).size!==roles.length)return result('Duplicate role changes rejected. Review before saving.');
 const send=(path:string,body:object)=>transport(path,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-LAN-Session-Proof':csrf,'X-CSRF-Token':csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 let revision=roles[0]?.revision;
 try {
  for(const role of [...roles].sort((a,b)=>Number(a.action==='assign')-Number(b.action==='assign'))){
   if(!current())return result('Session or selected member changed. No further action was requested.');
   const r=await send('/api/manage/users/'+userId+'/roles',{...role,revision});
   if(!r.ok)return result('Remaining role changes and account action were not requested. Reload and review.',r.status>=500);
   savedRoleIds.push(role.roleId);
   const b=await r.json();if(!Number.isSafeInteger(b.revision))return result('Role response could not be confirmed. No further action was requested. Reload to check.',true);
   revision=b.revision;
  }
  if(!current())return result('Session or selected member changed. No further action was requested.');
  if(account){const r=await send('/api/auth/lifecycle/command',account);
   if(!r.ok)return result('Account action was not confirmed. Reload and check before explicitly requesting it again.',r.status>=500);
   const b=await r.json(),uncertain=!['accepted','disabled','cancelled','completed'].includes(b.outcome);
   return result(accountOutcomeLabels[b.outcome]??'Account result unknown. Reload to check.',uncertain,!uncertain,b.outcome);
  }
  return result('');
 }catch{return result('Result unknown. No automatic retry was made. Reload and check the member before another request.',true);}
}
