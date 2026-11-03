export interface RegistrationGuest {id:string;name:string;email:string;days:string[]}
export interface RegistrationDraft {days:string[];guests:RegistrationGuest[]}
export interface RegistrationPlace {personId:string;day:string;status:'confirmed'|'waitlisted';position?:number}
export interface OwnEventRegistration extends RegistrationDraft {active:boolean;revision:number;places:RegistrationPlace[]}
export function registrationDate(day:string){return day.split('-').reverse().join('-');}
export function registrationDayHours(index:number,count:number,start:string,end:string){
 return `${index===0?start:'00:00'} – ${index===count-1?end:'midnight'}`;
}
