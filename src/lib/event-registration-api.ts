import type {OwnEventRegistration,RegistrationPlace} from './event-registration';
export interface RegistrationData {
 revision:number;open:boolean;ended:boolean;cancelled:boolean;maxGuests:number;startsAt:number;endsAt:number;
 days:{date:string;confirmed:number;waiting:number;capacity:number}[];
 own:(Omit<OwnEventRegistration,'revision'>)|null;
 crew:{id:string;name:string;days:string[]}[];
 participants?:{id:string;name:string;kind:string;owner:string;places:RegistrationPlace[]}[];total?:number;
}
export async function registrationRequest(id:string,proof:string,manager=false,body?:object,signal?:AbortSignal):Promise<RegistrationData>{
 const response=await fetch('/api/'+(manager?'event-participants/':'event-registration/')+encodeURIComponent(id),{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof,...body?{'Content-Type':'application/json','X-CSRF-Token':proof}:{}},...body?{body:JSON.stringify({...body,operationId:crypto.randomUUID()})}:{},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw Error(value.error??'Registration could not be loaded');return value;
}
