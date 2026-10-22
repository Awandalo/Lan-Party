// Presentation eligibility only; backend status and every mutation independently
// require the trusted Worker build/configuration and current authentication.
export function mfaUiEligible(development:boolean,authMode:string|undefined,origin:string){
  try{
    const url=new URL(origin);
    return development&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)
      ||authMode==='hosted-dev'&&origin==='https://dev.lan-party.club';
  }catch{return false;}
}
export const MFA_ENROLLMENT_AVAILABLE=typeof window!=='undefined'
  &&mfaUiEligible(import.meta.env.DEV,import.meta.env.VITE_AUTH_MODE,window.location.origin);
