import {useState} from 'react';
import {useLocationRead} from '../lib/locations';
import type {LocationLog} from '../lib/locations';
import LogPagination from './LogPagination';
import '../CSS/Locations_style.css';
const labels:Record<string,string>={'location.create':'Created','location.update':'Updated','location.archive':'Archived','location.restore':'Restored'};
const fieldLabels:Record<string,string>={name:'Name',addressLine:'Street and number',postalCode:'Postal code',city:'City',countryCode:'Country',instructions:'Practical instructions',capacity:'Capacity',rentalCents:'Default rental',directionsUrl:'Directions link',active:'Archive status'};
export default function LocationActivityLog(){
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[operation,setOperation]=useState(''),[pages,setPages]=useState<string[]>([]);
 const params=new URLSearchParams({...query?{search:query}:{},...operation?{operation}:{},...pages.length?{before:pages.at(-1)!}:{}});
 const read=useLocationRead<{entries:LocationLog[];nextBefore:string|null}>('/api/manage/location-activity'+(params.size?'?'+params:''));
 return <div className="locations-page"><p>Location changes from the logging rollout onward. Names are current labels; changed field names are recorded without retaining old addresses or instructions.</p>
 <form className="panel locations-search" onSubmit={e=>{e.preventDefault();setQuery(search.trim());setPages([]);read.reload();}}><label>Search Locations logs<input maxLength={80} value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Action<select value={operation} onChange={e=>{setOperation(e.target.value);setPages([]);}}><option value="">All actions</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button className="button">Search</button><button type="button" className="button button-secondary" onClick={()=>{setSearch('');setQuery('');setOperation('');setPages([]);read.reload();}}>Clear</button></form>
 <LogPagination label="Locations Log" page={pages.length+1} hasNewer={!!pages.length} hasOlder={!!read.data?.nextBefore} loading={read.loading} onNewer={()=>setPages(p=>p.slice(0,-1))} onOlder={()=>{if(read.data?.nextBefore)setPages(p=>[...p,read.data!.nextBefore!]);}}/>
 <p role="status">{read.loading?'Loading Locations logs…':read.message}</p>{read.message&&<button className="button button-secondary" onClick={read.reload}>Check again</button>}
 {read.data&&<div className="roles-scroll"><table className="activity-table"><caption>Locations logs</caption><thead><tr><th scope="col">When (Netherlands)</th><th scope="col">Location</th><th scope="col">Action</th><th scope="col">Changed by</th><th scope="col">Changed fields</th></tr></thead><tbody>{read.data.entries.map(e=><tr key={e.sequence}><td>{new Date(e.occurredAt*1000).toLocaleString('en-GB',{timeZone:'Europe/Amsterdam'})}</td><td>{e.locationName}</td><td>{labels[e.operation]}</td><td>{e.actorName??'Unavailable member'}</td><td>{(JSON.parse(e.fields) as string[]).map(f=>fieldLabels[f]??f).join(', ')}</td></tr>)}</tbody></table>{!read.data.entries.length&&<p>No location changes match these filters.</p>}</div>}
 </div>;
}
