const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function eventLocalTime(seconds:number){return formatter.format(new Date(seconds*1000)).replace(' ','T');}
// Reject nonexistent/ambiguous local times instead of silently shifting an event.
export function eventInstant(local:string){
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local))return null;
 const nominal=Date.parse(local+'Z');if(!Number.isFinite(nominal))return null;
 const matches=[];for(let offset=-14;offset<=14;offset++){const seconds=nominal/1000+offset*3600;if(eventLocalTime(seconds)===local)matches.push(seconds);}
 return matches.length===1?matches[0]:null;
}
export function eventDates(startsAt:number,endsAt:number){
 if(!Number.isSafeInteger(startsAt)||!Number.isSafeInteger(endsAt)||endsAt<=startsAt||startsAt<0||endsAt>253402300799)throw Error('Enter valid start and end times.');
 const first=eventLocalTime(startsAt).slice(0,10),last=eventLocalTime(endsAt).slice(0,10),dates:string[]=[];
 if(!/^20\d{2}-/.test(first)||!/^20\d{2}-/.test(last))throw Error('Use an event date between 2000 and 2099.');
 for(let day=Date.parse(first+'T00:00:00Z'),end=Date.parse(last+'T00:00:00Z');day<=end;day+=86400000){
  dates.push(new Date(day).toISOString().slice(0,10));if(dates.length>31)throw Error('An event can span at most 31 calendar days.');
 }
 return dates;
}
