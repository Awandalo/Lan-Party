export async function googleRequest(action: string, input?: object, csrf?: string) {
  return fetch('/api/auth/google/'+action,{method:input?'POST':'GET',credentials:'same-origin',redirect:'error',
    headers:{'X-LAN-Request':'1',...(input?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},
    ...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(15000)});
}
let setupRequested=false;
let mfaRequested=false;
export function capturePasswordSetup() {
  if(window.location.pathname!=='/account/security')return;
  // This result is display-only; do not strip its diagnostic or turn it into setup intent.
  if(new URLSearchParams(window.location.search).has('google_mfa'))return;
  setupRequested=window.location.hash==='#add-password';
  mfaRequested=window.location.hash==='#mfa';
  window.history.replaceState(null,'','/account/security');
}
// A display hint only. No password/token/proof is persisted across OAuth redirects.
export function passwordSetupRequested(){return setupRequested;}
export function mfaSettingsRequested(){return mfaRequested;}
export function clearPasswordSetup(){setupRequested=false;}
