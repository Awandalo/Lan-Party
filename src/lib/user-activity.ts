export const userActivityLabels={
 'account.created':'Account created', 'account.deleted':'Account deleted',
 'account.deactivated':'Account deactivated', 'account.activated':'Account reactivated',
 'invitation.prepared':'Invitation prepared', 'invitation.accepted':'Provider accepted submission',
 'invitation.unconfirmed':'Invitation delivery unconfirmed', 'invitation.cancelled':'Invitation cancelled',
} as const;
export interface UserActivityEntry {
 sequence:string;occurredAt:number;event:keyof typeof userActivityLabels;
 actorKind:'account'|'administrator'|'system'|'anonymous';dateOnly:0|1;
 actorId:string|null;targetId:string|null;operationId:string|null;actorName:string|null;targetName:string|null;
}
export interface UserActivityPage {entries:UserActivityEntry[];nextBefore:string|null}
const cursor=(v:unknown):v is string=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9223372036854775807n;
const nullable=(v:unknown,max:number)=>v===null||typeof v==='string'&&v.length<=max;
export function validUserActivity(value:unknown):value is UserActivityPage{
 if(!value||typeof value!=='object')return false;
 const p=value as UserActivityPage;
 return (p.nextBefore===null||cursor(p.nextBefore))&&Array.isArray(p.entries)&&p.entries.length<=20&&p.entries.every(e=>{
  if(!e||!cursor(e.sequence)||!Number.isSafeInteger(e.occurredAt)||e.occurredAt<0||!Object.hasOwn(userActivityLabels,e.event)||!['account','administrator','system','anonymous'].includes(e.actorKind)||![0,1].includes(e.dateOnly))return false;
  if(!['actorId','targetId','operationId'].every(k=>nullable(e[k as 'actorId'],64))||!['actorName','targetName'].every(k=>nullable(e[k as 'actorName'],100)))return false;
  return e.actorKind==='anonymous'?e.dateOnly===1&&[e.actorId,e.targetId,e.operationId,e.actorName,e.targetName].every(v=>v===null):e.dateOnly===0;
 });
}
export function userActivityTime(entry:UserActivityEntry){
 return entry.dateOnly?new Date(entry.occurredAt*1000).toISOString().slice(0,10)+' (UTC day; time removed)':new Date(entry.occurredAt*1000).toLocaleString(undefined,{timeZone:'UTC'})+' UTC';
}
