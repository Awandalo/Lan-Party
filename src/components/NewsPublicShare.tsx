import {useEffect,useId,useRef,useState} from 'react';

export function newsShareLinks(title:string,url:string){
 const text=title+'\n'+url;
 return [
  {label:'WhatsApp',href:'https://wa.me/?text='+encodeURIComponent(text)},
  {label:'Facebook',href:'https://www.facebook.com/sharer/sharer.php?u='+encodeURIComponent(url)},
  {label:'X',href:'https://twitter.com/intent/tweet?text='+encodeURIComponent(title)+'&url='+encodeURIComponent(url)},
  {label:'Bluesky',href:'https://bsky.app/intent/compose?text='+encodeURIComponent(text)},
  {label:'LinkedIn',href:'https://www.linkedin.com/sharing/share-offsite/?url='+encodeURIComponent(url)},
  {label:'E-mail',href:'mailto:?subject='+encodeURIComponent(title.replace(/[\r\n]/g,' '))+'&body='+encodeURIComponent(text)},
 ];
}

export default function NewsPublicShare({title,url}:{title:string;url:string}){
 const root=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),id=useId();
 const [open,setOpen]=useState(false),[status,setStatus]=useState(''),[fallback,setFallback]=useState(false);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus({preventScroll:true});}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 return <div className="news-public-share" ref={root} onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <button ref={button} className="button button-secondary" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}>
   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4M9 14l6 4"/></svg> Share
  </button>
  <div id={id} className="news-share-options" hidden={!open}>
   <nav aria-label="Share this article"><ul>{newsShareLinks(title,url).map(link=><li key={link.label}><a href={link.href} target={link.label==='E-mail'?undefined:'_blank'} rel="noopener noreferrer">{link.label}<span aria-hidden="true">↗</span></a></li>)}
   <li><button onClick={async()=>{try{await navigator.clipboard.writeText(url);setStatus('Link copied.');setFallback(false);}catch{setStatus('Select and copy the link below.');setFallback(true);}}}>Copy link</button></li></ul></nav>
   <p className="news-share-status" role="status">{status}</p>
   {fallback&&<label className="news-share-fallback">Article link<input readOnly value={url} onFocus={event=>event.currentTarget.select()}/></label>}
  </div>
 </div>;
}
