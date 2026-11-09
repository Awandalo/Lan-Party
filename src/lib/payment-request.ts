// Exact payment hosts confirmed by provider documentation; see the finalization contract.
// Preserve the original query/fragment: bank request identifiers can live in either.
const paymentHosts=new Set(['tikkie.me','www.tikkie.me','betaalverzoek.rabobank.nl','bunq.me','diensten.asnbank.nl','diensten.snsbank.nl','diensten.regiobank.nl']);
export const paymentRequestProviders='Tikkie, Rabobank, ING, bunq, ASN Bank, SNS or RegioBank';
export function validPaymentRequestUrl(value:string){
 if(!/^https:\/\//i.test(value)||/[\s\\]/.test(value))return false;
 try{
  const url=new URL(value);
  // ING's legacy shared URL redirects to its current payreq flow. Restrict the
  // general bank host to these payment routes, rather than accepting login links.
  const ingRequest=url.hostname==='www.ing.nl'&&(url.pathname==='/de-ing/payreq'||url.pathname.startsWith('/particulier/betaalverzoek/'));
  return url.protocol==='https:'&&(paymentHosts.has(url.hostname)||ingRequest)&&!url.username&&!url.password&&!url.port;
 }catch{return false;}
}
