import {useEffect,useState} from 'react';
import MfaEnrollment from './MfaEnrollment';
import MfaManagement from './MfaManagement';
import {readMfaStatus} from '../lib/mfa-status';
import type {MfaStatus} from '../lib/mfa-status';
export default function MfaSettings(props:{csrf:string;open:boolean;disabled:boolean;onOpen:()=>void;onBusy:(value:boolean)=>void;onActivated:()=>Promise<unknown>;methods:{password:boolean;google:boolean}|null}){
 const [revision,setRevision]=useState(0);
 const [snapshot,setStatus]=useState<(MfaStatus&{csrf:string})|null>(null),[failed,setFailed]=useState(false),[refreshing,setRefreshing]=useState(false);
 const status=snapshot?.csrf===props.csrf?snapshot:null;
 useEffect(()=>{const controller=new AbortController();setRefreshing(true);setFailed(false);
  void readMfaStatus(AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])).then(body=>{if(!controller.signal.aborted)setStatus({...body,csrf:props.csrf});}).catch(()=>{if(!controller.signal.aborted)setFailed(true);}).finally(()=>{if(!controller.signal.aborted)setRefreshing(false);});
  return()=>controller.abort();
 },[props.csrf,revision]);
 if(status===null||failed)return <section><h2>Two-factor authentication</h2><p role="status">{failed?'MFA settings are unavailable. Reload before trying again.':'Checking MFA status…'}</p></section>;
 if(!status.enrollmentAvailable)return <section><h2>Two-factor authentication</h2><p>Authenticator: {status.enabled?'Enabled':'Not enabled'}. MFA settings are unavailable in this environment.</p></section>;
 if(!props.methods)return <section aria-busy="true"><h2>Two-factor authentication</h2><p role="status">Waiting for connected accounts before enabling security actions…</p></section>;
 const ready={...props,disabled:props.disabled||refreshing,methods:props.methods,onActivated:async()=>{setRevision(n=>n+1);return props.onActivated();}};
 return status.enabled?<MfaManagement {...ready}/>:<MfaEnrollment {...ready}/>;
}
