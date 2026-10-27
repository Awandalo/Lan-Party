import {Link} from 'react-router';
export default function RecoveryWarning({remaining}:{remaining?:number}){
 if(remaining===undefined||remaining>2)return null;
 return <aside className="account-confirmation" role="status">
  <strong>{remaining===0?'No recovery codes remain — recovery-code sign-in is unavailable.':remaining===1?'You have one final recovery code remaining.':'Only two recovery codes remain.'}</strong>
  <p>If your authenticator is available, regenerate recovery codes now in <Link to="/account/security">Account Security</Link>. Losing access to all usable sign-in methods may lock you out until a LAN Party administrator can assist. Existing valid methods remain usable; MFA is not bypassed.</p>
 </aside>;
}
