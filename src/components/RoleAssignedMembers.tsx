import {useState} from 'react';
import {Link} from 'react-router';
import {useMemberRead} from '../lib/use-member-read';
import {formatMemberNumber} from '../lib/member-number';
const states={active:'Active',disabled:'Disabled',deactivated:'Deactivated','admin-disabled':'Administrator-disabled',deleting:'Deletion in progress'};

export default function RoleAssignedMembers({roleId}:{roleId:string}){
 const [pages,setPages]=useState<string[]>([]);
 const params=new URLSearchParams({roleId,status:'all',limit:'20'});
 if(pages.length)params.set('cursor',pages[pages.length-1]);
 const read=useMemberRead('/api/manage/users?'+params,false),page=read.data&&'members'in read.data?read.data:null;
 return <section className="panel role-assigned-members" aria-labelledby="role-members-title" aria-busy={read.loading}><h2 id="role-members-title">Assigned members</h2><p className="role-footnote">Includes inactive accounts and future assignments. Effective access may differ.</p><p className="roles-progress" role="status">{read.loading?'Loading assigned members…':read.message||'\u00a0'}</p>{read.message&&<button type="button" className="button button-secondary" onClick={read.retry}>Check again</button>}{page&&<>{page.members.length?<ul>{page.members.map(member=><li key={member.userId}><Link to={'/manage/users/'+member.userId}><strong>{member.nickname??'Nickname unavailable'}</strong><span>{formatMemberNumber(member.memberNumber)}</span></Link><span className="role-footnote">{states[member.status]}</span></li>)}</ul>:<p>No members are assigned to this role.</p>}{(pages.length>0||page.nextCursor)&&<nav className="role-member-pages" aria-label="Assigned member pages"><button type="button" className="button button-secondary" disabled={read.loading||!pages.length} onClick={()=>setPages(p=>p.slice(0,-1))}>Previous page</button><span>Page {pages.length+1}</span><button type="button" className="button button-secondary" disabled={read.loading||!page.nextCursor} onClick={()=>{if(page.nextCursor)setPages(p=>[...p,page.nextCursor!]);}}>Next page</button></nav>}</>}</section>;
}
