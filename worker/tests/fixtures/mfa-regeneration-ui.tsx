// Fictional browser-only transport. Never connects to an authentication provider or sends mail.
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import MfaRegeneration from '../../../src/components/MfaRegeneration';
import MfaManagement from '../../../src/components/MfaManagement';
import AccountSecurity from '../../../src/pages/AccountSecurity';
import {AuthProvider} from '../../../src/lib/auth';
import {BrowserRouter} from 'react-router';
import '../../../src/CSS/main.css';
import '../../../src/CSS/AccountSecurity_style.css';
let operation=false,seen=false,primary=true,mfa=false,active=false,reveals=0,cancels=0,googleTabs=0,loseReveal=false,loseActivation=false,contextChanged=false;
const codes=Array.from({length:10},(_,i)=>String.fromCharCode(65+i)+'AAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA');
const token='a'.repeat(64),ack='b'.repeat(64);
// Drive real component timers deterministically; never sleep through a timeout.
const originalNow=Date.now.bind(Date),nativeSetTimeout=window.setTimeout.bind(window),nativeClearTimeout=window.clearTimeout.bind(window);
let offset=0;
Date.now=()=>originalNow()+offset;
const timers=new Map<number,{at:number;run:()=>void}>();
window.setTimeout=((handler:TimerHandler,delay=0,...args:unknown[])=>{
 if(typeof handler!=='function')throw Error('String timer forbidden in fixture');
 const run=()=>handler(...args),id=nativeSetTimeout(()=>{timers.delete(id);run();},delay);
 timers.set(id,{at:Date.now()+delay,run});return id;
}) as typeof window.setTimeout;
window.clearTimeout=(id?:number)=>{if(id!==undefined)timers.delete(id);nativeClearTimeout(id);};
function advance(){offset+=86400000;for(const [id,timer] of timers){if(timer.at<=Date.now()){timers.delete(id);nativeClearTimeout(id);timer.run();}}primary=false;mfa=false;}
window.open=()=>{googleTabs++;return {opener:null,closed:false,close(){this.closed=true;},location:{replace(){primary=true;mfa=false;}}} as unknown as Window;};
window.fetch=async(input,init)=>{
 const path=String(input),data=JSON.parse(String(init?.body??'{}'));
 if(path==='/api/auth/session')return Response.json({account:{userId:'fictional-user',nickname:'Fictional Tester',memberNumber:'11'},csrfToken:'c'.repeat(64),emailVerified:true});
 if(path==='/api/auth/google/methods')return Response.json({password:true,google:true});
 if(path==='/api/auth/mfa/status')return Response.json({enabled:true,enrollmentAvailable:true});
 if(path==='/api/auth/google/start')return Response.json({url:'https://accounts.google.com/o/oauth2/v2/auth?state=fictional'});
 if(path==='/api/auth/google/reauth-password'){primary=true;mfa=false;return Response.json({confirmed:true});}
 if(!path.startsWith('/api/auth/mfa/manage/'))throw Error('External transport forbidden');
 const action=path.split('/').pop();
 if(contextChanged&&data.token)return Response.json({code:'regeneration_ended',error:'Fictional session changed; check current settings.'},{status:new URL(window.location.href).searchParams.has('csrf-rejection')?403:410});
 if(action==='start'&&!primary)return Response.json({primaryRequired:true,error:'Confirm your sign-in method first.'},{status:428});
 if(action==='start'&&data.purpose==='disable')return Response.json({error:'Confirm your sign-in method first.'},{status:428});
 if(action==='start'){operation=true;seen=false;mfa=false;active=false;return Response.json({token,regeneration:true});}
 if(action==='cancel'){operation=false;cancels++;return Response.json({cancelled:true});}
 if(action==='check')return Response.json({phase:active?'activated':seen?'revealed':'prepared',seen,primaryRequired:!primary,mfaRequired:!mfa});
 if(!operation)return Response.json({error:'No fictional operation'},{status:409});
 if(!primary)return Response.json({primaryRequired:true,error:'Confirm your identity; pending codes are unchanged.'},{status:428});
 if(action==='verify'&&data.code==='000000')return Response.json({error:'Fictional incorrect code'},{status:401});
 if(action==='verify'){mfa=true;return Response.json({verified:true});}
 if(!mfa)return Response.json({primaryRequired:false,error:'Confirm your authenticator; pending codes are unchanged.'},{status:428});
 if(action==='reveal'){if(seen)return Response.json({error:'Already revealed'},{status:409});seen=true;reveals++;if(loseReveal){loseReveal=false;throw Error('Fictional lost reveal response');}return Response.json({codes,acknowledgment:ack});}
 if(action==='finish'&&data.acknowledgment===ack&&data.confirmed===true){active=true;operation=false;if(loseActivation){loseActivation=false;throw Error('Fictional lost activation response');}return Response.json({notification:'attempted'});}
 throw Error('Unexpected fictional request');
};
function App(){const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[show,setShow]=useState(true),[version,setVersion]=useState(0);
 return <main className="page-section"><div className="panel account-security-card" style={{maxWidth:new URL(window.location.href).searchParams.has('mobile')?360:640,marginInline:'auto'}}><h1>Fictional recovery-code UI test</h1><p>No real accounts, credentials, messages or provider requests.</p>
 <button onClick={()=>{advance();setVersion(n=>n+1);}}>Advance beyond one day (proof stale only)</button>
 <button onClick={()=>setShow(false)}>Leave code view</button><button onClick={()=>{loseReveal=true;}}>Lose next reveal response</button><button onClick={()=>{loseActivation=true;}}>Lose next activation response</button><button onClick={()=>{contextChanged=true;}}>Switch fictional session</button><button onClick={()=>setShow(true)}>Return to new view</button>
 <button onClick={()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Fictional denial');}}});}}>Deny clipboard</button>
 <button onClick={()=>setVersion(n=>n+1)}>Inspect safe counters</button>
 <p aria-label="Fixture counters">{JSON.stringify({version,seen,reveals,cancels,active,googleTabs})}</p>
 {show&&(new URL(window.location.href).searchParams.has('account')?<BrowserRouter><AuthProvider><AccountSecurity/></AuthProvider></BrowserRouter>:new URL(window.location.href).searchParams.has('integration')?<MfaManagement csrf={'c'.repeat(64)} open={open} disabled={busy} methods={{password:true,google:true}} onOpen={()=>setOpen(true)} onBusy={setBusy} onActivated={async()=>{setVersion(n=>n+1);}}/>:<MfaRegeneration csrf={'c'.repeat(64)} open={open} disabled={false} methods={{password:true,google:true}} onOpen={()=>setOpen(true)} onBusy={()=>{}} onActivated={async()=>{setVersion(n=>n+1);}}/>)}
 </div></main>;
}
const fixtureRoot=createRoot(document.getElementById('root')!);fixtureRoot.render(<App/>);
if(import.meta.hot)import.meta.hot.dispose(()=>fixtureRoot.unmount());
