// Local review simulator only. This is not a server authorization or D1 transaction.
import type {RegistrationDraft,RegistrationPlace} from './event-registration';
export interface Party extends RegistrationDraft {owner:string;active:boolean}
export interface Group {owner:string;day:string;people:string[];sequence:number}
export interface PreviewRegistrationState {revision:number;sequence:number;open:boolean;ended:boolean;cancelled:boolean;capacity:number;days:string[];maxGuests:number;parties:Party[];confirmed:Group[];waiting:Group[];notices:{owner:string;action:string}[]}
export type PreviewCommand={action:'save';owner:string;draft:RegistrationDraft}|{action:'cancel';owner:string}|{action:'open'|'close'|'end'|'cancel-event'}|{action:'capacity';capacity:number};
export function remaining(s:PreviewRegistrationState,day:string){return s.capacity-s.confirmed.filter(g=>g.day===day).reduce((n,g)=>n+g.people.length,0);}
const email=(value:string)=>value.trim().toLowerCase();
export function confirmedMembers(s:PreviewRegistrationState,members:{id:string;name:string}[],day:string|null){
 return members.flatMap(member=>{
  const dates=s.days.filter(date=>(day===null||date===day)&&s.confirmed.some(group=>group.owner===member.id&&group.day===date&&group.people.includes(member.id)));
  return dates.length?[{...member,days:dates}]:[];
 });
}
export function ownPlaces(s:PreviewRegistrationState,owner:string):RegistrationPlace[]{
 return [...s.confirmed.flatMap(g=>g.owner===owner?g.people.map(personId=>({personId,day:g.day,status:'confirmed' as const})):[]),...s.waiting.filter(g=>g.owner===owner).flatMap(g=>g.people.map(personId=>({personId,day:g.day,status:'waitlisted' as const,position:s.waiting.filter(other=>other.day===g.day&&other.sequence<g.sequence).length+1})))];
}
export function changeRegistration(input:PreviewRegistrationState,revision:number,command:PreviewCommand):PreviewRegistrationState {
 if(input.revision!==revision)throw Error('Registration changed. Reload before trying again.');
 const s=structuredClone(input),owner='owner' in command?command.owner:null;
 if(command.action==='open'){
  if(s.ended||s.cancelled)throw Error('An ended or cancelled event cannot accept registrations.');s.open=true;
 }else if(command.action==='close')s.open=false;
 else if(command.action==='end'){s.ended=true;s.open=false;}
 else if(command.action==='cancel-event'){
  s.cancelled=true;s.open=false;s.confirmed=[];s.waiting=[];
  for(const party of s.parties.filter(p=>p.active)){party.active=false;s.notices.push({owner:party.owner,action:'event cancelled'});}
 }else if(command.action==='capacity'){
  if(!Number.isInteger(command.capacity)||command.capacity<1||command.capacity>100000)throw Error('Use a positive whole-number capacity.');
  if(s.days.some(day=>s.confirmed.filter(g=>g.day===day).reduce((n,g)=>n+g.people.length,0)>command.capacity))throw Error('Resolve confirmed registrations before reducing capacity.');
  s.capacity=command.capacity;
 }else{
  if(!s.open||s.ended||s.cancelled)throw Error('Registration is closed. Contact the organizer for changes.');
  if(!owner)throw Error('Choose a member.');
  const old=s.parties.find(p=>p.owner===owner);
  if(command.action==='cancel'){
   if(!old?.active)throw Error('No active registration to cancel.');old.active=false;
   s.confirmed=s.confirmed.filter(g=>g.owner!==owner);s.waiting=s.waiting.filter(g=>g.owner!==owner);
   s.notices.push({owner,action:'registration cancelled'});
  }else if(command.action==='save'){
   const draft=structuredClone(command.draft),validDays=(days:string[])=>Array.isArray(days)&&days.length>0&&new Set(days).size===days.length&&days.every(day=>s.days.includes(day));
   if(!validDays(draft.days)||!Array.isArray(draft.guests)||draft.guests.length>s.maxGuests)throw Error('Choose valid attendance days and respect the guest limit.');
   const identifiers=new Set<string>(),emails=new Set<string>();
   for(const guest of draft.guests){
    guest.name=guest.name.trim();guest.email=email(guest.email);
    if(!/^[a-f0-9-]{36}$/.test(guest.id)||identifiers.has(guest.id)||!guest.name||guest.name.length>100||guest.email.length>254||!/^\S+@\S+\.\S+$/.test(guest.email)||!validDays(guest.days))throw Error('Check each guest name, email and days.');
    identifiers.add(guest.id);
    if(emails.has(guest.email)||s.parties.some(p=>p.active&&p.owner!==owner&&p.guests.some(g=>email(g.email)===guest.email)))throw Error('A guest email cannot be used for this event. Check the details or contact the organizer.');
    emails.add(guest.email);
   }
   const requests=new Map<string,string[]>([[owner,draft.days],...draft.guests.map(g=>[g.id,g.days] as [string,string[]])]);
   if(identifiers.has(owner))throw Error('Invalid guest identifier.');
   // Keep existing places and queue positions; remove only deselected people/days.
   for(const list of [s.confirmed,s.waiting])for(const group of list.filter(g=>g.owner===owner))group.people=group.people.filter(person=>requests.get(person)?.includes(group.day));
   s.confirmed=s.confirmed.filter(g=>g.people.length);s.waiting=s.waiting.filter(g=>g.people.length);
   for(const day of s.days){
    const newcomers=[...requests].filter(([person,days])=>days.includes(day)&&![...s.confirmed,...s.waiting].some(g=>g.owner===owner&&g.day===day&&g.people.includes(person))).map(([person])=>person);
    if(newcomers.length)s.waiting.push({owner,day,people:newcomers,sequence:++s.sequence});
   }
   const wasActive=old?.active;
   const party={...draft,owner,active:true};if(old)Object.assign(old,party);else s.parties.push(party);
   s.notices.push({owner,action:wasActive?'registration updated':'registration confirmed'});
  }
 }
 if(s.open&&!s.ended&&!s.cancelled){
  // First fitting group wins; skipped groups keep their original sequence.
  s.waiting.sort((a,b)=>a.sequence-b.sequence);
  for(const group of [...s.waiting])if(group.people.length<=remaining(s,group.day)){
   s.confirmed.push(group);s.waiting=s.waiting.filter(g=>g!==group);
   if(input.waiting.some(old=>old.sequence===group.sequence))s.notices.push({owner:group.owner,action:'waitlist promotion'});
  }
 }
 s.revision++;return s;
}
