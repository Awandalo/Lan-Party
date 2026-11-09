import {changeRegistration} from '../src/lib/registration-allocation';
import {registrationReady,registrationSnapshot} from './event-registration-data';
// Called inside the existing account-deletion transaction. Removing a member's
// private party also frees guest places; promotions use the same queue policy.
export async function registrationRemoval(db:D1Database,userId:string){
 const statements:D1PreparedStatement[]=[],operations:string[]=[];
 if(!await registrationReady(db))return {statements,operations};
 const events=(await db.prepare('SELECT DISTINCT event_id FROM registrations WHERE user_id=?').bind(userId).all<{event_id:string}>()).results;
 for(const {event_id:id} of events){
  const {state}=await registrationSnapshot(db,id);
  state.parties=state.parties.filter(p=>p.owner!==userId);state.confirmed=state.confirmed.filter(g=>g.owner!==userId);state.waiting=state.waiting.filter(g=>g.owner!==userId);
  const next=changeRegistration(state,state.revision,{action:state.open&&!state.ended&&!state.cancelled?'open':'close'}),operation=crypto.randomUUID();operations.push(operation);
  statements.push(db.prepare('UPDATE event_management SET revision=revision+1 WHERE event_id=? AND revision=?').bind(id,state.revision),db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('Registration conflict') END"));
  statements.push(db.prepare("INSERT INTO event_registration_operations VALUES (?,?,NULL,'cancel',unixepoch(),?)").bind(operation,id,next.revision));
  const groups=JSON.stringify([...next.confirmed.map(g=>({...g,status:'confirmed'})),...next.waiting.map(g=>({...g,status:'waitlisted'}))]);
  // Preserve the removed party until the existing deletion code records its
  // historical anonymous totals; only other parties' places are updated here.
  statements.push(db.prepare('DELETE FROM event_registration_places WHERE event_id=? AND registration_id NOT IN (SELECT id FROM registrations WHERE user_id=?)').bind(id,userId),db.prepare(`INSERT INTO event_registration_places SELECT r.id,?,d.id,person.value,json_extract(g.value,'$.status'),json_extract(g.value,'$.sequence') FROM json_each(?) g JOIN json_each(json_extract(g.value,'$.people')) person JOIN registrations r ON r.user_id=json_extract(g.value,'$.owner') AND r.event_id=? JOIN event_days d ON d.event_id=r.event_id AND d.attendance_date=json_extract(g.value,'$.day')`).bind(id,groups,id));
  statements.push(db.prepare(`INSERT OR IGNORE INTO registration_days SELECT p.registration_id,p.event_id,p.event_day_id,unixepoch() FROM event_registration_places p JOIN registrations r ON r.id=p.registration_id WHERE p.event_id=? AND p.state='confirmed' AND p.person_id=r.user_id AND r.user_id<>?`).bind(id,userId));
  for(const owner of new Set(next.notices.map(n=>n.owner)))statements.push(db.prepare('INSERT INTO event_registration_notifications(id,operation_id,user_id,event_id,created_at) VALUES (?,?,?,?,unixepoch())').bind(crypto.randomUUID(),operation,owner,id));
 }
 return {statements,operations};
}
