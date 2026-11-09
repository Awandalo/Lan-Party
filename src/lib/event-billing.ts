export interface BillingPerson {owner:string;id:string;name:string;kind:string;days:string[];complimentary?:boolean}
export interface BillLine {name:string;kind:string;days:string[];complimentary:boolean;totalCents:number}
export interface CombinedBill {owner:string;lines:BillLine[];totalCents:number}
export function calculateEventBills(rentalCents:number,people:BillingPerson[]){
 const participantDays=people.reduce((n,p)=>n+p.days.length,0);
 if(!Number.isSafeInteger(rentalCents)||rentalCents<0)throw Error('Invalid finalization inputs');
 const dailyRateCents=participantDays?Math.ceil(rentalCents/(participantDays*50))*50:0;
 const bills:CombinedBill[]=[];
 for(const person of people.filter(p=>p.days.length)){
  let bill=bills.find(b=>b.owner===person.owner);if(!bill){bill={owner:person.owner,lines:[],totalCents:0};bills.push(bill);}
  const totalCents=person.complimentary?0:dailyRateCents*person.days.length;
  bill.lines.push({name:person.name,kind:person.kind,days:[...person.days],complimentary:person.complimentary===true,totalCents});bill.totalCents+=totalCents;
 }
 return {rentalCents,participantDays,dailyRateCents,complimentaryDays:people.filter(p=>p.complimentary).reduce((n,p)=>n+p.days.length,0),bills};
}
