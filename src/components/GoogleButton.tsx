import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import LoginChallenge from './LoginChallenge';
import { googleRequest } from '../lib/google';
import { GoogleLinkIntent } from '../lib/google-link-intent';
import SecurityActionIcon from './SecurityActionIcon';

export interface GoogleButtonHandle { resumeLink: (session: string) => boolean; cancelLink: () => void }

export default function GoogleButton({purpose='signin',returnAction,csrf,onRecentAuthenticationRequired,onStart,onPendingChange,ref,disabled=false,iconOnly=false}:{purpose?:'signin'|'link'|'reauth';returnAction?:'mfa';csrf?:string;iconOnly?:boolean;
  onRecentAuthenticationRequired?:()=>void;onStart?:()=>void;onPendingChange?:(pending:boolean)=>void;ref?:Ref<GoogleButtonHandle>;disabled?:boolean}) {
  const intent=useRef(new GoogleLinkIntent()),inFlight=useRef(false),mounted=useRef(true);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[siteKey,setSiteKey]=useState('');
  const [token,setToken]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  useImperativeHandle(ref,()=>({resumeLink(session){
    if(purpose!=='link'||session!==csrf||!intent.current.consume(session)||inFlight.current)return false;
    void start();return true;
  },cancelLink(){intent.current.cancel();setFeedback('');setSiteKey('');setToken(null);setAttempt(n=>n+1);requestAnimationFrame(()=>trigger.current?.focus());}}));
  async function start(){
    if(inFlight.current)return;
    if(siteKey&&!token){setFeedback('Complete the security check first.');return;}
    onStart?.();inFlight.current=true;onPendingChange?.(true);setBusy(true);setFeedback(purpose==='link'?'Connecting Google requires recent authentication and signs out your other sessions.':'');
    let navigating=false;
    try{
      const response=await googleRequest('start',{purpose,...(returnAction?{returnAction}:{}),...(token?{turnstileToken:token}:{})},csrf),body=await response.json();
      if(!mounted.current)return;
      if(response.ok){const url=new URL(body.url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw Error();window.location.assign(url.href);navigating=true;}
      else if(response.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check, then select Google again.');}
      else if(response.status===428&&body.code==='reauth_required'){
        if(purpose==='link'&&csrf)intent.current.begin(csrf);
        onRecentAuthenticationRequired?.();setFeedback('Confirm your password to connect Google. Your other sessions will be signed out.');
      }
      else setFeedback('Google sign-in is unavailable. For account changes, confirm your existing method first. You can still use email/password.');
    }catch{setFeedback('Google sign-in could not be started. No automatic retry was made.');}
    finally{if(!navigating){inFlight.current=false;onPendingChange?.(false);setToken(null);setAttempt(n=>n+1);setBusy(false);}}
  }
  return <div className={iconOnly?'google-method security-google-action':'google-method'}>{siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setToken}/>}
    <button ref={trigger} type="button" className={iconOnly?'security-icon-action':'button button-secondary'} aria-label={iconOnly?'Connect Google':undefined} title={iconOnly?'Connect Google':undefined} aria-busy={busy} disabled={busy||disabled} onClick={()=>void start()}>
      {iconOnly?<SecurityActionIcon action="link"/>:busy?'Connecting…':purpose==='link'?'Connect Google':purpose==='reauth'?'Confirm Google identity':'Continue with Google'}</button>
    <p role="status">{feedback}</p></div>;
}
