import HelpButton from './HelpButton';
import './PaymentRequestHelp.css';

export const paymentLinkExamples=[
 ['Tikkie / ABN AMRO','https://tikkie.me/pay/…','https://www.tikkie.me/pay/…'],
 ['Rabobank','https://betaalverzoek.rabobank.nl/betaalverzoek/?id=…'],
 ['ING','https://www.ing.nl/particulier/betaalverzoek/index.html?…','https://www.ing.nl/de-ing/payreq?…'],
 ['bunq','https://bunq.me/…'],
 ['ASN Bank','https://diensten.asnbank.nl/online/betaalverzoek/…'],
 ['SNS','https://diensten.snsbank.nl/online/betaalverzoek/…'],
 ['RegioBank','https://diensten.regiobank.nl/online/betaalverzoek/…']
];

export default function PaymentRequestHelp(){
 return <HelpButton label="Payment request URL help" title="Payment request link help">
  <h3>How to add your link</h3><ol><li>Create a payment request in your bank or Tikkie app.</li><li>Choose Share or Copy link. Paste the complete link here, including everything after any <strong>?</strong> or <strong>#</strong>. Use the shared payment link rather than a login or information page.</li><li>Save the payment instructions. Members can open the link from their final bill after you finalize the event.</li></ol>
  <p>For one shared event link, choose an open amount if your bank offers it, so members can enter their own bill total.</p>
  <h3>Supported banks & link formats</h3><p>These examples show the format only. The … stands for your bank’s request code; copy the actual link from your app.</p>
  <dl className="payment-request-formats">{paymentLinkExamples.map(([bank,...links])=><div key={bank}><dt>{bank}</dt><dd>{links.map(link=><code key={link}>{link}</code>)}</dd></div>)}</dl>
  <p>HTTPS is required. Both the link and instructions are optional. Leave both empty to arrange payment entirely outside the website. Payments are checked manually; opening or paying a request does not automatically mark a bill Paid.</p>
 </HelpButton>;
}
