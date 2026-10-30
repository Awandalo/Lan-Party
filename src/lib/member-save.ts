export interface AccountSnapshot {version:number;issuedAt:number;status:string;origin:string|null;invitationId:string|null;eligible:number}
export interface AccountCommand {operationId:string;userId:string;action:'invite'|'disable'|'cancel';version:number;issuedAt:number;invitationId:string|null}
export interface MemberSaveResult {roleSaved:boolean;accountSaved:boolean;message:string;uncertain:boolean}
export async function saveMemberChanges(transport:typeof fetch,csrf:string,userId:string,role:object|null,account:AccountCommand|null,current:()=>boolean):Promise<MemberSaveResult> {
 let roleSaved=false;
 const send=(path:string,body:object)=>transport(path,{method:'POST',credentials:'same-origin',redirect:'error',headers:{'Content-Type':'application/json','X-LAN-Request':'1','X-LAN-Session-Proof':csrf,'X-CSRF-Token':csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 try {
  if(role){const r=await send('/api/manage/users/'+userId+'/roles',role);if(!r.ok)return {roleSaved:false,accountSaved:false,message:'Role change was not confirmed. No account action was requested. Reload and review.',uncertain:r.status>=500};roleSaved=true;}
  if(!current())return {roleSaved,accountSaved:false,message:'Session or selected member changed. No further account action was requested.',uncertain:false};
  if(account){const r=await send('/api/auth/lifecycle/command',account);
   if(!r.ok)return {roleSaved,accountSaved:false,message:(roleSaved?'Role change saved. ':'')+'Account action was not confirmed. Reload and check before explicitly requesting it again.',uncertain:r.status>=500};
   const b=await r.json(),labels:Record<string,string>={accepted:'Invitation requested. Account remains disabled until recipient verification.',disabled:'Account disabled. Sessions and pending operations revoked.',cancelled:'Pending invitation cancelled. Account remains disabled.',completed:'Recipient already completed reactivation. Account is active.',superseded:'This invitation was replaced by a newer request.',unconfirmed:'Email delivery was not confirmed. This unfinished attempt was cancelled.',pending:'Invitation result is pending or unknown. No automatic resend was made.'};
   const uncertain=!['accepted','disabled','cancelled','completed'].includes(b.outcome);
   return {roleSaved,accountSaved:!uncertain,message:(roleSaved?'Role change saved. ':'')+(labels[b.outcome]??'Account result unknown. Reload to check.'),uncertain};
  }
  return {roleSaved,accountSaved:false,message:'Role change saved.',uncertain:false};
 }catch{return {roleSaved,accountSaved:false,message:(roleSaved?'Role change saved. ':'')+'Result unknown. No automatic retry was made. Reload and check the member before another request.',uncertain:true};}
}
