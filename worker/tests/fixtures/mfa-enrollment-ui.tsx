// Fictional UI only: all API requests intercepted, no real accounts or emails.
import React from 'react';import{createRoot}from'react-dom/client';
import MfaEnrollment from '../../../src/components/MfaEnrollment';
import '../../../src/CSS/main.css';import '../../../src/CSS/AccountSecurity_style.css';
const scenario=new URL(location.href).searchParams.get('scenario')??'stale';
let fresh=scenario==='fresh',pending=scenario==='pending',starts=0,verified=0,activated=0,cancelled=0,statusReads=0,copied=0;
const token='a'.repeat(64),secret='A'.repeat(32),codes=Array.from({length:10},(_,i)=>String.fromCharCode(65+i)+'AAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA');
const output=document.createElement('output');output.setAttribute('aria-label','Fictional request counters');output.style.overflowWrap='anywhere';document.body.append(output);
function counts(){output.textContent=JSON.stringify({starts,verified,activated,cancelled,statusReads,copied});}counts();
Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text:string)=>{if(new URL(location.href).searchParams.has('clipboard-fail'))throw Error('Fictional clipboard failure');if(text!==codes.join('\n'))throw Error('Unexpected copied contents');copied++;counts();}}});
window.fetch=async(url,init={})=>{
 const path=new URL(String(url),location.href).pathname;const body=JSON.parse(String(init.body??'{}'));
 if(path==='/api/auth/mfa/status'){statusReads++;counts();if(scenario==='status-error')throw Error('Fictional outage');return Response.json({enabled:false,enrollmentAvailable:true,...(pending?{pendingEnrollment:{expiresAt:Math.floor(Date.now()/1000)+600}}:{})});}
 if(path==='/api/auth/security/reauth-password'){fresh=true;return Response.json({ok:true});}
 if(path==='/api/auth/mfa/enroll/start'){starts++;counts();if(scenario==='uncertain')throw Error('Fictional lost response');if(!fresh)return Response.json({code:'reauth_required'},{status:428});if(pending&&!body.restart)return Response.json({code:'enrollment_pending'},{status:409});pending=true;return Response.json({token,secret,uri:'otpauth://totp/LAN%20Party%3AFictional%20Member?'+new URLSearchParams({secret,issuer:'LAN Party',algorithm:'SHA1',digits:'6',period:'30'}),expiresAt:Math.floor(Date.now()/1000)+600});}
 if(path==='/api/auth/mfa/enroll/verify'){verified++;counts();return Response.json({codes,acknowledgment:'b'.repeat(64)});}
 if(path==='/api/auth/mfa/enroll/cancel'){cancelled++;pending=false;counts();return Response.json({ok:true});}
 if(path==='/api/auth/mfa/enroll/activate'){activated++;counts();return Response.json({ok:true});}
 throw Error('Unexpected or external request blocked');
};
createRoot(document.getElementById('root')!).render(<main className="page-section account-security-page"><div className="panel account-security-card"><h1>Fictional Account Security</h1><MfaEnrollment csrf={'c'.repeat(64)} methods={{password:true}}/><section><h2>Email verification</h2><p>Verified</p></section></div></main>);
