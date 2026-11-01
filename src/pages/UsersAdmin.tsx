import {Link} from 'react-router';
import '../CSS/UsersAdmin_style.css';
export default function UsersAdmin(){
 return <section className="page-section users-admin-page"><div className="panel"><h1>Account reactivation</h1><p>Reactivation invitations are now managed from Members. Find the deactivated member by nickname or member number, then review and save the invitation request in their details.</p><Link className="button" to="/manage/users">Open Members</Link></div></section>;
}
