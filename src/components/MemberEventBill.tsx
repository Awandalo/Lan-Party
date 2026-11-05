import {useEffect,useState} from 'react';
import {useAuth} from '../lib/auth';
import {financeRequest,FinanceRequestError,euro} from '../lib/event-finance';
import type {MemberBillData} from '../lib/event-finance';
import {registrationDate} from '../lib/event-registration';
import './EventFinance.css';
export default function MemberEventBill({id}:{id:string}){
 const auth=useAuth(),proof=auth.status==='ready'?auth.session?.csrfToken:undefined,context=id+':'+proof;
 const [state,setState]=useState<{context:string;data:MemberBillData}|null>(null),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{if(!proof)return;const controller=new AbortController();setMessage('');financeRequest<MemberBillData>(id,proof,false,undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setState({context,data});}).catch(e=>{if(!controller.signal.aborted&&!(e instanceof FinanceRequestError&&e.status===503&&e.message==='Event finalization is awaiting its database migration'))setMessage(e.message);});return()=>controller.abort();},[id,proof,context,retry]);
 const data=state?.context===context?state.data:null;
 if(message)return <section className="member-final-bill"><h2>Your final bill</h2><p role="alert">{message}</p><button className="button button-secondary" onClick={()=>setRetry(n=>n+1)}>Check again</button></section>;
 if(!data?.finalized)return null;
 const bill=data.bill;
 return <section className="member-final-bill"><h2>Your final bill</h2>{bill?<><p>Event permanently closed · daily price {euro(data.dailyRateCents!)}. This combined bill covers you and your invited guests, based on organizer-reviewed attendance.</p><ul>{bill.lines.map((line,i)=><li key={i}><strong>{line.name}</strong> · {line.days.map(registrationDate).join(', ')} · {line.complimentary?'Free':euro(line.totalCents)}</li>)}</ul><p><strong>Total {euro(bill.totalCents)}</strong> · {bill.totalCents===0?'No payment due':bill.paid?'Paid':'Unpaid'}</p>{bill.totalCents>0&&<><p className="bill-instructions">{bill.instructions||'Contact the organizer for payment instructions.'}</p>{bill.paymentUrl&&<a className="button button-secondary" href={bill.paymentUrl} target="_blank" rel="noreferrer">Pay externally with Tikkie ↗</a>}<p>Payment is checked manually by the organizer. Paying externally does not automatically change your status here.</p></>}</>:<p>There is no final bill for your account.</p>}</section>;
}
