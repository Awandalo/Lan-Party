export default function SecurityActionIcon({action}:{action:'key'|'shield'|'link'|'unlink'}) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {action==='shield'?<><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="M12 8v7m-3-3h6"/></>:action==='key'?<><circle cx="8" cy="9" r="5"/><path d="m12 12 9 9m-5-5 3-3m-6 0 3-3"/></>:
      <><path d="m10 13 4-4m-7 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"/>{action==='unlink'&&<path d="m3 3 18 18"/>}</>}
  </svg>;
}
