const reasons:Record<string,string>={
 'cancelled':'Google confirmation was cancelled. Return to the original tab to use your password or cancel MFA setup. No new confirmation was granted.',
 'fresh-proof-unavailable':'Google did not provide acceptable recent authentication proof. Choosing an account does not necessarily refresh your Google authentication time. Use your password in the original tab if available, or cancel.',
 'provider-validation':'The Google response could not be validated. No fresh confirmation was granted. This can include unavailable authentication-time proof or an interrupted provider exchange.',
 'identity-unavailable':'This Google identity is unavailable for this DEV operation.',
 'identity-mismatch':'The Google identity did not match the identity already connected to this account.',
 'session-changed':'The initiating account or session could not be confirmed. Return to Account Security and check your session.',
 'confirmation-unavailable':'The confirmation result could not be completed. Do not repeat setup automatically; check its status in the original tab.',
};
export default function GoogleMfaResult({result}:{result:string}){
 const complete=result==='complete',known=Object.hasOwn(reasons,result);
 return <section className="page-section account-security-page"><div className="panel account-security-card">
  <h1>Google confirmation</h1>
  <p role="status">{complete?'Google response processed. Return to your original Account Security tab if one is open; it will check the server result before continuing your MFA action.':(known?reasons[result]:null)??'Google confirmation is unavailable. Return to the original tab and use another existing sign-in method or cancel.'}</p>
  <p>This result does not start or retry an MFA action. You can close this tab after returning to the original tab, or continue here if this was your only tab.</p>
  <p>Reference: <code>{known||complete?result:'unavailable'}</code></p>
  <a href="/account/security#mfa">Continue to Account Security in this tab</a>
 </div></section>;
}
