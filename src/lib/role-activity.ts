import {permissionLabel} from './role-presentation';
export interface ActivityEntry {sequence:string;occurredAt:number;actorId:string;actorName?:string|null;operation:string;roleId:string;roleName?:string|null;accountId:string|null;accountName?:string|null;delta:string;operationId:string}
export interface ActivityPage {entries:ActivityEntry[];nextBefore:string|null;permissions?:{id:string;code:string}[]}
export const activityOperations:Record<string,string>={'role.create':'Role created','role.update':'Role updated','membership.add':'Role assigned','membership.remove':'Role removed'};
export function activityChanges(entry:ActivityEntry,permissions:ActivityPage['permissions']=[]){
 let delta:Record<string,unknown>={};try{const raw:unknown=JSON.parse(entry.delta);if(raw&&typeof raw==='object'&&!Array.isArray(raw))delta=raw as Record<string,unknown>;}catch{/* Keep the original record available in technical details. */}
 const rows:{field:string;before:string;after:string}[]=[];
 if(Array.isArray(delta.fields))for(const field of delta.fields)if(typeof field==='string')rows.push({field:{name:'Role name',description:'Description',code:'Role identifier'}[field]??field,before:'Not retained',after:'Not retained'});
 for(const [key,label] of [['active','Role status'],['protected','Administrator protection'],['assigned','Membership'],['permissions','Permissions']]){
  const value=delta[key];if(!value||typeof value!=='object'||!('before'in value)||!('after'in value))continue;
  const pair=value as {before:unknown;after:unknown};
  const display=(v:unknown):string=>key==='permissions'&&Array.isArray(v)?v.map(id=>permissionLabel(permissions.find(p=>p.id===id)?.code??String(id))).join(', ')||'None':v===null?'Did not exist':key==='assigned'?(v?'Assigned':'Not assigned'):key==='active'?(v?'Active':'Inactive'):(v?'Protected':'Ordinary');
  if(JSON.stringify(pair.before)!==JSON.stringify(pair.after)||entry.operation==='role.create')rows.push({field:label,before:display(pair.before),after:display(pair.after)});
 }
 return rows;
}
