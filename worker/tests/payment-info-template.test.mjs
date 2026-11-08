import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const code=await build({stdin:{resolveDir:process.cwd(),contents:"export {ResendEmailTransport,EmailDeliveryError} from './worker/auth/email';export {paymentInfoEmail} from './worker/payment-info-template';"},bundle:true,format:'esm',platform:'node',write:false});
const {ResendEmailTransport,EmailDeliveryError,paymentInfoEmail}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const info={name:'Alice <img>',event:'LAN & friends',dailyRateCents:1700,lines:[{name:'Alice <img>',kind:'Member',days:['2030-11-01','2030-11-02','2030-11-03'],complimentary:false,totalCents:5100}],totalCents:5100,paymentUrl:'https://tikkie.me/pay/fictional',instructions:'Fictional bank'};
const mail={to:'alice@example.test',url:'https://dev.lan-party.club/events/00000000-0000-4000-8000-000000000001/registration',idempotencyKey:'fictional-key',expiresAt:9999999999,purpose:'event-payment',paymentInfo:info};
test('simple final message shows 1/2/3 corrected days, Dutch rate/total, escaped HTML and a real payment link',()=>{
 for(let days=1;days<=3;days++){const value={...info,lines:[{...info.lines[0],days:info.lines[0].days.slice(0,days),totalCents:days*1700}],totalCents:days*1700},message=paymentInfoEmail(value);assert.match(message.text,new RegExp(days+' '+(days===1?'day':'days')));assert.ok(message.text.includes('€ 17,00'));assert.ok(message.html.includes('&lt;img&gt;'));assert.ok(message.html.includes('LAN &amp; friends'));assert.ok(message.html.includes('<a href="https://tikkie.me/pay/fictional">'));assert.equal(message.html.includes('<img>'),false);}
 const free=paymentInfoEmail({...info,lines:[{...info.lines[0],complimentary:true,totalCents:0}],totalCents:0});assert.match(free.text,/No payment is due/);
 const bank=paymentInfoEmail({...info,paymentUrl:''});assert.match(bank.text,/instructions below/);assert.equal(bank.text.includes('following link'),false);
 assert.throws(()=>paymentInfoEmail({...info,paymentUrl:'https://evil.example.test/pay'}));assert.throws(()=>paymentInfoEmail({...info,totalCents:1}));
});
test('payment transport records only a bounded valid provider receipt; confirmed rejection and unknown outcomes stay distinct',async()=>{
 let calls=0;const provider=new ResendEmailTransport('fictional-key','sender@example.test',async(url,request)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(request.redirect,'manual');assert.equal(request.headers['Idempotency-Key'],'fictional-key');assert.match(JSON.parse(request.body).text,/Combined total/);return Response.json({id:'00000000-0000-4000-8000-000000000001'});});
 assert.deepEqual(await provider.send(mail),{id:'00000000-0000-4000-8000-000000000001'});assert.equal(calls,1);
 for(const [status,outcome]of [[400,'failed'],[401,'failed'],[403,'failed'],[422,'failed'],[429,'failed'],[409,'unknown'],[500,'unknown']]){
  const transport=new ResendEmailTransport('fictional','sender@example.test',async()=>new Response('private provider diagnostic',{status}));await assert.rejects(transport.send(mail),e=>e instanceof EmailDeliveryError&&e.outcome===outcome&&!e.message.includes('private'));
 }
 for(const request of [async()=>{throw Error('fictional timeout');},async()=>Response.json({})])await assert.rejects(new ResendEmailTransport('fictional','sender@example.test',request).send(mail),e=>e.outcome==='unknown');
});
