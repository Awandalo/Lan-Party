import {useEffect,useState} from 'react';
import MfaEnrollment from './MfaEnrollment';
import MfaManagement from './MfaManagement';
export default function MfaSettings(props:{csrf:string;open:boolean;disabled:boolean;onOpen:()=>void;onBusy:(value:boolean)=>void;onActivated:()=>Promise<unknown>;methods:{password:boolean;google:boolean}}){
 const [enabled,setEnabled]=useState<boolean|null>(null);
 useEffect(()=>{const controller=new AbortController();setEnabled(null);
  void fetch('/api/auth/mfa/status',{credentials:'same-origin',redirect:'error',headers:{'X-LAN-Request':'1'},signal:controller.signal})
   .then(async response=>{if(!response.ok)throw Error();const body=await response.json();if(!controller.signal.aborted)setEnabled(body.enabled===true);}).catch(()=>{});
  return()=>controller.abort();
 },[props.csrf]);
 if(enabled===null)return <section><h2>Two-factor authentication</h2><p role="status">Checking MFA status. Reload if it remains unavailable.</p></section>;
 return enabled?<MfaManagement {...props}/>:<MfaEnrollment {...props}/>;
}
