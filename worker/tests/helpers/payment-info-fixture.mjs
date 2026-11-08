import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const proof=u=>({'X-LAN-Session-Proof':u?.csrf??'', 'X-CSRF-Token':u?.csrf??''});
export async function paymentExample(f){
 const admin=await f.user({genuine:true}),planner=await f.user({admin:true}),member=await f.user(),outsider=await f.user(),location=randomUUID();
 for(const [u,name]of [[member,'Pixel Alice'],[admin,'Fictional Organizer'],[outsider,'Byte Bob']])await f.sql('INSERT INTO user_nicknames(user_id,nickname,created_at,updated_at) VALUES (?,?,0,0)',u.id,name).run();
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Fictional Hall','Example 1','0000 AA','Example','NL',20,30000,0,0)",location).run();
 const created=await f.request('manage/events',admin,{action:'create',operationId:randomUUID(),locationId:location,locationRevision:0,title:'Fictional payment info LAN',description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Fictional local review only. No real emails or hosted data.'}]}]},startsAt:Date.parse('2030-11-01T17:00Z')/1000,endsAt:Date.parse('2030-11-03T19:00Z')/1000,minimumParticipants:1,maxGuests:2},proof(admin));assert.equal(created.status,200,await created.clone().text());const{id}=await created.json(),days=['2030-11-01','2030-11-02','2030-11-03'],guest={id:randomUUID(),name:'Guest Nova',email:'nova@example.test',days:[days[1]]};
 await f.sql("UPDATE events SET publication_status='published',registration_status='open' WHERE id=?",id).run();await f.sql('UPDATE event_management SET is_listed=1 WHERE event_id=?',id).run();
 assert.equal((await f.request('event-registration/'+id,member,{action:'save',revision:0,operationId:randomUUID(),draft:{days,guests:[guest]}},proof(member))).status,200);
 const revision=()=>f.sql('SELECT revision FROM event_management WHERE event_id=?',id).first('revision');
 const call=(u=admin,body,headers={})=>f.request('event-finance/'+id+'/manage',u,body,{...proof(u),...headers});
 const command=async(action,extra={},u=admin,headers={})=>call(u,{action,operationId:randomUUID(),revision:await revision(),...extra},headers);
 const preview=async(u=admin)=>{const r=await command('payment-info-preview',{},u);assert.equal(r.status,200,await r.clone().text());return r.json();};
 const send=async(p,extra={},headers={})=>command('send-payment-info',{previewToken:p.previewToken,retryFailed:false,...extra},admin,headers);
 const mails=async()=> (await f.fetch('http://127.0.0.1:5173/fixture-payment-emails')).json();
 const end=async()=>{await f.sql("UPDATE events SET registration_status='closed' WHERE id=?",id).run();await f.sql('UPDATE event_management SET starts_at=1,ends_at=2 WHERE event_id=?',id).run();};
 const review=async()=>{const r=await f.request('event-review/'+id,admin,undefined,proof(admin));assert.equal(r.status,200,await r.clone().text());return r.json();};
 const edit=async(person,selected)=>f.request('event-review/'+id,admin,{action:'attendance',revision:await revision(),operationId:randomUUID(),registrationId:person.registrationId,personId:person.id,days:selected,reason:'Fictional corrected days'},proof(admin));
 const finalize=async({instructions='Fictional bank reference',paymentUrl='https://tikkie.me/pay/fictional'}={})=>{
  await end();const person=(await review()).people.find(p=>p.id===member.id);assert.equal((await edit(person,[days[0],days[2]])).status,200);
  assert.equal((await f.request('event-review/'+id,admin,{action:'instructions',revision:await revision(),operationId:randomUUID(),paymentUrl,instructions,reason:'Fictional payment details'},proof(admin))).status,200);
  const closed=await command('finalize',{confirmation:'Fictional payment info LAN'},planner);assert.equal(closed.status,200,await closed.clone().text());
 };
 return {id,days,admin,planner,member,outsider,guest,revision,call,command,preview,send,mails,end,review,edit,finalize};
}
