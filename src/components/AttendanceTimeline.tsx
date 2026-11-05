import type {CSSProperties} from 'react';
import type {RegistrationPlace} from '../lib/event-registration';
import {registrationDate} from '../lib/event-registration';
import './AttendanceTimeline.css';

export default function AttendanceTimeline({days,places,confirmedLabel='Confirmed'}:{days:string[];places:Pick<RegistrationPlace,'day'|'status'|'position'>[];confirmedLabel?:string}){
 const confirmed=days.map((day,index)=>places.some(p=>p.day===day&&p.status==='confirmed')?index:-1).filter(index=>index>=0);
 const first=confirmed[0]??-1,last=confirmed.at(-1)??-1;
 const steps=days.map((day,index)=>{
  const place=places.find(p=>p.day===day&&p.status==='confirmed')??places.find(p=>p.day===day);
  const state=place?.status==='confirmed'?'confirmed':place?.status==='waitlisted'?'waiting':index>first&&index<last?'gap':'outside';
  return {day,state,label:state==='confirmed'?confirmedLabel:state==='waiting'?`Waitlisted${place?.position?` · group ${place.position}`:''}`:'Not attending'};
 });
 return <div className="attendance-timeline-scroll" role="region" aria-label="Attendance by event day" tabIndex={0}><ol className="attendance-timeline">{steps.map((step,index)=>{
  const weekday=new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'UTC'}).format(new Date(step.day+'T12:00:00Z'));
  return <li key={step.day} className={'attendance-step attendance-'+step.state} style={{'--next-day-color':`var(--attendance-${steps[index+1]?.state??step.state})`} as CSSProperties}>
   <span className="attendance-day-marker" aria-hidden="true">{step.state==='confirmed'?'✓':step.state==='waiting'?'…':step.state==='gap'?'×':'–'}</span>
   <strong>{weekday}</strong><time dateTime={step.day}>{registrationDate(step.day)}</time><span className="attendance-day-status">{step.label}</span>
  </li>;
 })}</ol></div>;
}
