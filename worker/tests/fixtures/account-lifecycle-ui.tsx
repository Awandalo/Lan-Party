// Fictional rendering fixture only. No requests leave this page and no real mail is sent.
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router';
import {AuthProvider} from '../../../src/lib/auth';
import AccountLifecycle from '../../../src/components/AccountLifecycle';
import AccountSecurity from '../../../src/pages/AccountSecurity';
import UsersAdmin from '../../../src/pages/UsersAdmin';
import ReactivateAccount from '../../../src/pages/ReactivateAccount';
import '../../../src/CSS/main.css';
const scenario=new URL(location.href).searchParams.get('scenario')??'account';
let claims=0,completions=0,deactivations=0,confirmations=0,invites=0,claimed=false,mfaChecks=0,rotated=false;
const flow=scenario.startsWith('deactivate-');
const counters=document.createElement('output');counters.setAttribute('aria-label','Fictional request counters');document.body.append(counters);
const count=()=>{counters.textContent=JSON.stringify({claims,completions,deactivations,confirmations,invites,mfaChecks,rotated});};count();
window.fetch=async(url,init={})=>{
 const path=new URL(String(url),location.href).pathname;
 if(path==='/api/auth/session')return Response.json({account:{userId:rotated&&scenario==='deactivate-identity-change'?'00000000-0000-4000-8000-000000000009':'00000000-0000-4000-8000-000000000001',nickname:'Fictional Member',memberNumber:'11'},csrfToken:(rotated?'e':'c').repeat(64),emailVerified:true});
 if(path==='/api/auth/lifecycle/status')return Response.json({available:scenario!=='unmigrated',administrator:true,deletionAvailable:false});
 if(path==='/api/auth/security/reauth-password'){confirmations++;count();return Response.json({ok:true});}
 if(path==='/api/auth/security/methods')return Response.json({password:true});
 if(path==='/api/auth/mfa/status')return Response.json({enabled:scenario!=='settings-disabled',enrollmentAvailable:true});
 if(path==='/api/auth/mfa/enroll/start')return Response.json({code:'reauth_required',error:'Fictional recent password confirmation required.'},{status:428});
 if(path==='/api/auth/mfa/step-up'){
 mfaChecks++;count();if(scenario==='deactivate-uncertain')throw Error('Fictional uncertain response');
 if(scenario==='deactivate-invalid')return Response.json({error:'Code not accepted.'},{status:401});
 rotated=true;count();return Response.json({next:'/account/security'});
 }
 if(path==='/api/auth/lifecycle/deactivate'){
 deactivations++;count();
 if(flow){
 if(scenario==='deactivate-conflict')return Response.json({code:'lifecycle_state_conflict',error:'Account state needs administrator assistance.'},{status:409});
 if(scenario==='deactivate-server-error')return Response.json({error:'The lifecycle result could not be confirmed.'},{status:503});
 if(scenario!=='deactivate-password'&&!rotated)return Response.json({code:'mfa_required',error:'Confirm two-factor authentication.'},{status:428});
 const csrf=new Headers(init.headers).get('X-CSRF-Token');if(csrf!==(rotated?'e':'c').repeat(64))return Response.json({error:'Stale CSRF rejected.'},{status:403});
 if(scenario==='deactivate-expired'&&confirmations<2)return Response.json({code:'primary_required',error:'Confirm your password again.'},{status:428});
 return Response.json({error:'Fictional deactivation reached once with valid proof; no real account changed.'},{status:409});
 }
 return Response.json({error:'Fictional last active administrator is protected.'},{status:409});
 }
 if(path==='/api/auth/lifecycle/users')return Response.json({users:[{userId:'00000000-0000-4000-8000-000000000002',nickname:'Deactivated Fixture',email:'fixture@example.test',memberNumber:12}]});
 if(path==='/api/auth/lifecycle/invite'){invites++;count();return Response.json({message:'Fictional invitation requested.'});}
 if(path==='/api/auth/lifecycle/reactivation/claim'){claims++;count();if(scenario==='expired')return Response.json({error:'Invitation expired. Ask your administrator for a new invitation.'},{status:409});claimed=true;return Response.json({csrfToken:'d'.repeat(64)});}
 if(path==='/api/auth/lifecycle/reactivation/status')return claimed?Response.json({available:true,mfa:true,csrfToken:'d'.repeat(64)}):Response.json({error:'No context'},{status:401});
 if(path==='/api/auth/lifecycle/reactivation/complete'){completions++;count();return Response.json({next:'/account/security',message:'Account reactivated. Your password and two-factor protection have been verified.'});}
 throw Error('Unexpected/external request blocked in fictional lifecycle fixture');
};
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider>{scenario.startsWith('settings-')?<AccountSecurity/>:scenario==='admin'?<UsersAdmin/>:scenario==='reactivate'||scenario==='expired'?<ReactivateAccount/>:<main className="page-section"><div className="panel" style={{maxWidth:'48rem',padding:'2rem',margin:'auto'}}><h1>Fictional Account Security</h1><AccountLifecycle/></div></main>}</AuthProvider></BrowserRouter>);
