import type {AccountCommand,AccountSnapshot} from '../lib/member-save';
function AccountSwitch({label,checked,disabled,onChange}:{label:string;checked:boolean;disabled:boolean;onChange:()=>void}){
 return <button type="button" className="member-state-switch" role="switch" aria-checked={checked} disabled={disabled} onClick={onChange}><span aria-hidden="true"/><span>{label}</span></button>;
}
export default function MemberAccountControl({snapshot,intent,locked,feedback,onChange}:{snapshot:AccountSnapshot|null;intent:AccountCommand|null;locked:boolean;feedback:string;onChange:(action:AccountCommand['action']|null)=>void}) {
 const status=feedback||(snapshot?.invitationId?'Invitation requested; account remains disabled until recipient verification.':'');
 const action=snapshot?.status==='active'?'disable':snapshot?.eligible?'invite':null;
 return <><p className="member-lifecycle-status" role="status">{status}</p><div className="member-account-control">
  {!snapshot&&<small>Account actions require current Administrator access and the lifecycle feature to be available.</small>}
  {action&&<AccountSwitch label={action==='invite'?'Request reactivation invitation':'Deactivate account'} checked={intent?.action===action} disabled={locked} onChange={()=>onChange(intent?.action===action?null:action)}/>}
  {snapshot?.invitationId&&<AccountSwitch label="Cancel pending invitation" checked={intent?.action==='cancel'} disabled={locked} onChange={()=>onChange(intent?.action==='cancel'?null:'cancel')}/>}
  {(action==='invite'||snapshot?.invitationId)&&<small>Stage a request, then review and Save changes. A new invitation replaces the previous link and browser context. The recipient must verify their password and optional MFA.</small>}
  {action==='disable'&&<small>Administrator deactivation preserves profile names and roles, hides the public identity and revokes sessions and pending operations. Use Account Security to deactivate your own account.</small>}
 </div></>;
}
