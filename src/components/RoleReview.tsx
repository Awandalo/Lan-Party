import type {Catalogue,Role} from '../lib/roles';
import type {RoleDraft} from '../lib/role-presentation';
import {assignedPermissions,permissionLabel} from '../lib/role-presentation';
export default function RoleReview({catalogue,draft,role}:{catalogue:Catalogue;draft:RoleDraft;role?:Role}){
 const before=assignedPermissions(catalogue,role),names=(ids:string[])=>catalogue.permissions.filter(p=>ids.includes(p.id)).map(p=>permissionLabel(p.code)).join(', ')||'None';
 return <div className="role-review"><h3>Review your changes</h3><p><strong>{draft.name}</strong> · {draft.active?'Active':'Inactive'} · {draft.protected?'Administrator-protected':'Ordinary role'}</p><p>{draft.description||'No description provided.'}</p>{role&&<p>Previous: {role.name} · {role.isActive?'Active':'Inactive'} · {role.isProtected?'Administrator-protected':'Ordinary role'} · {role.description||'No description'}</p>}<dl><dt>Add permissions</dt><dd>{names(draft.permissionIds.filter(id=>!before.includes(id)))}</dd><dt>Remove permissions</dt><dd>{names(before.filter(id=>!draft.permissionIds.includes(id)))}</dd></dl><small>Changes apply only after confirmation. Security changes to a role you hold are rejected by the server.</small></div>;
}
