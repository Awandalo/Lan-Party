import {useEffect} from 'react';
// BrowserRouter does not expose a navigation blocker. Guard ordinary link
// navigation before React Router handles it, and retain the browser reload guard.
export function useUnsavedRole(dirty:boolean){
 useEffect(()=>{
  if(!dirty)return;
  const leaving=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
  const click=(event:MouseEvent)=>{
   if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const anchor=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;
   if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;
   const url=new URL(anchor.href,location.href);
   if(url.origin===location.origin&&url.pathname===location.pathname&&url.search===location.search)return;
   if(!window.confirm('Discard your unsaved role changes and leave this page?')){event.preventDefault();event.stopPropagation();}
  };
  window.addEventListener('beforeunload',leaving);document.addEventListener('click',click,true);
  return()=>{window.removeEventListener('beforeunload',leaving);document.removeEventListener('click',click,true);};
 },[dirty]);
}
