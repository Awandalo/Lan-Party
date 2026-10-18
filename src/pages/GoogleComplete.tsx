import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { googleRequest } from '../lib/google';
import '../CSS/GoogleComplete_style.css';
export default function GoogleComplete(){
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
  const [firstName,setFirstName]=useState(''),[lastName,setLastName]=useState('');
  const edited=useRef({firstName:false,lastName:false});
  useEffect(()=>{
    let disposed=false;
    void googleRequest('profile').then(async response=>{
      if(!response.ok)return;
      const hints=await response.json();if(disposed)return;
      if(!edited.current.firstName&&typeof hints.firstName==='string')setFirstName(hints.firstName);
      if(!edited.current.lastName&&typeof hints.lastName==='string')setLastName(hints.lastName);
    }).catch(()=>{/* Suggestions are optional; users can always enter their own names. */});
    return()=>{disposed=true;};
  },[]);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);
    const data=new FormData(event.currentTarget);
    try{const response=await googleRequest('complete',Object.fromEntries(['nickname','firstName','lastName'].map(k=>[k,String(data.get(k)??'')])));
      const body=await response.json();if(response.ok&&['/account','/verify-email'].includes(body.next))window.location.assign(body.next);
      else setFeedback(body.error??'Registration unavailable.');
    }catch{setFeedback('Unable to confirm registration. No automatic retry was made.');}finally{setBusy(false);}
  }
  return <section className="page-section google-complete-page"><div className="panel google-complete-card">
    <h1>Finish your LAN Party account</h1><p>Choose a public nickname. Your first and last names stay private. No local password is required.</p>
    <p>Review the private names suggested by Google, or enter your own. Your nickname is always your choice.</p>
    <p>Already a member? <Link to="/login">Sign in to your existing LAN Party account</Link> first.
      Signing in does not connect Google. Under Account → Security, confirm your existing sign-in method,
      then select Connect Google. Matching emails never link accounts automatically.</p>
    <form onSubmit={submit}><fieldset disabled={busy}><legend>Your details</legend>
      <label htmlFor="google-nickname">Nickname</label><input id="google-nickname" name="nickname" minLength={3} maxLength={24} required/>
      <p>3–24 letters, numbers, spaces, underscores or hyphens. No leading, trailing or repeated spaces.</p>
      <label htmlFor="google-first">First name (private)</label><input id="google-first" name="firstName" autoComplete="given-name" maxLength={100} required
        value={firstName} onChange={event=>{edited.current.firstName=true;setFirstName(event.target.value);}}/>
      <label htmlFor="google-last">Last name (private)</label><input id="google-last" name="lastName" autoComplete="family-name" maxLength={100} required
        value={lastName} onChange={event=>{edited.current.lastName=true;setLastName(event.target.value);}}/>
      <button className="button">{busy?'Creating…':'Create account'}</button></fieldset></form><p role="status">{feedback}</p>
  </div></section>;
}
