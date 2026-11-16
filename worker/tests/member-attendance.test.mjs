import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {local} from './helpers/role-fixture.mjs';
const proof=u=>({'X-LAN-Session-Proof':u?.csrf??''});
async function recorded(f,admin,owner,{year=2020,days=3,guests=true,free=false,qualifies=false,unfinished=false,future=false,status='published'}={}){
 const location=randomUUID();
 await f.sql("INSERT INTO locations(id,name,address_line,postal_code,city,country_code,capacity,default_rental_cents,created_at,updated_at) VALUES (?,'Original fictional hall','Example 1','0000 AA','Example','NL',20,0,0,0)",location).run();
 const eventYear=future?2035:year;
 const body={action:'create',operationId:randomUUID(),locationId:location,locationRevision:0,title:'Fictional LAN '+year,description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Fictional attendance fixture'}]}]},startsAt:Date.parse(eventYear+'-11-01T12:00Z')/1000,endsAt:Date.parse(eventYear+'-11-03T14:00Z')/1000,minimumParticipants:1,maxGuests:2,achievementsEnabled:qualifies};
 const res=await f.request('manage/events',admin,body,{...proof(admin),'X-CSRF-Token':admin.csrf});assert.equal(res.status,200,await res.clone().text());
 const {id}=await res.json(),dates=Array.from({length:3},(_,i)=>eventYear+'-11-0'+(i+1));
 await f.sql("UPDATE events SET publication_status=?,registration_status='closed' WHERE id=?",status,id).run();
 if(!unfinished){
  await f.sql("INSERT INTO event_finalizations(event_id,operation_id,closed_at,rental_cents,participant_days,daily_rate_cents,payment_url,instructions) VALUES (?,?,unixepoch(),0,?,0,'','Private payment instructions')",id,randomUUID(),days+(guests?3:0)).run();
  const lines=[...(days?[{name:'Private member name',kind:'Member',days:dates.slice(0,days),complimentary:free,totalCents:0}]:[]),...(guests?[{name:'Private guest name',kind:'Invited guest',days:dates,complimentary:false,totalCents:0}]:[])];
  await f.sql('INSERT INTO event_bills(id,event_id,owner_id,lines,total_cents) VALUES (?,?,?,?,0)',randomUUID(),id,owner.id,JSON.stringify(lines)).run();
 }
 await f.sql("UPDATE locations SET name='Renamed venue' WHERE id=?",location).run();
 return {id,dates};
}
async function history(f,staff,member){const r=await f.request('manage/users/'+member.id,staff,undefined,proof(staff));assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('cache-control'),'no-store');return (await r.json()).member.attendance;}

test('member detail shows actual finalized own days, including Free and excluded achievements; never guests or private billing fields',()=>local(async f=>{
 const staff=await f.user({genuine:true}),member=await f.user(),other=await f.user();
 const older=await recorded(f,staff,member,{year:2019,days:1,guests:true});
 const newer=await recorded(f,staff,member,{year:2020,free:true,qualifies:true});
 await recorded(f,staff,other,{year:2021});await recorded(f,staff,member,{year:2022,days:0});
 await recorded(f,staff,member,{year:2023,unfinished:true});await recorded(f,staff,member,{year:2024,future:true});
 await recorded(f,staff,member,{year:2025,status:'cancelled'});
 const before=(await f.sql('SELECT id,lines,total_cents FROM event_bills ORDER BY id').all()).results;
 const data=await history(f,staff,member);
 assert.equal(data.available,true);assert.equal(data.hasMore,false);
 assert.deepEqual(data.events,[{id:newer.id,title:'Fictional LAN 2020',venue:'Original fictional hall',achievementsEnabled:true,days:newer.dates},{id:older.id,title:'Fictional LAN 2019',venue:'Original fictional hall',achievementsEnabled:false,days:[older.dates[0]]}]);
 assert.equal(/Private|payment|totalCents|email|owner|complimentary/.test(JSON.stringify(data)),false);
 assert.deepEqual((await f.sql('SELECT id,lines,total_cents FROM event_bills ORDER BY id').all()).results,before);
 const list=await(await f.request('manage/users',staff,undefined,proof(staff))).json();assert.ok(list.members.every(m=>!('attendance' in m)));
}));
test('attendance history retains users.view, session proof and account isolation boundaries',()=>local(async f=>{
 const staff=await f.user({admin:true}),member=await f.user(),stranger=await f.user();
 await recorded(f,staff,member);
 for(const actor of [undefined,member,stranger])assert.ok([401,403].includes((await f.request('manage/users/'+member.id,actor,undefined,proof(actor))).status));
 assert.equal((await f.request('manage/users/'+member.id,staff)).status,403);
 assert.deepEqual((await history(f,staff,stranger)).events,[]);
 await f.sql('DELETE FROM role_permissions').run();assert.equal((await f.request('manage/users/'+member.id,staff,undefined,proof(staff))).status,403);
}));
test('pre-event schemas report attendance unavailable rather than failing member details or inventing empty history',()=>local(async f=>{
 const staff=await f.user({genuine:true}),member=await f.user();
 assert.deepEqual(await history(f,staff,member),{available:false,events:[],hasMore:false});
},23));

test('long histories are bounded to the latest 100 events and advertise additional rows',()=>local(async f=>{
 const staff=await f.user({genuine:true}),member=await f.user(),seed=await recorded(f,staff,member);
 const templates=[];
 for(const [table,column] of [['events','id'],['event_management','event_id'],['event_finalizations','event_id'],['event_bills','event_id']])templates.push({table,row:await f.sql(`SELECT * FROM ${table} WHERE ${column}=?`,seed.id).first()});
 const ids=[];
 for(let i=1;i<=100;i++){
  const id=randomUUID();ids.push(id);
  await f.db.batch(templates.map(({table,row})=>{
   const clone={...row};if(table==='events'){clone.id=id;clone.slug='fictional-history-'+i;}else clone.event_id=id;
   if(table==='event_management')clone.starts_at+=i;
   if(table==='event_finalizations')clone.operation_id=randomUUID();
   if(table==='event_bills')clone.id=randomUUID();
   const keys=Object.keys(clone);return f.db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(clone));
  }));
 }
 const data=await history(f,staff,member);assert.equal(data.events.length,100);assert.equal(data.hasMore,true);assert.equal(data.events[0].id,ids.at(-1));assert.equal(data.events.at(-1).id,ids[0]);
}));
