import HelpButton from './HelpButton';

export default function BillCalculationHelp(){
 return <HelpButton label="Bill calculation and payment filter help" title="Bills & payment status help">
  <h3>How the daily price is calculated</h3><p>The venue rental is divided by retained participant-days and rounded up to the next €0,50. Complimentary days stay in the divisor; their share is covered by the organization.</p>
  <h3>Deleted accounts</h3><p>Accounts deleted before finalization are excluded. Deleting an account afterwards preserves the locked price and totals.</p>
  <h3>Payment filters</h3><p>After finalization, All shows every bill, Paid shows bills manually marked as received, and Unpaid shows bills still awaiting payment. Bills with a €0 total have no payment due and appear under All only.</p><p>Each status covers the member’s combined bill, including guests. Changing a payment switch immediately updates the filtered list. Before finalization the amounts are previews, so Paid and Unpaid filters are unavailable.</p>
 </HelpButton>;
}
