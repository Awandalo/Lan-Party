import type {BillLine,CombinedBill} from './event-billing';
export interface FinanceData {finalized:boolean;canManagePayments?:boolean;revision?:number;title?:string;ended?:boolean;open?:boolean;closedAt?:number;rentalCents:number;participantDays:number;dailyRateCents:number;complimentaryDays?:number;bills:(Omit<CombinedBill,'owner'>&{owner:string|null;id?:string;paid?:number})[]}
export interface MemberBillData {finalized:boolean;closedAt?:number;dailyRateCents?:number;bill?:{lines:BillLine[];totalCents:number;paid:number;paymentUrl:string;instructions:string}|null}
export class FinanceRequestError extends Error {constructor(public status:number,message:string){super(message);}}
export async function financeRequest<T>(id:string,proof:string,manager:boolean,body?:object,signal?:AbortSignal):Promise<T>{
 const response=await fetch('/api/event-finance/'+encodeURIComponent(id)+(manager?'/manage':''),{method:body?'POST':'GET',credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1','X-LAN-Session-Proof':proof,...body?{'Content-Type':'application/json','X-CSRF-Token':proof}:{}},...body?{body:JSON.stringify({...body,operationId:crypto.randomUUID()})}:{},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw new FinanceRequestError(response.status,value.error??'Finance could not be loaded');return value;
}
export const euro=(cents:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR'}).format(cents/100);

export type BillPaymentFilter='all'|'paid'|'unpaid';
export function filterBillsByPayment<T extends {totalCents:number;paid?:number}>(bills:T[],filter:BillPaymentFilter):T[]{
 return bills.filter(bill=>filter==='all'||bill.totalCents>0&&(filter==='paid'?!!bill.paid:!bill.paid));
}
