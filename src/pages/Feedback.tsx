import {useEffect,useRef,useState} from 'react';
import {Link,Navigate,useLocation,useNavigate,useParams} from 'react-router';
import {useAuth} from '../lib/auth';
import {useAdministration} from '../lib/administration';
import {useFeedback,useFeedbackRead,FEEDBACK_UI_AVAILABLE,feedbackLabel,decisions,progressStates} from '../lib/feedback';
import type {FeedbackPage,FeedbackItem} from '../lib/feedback';
import {formatMemberNumber} from '../lib/member-number';
import {FeedbackLabels,FeedbackState} from '../components/FeedbackDisplay';
import NewFeedbackDialog from '../components/NewFeedbackDialog';
import FeedbackThread from '../components/FeedbackThread';
import '../CSS/Feedback_style.css';

export default function Feedback({admin=false}:{admin?:boolean}){
 const {session,status}=useAuth(),access=useAdministration(),params=useParams(),route=params['*']??'';
 const {context}=useFeedback();
 if(!FEEDBACK_UI_AVAILABLE)return <p>Page not found</p>;
 if(status==='loading'||access.status==='loading')return <section className="page-section feedback-page" aria-busy="true"><h1>Feedback</h1><p role="status">Checking access…</p></section>;
 if(status==='error'||access.status==='error')return <p role="alert">Access could not be checked. Please reload.</p>;
 if(!session)return <Navigate to="/login" replace/>;
 if(admin&&!access.sections.includes('feedback'))return <section className="page-section"><h1>Access restricted</h1></section>;
 if(route&&route!=='new'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(route)||admin&&route==='new')return <p>Page not found</p>;
 const prefix=admin?'/manage/feedback':'/account/feedback',thread=!admin&&route&&route!=='new';
 return <section className={'page-section feedback-page administration-page'+(admin?' feedback-administration':'')}><h1>{admin?'Feedback inbox':'Feedback'}</h1>
  <div key={context+':'+admin+':'+(thread?route:'workspace')}>
   {thread?<FeedbackThread id={route} admin={false} prefix={prefix}/>:<Inbox admin={admin} prefix={prefix} initialSelection={admin?route:''} openFromRoute={!admin&&route==='new'}/>}
  </div>
 </section>;
}

