export default function MinimumAttendanceCounter({days,minimum,people,selected,onSelect}:{days:{confirmed:number}[];minimum:number;people:number;selected:boolean;onSelect:()=>void}){
 const participantDays=days.reduce((total,day)=>total+day.confirmed,0),required=minimum*days.length;
 const equivalent=days.length?participantDays/days.length:0,progress=required>0?Math.min(100,participantDays/required*100):0;
 const reached=required>0&&participantDays>=required;
 return <button type="button" className={'participant-counter'+(selected?' selected':'')} aria-pressed={selected} onClick={onSelect}>
  <span className="participant-ring" style={{background:`conic-gradient(var(--accent) ${progress}%, var(--border) 0)`}}><span><strong>{new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(equivalent)}</strong><small>of {minimum} needed</small></span></span>
  <strong>Event minimum</strong><small>{reached?'Minimum reached':'Toward minimum'}</small><small>{people} {people===1?'person':'people'} · {participantDays} participant-days</small>
 </button>;
}
