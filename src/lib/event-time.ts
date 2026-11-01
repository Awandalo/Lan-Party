const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function eventLocalTime(seconds:number){return formatter.format(new Date(seconds*1000)).replace(' ','T');}
// Reject nonexistent/ambiguous local times instead of silently shifting an event.
export function eventInstant(local:string){
 if(!/^20\d{2}-\d\d-\d\dT\d\d:\d\d$/.test(local))return null;
 const nominal=Date.parse(local+'Z');if(!Number.isFinite(nominal))return null;
 const matches=[];for(let offset=-14;offset<=14;offset++){const seconds=nominal/1000+offset*3600;if(eventLocalTime(seconds)===local)matches.push(seconds);}
 return matches.length===1?matches[0]:null;
}