function Inbox({admin,prefix,initialSelection,openFromRoute}:{admin:boolean;prefix:string;initialSelection:string;openFromRoute:boolean}){
 const location=useLocation(),navigate=useNavigate(),api=admin?'/api/manage/feedback':'/api/feedback/requests';
 const query=new URLSearchParams(location.search),read=useFeedbackRead<FeedbackPage>(api+(query.size?'?'+query:''));
 const [filters,setFilters]=useState(()=>filterValues(query)),[selected,setSelected]=useState(initialSelection),[creating,setCreating]=useState(openFromRoute),[created,setCreated]=useState(''),[selectionBusy,setSelectionBusy]=useState(false);
 const createdLink=useRef<HTMLAnchorElement>(null),focusCreated=useRef('');
 useEffect(()=>{setFilters(filterValues(new URLSearchParams(location.search)));},[location.search]);
 useEffect(()=>{if(openFromRoute)setCreating(true);},[openFromRoute]);
 useEffect(()=>{if(focusCreated.current&&createdLink.current){createdLink.current.focus();focusCreated.current='';}},[read.data,created]);
 function close(attempted=false){setCreating(false);if(attempted)read.reload();if(openFromRoute)navigate(prefix+location.search,{replace:true});}
 function apply(){if(selectionBusy)return;const params=new URLSearchParams();Object.entries(filters).forEach(([key,value])=>{if(value)params.set(key,value);});setSelected('');navigate(prefix+(params.size?'?'+params:''));read.reload();}
 function createdRequest(id:string){setCreating(false);setCreated(id);focusCreated.current=id;setFilters(filterValues(new URLSearchParams()));navigate(prefix,{replace:true});read.reload();}
 const items=read.data?.requests??[];
 const list=<>
  <div className="feedback-heading"><h2>{admin?'Requests':'My Requests'}</h2>{!admin&&<button className="button" onClick={()=>setCreating(true)}>New request</button>}</div>
  {!admin&&created&&<p className="feedback-status" role="status">Request submitted. <Link to={prefix+'/'+created}>View request</Link></p>}
  <FeedbackState loading={read.loading} refreshing={!!read.data} error={read.error} retry={read.reload}/>
  {read.data&&<>
   <div className={admin?'feedback-ticket-list':'feedback-list'} aria-busy={read.loading}>
    {items.map(item=>admin?<button key={item.id} type="button" className="feedback-ticket" aria-pressed={selected===item.id} disabled={selectionBusy} onClick={()=>setSelected(item.id)}><RequestSummary item={item} admin/></button>
     :<Link key={item.id} ref={item.id===created?createdLink:undefined} className={'panel feedback-request'+(item.id===created?' is-created':'')} to={prefix+'/'+item.id}><RequestSummary item={item}/></Link>)}
    {!items.length&&<p>No requests match these filters.</p>}
   </div>
   <nav className="feedback-pages" aria-label="Feedback pages">
    {query.has('cursor')&&<button className="button button-secondary" disabled={selectionBusy} onClick={()=>{query.delete('cursor');setSelected('');navigate(prefix+(query.size?'?'+query:''));}}>First page</button>}
    {read.data.nextCursor&&<button className="button button-secondary" onClick={()=>{query.set('cursor',read.data!.nextCursor!);setSelected('');navigate(prefix+'?'+query);}}>Older requests</button>}
   </nav>
  </>}
 </>;
 return <>
  <form className="panel feedback-filters" aria-label="Filter requests" onSubmit={e=>{e.preventDefault();apply();}}>
   {(['progress','decision'] as const).map(key=><label key={key}>{feedbackLabel(key)}<select value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">All</option>{(key==='progress'?progressStates:decisions).map(value=><option key={value} value={value}>{feedbackLabel(value)}</option>)}</select></label>)}
   <label>Type<select value={filters.kind} onChange={e=>setFilters({...filters,kind:e.target.value})}><option value="">All types</option><option value="bug">Bug report</option><option value="feature">Feature request</option></select></label>
   <label>Search titles<input maxLength={120} type="search" value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})}/></label><button className="button button-secondary" disabled={selectionBusy}>Apply filters</button>
  </form>
  {admin?<div className="feedback-workspace"><section className="feedback-list-column" aria-label="Requests">{list}{selected&&read.data&&!items.some(i=>i.id===selected)&&<p className="feedback-footnote">The selected request is outside these results.</p>}</section>
   {selected?<FeedbackThread key={selected} id={selected} admin prefix={prefix} onUpdated={read.reload} onBusyChange={setSelectionBusy}/>:<><section className="panel feedback-empty-selection"><h2>Select a request</h2><p>Choose a request from the list to read its details and conversation.</p></section><aside className="feedback-review-column" aria-label="Request administration"><section className="panel"><h2>Decision and progress</h2><p>Review controls appear here when you select a request.</p></section></aside></>}
  </div>:list}
  {creating&&!admin&&<NewFeedbackDialog onClose={close} onCreated={createdRequest}/>}
 </>;
}
function filterValues(query:URLSearchParams){return {kind:query.get('kind')??'',decision:query.get('decision')??'',progress:query.get('progress')??'',search:query.get('search')??''};}
function RequestSummary({item,admin=false}:{item:FeedbackItem;admin?:boolean}){return <><strong>{item.title}</strong>{item.unread&&<span className="feedback-unread-label">Unread</span>}<FeedbackLabels item={item}/>{admin&&<small>{item.nickname??'Nickname unavailable'}{item.memberNumber?' · '+formatMemberNumber(item.memberNumber):''}</small>}<small>{new Date(item.createdAt*1000).toLocaleString()}</small></>;}
