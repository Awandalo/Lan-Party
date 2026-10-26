// Fictional rendering fixture only. No requests leave this page and no real mail is sent.
import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router';
import {AuthProvider} from '../../../src/lib/auth';
import AccountLifecycle from '../../../src/components/AccountLifecycle';
import UsersAdmin from '../../../src/pages/UsersAdmin';
import ReactivateAccount from '../../../src/pages/ReactivateAccount';
import '../../../src/CSS/main.css';
const scenario=new URL(location.href).searchParams.get('scenario')??'account';
let claims=0,completions=0,deactivations=0,confirmations=0,invites=0,claimed=false;
const counters=document.createElement('output');counters.setAttribute('aria-label','Fictional request counters');document.body.append(counters);
const count=()=>{counters.textContent=JSON.stringify({claims,completions,deactivations,confirmations,invites});};count();
window.fetch=async(url,init={})=>{
 const path=new URL(String(url),location.href).pathname;
 if(path==='/api/auth/session')return Response.json({account:{userId:'00000000-0000-4000-8000-000000000001',nickname:'Fictional Member',memberNumber:'11'},csrfToken:'c'.repeat(64),emailVerified:true});
 if(path==='/api/auth/lifecycle/status')return Response.json({available:scenario!=='unmigrated',administrator:true,deletionAvailable:false});
 if(path==='/api/auth/security/reauth-password'){confirmations++;count();return Response.json({ok:true});}
 if(path==='/api/auth/lifecycle/deactivate'){deactivations++;count();return Response.json({error:'Fictional last active administrator is protected.'},{status:409});}
 if(path==='/api/auth/lifecycle/users')return Response.json({users:[{userId:'00000000-0000-4000-8000-000000000002',nickname:'Deactivated Fixture',email:'fixture@example.test',memberNumber:12}]});
 if(path==='/api/auth/lifecycle/invite'){invites++;count();return Response.json({message:'Fictional invitation requested.'});}
 if(path==='/api/auth/lifecycle/reactivation/claim'){claims++;count();if(scenario==='expired')return Response.json({error:'Invitation expired. Ask your administrator for a new invitation.'},{status:409});claimed=true;return Response.json({csrfToken:'d'.repeat(64)});}
 if(path==='/api/auth/lifecycle/reactivation/status')return claimed?Response.json({available:true,mfa:true,csrfToken:'d'.repeat(64)}):Response.json({error:'No context'},{status:401});
 if(path==='/api/auth/lifecycle/reactivation/complete'){completions++;count();return Response.json({next:'/account/security',message:'Account reactivated. Your password and two-factor protection have been verified.'});}
 throw Error('Unexpected/external request blocked in fictional lifecycle fixture');
};
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider>{scenario==='admin'?<UsersAdmin/>:scenario==='reactivate'||scenario==='expired'?<ReactivateAccount/>:<main className="page-section"><div className="panel" style={{maxWidth:'48rem',padding:'2rem',margin:'auto'}}><h1>Fictional Account Security</h1><AccountLifecycle/></div></main>}</AuthProvider></BrowserRouter>);
