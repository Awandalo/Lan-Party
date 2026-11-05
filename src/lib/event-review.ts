export interface ReviewPerson {registrationId:string;owner:string;id:string;name:string;kind:string;confirmed:string[];days:string[];complimentary?:boolean}
export interface EventReviewData {
 finalized?:boolean;revision:number;ended:boolean;open:boolean;canFinance:boolean;rentalCents:number;days:string[];people:ReviewPerson[];
 anonymousDays:{date:string;total:number}[];anonymousPeople:number;deletedAccounts:number;
 settings?:{payment_url:string;instructions:string};activity:{action:string;personName:string|null;reason:string;detail:string;occurredAt:number}[];
}
export class EventReviewRequestError extends Error {
 constructor(public status:number,message:string){super(message);}
}
export async function eventReviewRequest(id:string,proof:string,body?:object,signal?:AbortSignal):Promise<EventReviewData>{
 const response=await fetch('/api/event-review/'+encodeURIComponent(id),{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof,...body?{'Content-Type':'application/json','X-CSRF-Token':proof}:{}},...body?{body:JSON.stringify({...body,operationId:crypto.randomUUID()})}:{},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw new EventReviewRequestError(response.status,value.error??'Attendance review could not be loaded');return value;
}
