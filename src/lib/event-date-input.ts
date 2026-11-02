import {eventInstant,eventLocalTime} from './event-time';
export interface EventDateInput {date:string;hour:string;minute:string}
export function formatEventDateEntry(raw:string){
 const digits=raw.replace(/\D/g,'').slice(0,8);
 return [digits.slice(0,2),digits.slice(2,4),digits.slice(4)].filter(Boolean).join('/');
}
export function eventInputFromInstant(value?:number):EventDateInput {
 if(value===undefined)return {date:'',hour:'',minute:''};
 const [date,time]=eventLocalTime(value).split('T'),[year,month,day]=date.split('-');
 return {date:`${day}/${month}/${year}`,hour:time.slice(0,2),minute:time.slice(3,5)};
}
export function eventInputDate(date:string){
 const match=/^(\d{2})\/(\d{2})\/(20\d{2})$/.exec(date);
 if(!match)return null;
 const iso=`${match[3]}-${match[2]}-${match[1]}`,instant=Date.parse(iso+'T00:00:00Z');
 return Number.isFinite(instant)&&new Date(instant).toISOString().slice(0,10)===iso?iso:null;
}
export function resolveEventInput(value:EventDateInput,original?:number){
 const date=eventInputDate(value.date);
 if(!date)throw Error('Use a real date in DD/MM/YYYY format, between 2000 and 2099.');
 if(!/^(?:[01]\d|2[0-3])$/.test(value.hour)||!/^\d{2}$/.test(value.minute)||Number(value.minute)>59)throw Error('Choose a 24-hour time.');
 const local=`${date}T${value.hour}:${value.minute}`;
 // Preserve the original instant, including legacy seconds and a DST-fold offset.
 if(original!==undefined&&local===eventLocalTime(original))return original;
 if(!['00','15','30','45'].includes(value.minute))throw Error('Choose minutes 00, 15, 30 or 45 when changing this time.');
 const instant=eventInstant(local);
 if(instant===null)throw Error('This Netherlands time is ambiguous or nonexistent due to daylight saving. Choose another time.');
 return instant;
}
export function eventInputErrors(value:EventDateInput,original?:number){
 const errors={date:'',hour:'',minute:''};
 if(!eventInputDate(value.date))errors.date='Use a real date in DD/MM/YYYY format, between 2000 and 2099.';
 if(!/^(?:[01]\d|2[0-3])$/.test(value.hour))errors.hour='Choose an hour from 00 to 23.';
 if(!/^\d{2}$/.test(value.minute)||Number(value.minute)>59)errors.minute='Choose minutes 00, 15, 30 or 45.';
 if(!Object.values(errors).some(Boolean)){
  try{resolveEventInput(value,original);}catch(e){
   if(!['00','15','30','45'].includes(value.minute))errors.minute=(e as Error).message;
   else errors.hour=errors.minute=(e as Error).message;
  }
 }
 return errors;
}
