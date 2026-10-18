import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { googleRequest } from '../lib/google';
import '../CSS/GoogleComplete_style.css';
export default function GoogleComplete(){
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const [existingAccount,setExistingAccount]=useState(false),pending=useRef(false);
  const [profileLoading,setProfileLoading]=useState(true),[unavailable,setUnavailable]=useState(false);
  const [firstName,setFirstName]=useState(''),[lastName,setLastName]=useState('');
  const edited=useRef({firstName:false,lastName:false});
  useEffect(()=>{
    let disposed=false;
    void googleRequest('profile').then(async response=>{
      if(!response.ok){if(!disposed){setUnavailable(true);setFeedback('Your Google signup session is unavailable or expired. Start Google sign-in again.');}return;}
      const hints=await response.json();if(disposed)return;
      setExistingAccount(hints.existingAccount===true);
      if(!edited.current.firstName&&typeof hints.firstName==='string')setFirstName(hints.firstName);
      if(!edited.current.lastName&&typeof hints.lastName==='string')setLastName(hints.lastName);
    }).catch(()=>{if(!disposed){setUnavailable(true);setFeedback('Unable to check your Google signup session. Start Google sign-in again.');}})
      .finally(()=>{if(!disposed)setProfileLoading(false);});
    return()=>{disposed=true;};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setFeedback('');
    let navigating=false;
    const data=new FormData(event.currentTarget);
    try{const response=await googleRequest('complete',Object.fromEntries(['nickname','firstName','lastName'].map(k=>[k,String(data.get(k)??'')])));
      const body=await response.json();if(response.ok&&['/account','/verify-email'].includes(body.next)){window.location.assign(body.next);navigating=true;}
      else if(body.code==='existing_account'){setExistingAccount(true);setFeedback(body.error);}
      else setFeedback(body.error??'Registration unavailable.');
    }catch{setFeedback('Unable to confirm registration. No automatic retry was made.');}finally{if(!navigating){pending.current=false;setBusy(false);}}
  }
  return <section className="page-section google-complete-page"><div className="panel google-complete-card">
    <h1>Finish your LAN Party account</h1><p>Choose your public nickname. Your first and last names stay private.</p>
    {profileLoading?<p role="status">Checking your Google signup…</p>:unavailable?<Link className="button" to="/login">Return to login</Link>:existingAccount?<div role="status"><h2>Sign in to continue</h2><p>Sign in to your existing account, then connect Google under Account → Settings. Accounts are never linked automatically.</p><Link className="button" to="/login">Sign in to existing account</Link></div>:
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}><legend>Your details</legend>
      <label htmlFor="google-nickname">Nickname</label><input id="google-nickname" name="nickname" minLength={3} maxLength={24} required aria-describedby="google-nickname-help"/>
      <p id="google-nickname-help">3–24 letters, numbers, spaces, underscores or hyphens. No leading, trailing or repeated spaces.</p>
      <label htmlFor="google-first">First name (private)</label><input id="google-first" name="firstName" autoComplete="given-name" maxLength={100} required
        value={firstName} onChange={event=>{edited.current.firstName=true;setFirstName(event.target.value);}}/>
      <label htmlFor="google-last">Last name (private)</label><input id="google-last" name="lastName" autoComplete="family-name" maxLength={100} required
        value={lastName} onChange={event=>{edited.current.lastName=true;setLastName(event.target.value);}}/>
      <button className="button">{busy?'Creating…':'Create account'}</button></fieldset></form>}
    {!existingAccount&&<details><summary>Already a member?</summary><p><Link to="/login">Sign in</Link>, then use Account → Settings → Connect Google. Matching emails never link accounts automatically.</p></details>}
    <p role="status" aria-live="polite">{feedback}</p>
  </div></section>;
}
