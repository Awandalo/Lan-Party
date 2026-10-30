import type {AccountCommand,AccountSnapshot} from '../lib/member-save';
export default function MemberAccountControl({snapshot,intent,locked,roleChange,onChange}:{snapshot:AccountSnapshot|null;intent:AccountCommand|null;locked:boolean;roleChange:boolean;onChange:(action:AccountCommand['action']|null)=>void}) {
 if(!snapshot)return <div className="member-account-control"><small>Account actions require current Administrator access and the lifecycle feature to be available.</small></div>;
 const action=snapshot.status==='active'?'disable':snapshot.eligible?'invite':null;
 return <div className="member-account-control">
  {action&&<label className="role-check"><input type="checkbox" role="switch" checked={intent?.action===action} disabled={locked||roleChange&&action!=='invite'} onChange={event=>onChange(event.target.checked?action:null)}/>{action==='invite'?'Request reactivation invitation':'Deactivate account'}</label>}
  {snapshot.invitationId&&<label className="role-check"><input type="checkbox" role="switch" checked={intent?.action==='cancel'} disabled={locked||roleChange} onChange={event=>onChange(event.target.checked?'cancel':null)}/>Cancel pending invitation</label>}
  {(action==='invite'||snapshot.invitationId)&&<small>An invitation does not activate the account. The recipient must verify their password and optional MFA. A new invitation replaces the previous link and browser context.</small>}
  {action==='disable'&&<small>Administrator deactivation preserves profile names and roles, hides the public identity and revokes sessions and pending operations. Use Account Security to deactivate your own account.</small>}
 </div>;
}
