export interface MfaStatus {enabled:boolean;enrollmentAvailable:boolean}
export async function readMfaStatus(signal:AbortSignal):Promise<MfaStatus>{
  const response=await fetch('/api/auth/mfa/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal});
  if(!response.ok)throw Error('MFA status unavailable');
  const body=await response.json();
  if(typeof body.enabled!=='boolean'||typeof body.enrollmentAvailable!=='boolean')throw Error('MFA status unavailable');
  return {enabled:body.enabled,enrollmentAvailable:body.enrollmentAvailable};
}
