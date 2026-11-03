import assert from 'node:assert/strict';
import {createRequire,Module} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const result=await build({entryPoints:['worker/tests/fixtures/registration-model.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const mod=new Module(import.meta.filename);mod._compile(result.outputFiles[0].text,import.meta.filename);
const {changeRegistration:change,ownPlaces,remaining,confirmedMembers}=mod.exports;
const presentation=await build({entryPoints:['src/lib/event-registration.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const display=new Module(import.meta.filename);display._compile(presentation.outputFiles[0].text,import.meta.filename);
const {registrationDate,registrationDayHours}=display.exports;
const days=['2030-11-01','2030-11-02','2030-11-03'];
const initial=(capacity=3)=>({revision:0,sequence:0,open:true,ended:false,cancelled:false,capacity,days,maxGuests:2,parties:[],confirmed:[],waiting:[],notices:[]});
const guest=(n,selected=days)=>({id:`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,name:'Fictional guest '+n,email:`guest${n}@example.test`,days:selected});
const save=(s,owner,selected=days,guests=[])=>change(s,s.revision,{action:'save',owner,draft:{days:selected,guests}});
const act=(s,command)=>change(s,s.revision,command);
test('day roster filters confirmed member days only; clearing restores all dates without changing registrations',()=>{
 let s=save(initial(1),'alice',[days[0]],[guest(1,[days[1]])]);s=save(s,'bob',[days[1],days[2]]);
 const members=[{id:'alice',name:'Pixel Alice'},{id:'bob',name:'Byte Bob'}],before=structuredClone(s);
 assert.deepEqual(confirmedMembers(s,members,days[0]),[{...members[0],days:[days[0]]}]);
 assert.deepEqual(confirmedMembers(s,members,days[1]),[]); // Guest confirmed; Bob waitlisted.
 assert.deepEqual(confirmedMembers(s,members,days[2]),[{...members[1],days:[days[2]]}]);
 assert.deepEqual(confirmedMembers(s,members,null),[{...members[0],days:[days[0]]},{...members[1],days:[days[2]]}]);
 assert.deepEqual(s,before);
});
test('registration dates display day-month-year without changing canonical keys',()=>{
 assert.equal(registrationDate('2030-11-01'),'01-11-2030');assert.equal(registrationDate('2028-02-29'),'29-02-2028');
 const s=save(initial(),'alice');assert.equal(ownPlaces(s,'alice')[0].day,'2030-11-01');
});
test('LAN day labels use event start, midnight boundaries and event end without changing capacity rules',()=>{
 assert.equal(registrationDayHours(0,3,'18:00','20:00'),'18:00 – midnight');
 assert.equal(registrationDayHours(1,3,'18:00','20:00'),'00:00 – midnight');
 assert.equal(registrationDayHours(2,3,'18:00','20:00'),'00:00 – 20:00');
 assert.equal(registrationDayHours(0,1,'10:15','22:45'),'10:15 – 22:45');
});
test('a member and guests consume individual places only on their chosen days',()=>{
 const s=save(initial(),'alice',[days[0]],[guest(1,[days[1]])]);assert.equal(remaining(s,days[0]),2);assert.equal(remaining(s,days[1]),2);assert.equal(remaining(s,days[2]),3);assert.equal(ownPlaces(s,'alice').length,2);
});
test('new same-day groups wait atomically without partially using capacity',()=>{
 let s=save(initial(2),'bob');s=save(s,'alice',days,[guest(1)]);assert.equal(ownPlaces(s,'alice').filter(p=>p.status==='confirmed').length,0);assert.equal(s.waiting.length,3);assert.equal(remaining(s,days[0]),1);
});
test('first fitting groups pass larger groups while skipped priority stays unchanged',()=>{
 let s=save(initial(2),'alice',days,[guest(1),guest(2)]);const sequence=s.waiting[0].sequence;s=save(s,'bob');s=save(s,'charlie');assert.equal(s.waiting[0].sequence,sequence);assert.equal(remaining(s,days[0]),0);assert.equal(ownPlaces(s,'bob')[0].status,'confirmed');
 s=act(s,{action:'cancel',owner:'bob'});s=act(s,{action:'cancel',owner:'charlie'});s=act(s,{action:'capacity',capacity:3});assert.equal(s.waiting.length,0);assert.equal(ownPlaces(s,'alice').every(p=>p.status==='confirmed'),true);
});
test('adding guests never demotes already confirmed member days',()=>{
 let s=save(initial(1),'alice');s=save(s,'alice',days,[guest(1)]);assert.equal(ownPlaces(s,'alice').filter(p=>p.personId==='alice').every(p=>p.status==='confirmed'),true);assert.equal(ownPlaces(s,'alice').filter(p=>p.personId!=='alice').every(p=>p.status==='waitlisted'),true);
});
test('removing selected days or individual guests frees space and promotes eligible groups',()=>{
 let s=save(initial(2),'alice',days,[guest(1)]);s=save(s,'bob');s=save(s,'alice',[days[0]],[]);assert.equal(ownPlaces(s,'bob').every(p=>p.status==='confirmed'),true);assert.equal(remaining(s,days[1]),1);assert.ok(s.notices.some(n=>n.owner==='bob'&&n.action==='waitlist promotion'));
});
test('cancellation releases all owned places; re-registration loses previous priority',()=>{
 let s=save(initial(1),'alice');s=save(s,'bob');s=save(s,'charlie');s=act(s,{action:'cancel',owner:'bob'});s=save(s,'bob');assert.equal(s.waiting.filter(g=>g.day===days[0])[0].owner,'charlie');
 s=act(s,{action:'cancel',owner:'alice'});assert.equal(ownPlaces(s,'charlie')[0].status,'confirmed');assert.equal(ownPlaces(s,'bob')[0].status,'waitlisted');
});
test('duplicate guest email is normalized and rejected without identifying another owner',()=>{
 let s=save(initial(),'alice',days,[guest(1)]);const input=structuredClone(s);assert.throws(()=>save(s,'bob',days,[{...guest(2),email:' GUEST1@EXAMPLE.TEST '}]),/^Error: A guest email cannot be used/);assert.deepEqual(s,input);
 s=act(s,{action:'cancel',owner:'alice'});assert.doesNotThrow(()=>save(s,'bob',days,[guest(1)]));assert.throws(()=>save(initial(),'alice',days,[guest(1),{...guest(2),email:guest(1).email}]),/guest email/);
});
test('closed registration is view-only and reopening promotes newly fitting waiting groups',()=>{
 let s=save(initial(1),'alice');s=save(s,'bob');s=act(s,{action:'close'});assert.throws(()=>save(s,'alice'),/closed/);assert.throws(()=>act(s,{action:'cancel',owner:'alice'}),/closed/);s=act(s,{action:'capacity',capacity:2});assert.equal(ownPlaces(s,'bob')[0].status,'waitlisted');s=act(s,{action:'open'});assert.equal(ownPlaces(s,'bob')[0].status,'confirmed');
});
test('capacity cannot drop below confirmed headcount and ended/cancelled events cannot reopen',()=>{
 let s=save(initial(),'alice',days,[guest(1)]);assert.throws(()=>act(s,{action:'capacity',capacity:1}),/Resolve confirmed/);s=act(s,{action:'end'});assert.throws(()=>act(s,{action:'open'}),/ended or cancelled/);
 s=act(save(initial(),'alice'),{action:'cancel-event'});assert.equal(s.confirmed.length,0);assert.equal(s.waiting.length,0);assert.equal(s.parties[0].active,false);assert.throws(()=>act(s,{action:'open'}),/ended or cancelled/);
});
test('revision fence rejects stale state and invalid input leaves state unchanged',()=>{
 const s=save(initial(),'alice');assert.throws(()=>change(s,0,{action:'cancel',owner:'alice'}),/changed/);const before=structuredClone(s);for(const draft of [{days:[],guests:[]},{days:['not-an-event-day'],guests:[]},{days,guests:[guest(1),guest(2),guest(3)]},{days,guests:[{...guest(1),email:'invalid'}]}])assert.throws(()=>change(s,s.revision,{action:'save',owner:'bob',draft}));assert.deepEqual(s,before);
});
