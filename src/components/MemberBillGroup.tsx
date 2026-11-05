import type {FinanceData} from '../lib/event-finance';
import {euro} from '../lib/event-finance';
import Icon from './Icon';

export default function MemberBillGroup({bill,dailyRateCents,finalized}:{bill:FinanceData['bills'][number];dailyRateCents:number;finalized:boolean}){
 const member=bill.owner===null?'Account no longer exists':bill.lines.find(line=>line.kind==='Member')?.name??'Responsible member';
 const payableDays=bill.lines.filter(line=>!line.complimentary).reduce((n,line)=>n+line.days.length,0),freeDays=bill.lines.filter(line=>line.complimentary).reduce((n,line)=>n+line.days.length,0);
 const calculation=[...(payableDays?[`${payableDays} payable ${payableDays===1?'day':'days'} × ${euro(dailyRateCents)}`]:[]),...(freeDays?[`${freeDays} complimentary ${freeDays===1?'day':'days'} × ${euro(0)}`]:[])].join(' + ');
 return <details className="finance-member-group"><summary><span className="finance-group-chevron"><Icon name="arrow"/></span><span className="finance-group-icon"><Icon name="users"/></span><strong className="finance-group-name">{member}</strong><strong className="finance-group-total">{euro(bill.totalCents)}</strong></summary>
  {bill.lines.length?<div className="finance-group-breakdown"><table><caption className="sr-only">Bill breakdown for {member}</caption><thead><tr><th scope="col">Participant / type</th><th scope="col">Days</th><th scope="col">Total</th></tr></thead><tbody>{bill.lines.map((line,index)=><tr key={index} className={line.kind==='Invited guest'?'finance-guest-line':undefined}><th scope="row"><span className="finance-line-person">{line.kind==='Invited guest'&&<Icon name="users"/>}<span>{line.name}</span><span className={'finance-type'+(line.kind==='Invited guest'?' finance-type-guest':'')}>{line.kind==='Invited guest'?'Guest':'Member'}</span></span></th><td>{line.days.length} {line.days.length===1?'day':'days'}</td><td>{line.complimentary&&<small className="finance-free">Free </small>}<strong>{euro(line.totalCents)}</strong></td></tr>)}</tbody><tfoot><tr><td colSpan={3}><strong>Total calculation</strong><span>{calculation} = <strong>{euro(bill.totalCents)}</strong></span></td></tr></tfoot></table></div>:<p className="finance-erased-bill">Identifying details removed. Locked total preserved.</p>}
  {finalized&&<p className="finance-group-status">{bill.totalCents===0?'No payment due':bill.paid?'Paid':'Unpaid'}</p>}
 </details>;
}
