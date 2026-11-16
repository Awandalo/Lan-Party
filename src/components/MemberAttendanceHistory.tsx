import type {MemberAttendanceHistory as History} from '../lib/members';
import {registrationDate} from '../lib/event-registration';

export default function MemberAttendanceHistory({history}:{history:History}){
 return <section className="panel members-attendance" aria-labelledby="member-attendance-heading">
  <h2 id="member-attendance-heading">Attended events</h2>
  <p>Completed events and this member’s reviewed attendance. Free attendance counts; guest days and future bookings do not.</p>
  {!history.available?<p role="status">Attendance history is currently unavailable.</p>:<>
   <div className="members-table-scroll"><table>
    <caption className="members-attendance-caption">Attendance history</caption>
    <thead><tr><th scope="col">Event</th><th scope="col">Attended days</th><th scope="col">Location</th><th scope="col">Achievements</th></tr></thead>
    <tbody>{history.events.length?history.events.map(event=><tr key={event.id}>
     <td>{event.title}</td><td>{event.days.map(registrationDate).join(', ')}</td><td>{event.venue??'Unavailable'}</td><td>{event.achievementsEnabled?'Qualifying event':'Excluded'}</td>
    </tr>):<tr><td colSpan={4}>No completed attendance recorded.</td></tr>}</tbody>
   </table></div>
   {history.hasMore&&<p role="status">Showing the 100 most recent attended events.</p>}
  </>}
 </section>;
}
