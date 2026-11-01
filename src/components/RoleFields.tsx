import SwitchInput from './SwitchInput';
import {useId,useState} from 'react';
import type {RoleDraft} from '../lib/role-presentation';
import {defaultRoleCode,normalizeRoleDraft,roleFieldErrors} from '../lib/role-presentation';
export default function RoleFields({draft,onChange,administrator,existing=false}:{draft:RoleDraft;onChange:(draft:RoleDraft)=>void;administrator:boolean;existing?:boolean}){
 const id=useId(),[touched,setTouched]=useState<Partial<Record<'name'|'description'|'code',boolean>>>({}),errors=roleFieldErrors(draft);
 const error=(field:'name'|'description'|'code')=>(touched[field]||draft[field].length>0)?errors[field]:'';
 function blur(field:'name'|'description'|'code'){setTouched(old=>({...old,[field]:true}));onChange(normalizeRoleDraft(draft));}
 return <div className="role-fields">
  <label>Role name<input required maxLength={80} value={draft.name} aria-invalid={!!error('name')} aria-describedby={error('name')?id+'-name-error':undefined} onBlur={()=>blur('name')} onChange={event=>onChange({...draft,name:event.target.value,...(!existing&&draft.code===defaultRoleCode(draft.name)?{code:defaultRoleCode(event.target.value)}:{})})}/>{error('name')&&<small id={id+'-name-error'} className="role-field-error" role="status">{error('name')}</small>}</label>
  <label>Description<textarea rows={3} maxLength={400} value={draft.description} aria-invalid={!!error('description')} aria-describedby={id+'-description-help'+(error('description')?' '+id+'-description-error':'')} onBlur={()=>blur('description')} onChange={event=>onChange({...draft,description:event.target.value})}/><small id={id+'-description-help'}>A short explanation of who this role is for. Surrounding spaces are removed when reviewing or saving.</small>{error('description')&&<small id={id+'-description-error'} className="role-field-error" role="status">{error('description')}</small>}</label>
  <label>Role identifier<input required minLength={2} maxLength={40} value={draft.code} disabled={existing} aria-invalid={!!error('code')} aria-describedby={id+'-code-help'+(error('code')?' '+id+'-code-error':'')} onBlur={()=>blur('code')} onChange={event=>onChange({...draft,code:event.target.value})}/><small id={id+'-code-help'}>Stable identifier: 2–40 lowercase letters, numbers and underscores; start with a letter and end with a letter or number.</small>{error('code')&&<small id={id+'-code-error'} className="role-field-error" role="status">{error('code')}</small>}</label>
  <div className="role-definition-options"><label className="role-check"><SwitchInput checked={draft.active} onChange={event=>onChange({...draft,active:event.target.checked})}/>Active role</label><label className="role-check"><SwitchInput checked={draft.protected} disabled={!administrator} onChange={event=>onChange({...draft,protected:event.target.checked})}/>Administrator-protected</label></div>
 </div>;
}
