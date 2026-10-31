import type {Catalogue,Role} from './roles';
export const administratorRole='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7';
const labels:Record<string,string>={
 'events.create':'Create events','events.update':'Edit events','events.publish':'Publish events','events.cancel':'Cancel events','events.manage_registrations':'Manage event registrations',
 'news.create':'Write news','news.update':'Edit news','news.publish':'Publish news','news.archive':'Archive news',
 'users.view':'View members','users.manage':'Manage members','roles.manage':'Manage ordinary roles','roles.protect_admin':'Protected role capability','locations.manage':'Manage locations',
};
export const groupLabels:Record<string,string>={events:'Events',news:'News',users:'Members',roles:'Roles',locations:'Locations'};
export const groupIcons:Record<string,string>={events:'calendar',news:'news',users:'users',roles:'shield',locations:'pin'};
export function permissionLabel(code:string){return labels[code]??code.replaceAll(/[._]/g,' ');}
export function groups(catalogue:Catalogue){return [...new Set(catalogue.permissions.map(p=>p.code.split('.')[0]))].sort();}
export function assignedPermissions(catalogue:Catalogue,role?:Role){return catalogue.mappings.filter(m=>m.roleId===role?.id).map(m=>m.permissionId);}
export function enabledGroups(catalogue:Catalogue,ids:string[]){return [...new Set(catalogue.permissions.filter(p=>ids.includes(p.id)).map(p=>p.code.split('.')[0]))];}
// One saved-role rule for all surfaces. Only the genuine built-in Administrator
// gets a shield; custom protection is a separate lock badge, never authority.
export function roleIcon(catalogue:Catalogue,role:Role){
 if(role.id===administratorRole)return 'shield';
 if(role.id==='193e06d9-4dfa-4ef9-80f2-9d457b6b7b5f')return 'users';
 const categories=enabledGroups(catalogue,assignedPermissions(catalogue,role));
 return categories.length===1&&categories[0]!=='roles'?groupIcons[categories[0]]??'grid':'grid';
}
export interface RoleDraft {code:string;name:string;description:string;active:boolean;protected:boolean;permissionIds:string[]}
export function roleDraft(catalogue:Catalogue,role?:Role):RoleDraft{return {code:role?.code??'',name:role?.name??'',description:role?.description??'',active:role?!!role.isActive:true,protected:!!role?.isProtected,permissionIds:assignedPermissions(catalogue,role)};}
// Normalize role metadata only; credentials and other form values must retain their own rules.
export function normalizeRoleDraft(draft:RoleDraft):RoleDraft{return {...draft,code:draft.code.trim(),name:draft.name.trim(),description:draft.description.trim()};}
export function roleFieldErrors(input:RoleDraft){
 const draft=normalizeRoleDraft(input),controls=/[\u0000-\u001f\u007f]/;
 return {
  name:!draft.name?'Enter a role name.':draft.name.length>80?'Use at most 80 characters.':controls.test(draft.name)?'Use a single line without control characters.':'',
  description:draft.description.length>400?'Use at most 400 characters.':controls.test(draft.description)?'Use a single line without control characters.':'',
  code:!draft.code?'Enter a role identifier.':!/^[a-z][a-z0-9_]{0,38}[a-z0-9]$/.test(draft.code)?'Use 2–40 lowercase letters, numbers or underscores; start with a letter and end with a letter or number.':'',
 };
}
export function draftValid(draft:RoleDraft){return Object.values(roleFieldErrors(draft)).every(error=>!error);}
export function defaultRoleCode(name:string){return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40).replace(/_+$/,'');}
export function sameRoleDraft(left:RoleDraft,right:RoleDraft){const a=normalizeRoleDraft(left),b=normalizeRoleDraft(right);return a.code===b.code&&a.name===b.name&&a.description===b.description&&a.active===b.active&&a.protected===b.protected&&a.permissionIds.length===b.permissionIds.length&&[...a.permissionIds].sort().every((id,index)=>id===[...b.permissionIds].sort()[index]);}
