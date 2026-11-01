// A deliberately small text grammar. Raw HTML is always rendered as text.
export function eventLink(value:string){
 try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function eventLines(source:string){
 return source.split('\n').map(line=>{
  const match=/^(#{1,3}) (.*)$/.exec(line);
  return match?{kind:'heading' as const,level:match[1].length,text:match[2]}:/^[-*] /.test(line)?{kind:'bullet' as const,text:line.slice(2)}:/^\d+\. /.test(line)?{kind:'number' as const,text:line.replace(/^\d+\. /,'')}:{kind:'paragraph' as const,text:line};
 });
}
