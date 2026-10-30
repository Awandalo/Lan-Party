import {useState} from 'react';
import type {FormEvent} from 'react';
import {Link,useParams} from 'react-router';
import {formatMemberNumber} from '../lib/member-number';
import {useMemberRead} from '../lib/use-member-read';
import type {MemberDetail,MemberPage,MemberSummary} from '../lib/members';
import '../CSS/Members_style.css';
import MemberRoleEditor from '../components/MemberRoleEditor';
const labels:Record<MemberSummary['status'],string>={active:'Active',disabled:'Disabled',deactivated:'Voluntarily deactivated','admin-disabled':'Administrator-disabled',deleting:'Deletion in progress'};
function RoleLabels({row}:{row:MemberSummary}){return row.roles.length?<ul className="member-roles" aria-label="Assigned roles">{row.roles.map(r=><li className="member-role" key={r.code}>{r.name}{!r.active && ' (inactive)'}</li>)}</ul>:<>None</>;}
function AccountState({row}:{row:MemberSummary}){return <span className={'member-state '+(row.status==='active'?'member-state-active':'member-state-inactive')}>{labels[row.status]}</span>;}
function date(value:number){const d=new Date(value*1000);return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'Unavailable';}
export default function Members(){
 const {userId}=useParams();
 const [search,setSearch]=useState(''),[status,setStatus]=useState('active');
 const [criteria,setCriteria]=useState({search:'',status:'active'}),[cursors,setCursors]=useState<string[]>([]);
 const params=new URLSearchParams({...criteria,limit:'20'});if(cursors.length)params.set('cursor',cursors[cursors.length-1]);
 const href=userId?'/api/manage/users/'+encodeURIComponent(userId):'/api/manage/users?'+params.toString();
 const read=useMemberRead(href,!!userId),page=read.data && 'members' in read.data?read.data as MemberPage:null;
 const detail=read.data && 'member' in read.data?read.data.member as MemberDetail:null;
 function submit(event:FormEvent){event.preventDefault();setCursors([]);setCriteria({search,status});}
 function clear(){setSearch('');setStatus('active');setCriteria({search:'',status:'active'});setCursors([]);read.retry();}
 return <div className="members-page">
  {userId?<Link to="/manage/users">Back to Members</Link>:<form className="panel members-search" onSubmit={submit}>
   <div><label htmlFor="member-search">Search</label><input id="member-search" value={search} maxLength={24} onChange={e=>setSearch(e.target.value)} aria-describedby="member-search-help"/><small id="member-search-help">Part of a nickname or an exact member number, such as #0001. No email search.</small></div>
   <div><label htmlFor="member-status">Account state</label><select id="member-status" value={status} onChange={e=>setStatus(e.target.value)}><option value="active">Active</option><option value="deactivated">Deactivated / administrator-disabled</option><option value="disabled">Disabled / deleting</option></select></div>
   <div className="members-search-actions"><button className="button" type="submit">Search members</button>
   <button className="button button-secondary" type="button" onClick={clear}>Clear filters</button></div>
  </form>}
  <div className="members-results" aria-busy={read.loading}>
   <p className="members-progress" role="status">{read.loading?(read.data?'Checking for updates…':'Loading members…'):'\u00a0'}</p>
   {read.message && <div role="status"><p>{read.message}</p><button className="button button-secondary" onClick={read.retry}>Check again</button></div>}
   {page && <><p role="status">{page.members.length?`${page.members.length} member${page.members.length===1?'':'s'} on this page.`:'No members found.'}</p>
    {page.members.length>0 && <div className="members-table-scroll"><table><caption>Members matching your search</caption><thead><tr><th scope="col">Nickname</th><th scope="col">Member number</th><th scope="col">Account state</th><th scope="col">Assigned roles</th></tr></thead><tbody>{page.members.map(row=><tr key={row.userId}><td><Link to={'/manage/users/'+row.userId} aria-label={row.nickname?undefined:'View member '+formatMemberNumber(row.memberNumber)}>{row.nickname??'Nickname unavailable'}</Link></td><td>{formatMemberNumber(row.memberNumber)}</td><td><AccountState row={row}/></td><td><RoleLabels row={row}/></td></tr>)}</tbody></table></div>}

   </>}
   {!userId && !read.message && <nav className="members-pagination" aria-label="Member pages"><button className="button button-secondary" aria-disabled={read.loading || !cursors.length} onClick={()=>{if(!read.loading && cursors.length)setCursors(c=>c.slice(0,-1));}}>Previous page</button><span>Page {cursors.length+1}</span><button className="button button-secondary" aria-disabled={read.loading || !page?.nextCursor} onClick={()=>{if(!read.loading && page?.nextCursor)setCursors(c=>[...c,page.nextCursor!]);}}>Next page</button></nav>}
   {detail && <MemberRoleEditor key={detail.userId} userId={detail.userId} eligible={detail.status==='active'&&detail.verified} fallback={<RoleLabels row={detail}/>} memberLabel={`${detail.nickname??"Member"} · ${formatMemberNumber(detail.memberNumber)} · ${detail.email}`} >{(roleEditor,roleActions,accountEditor)=><><section className="panel members-detail" aria-labelledby="member-detail-heading"><h2 id="member-detail-heading">{detail.nickname??'Nickname unavailable'} · {formatMemberNumber(detail.memberNumber)}</h2><dl>
    <dt>Account state</dt><dd><AccountState row={detail}/>{accountEditor}</dd><dt>Assigned roles</dt><dd>{roleEditor}</dd><dt>Email</dt><dd>{detail.email}</dd><dt>Email verification</dt><dd>{detail.verified?'Verified':'Not verified'}</dd><dt>First name</dt><dd>{detail.firstName??'Unavailable'}</dd><dt>Name prefix</dt><dd>{detail.prefix??'Unavailable'}</dd><dt>Last name</dt><dd>{detail.lastName??'Unavailable'}</dd><dt>Created</dt><dd>{date(detail.createdAt)}</dd>
   </dl></section><section className="panel members-attendance" aria-labelledby="member-attendance-heading"><h2 id="member-attendance-heading">Attended events</h2><div className="members-table-scroll"><table><caption className="members-attendance-caption">Attendance history</caption><thead><tr><th scope="col">Event</th><th scope="col">Date</th><th scope="col">Location</th></tr></thead><tbody><tr><td colSpan={3}>Attendance history will appear here when event registration and attendance tracking are available.</td></tr></tbody></table></div></section>{roleActions}</>}</MemberRoleEditor>}
  </div>
 </div>;
}
