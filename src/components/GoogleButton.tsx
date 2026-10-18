import { useState } from 'react';
import LoginChallenge from './LoginChallenge';
import { googleRequest } from '../lib/google';

export default function GoogleButton({purpose='signin',csrf,onRecentAuthenticationRequired}:{purpose?:'signin'|'link'|'reauth';csrf?:string;
  onRecentAuthenticationRequired?:()=>void}) {
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[siteKey,setSiteKey]=useState('');
  const [token,setToken]=useState<string|null>(null),[attempt,setAttempt]=useState(0);
  async function start(){
    if(busy)return;
    if(siteKey&&!token){setFeedback('Complete the security check first.');return;}
    setBusy(true);setFeedback('');
    try{
      const response=await googleRequest('start',{purpose,...(token?{turnstileToken:token}:{})},csrf),body=await response.json();
      if(response.ok){const url=new URL(body.url);if(url.origin!=='https://accounts.google.com'||url.pathname!=='/o/oauth2/v2/auth')throw Error();window.location.assign(url.href);}
      else if(response.status===403&&body.siteKey){setSiteKey(body.siteKey);setFeedback('Complete the security check, then select Google again.');}
      else if(response.status===428&&body.code==='reauth_required'){
        onRecentAuthenticationRequired?.();setFeedback('Confirm your existing sign-in method below, then select Connect Google again.');
      }
      else setFeedback('Google sign-in is unavailable. For account changes, confirm your existing method first. You can still use email/password.');
    }catch{setFeedback('Google sign-in could not be started. No automatic retry was made.');}
    finally{setToken(null);setAttempt(n=>n+1);setBusy(false);}
  }
  return <div className="google-method">{siteKey&&<LoginChallenge key={attempt} siteKey={siteKey} onToken={setToken}/>}
    <button type="button" className="button button-secondary" disabled={busy} onClick={()=>void start()}>
      {busy?'Connecting…':purpose==='link'?'Connect Google':purpose==='reauth'?'Confirm Google identity':'Continue with Google'}</button>
    <p role="status">{feedback}</p></div>;
}
