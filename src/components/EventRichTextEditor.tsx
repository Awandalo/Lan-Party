import {useEffect,useId,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {TableKit} from '@tiptap/extension-table';
import type {EventNode} from '../lib/event-document';
import {eventLink} from '../lib/event-content';
import '../CSS/EventRichTextEditor.css';

export default function EventRichTextEditor({value,disabled,onChange}:{value:EventNode;disabled:boolean;onChange:(value:EventNode)=>void}){
 const [linkOpen,setLinkOpen]=useState(false),[href,setHref]=useState(''),[message,setMessage]=useState('');
 const [expanded,setExpanded]=useState(false),dialog=useRef<HTMLDialogElement>(null),expandButton=useRef<HTMLButtonElement>(null),heading=useId();
 const editor=useEditor({
  extensions:[StarterKit.configure({code:false,codeBlock:false,blockquote:false,horizontalRule:false,heading:{levels:[2,3,4]},link:{openOnClick:false,autolink:false,linkOnPaste:false,isAllowedUri:url=>!!eventLink(url)}}),TableKit.configure({table:{resizable:false}})],
  content:value,immediatelyRender:false,shouldRerenderOnTransaction:true,
  editable:!disabled,
  editorProps:{attributes:{role:'textbox','aria-label':'Event description','aria-multiline':'true'}},
  onUpdate:({editor:instance})=>onChange(instance.getJSON() as EventNode),
 });
 useEffect(()=>{editor?.setEditable(!disabled);},[editor,disabled]);
 useEffect(()=>{
  if(expanded)dialog.current?.showModal();
  else if(dialog.current?.open){dialog.current.close();expandButton.current?.focus({preventScroll:true});}
 },[expanded]);
 if(!editor)return <p role="status">Loading description editor…</p>;
 function button(label:string,text:string,action:()=>void,active=false,unavailable=false){return <button type="button" aria-label={label} title={label} aria-pressed={active} disabled={disabled||unavailable} onMouseDown={e=>e.preventDefault()} onClick={action}>{text}</button>;}
 function applyLink(){const safe=eventLink(href);if(!safe){setMessage('Use a full HTTP(S) link without credentials.');return;}editor!.chain().focus().extendMarkRange('link').setLink({href:safe}).run();setLinkOpen(false);setMessage('');}
 const content=<>
  <div className="event-format-toolbar" role="group" aria-label="Description formatting">
   {button('Bold','B',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
   {button('Italic','I',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
   {button('Underline','U',()=>editor.chain().focus().toggleUnderline().run(),editor.isActive('underline'))}
   {button('Strikethrough','S̶',()=>editor.chain().focus().toggleStrike().run(),editor.isActive('strike'))}
   {button('Normal paragraph','¶',()=>editor.chain().focus().setParagraph().run(),editor.isActive('paragraph'))}
   {([2,3,4] as const).map(level=><button key={level} type="button" disabled={disabled} aria-label={'Heading '+(level-1)} title={'Heading '+(level-1)} aria-pressed={editor.isActive('heading',{level})} onMouseDown={e=>e.preventDefault()} onClick={()=>editor.chain().focus().toggleHeading({level}).run()}>H{level-1}</button>)}
   {button('Bullet list','• List',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
   {button('Numbered list','1. List',()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}
   {button('Insert or edit link','Link',()=>{setHref(String(editor.getAttributes('link').href??''));setLinkOpen(true);setMessage('');},editor.isActive('link'))}
   {button('Remove link','Unlink',()=>editor.chain().focus().unsetLink().run(),false,!editor.isActive('link'))}
   {button('Insert table','Table',()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run(),false,editor.isActive('table'))}
   {editor.isActive('table')&&<>
    {button('Add table row','+ Row',()=>editor.chain().focus().addRowAfter().run())}
    {button('Add table column','+ Column',()=>editor.chain().focus().addColumnAfter().run())}
    {button('Remove table row','− Row',()=>editor.chain().focus().deleteRow().run())}
    {button('Remove table column','− Column',()=>editor.chain().focus().deleteColumn().run())}
    {button('Remove table','Remove table',()=>editor.chain().focus().deleteTable().run())}
   </>}
   {button('Undo','↶',()=>editor.chain().focus().undo().run(),false,!editor.can().undo())}
   {button('Redo','↷',()=>editor.chain().focus().redo().run(),false,!editor.can().redo())}
   {!expanded&&<button ref={expandButton} type="button" className="event-editor-expand" disabled={disabled} aria-haspopup="dialog" onClick={()=>setExpanded(true)}>Expand description</button>}
  </div>
  {linkOpen&&<div className="event-link-controls"><label>Link URL<input type="url" value={href} onChange={e=>setHref(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();applyLink();}}}/></label><button type="button" onClick={applyLink}>Apply link</button><button type="button" onClick={()=>setLinkOpen(false)}>Cancel link</button><p role="alert">{message}</p></div>}
  <EditorContent editor={editor}/>
  <p className="event-editor-hint">Select text, then choose formatting. Ctrl+B / Ctrl+I / Ctrl+U also work. Basic headings, lists, links and tables only; up to 8,000 text characters.</p>
 </>;
 return <div className="event-rich-editor">
  {!expanded&&content}
  <dialog ref={dialog} className="event-description-dialog event-rich-editor" aria-labelledby={heading} onCancel={e=>{e.preventDefault();e.stopPropagation();setExpanded(false);}} onClose={e=>{e.stopPropagation();setExpanded(false);}}>
   {expanded&&<><div className="event-editor-expanded-heading"><h2 id={heading}>Event description</h2><button type="button" className="button button-secondary" onClick={()=>setExpanded(false)}>Return to event</button></div>{content}</>}
  </dialog>
 </div>;
}
