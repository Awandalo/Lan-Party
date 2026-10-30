import {useState} from 'react';
import type {FormEvent} from 'react';
import {useAuth} from '../lib/auth';
import {builtIn,useRoleMutation,useRoleRead} from '../lib/roles';
import type {Catalogue,Role} from '../lib/roles';
import '../CSS/Roles_style.css';
export function RolesLoading(){
 return <div className="roles-page" aria-busy="true"><p className="roles-progress" role="status">Loading roles…</p><div className="roles-placeholder" aria-hidden="true"><div className="roles-placeholder-field"/><div className="panel role-editor"><h2>Role detail</h2><div className="roles-placeholder-field"/><div className="roles-placeholder-field"/><div className="roles-placeholder-description"/><div className="roles-placeholder-permissions"/></div></div></div>;
}
function Editor({catalogue,role}:{catalogue:Catalogue;role?:Role}){
 const assigned=catalogue.mappings.filter(p=>p.roleId===role?.id).map(p=>p.permissionId);
 const [code,setCode]=useState(role?.code??''),[name,setName]=useState(role?.name??''),[description,setDescription]=useState(role?.description??'');
 const [active,setActive]=useState(role?!!role.isActive:true),[protectedRole,setProtected]=useState(!!role?.isProtected),[permissions,setPermissions]=useState(assigned),[review,setReview]=useState(false);
 const mutation=useRoleMutation();
 const locked=!!role&&builtIn(role)||!catalogue.administrator&&(!!role?.isProtected||assigned.some(id=>catalogue.permissions.find(p=>p.id===id)?.protected));
 async function submit(event:FormEvent){event.preventDefault();if(locked||!review)return;await mutation.save('/api/manage/roles',{action:role?'update':'create',...(role?{roleId:role.id}:{}),revision:catalogue.revision,code,name,description,active,protected:protectedRole,permissionIds:permissions});}
 return <form className="panel role-editor" onSubmit={submit} aria-busy={mutation.pending}>
  <h2>{role?'Role detail':'Create custom role'}</h2>{locked&&<p>This role is read-only for your account. Built-in definitions are permanently protected.</p>}
  {role?.id==='1ff3ba6a-1567-4b90-bd5f-74d4d35a7ca7'&&<p>Genuine Administrators have full administration authority independently of the explicit mappings shown below.</p>}
  <fieldset disabled={locked||mutation.pending}><legend>Role definition</legend>
   <label>Stable code<input value={code} onChange={e=>setCode(e.target.value)} disabled={!!role} required maxLength={40}/></label>
   <label>Display name<input value={name} onChange={e=>setName(e.target.value)} required maxLength={80}/></label>
   <label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={400}/></label>
   <label className="role-check"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Active</label>
   <label className="role-check"><input type="checkbox" checked={protectedRole} disabled={!catalogue.administrator} onChange={e=>setProtected(e.target.checked)}/>Administrator-protected</label>
   <fieldset><legend>Explicit permissions</legend><p>Permissions for future features do not implement those features. Protected grants require a genuine Administrator.</p>{catalogue.permissions.map(p=><label className="role-check" key={p.id}><input type="checkbox" checked={permissions.includes(p.id)} disabled={p.protected&&!catalogue.administrator} onChange={e=>setPermissions(ids=>e.target.checked?[...ids,p.id]:ids.filter(id=>id!==p.id))}/><span><strong>{p.code}</strong> — {p.description}{p.protected?' (protected)':''}</span></label>)}</fieldset>
   <p>Review: {role?.name??'New role'} → {name||'Unnamed'}; {active?'active':'inactive'}; {protectedRole?'protected':'ordinary'}; {permissions.length} permissions (previously {assigned.length}). Security changes to a role you hold are rejected by the server.</p>
   <p>Add permissions: {catalogue.permissions.filter(p=>permissions.includes(p.id)&&!assigned.includes(p.id)).map(p=>p.code).join(', ')||'None'}. Remove permissions: {catalogue.permissions.filter(p=>assigned.includes(p.id)&&!permissions.includes(p.id)).map(p=>p.code).join(', ')||'None'}.</p>
   <label className="role-check"><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)} required/>I reviewed this definition and its grants</label>
   <button className="button" type="submit" disabled={!review||mutation.pending}>Save role</button>
  </fieldset><p role="status">{mutation.message}</p>
 </form>;
}
export default function Roles(){
 const read=useRoleRead<Catalogue>('/api/manage/roles'),[selected,setSelected]=useState('new');
 if(!read.data)return read.message?<div role="status"><p>{read.message}</p><button className="button" onClick={read.reload}>Reload roles</button></div>:<RolesLoading/>;
 const data=read.data,role=data.roles.find(r=>r.id===selected);
 return <div className="roles-page" aria-busy={read.loading}><p className="roles-progress" role="status">{read.loading?'Checking for updates…':'\u00a0'}</p><label>Choose a role<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="new">Create custom role</option>{data.roles.map(r=><option key={r.id} value={r.id}>{r.name} ({r.code}){r.isProtected?' · protected':''}{!r.isActive?' · inactive':''}</option>)}</select></label><Editor key={selected+':'+data.revision} catalogue={data} role={role}/></div>;
}
export function MemberRoles({userId}:{userId:string}){
 const auth=useAuth(),read=useRoleRead<Catalogue>('/api/manage/users/'+userId+'/roles'),mutation=useRoleMutation(),[selected,setSelected]=useState(''),[review,setReview]=useState(false);
 if(!auth.administration?.sections.includes('roles'))return null;
 if(!read.data)return <p role="status">{read.message||'Loading role administration…'}</p>;
 const data=read.data,role=data.roles.find(r=>r.id===selected),assigned=data.assignments?.some(a=>a.roleId===selected),self=userId===auth.session?.account.userId;
 return <section className="panel roles-page"><h2>Role membership</h2><p>Effective permissions: {data.effectivePermissions?.join(', ')||'None'}</p>
  <label>Role<select value={selected} onChange={e=>{setSelected(e.target.value);setReview(false);}}><option value="">Select a role</option>{data.roles.map(r=><option value={r.id} key={r.id}>{r.name}{data.assignments?.some(a=>a.roleId===r.id)?' · assigned':''}{r.isProtected?' · protected':''}</option>)}</select></label>
  <p>Change: {role?.name??'Select a role'} — {assigned?'remove assignment':'add assignment'}. {self?'Self-membership changes are not permitted.':''}</p>
  <label className="role-check"><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)}/>I reviewed this membership change</label>
  <button className="button" disabled={!role||!review||self||mutation.pending} onClick={()=>{if(role)void mutation.save('/api/manage/users/'+userId+'/roles',{action:assigned?'remove':'assign',accountId:userId,roleId:role.id,revision:data.revision});}}>Save membership</button><p role="status">{mutation.message}</p>
 </section>;
}
interface ActivityPage {entries:{sequence:string;occurredAt:number;actorId:string;operation:string;roleId:string;accountId:string|null;delta:string;operationId:string}[];nextBefore:string|null}
export function RoleActivity(){
 const [pages,setPages]=useState<string[]>([]),read=useRoleRead<ActivityPage>('/api/manage/role-activity'+(pages.length?'?before='+pages.at(-1):''),'activity');
 return <div className="roles-page"><p>Private successful-change history, retained indefinitely. IDs can remain linkable after account deletion.</p>
  {!read.data?<p role="status">{read.message||'Loading activity…'}</p>:<><div className="roles-scroll"><table><caption>Role Activity Log</caption><thead><tr><th scope="col">Time / operation</th><th scope="col">Actor / target IDs</th><th scope="col">Change</th></tr></thead><tbody>{read.data.entries.map(e=><tr key={e.sequence}><td>{new Date(e.occurredAt*1000).toLocaleString()}<br/>{e.operation}<br/>{e.operationId}</td><td>Actor: {e.actorId}<br/>Role: {e.roleId}{e.accountId&&<><br/>Account: {e.accountId}</>}</td><td><pre>{e.delta}</pre></td></tr>)}</tbody></table>{!read.data.entries.length&&<p>No role changes recorded.</p>}</div><button className="button button-secondary" disabled={!pages.length} onClick={()=>setPages(p=>p.slice(0,-1))}>Newer activity</button><button className="button button-secondary" disabled={!read.data.nextBefore} onClick={()=>{if(read.data?.nextBefore)setPages(p=>[...p,read.data!.nextBefore!]);}}>Older activity</button></>}
 </div>;
}
