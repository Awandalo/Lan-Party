export async function googleRequest(action: string, input?: object, csrf?: string) {
  return fetch('/api/auth/google/'+action,{method:input?'POST':'GET',credentials:'same-origin',redirect:'error',
    headers:{'X-LAN-Request':'1',...(input?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},
    ...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(15000)});
}
let setup: string|null=null;
export function capturePasswordSetup() {
  if(window.location.pathname!=='/account/security')return;
  const params=new URLSearchParams(window.location.hash.slice(1));
  const value=params.get('setup');
  window.history.replaceState(null,'','/account/security');
  if([...params.keys()].length===1 && value && /^[0-9a-f]{64}$/.test(value))setup=value;
}
export function passwordSetupToken(){return setup;}
export function clearPasswordSetup(){setup=null;}
