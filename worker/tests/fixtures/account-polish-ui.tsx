// Fictional-only transport; unexpected URLs fail rather than reach any backend.
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router';
import {AuthProvider,useAuth} from '../../../src/lib/auth';import MfaManagement from '../../../src/components/MfaManagement';import MfaChallenge from '../../../src/pages/MfaChallenge';import Registration from '../../../src/pages/Registration';
import '../../../src/CSS/main.css';import '../../../src/CSS/AccountSecurity_style.css';
const params=new URL(location.href).searchParams;let csrf='a'.repeat(64),mfa=false,primary=false,steps=0,handoffs=0,registrations=0,checks=0;
const meter=document.createElement('output');meter.setAttribute('aria-label','Fictional counters');document.body.append(meter);function count(){meter.textContent=JSON.stringify({steps,handoffs,registrations,checks});}count();
window.fetch=async(input,init={})=>{const path=new URL(String(input),location.href).pathname,body=JSON.parse(String(init.body??'{}'));
 if(path==='/api/auth/session')return Response.json({account:{userId:params.has('mismatch')&&mfa?'other-fictional':'fictional-polish',nickname:'Fictional',memberNumber:'1'},emailVerified:true,csrfToken:csrf});
 if(path==='/api/auth/mfa/status')return Response.json({enabled:true,enrollmentAvailable:true});
 if(path==='/api/auth/mfa/challenge')return Response.json({csrfToken:csrf,expiresAt:Math.floor(Date.now()/1000)+300,recoveryAvailable:true});
 if(path==='/api/auth/register'){registrations++;count();return Response.json({message:'Generic'}, {status:202});}
 if(path==='/api/auth/mfa/step-up'){steps++;mfa=true;csrf='b'.repeat(64);count();if(params.has('lost-step'))throw Error('Fictional uncertain step-up');return Response.json({message:'Verified'});}
 if(path==='/api/auth/security/reauth-password'){if(new Headers(init.headers).get('X-CSRF-Token')!==csrf)throw Error('Stale primary CSRF');primary=true;return Response.json({message:'Verified'});}
 if(path==='/api/auth/mfa/recovery/from-session'){checks++;count();if(new Headers(init.headers).get('X-CSRF-Token')!==csrf)throw Error('Stale handoff CSRF');if(!mfa)return Response.json({code:'mfa_required'},{status:428});if(!primary)return Response.json({code:'reauth_required'},{status:428});handoffs++;count();return Response.json({message:'Fictional handoff checked with rotated session; navigation suppressed.'});}
 if(path==='/api/auth/mfa/manage/start')return Response.json({token:'c'.repeat(64),expiresAt:Math.floor(Date.now()/1000)+100});
 if(path==='/api/auth/mfa/manage/verify')return Response.json({acknowledgment:'d'.repeat(64)});
 if(path==='/api/auth/mfa/manage/cancel')return Response.json({message:'Cancelled'});
 if(path==='/api/auth/mfa/regeneration/start')return Response.json({code:'primary_required',error:'Confirm password'}, {status:428});
 throw Error('Forbidden fictional request '+path+Boolean(body));};
function Management(){const {session}=useAuth();const [busy,setBusy]=useState(false);return session?<MfaManagement csrf={session.csrfToken} open disabled={busy} methods={{password:true}} onOpen={()=>{}} onBusy={setBusy} onActivated={async()=>{}}/>:<p>Loading fictional session</p>;}
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><main className="page-section"><div className="panel account-security-card" style={params.has('narrow')?{width:'390px',maxWidth:'100%',boxSizing:'border-box'}:undefined}><h1>Fictional account polish</h1>{params.has('signup')?<Registration/>:params.has('login')?<MfaChallenge/>:<Management/>}</div></main></AuthProvider></BrowserRouter>);
