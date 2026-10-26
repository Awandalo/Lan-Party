// Fictional transport: no external requests, real credentials or emails.
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router';
import MfaRecovery from '../../../src/components/MfaRecovery';
import '../../../src/CSS/main.css';import '../../../src/CSS/AccountSecurity_style.css';
const params=new URL(location.href).searchParams;
let phase=params.has('committed')?'committed':'pending',primaryRequired=!params.has('committed'),revealed=false,freshCode=false,expired=false;
let reads=0,commits=0,reveals=0,primary=0,copies=0;
const secret='A'.repeat(32),csrf='c'.repeat(64);
const codes=Array.from({length:10},(_,i)=>String.fromCharCode(65+i)+'AAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA');
let deadline=Math.floor(Date.now()/1000)+300;
const meter=document.createElement('output');meter.setAttribute('aria-label','Fictional counters');meter.style.overflowWrap='anywhere';document.body.append(meter);
function stats(){meter.textContent=JSON.stringify({reads,commits,reveals,primary,copies});}stats();
Object.defineProperty(navigator,'clipboard',{value:{writeText:async(value:string)=>{if(value!==codes.join('\n').replaceAll('\\n','\n'))throw Error('Copy contents differ');copies++;stats();}}});
window.fetch=async(input,init={})=>{
 const path=new URL(String(input),location.href).pathname,body=JSON.parse(String(init.body??'{}'));
 if(!path.startsWith('/api/auth/mfa/recovery/'))throw Error('External request forbidden');
 const action=path.split('/').pop();
 if(expired)return Response.json({code:'recovery_unavailable',error:'Recovery unavailable or expired. Log in again.'},{status:401});
 if(action==='status'){reads++;stats();if(revealed&&params.has('lose-status'))throw Error('Fictional post-reveal status outage');return Response.json({phase,expiresAt:deadline,csrfToken:csrf,password:true,primaryRequired});}
 if(action==='primary'){primary++;primaryRequired=false;stats();return Response.json({message:'Identity confirmed.'});}
 if(action==='setup')return Response.json({secret,uri:'otpauth://totp/LAN%20Party%3AFictional?'+new URLSearchParams({secret,issuer:'LAN Party',algorithm:'SHA1',digits:'6',period:'30'}),expiresAt:deadline});
 if(primaryRequired&&['commit','reveal'].includes(action))return Response.json({code:'reauth_required',error:'Confirm your sign-in method again. The recovery deadline is unchanged.'},{status:428});
 if(action==='commit'){commits++;phase='committed';deadline=Math.floor(Date.now()/1000)+300;stats();if(params.has('lose-commit'))throw Error('Fictional lost commit response');return Response.json({displayExpiresAt:deadline});}
 if(action==='reveal'){reveals++;stats();if(!freshCode)return Response.json({error:'Proof not accepted.'},{status:401});freshCode=false;revealed=true;return Response.json({codes,expiresAt:deadline});}
 if(action==='ack'||action==='cancel'){phase='acknowledged';return Response.json({message:'Return to login with your new authenticator if replacement completed.'});}
 throw Error('Unexpected fictional request '+body.confirmed);
};
function App(){return <main className="page-section"><div className="panel account-security-card"><h1>Fictional replacement regression</h1><div className="mfa-actions"><button onClick={()=>{freshCode=true;}}>Next authenticator time step</button><button onClick={()=>{primaryRequired=true;}}>Make primary proof stale</button><button onClick={()=>{expired=true;}}>Expire restricted context</button></div><BrowserRouter><MfaRecovery/></BrowserRouter></div></main>;}
createRoot(document.getElementById('root')!).render(<App/>);
