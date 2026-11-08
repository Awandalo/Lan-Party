import {paymentInfoText} from '../src/lib/payment-info';
import type {PaymentInfo} from '../src/lib/payment-info';
import {validPaymentRequestUrl} from '../src/lib/payment-request';
export function paymentInfoEmail(info:PaymentInfo){
 if(!info||typeof info.name!=='string'||info.name.length>100||typeof info.event!=='string'||info.event.length>200||!Array.isArray(info.lines)||info.lines.length>50||!Number.isSafeInteger(info.dailyRateCents)||info.dailyRateCents<0||!Number.isSafeInteger(info.totalCents)||info.totalCents<0||typeof info.instructions!=='string'||info.instructions.length>2000||typeof info.paymentUrl!=='string'||info.paymentUrl&&!validPaymentRequestUrl(info.paymentUrl))throw Error('Invalid payment information');
 if(info.lines.some(l=>typeof l.name!=='string'||l.name.length>100||!Array.isArray(l.days)||l.days.length>31||l.days.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))||typeof l.complimentary!=='boolean'||l.totalCents!==(l.complimentary?0:l.days.length*info.dailyRateCents)))throw Error('Invalid payment information');
 if(info.lines.reduce((n,l)=>n+l.totalCents,0)!==info.totalCents)throw Error('Invalid payment information');
 if(info.responsibleMember!==undefined&&(typeof info.responsibleMember!=='string'||info.responsibleMember.length>100||info.lines.length!==1||info.instructions||info.paymentUrl))throw Error('Invalid guest information');
 const text=paymentInfoText(info),escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 return {subject:info.responsibleMember?'Your LAN Party cost information':'Your LAN Party payment information',text,html:text.split('\n\n').map(p=>'<p>'+(info.paymentUrl?escape(p).replace(escape(info.paymentUrl),'<a href="'+escape(info.paymentUrl)+'">'+escape(info.paymentUrl)+'</a>'):escape(p))+'</p>').join('')};
}
