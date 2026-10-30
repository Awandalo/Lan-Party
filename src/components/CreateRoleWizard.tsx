import {useEffect,useRef,useState} from 'react';
import type {Catalogue} from '../lib/roles';
import {useRoleMutation} from '../lib/roles';
import {draftValid,roleDraft,groups,groupLabels,groupIcons} from '../lib/role-presentation';
import RoleFields from './RoleFields';
import RolePermissions from './RolePermissions';
import RoleReview from './RoleReview';
import Icon from './Icon';
export default function CreateRoleWizard({catalogue,onClose}:{catalogue:Catalogue;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),[draft,setDraft]=useState(()=>roleDraft(catalogue)),[step,setStep]=useState(0),[modules,setModules]=useState<string[]>([]),[review,setReview]=useState(false),mutation=useRoleMutation();
 const steps=['Role info','Select categories','Permissions','Review & confirm'];
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{heading.current?.focus();},[step]);
 async function save(){if(!review||!draftValid(draft))return;await mutation.save('/api/manage/roles',{action:'create',revision:catalogue.revision,...draft});}
 return <dialog ref={dialog} className="role-wizard" aria-labelledby="wizard-heading" onCancel={event=>{if(mutation.pending)event.preventDefault();}} onClose={onClose}><div className="wizard-heading"><div><p className="eyebrow">Build a role for your crew</p><h2 id="wizard-heading" ref={heading} tabIndex={-1}>Create new role</h2></div><button type="button" className="text-action" aria-label="Close create role" disabled={mutation.pending} onClick={()=>dialog.current?.close()}>✕</button></div><ol className="wizard-steps" aria-label="Create role progress">{steps.map((label,index)=><li key={label} aria-current={step===index?'step':undefined}><span>{index+1}</span>{label}</li>)}</ol><div className="wizard-content">
  {step===0&&<RoleFields draft={draft} onChange={setDraft} administrator={catalogue.administrator}/>}
  {step===1&&<><h3>Which areas does this role need?</h3><p>Choose categories to configure next. Selecting a category grants no permissions.</p><div className="module-picker">{groups(catalogue).map(group=><label key={group}><Icon name={groupIcons[group]??'grid'}/><span>{groupLabels[group]??group}</span><input type="checkbox" checked={modules.includes(group)} onChange={event=>setModules(old=>event.target.checked?[...old,group]:old.filter(g=>g!==group))}/></label>)}</div><p className="role-footnote">Permissions already selected remain in the review if you hide a category here.</p></>}
  {step===2&&<RolePermissions catalogue={catalogue} modules={modules} ids={draft.permissionIds} editing onChange={permissionIds=>setDraft({...draft,permissionIds})}/>}
  {step===3&&<><RoleReview catalogue={catalogue} draft={draft}/><label className="role-check"><input type="checkbox" checked={review} onChange={event=>setReview(event.target.checked)}/>I reviewed this role and its permissions</label></>}
 </div><div className="wizard-actions"><button className="button button-secondary" disabled={mutation.pending} onClick={()=>dialog.current?.close()}>Cancel</button><div>{step>0&&<button className="button button-secondary" disabled={mutation.pending} onClick={()=>{setReview(false);setStep(step-1);}}>Back</button>}{step<3?<button className="button" disabled={!draftValid(draft)} onClick={()=>setStep(step+1)}>Next <Icon name="arrow"/></button>:<button className="button" disabled={!review||mutation.pending} onClick={()=>void save()}>{mutation.pending?'Saving…':'Create role'}</button>}</div></div><p role="status">{mutation.message}</p></dialog>;
}
