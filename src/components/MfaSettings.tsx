import {useEffect,useState} from 'react';
import MfaEnrollment from './MfaEnrollment';
import MfaManagement from './MfaManagement';
import {readMfaStatus} from '../lib/mfa-status';
import type {MfaStatus} from '../lib/mfa-status';
export default function MfaSettings(props:{csrf:string;open:boolean;disabled:boolean;onOpen:()=>void;onBusy:(value:boolean)=>void;onActivated:()=>Promise<unknown>;methods:{password:boolean;google:boolean}}){
 const [status,setStatus]=useState<MfaStatus|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{const controller=new AbortController();setStatus(null);setFailed(false);
  void readMfaStatus(controller.signal).then(body=>{if(!controller.signal.aborted)setStatus(body);}).catch(()=>{if(!controller.signal.aborted)setFailed(true);});
  return()=>controller.abort();
 },[props.csrf]);
 if(status===null)return <section><h2>Two-factor authentication</h2><p role="status">{failed?'MFA settings are unavailable. Reload before trying again.':'Checking MFA status…'}</p></section>;
 if(!status.enrollmentAvailable)return <section><h2>Two-factor authentication</h2><p>Authenticator: {status.enabled?'Enabled':'Not enabled'}. MFA settings are unavailable in this environment.</p></section>;
 return status.enabled?<MfaManagement {...props}/>:<MfaEnrollment {...props}/>;
}
