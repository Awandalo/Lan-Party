import {feedbackLabel} from '../lib/feedback';
import type {FeedbackItem} from '../lib/feedback';
export const feedbackPrivacy='Please do not include passwords, recovery codes, contact details or sensitive participant information.';
export function FeedbackState({loading,error,retry,refreshing=false}:{loading:boolean;error:string;retry:()=>void;refreshing?:boolean}){return <><p className="feedback-progress" role="status">{loading?(refreshing?'Checking for updates…':'Loading feedback…'):'\u00a0'}</p>{error&&<div role="alert"><p>{error}</p><button className="button button-secondary" onClick={retry}>Reload</button></div>}</>;}
export function FeedbackLabels({item}:{item:FeedbackItem}){return <div className="feedback-labels"><span>{item.kind==='bug'?'Bug report':'Feature request'}</span><span>Decision: {feedbackLabel(item.decision)}</span><span>Progress: {feedbackLabel(item.progress)}</span></div>;}
export function FeedbackDelta({text}:{text:string}){
 try{
  const delta:unknown=JSON.parse(text);
  if(!delta||typeof delta!=='object'||Array.isArray(delta))throw Error('Invalid change details');
  const pairs=Object.entries(delta) as [string,{before:unknown;after:unknown}][];
  if(pairs.some(([,value])=>!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'before')||!Object.hasOwn(value,'after')))throw Error('Invalid field details');
  // Older records include both triage fields even when just one changed.
  // Filter presentation only; retain the original event and independent values.
  const changes=pairs.filter(([,value])=>value.before!==value.after);
  return changes.length?<dl>{changes.map(([key,value])=><div key={key}><dt>{feedbackLabel(key)}</dt><dd>{feedbackLabel(String(value.before??'None'))} → {feedbackLabel(String(value.after??'None'))}</dd></div>)}</dl>:<p>No field changes recorded.</p>;
 }catch{return <p>Change details unavailable.</p>;}
}
