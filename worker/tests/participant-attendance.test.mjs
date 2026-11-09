import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('wrangler/package.json'))('esbuild');
const code=await build({stdin:{resolveDir:process.cwd(),contents:"export {loadParticipantAttendance} from './src/lib/participant-attendance';export {EventReviewRequestError} from './src/lib/event-review';"},bundle:true,platform:'node',format:'esm',write:false});
const {loadParticipantAttendance,EventReviewRequestError}=await import('data:text/javascript;base64,'+Buffer.from(code.outputFiles[0].text).toString('base64'));
const dates=['2030-11-01','2030-11-02','2030-11-03'];
const place=(personId,day,status='confirmed')=>({personId,day,status});
function example(){
 const registration={revision:5,ended:true,cancelled:false,days:dates.map(date=>({date,confirmed:2,waiting:0,capacity:20})),total:2,participants:[{owner:'alice',id:'a',places:dates.map(day=>place('a',day))},{owner:'alice',id:'g',places:[place('g',dates[1])]}]};
 const review={revision:5,open:false,anonymousPeople:20,anonymousDays:dates.map(date=>({date,total:20})),people:[{owner:'alice',id:'a',days:[dates[2]]},{owner:'alice',id:'g',days:[dates[0],dates[1]]}]};
 return {registration,review};
}
test('manager counters and cards use saved reviewed removals/additions, excluding anonymous history',async()=>{
 const {registration,review}=example(),result=await loadParticipantAttendance(async()=>registration,async()=>review);
 assert.deepEqual(result.days.map(d=>d.confirmed),[1,1,1]);assert.equal(result.total,2);assert.equal(result.attendanceReviewed,true);
 assert.deepEqual(result.participants[0].places.map(p=>p.day),[dates[2]]);assert.deepEqual(result.participants[1].places.map(p=>p.day),[dates[0],dates[1]]);
 assert.equal(registration.participants[0].places.length,3);assert.equal(registration.participants[1].places.length,1);
 review.people[0].days=dates;registration.revision=6;review.revision=6;
 const refreshed=await loadParticipantAttendance(async()=>registration,async()=>review);assert.deepEqual(refreshed.days.map(d=>d.confirmed),[2,2,1]);
});
test('review joins use owner and person ID together; recorded attendance replaces waitlisted status on corrected dates',async()=>{
 const {registration,review}=example();registration.participants.push({owner:'bob',id:'g',places:[place('g',dates[2],'waitlisted')]});review.people.push({owner:'bob',id:'g',days:[dates[2]]});
 const result=await loadParticipantAttendance(async()=>registration,async()=>review);
 assert.deepEqual(result.participants.find(p=>p.owner==='bob').places,[place('g',dates[2])]);assert.deepEqual(result.participants.find(p=>p.owner==='alice'&&p.id==='g').places.map(p=>p.day),[dates[0],dates[1]]);
});
test('before event end no review request is needed; stale reads and real review failures never silently show original dates',async()=>{
 const {registration,review}=example();registration.ended=false;assert.equal(await loadParticipantAttendance(async()=>registration,async()=>{throw Error('Unexpected review read');}),registration);
 registration.ended=true;review.revision++;await assert.rejects(loadParticipantAttendance(async()=>registration,async()=>review),/Attendance changed/);
 for(const error of [new EventReviewRequestError(403,'Restricted'),new EventReviewRequestError(503,'Review unavailable'),Error('Network failed')])await assert.rejects(loadParticipantAttendance(async()=>registration,async()=>{throw error;}),error);
 const missing=new EventReviewRequestError(503,'Attendance review is awaiting its database migration');assert.equal(await loadParticipantAttendance(async()=>registration,async()=>{throw missing;}),registration);
});
