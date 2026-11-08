import {euro} from './currency';
import type {BillLine} from './event-billing';
export interface PaymentInfo {name:string;event:string;dailyRateCents:number;lines:BillLine[];totalCents:number;paymentUrl:string;instructions:string;responsibleMember?:string}
// One plain-text message powers the preview and escaped HTML; no composer.
export function paymentInfoText(info:PaymentInfo){
 const intro=info.responsibleMember
  ?'This is your information only. '+info.responsibleMember+' receives the combined bill and arranges payment; you do not need to pay separately.'
  :info.totalCents===0?'No payment is due.':info.paymentUrl?'Please arrange payment using the following link: '+info.paymentUrl:info.instructions?'Please arrange payment using the instructions below.':'Payment details have not been provided. Contact the organizer.';
 const dates=(days:string[])=>days.map(d=>d.slice(8,10)+'-'+d.slice(5,7)+'-'+d.slice(0,4)).join(', ');
 return ['Dear '+info.name+',','The event '+info.event+' has been closed.','Daily price: '+euro(info.dailyRateCents),
  ...info.lines.map(line=>line.name+' — '+line.days.length+' '+(line.days.length===1?'day':'days')+' ('+dates(line.days)+'): '+(line.complimentary?'Free attendance — ':'' )+euro(line.totalCents)),
  (info.responsibleMember?'Your share: ':'Combined total: ')+euro(info.totalCents),intro,
  ...!info.responsibleMember&&info.instructions?[info.instructions]:[],
  'Thank you for hanging out with us. See you at the next one!'].join('\n\n');
}
export interface PaymentInfoRecipient {key:string;name:string;email:string;kind:'Member'|'Invited guest';text:string;state:'ready'|'sending'|'sent'|'failed'|'unknown'}
export interface PaymentInfoPreview {revision:number;previewToken:string;missingInstructions:boolean;sendBlockedReason?:string;recipients:PaymentInfoRecipient[]}
