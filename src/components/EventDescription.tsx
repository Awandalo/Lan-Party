import {createElement,Fragment} from 'react';
import type {ReactNode} from 'react';
import {eventDocument} from '../lib/event-document';
import type {EventNode} from '../lib/event-document';
export default function EventDescription({source}:{source:string}){
 function render(node:EventNode,key:string):ReactNode{
  if(node.type==='text'){
   let text:ReactNode=node.text;
   for(const mark of [...node.marks??[]].reverse())text=mark.type==='link'?<a href={mark.attrs!.href} target="_blank" rel="noreferrer" key={key+mark.type}>{text}</a>:createElement(({bold:'strong',italic:'em',underline:'u',strike:'s'} as const)[mark.type as 'bold'],{key:key+mark.type},text);
   return <Fragment key={key}>{text}</Fragment>;
  }
  const content=node.content?.map((child,i)=>render(child,key+'.'+i));
  switch(node.type){
   case 'doc':return <Fragment key={key}>{content}</Fragment>;
   case 'paragraph':return <p key={key}>{content}</p>;
   case 'heading':return createElement('h'+node.attrs!.level,{key},content);
   case 'hardBreak':return <br key={key}/>;
   case 'bulletList':return <ul key={key}>{content}</ul>;
   case 'orderedList':return <ol key={key} start={Number(node.attrs?.start??1)}>{content}</ol>;
   case 'listItem':return <li key={key}>{content}</li>;
   case 'table':return <div className="event-table-scroll" key={key}><table><tbody>{content}</tbody></table></div>;
   case 'tableRow':return <tr key={key}>{content}</tr>;
   case 'tableHeader':return <th key={key} scope="col">{content}</th>;
   case 'tableCell':return <td key={key}>{content}</td>;
   default:return null;
  }
 }
 return <div className="event-description">{render(eventDocument(source),'document')}</div>;
}