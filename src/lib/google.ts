export async function googleRequest(action: string, input?: object, csrf?: string) {
  return fetch('/api/auth/google/'+action,{method:input?'POST':'GET',credentials:'same-origin',redirect:'error',
    headers:{'X-LAN-Request':'1',...(input?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},
    ...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(15000)});
}
let setupRequested=false;
export function capturePasswordSetup() {
  if(window.location.pathname!=='/account/security')return;
  setupRequested=window.location.hash==='#add-password';
  window.history.replaceState(null,'','/account/security');
}
// A display hint only. No password/token/proof is persisted across OAuth redirects.
export function passwordSetupRequested(){return setupRequested;}
export function clearPasswordSetup(){setupRequested=false;}
