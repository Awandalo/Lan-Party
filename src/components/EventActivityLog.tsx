import {useState} from 'react';
import {useEventRead} from '../lib/event-management';
import type {EventLog} from '../lib/event-management';
import LogPagination from './LogPagination';
import '../CSS/EventManagement_style.css';
export default function EventActivityLog(){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[pages,setPages]=useState<string[]>([]);
 const params=new URLSearchParams({...query?{search:query}:{},...pages.length?{before:pages.at(-1)!}:{}}),read=useEventRead<{entries:EventLog[];nextBefore:string|null}>('/api/manage/event-activity?'+params);
 return <div className="event-management"><p>Event changes since this rollout. Logs record field categories without retaining old descriptions or venue addresses.</p><form className="panel event-search" onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPages([]);read.reload();}}><label>Search Events Logs<input maxLength={80} value={search} onChange={e=>setSearch(e.target.value)}/></label><button className="button">Search</button><button type="button" className="button button-secondary" onClick={()=>{setQuery('');setSearch('');setPages([]);read.reload();}}>Clear</button></form>
 <LogPagination label="Events Log" page={pages.length+1} hasNewer={!!pages.length} hasOlder={!!read.data?.nextBefore} loading={read.loading} onNewer={()=>setPages(p=>p.slice(0,-1))} onOlder={()=>{if(read.data?.nextBefore)setPages(p=>[...p,read.data!.nextBefore!]);}}/><p role="status">{read.loading?'Loading Events Logs…':read.message}</p>{read.message&&<button className="button" onClick={read.reload}>Check again</button>}
 {read.data&&<div className="roles-scroll"><table className="activity-table"><caption>Events Logs</caption><thead><tr><th>When (Netherlands)</th><th>Event</th><th>Action</th><th>Changed by</th><th>Changed fields</th></tr></thead><tbody>{read.data.entries.map(e=><tr key={e.sequence}><td>{new Date(e.occurredAt*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})}</td><td>{e.title}</td><td>{e.operation.replace('event.','')}</td><td>{e.actorName??'Unavailable member'}</td><td>{(JSON.parse(e.fields) as string[]).join(', ')}</td></tr>)}</tbody></table>{!read.data.entries.length&&<p>No event changes match these filters.</p>}</div>}</div>;
}
