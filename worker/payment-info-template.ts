import {paymentInfoText} from '../src/lib/payment-info';
import type {PaymentInfo} from '../src/lib/payment-info';
import {validPaymentRequestUrl} from '../src/lib/payment-request';
import {brandedEmailHtml,escapeEmailHtml as escape} from './email-layout';
export function paymentInfoEmail(info:PaymentInfo){
 if(!info||typeof info.name!=='string'||info.name.length>100||typeof info.event!=='string'||info.event.length>200||!Array.isArray(info.lines)||info.lines.length>50||!Number.isSafeInteger(info.dailyRateCents)||info.dailyRateCents<0||!Number.isSafeInteger(info.totalCents)||info.totalCents<0||typeof info.instructions!=='string'||info.instructions.length>2000||typeof info.paymentUrl!=='string'||info.paymentUrl&&!validPaymentRequestUrl(info.paymentUrl))throw Error('Invalid payment information');
 if(info.lines.some(l=>typeof l.name!=='string'||l.name.length>100||!Array.isArray(l.days)||l.days.length>31||l.days.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d))||typeof l.complimentary!=='boolean'||l.totalCents!==(l.complimentary?0:l.days.length*info.dailyRateCents)))throw Error('Invalid payment information');
 if(info.lines.reduce((n,l)=>n+l.totalCents,0)!==info.totalCents)throw Error('Invalid payment information');
 if(info.responsibleMember!==undefined&&(typeof info.responsibleMember!=='string'||info.responsibleMember.length>100||info.lines.length!==1||info.instructions||info.paymentUrl))throw Error('Invalid guest information');
 const text=paymentInfoText(info),subject=info.responsibleMember?'Your LAN Party cost information':'Your LAN Party payment information';
 const content=text.split('\n\n').map(paragraph=>{
  const total=paragraph.startsWith('Combined total:')||paragraph.startsWith('Your share:');
  let html=escape(paragraph);
  if(!info.responsibleMember&&info.totalCents>0&&info.paymentUrl&&paragraph==='Please arrange payment using the following link: '+info.paymentUrl)html=html.replace(escape(info.paymentUrl),'<br><a href="'+escape(info.paymentUrl)+'" style="display:inline-block;margin-top:12px;padding:16px 24px;border-radius:8px;background-color:#8de2bd;color:#101317;font-size:16px;font-weight:bold;text-decoration:none;">Open payment request</a>');
  return '<p style="margin:0 0 '+(total?'24':'16')+'px;color:'+(total?'#8de2bd':'#aeb9c7')+';font-size:'+(total?'22':'16')+'px;line-height:1.6;'+(total?'font-weight:bold;':'')+'white-space:pre-line;overflow-wrap:anywhere;">'+html+'</p>';
 }).join('\n');
 const footer=info.responsibleMember?'For information only. Your responsible member arranges payment.':'Payments are arranged outside LAN Party. The organizer records payment status manually.';
 return {subject,text,html:brandedEmailHtml(subject,info.responsibleMember?'Your attendance costs':'Your final bill',content,footer)};
}
