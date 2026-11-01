import {eventLines,eventLink} from './event-content';
export interface EventMark {type:string;attrs?:{href:string}}
export interface EventNode {type:string;text?:string;attrs?:Record<string,unknown>;marks?:EventMark[];content?:EventNode[]}
const block=['paragraph','heading','bulletList','orderedList','table'];
const children:Record<string,string[]>={doc:block,paragraph:['text','hardBreak'],heading:['text','hardBreak'],bulletList:['listItem'],orderedList:['listItem'],listItem:['paragraph','bulletList','orderedList'],table:['tableRow'],tableRow:['tableCell','tableHeader'],tableCell:['paragraph','heading','bulletList','orderedList'],tableHeader:['paragraph','heading','bulletList','orderedList']};
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
// Rebuild an allowlisted document; never trust attributes from the browser editor.
export function validateEventDocument(raw:unknown):EventNode {
 let nodes=0,characters=0;
 if(JSON.stringify(raw)?.length>48000)throw Error('Description is too large');
 function parse(value:unknown,parent:string,depth:number):EventNode{
  if(!object(value)||++nodes>800||depth>12||typeof value.type!=='string'||!children[parent]?.includes(value.type))throw Error('Unsupported description structure');
  const type=value.type;
  if(Object.keys(value).some(k=>!['type','text','attrs','marks','content'].includes(k)))throw Error('Unsupported description properties');
  if(value.attrs!==undefined&&!object(value.attrs))throw Error('Invalid description attributes');
  const attrs=value.attrs as Record<string,unknown>|undefined;
  const allowed=type==='heading'?['level']:type==='orderedList'?['start','type']:['tableCell','tableHeader'].includes(type)?['colspan','rowspan','colwidth','align']:[];
  if(attrs&&Object.keys(attrs).some(k=>!allowed.includes(k)))throw Error('Unsupported description attributes');
  const result:EventNode={type};
  if(type==='text'){
   if(typeof value.text!=='string'||!value.text||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.text)||attrs||value.content!==undefined)throw Error('Invalid description text');
   characters+=value.text.length;if(characters>8000)throw Error('Description text exceeds 8000 characters');result.text=value.text;
   if(value.marks!==undefined){
    if(!Array.isArray(value.marks)||value.marks.length>5)throw Error('Invalid formatting');
    const seen=new Set<string>();result.marks=value.marks.map(mark=>{
     if(!object(mark)||typeof mark.type!=='string'||!['bold','italic','underline','strike','link'].includes(mark.type)||seen.has(mark.type)||Object.keys(mark).some(k=>!['type','attrs'].includes(k)))throw Error('Unsupported formatting');seen.add(mark.type);
     if(mark.type==='link'){
      if(!object(mark.attrs)||Object.keys(mark.attrs).some(k=>!['href','target','rel','class','title'].includes(k))||typeof mark.attrs.href!=='string'||mark.attrs.href.length>2048||!eventLink(mark.attrs.href))throw Error('Use an HTTP(S) link without credentials');
      return {type:'link',attrs:{href:eventLink(mark.attrs.href)!}};
     }
     if(mark.attrs!==undefined)throw Error('Unsupported formatting attributes');return {type:mark.type};
    });
   }
   return result;
  }
  if(type==='hardBreak'){
   if(value.content!==undefined||value.text!==undefined)throw Error('Invalid line break');
   if(value.marks!==undefined)result.marks=parse({type:'text',text:' ',marks:value.marks},'paragraph',depth+1).marks;
   return result;
  }
  if(value.text!==undefined||value.marks!==undefined)throw Error('Invalid block text');
  if(type==='heading'){if(![2,3,4].includes(Number(attrs?.level)))throw Error('Invalid heading');result.attrs={level:Number(attrs!.level)};}
  if(type==='orderedList'){const start=attrs?.start??1;if(!Number.isSafeInteger(start)||Number(start)<1||Number(start)>1000||attrs?.type!=null)throw Error('Invalid numbered list');result.attrs={start};}
  if(['tableCell','tableHeader'].includes(type)){
   if((attrs?.colspan??1)!==1||(attrs?.rowspan??1)!==1||attrs?.colwidth!=null||attrs?.align!=null)throw Error('Only simple table cells are supported');
   result.attrs={colspan:1,rowspan:1,colwidth:null};
  }
  const content=value.content??[];if(!Array.isArray(content)||content.length>100)throw Error('Invalid description content');
  result.content=content.map(child=>parse(child,type,depth+1));
  if(!['paragraph','heading'].includes(type)&&!result.content.length)throw Error('Empty structural block');
  if(type==='listItem'&&result.content[0].type!=='paragraph')throw Error('List item needs a paragraph');
  if(type==='table'){
   const widths=result.content.map(row=>row.content!.length);if(widths.length>20||widths[0]>10||widths.some(w=>w!==widths[0]))throw Error('Use a rectangular table up to 20 rows and 10 columns');
  }
  return result;
 }
 const root=parse(raw,'root',0);return root;
}
// Root is intentionally separate from editor-supplied block types.
children.root=['doc'];
function legacyInline(source:string):EventNode[]{
 return source.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\s)]+\))/g).filter(Boolean).map(part=>{
  if(part.startsWith('**')&&part.endsWith('**'))return {type:'text',text:part.slice(2,-2),marks:[{type:'bold'}]};
  if(part.startsWith('*')&&part.endsWith('*'))return {type:'text',text:part.slice(1,-1),marks:[{type:'italic'}]};
  const link=/^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part),href=link?eventLink(link[2]):null;
  return link&&href?{type:'text',text:link[1],marks:[{type:'link',attrs:{href}}]}:{type:'text',text:part};
 });
}
export function eventDocument(source:string):EventNode{
 try{const value=JSON.parse(source);if(value?.type==='doc')return validateEventDocument(value);}catch{/* Historical plain descriptions remain text, never HTML. */}
 const content:EventNode[]=[];
 for(const line of eventLines(source)){
  const paragraph:EventNode={type:'paragraph',content:legacyInline(line.text)};
  if(line.kind==='bullet'||line.kind==='number'){
   const type=line.kind==='bullet'?'bulletList':'orderedList',last=content.at(-1),item:EventNode={type:'listItem',content:[paragraph]};
   if(last?.type===type)last.content!.push(item);else content.push({type,content:[item]});
  }else content.push(line.kind==='heading'?{type:'heading',attrs:{level:line.level+1},content:legacyInline(line.text)}:paragraph);
 }
 return {type:'doc',content:content.length?content:[{type:'paragraph',content:[]}]};
}
