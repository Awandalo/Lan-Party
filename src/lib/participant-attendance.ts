import type {RegistrationData} from './event-registration-api';
import type {EventReviewData} from './event-review';
import {EventReviewRequestError} from './event-review';

// Keep stored registrations intact; the manager view uses reviewed days after end.
export async function loadParticipantAttendance(loadRegistration:()=>Promise<RegistrationData>,loadReview:()=>Promise<EventReviewData>):Promise<RegistrationData>{
 const registration=await loadRegistration();
 if(!registration.ended||registration.cancelled)return registration;
 let review:EventReviewData;
 try{review=await loadReview();}catch(error){
  // Compatibility with 0029: only a deliberate missing-review-schema result may
  // fall back. Never hide authorization, network or other review failures.
  if(error instanceof EventReviewRequestError&&error.status===503&&error.message==='Attendance review is awaiting its database migration')return registration;
  throw error;
 }
 if(review.revision!==registration.revision)throw Error('Attendance changed while loading. Check again.');
 if(review.open)return registration;
 const retained=new Map(review.people.map(person=>[person.owner+':'+person.id,new Set(person.days)]));
 const participants=(registration.participants??[]).map(person=>{const days=retained.get(person.owner+':'+person.id)??new Set<string>();return {...person,places:[...registration.days.filter(day=>days.has(day.date)).map(day=>({personId:person.id,day:day.date,status:'confirmed' as const})),...person.places.filter(place=>place.status==='waitlisted'&&!days.has(place.day))]};}).filter(person=>person.places.length>0);
 return {...registration,attendanceReviewed:true,participants,total:review.people.filter(person=>person.days.length>0).length,
  days:registration.days.map(day=>({...day,confirmed:review.people.filter(person=>person.days.includes(day.date)).length}))};
}
