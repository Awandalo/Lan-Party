// Presentation-only demo gate. This does not grant registration or account access.
export function registrationPreviewEnabled(){
 if(typeof window==='undefined')return false;
 const url=new URL(window.location.origin);
 return import.meta.env.DEV&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)
  ||import.meta.env.VITE_AUTH_MODE==='hosted-dev'&&url.origin==='https://dev.lan-party.club';
}
