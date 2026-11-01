import {Fragment} from 'react';
import {eventLines,eventLink} from '../lib/event-content';
function inline(text:string){return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\s)]+\))/g).map((part,i)=>{
 if(part.startsWith('**')&&part.endsWith('**'))return <strong key={i}>{part.slice(2,-2)}</strong>;
 if(part.startsWith('*')&&part.endsWith('*'))return <em key={i}>{part.slice(1,-1)}</em>;
 const link=/^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part),href=link?eventLink(link[2]):null;
 return link&&href?<a key={i} href={href} target="_blank" rel="noreferrer">{link[1]}</a>:<Fragment key={i}>{part}</Fragment>;
});}
export default function EventDescription({source}:{source:string}){
 const lines=eventLines(source),groups:{kind:string;texts:string[];level?:number}[]=[];
 for(const line of lines){const last=groups.at(-1);if((line.kind==='bullet'||line.kind==='number')&&last?.kind===line.kind)last.texts.push(line.text);else groups.push({kind:line.kind,texts:[line.text],...'level'in line?{level:line.level}:{}});}
 return <div className="event-description">{groups.map((g,i)=>g.kind==='bullet'?<ul key={i}>{g.texts.map((t,j)=><li key={j}>{inline(t)}</li>)}</ul>:g.kind==='number'?<ol key={i}>{g.texts.map((t,j)=><li key={j}>{inline(t)}</li>)}</ol>:g.kind==='heading'?(g.level===1?<h3 key={i}>{inline(g.texts[0])}</h3>:g.level===2?<h4 key={i}>{inline(g.texts[0])}</h4>:<h5 key={i}>{inline(g.texts[0])}</h5>):<p key={i}>{inline(g.texts[0])}</p>)}</div>;
}
