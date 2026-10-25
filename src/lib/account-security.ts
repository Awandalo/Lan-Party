export async function securityRequest(action:string,input?:object,csrf?:string){
 return fetch('/api/auth/security/'+action,{method:input?'POST':'GET',credentials:'same-origin',redirect:'error',
 headers:{'X-LAN-Request':'1',...(input?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},
 ...(input?{body:JSON.stringify(input)}:{}),signal:AbortSignal.timeout(15000)});
}
export function mfaSettingsRequested(){return window.location.hash==='#mfa';}
