import type {FeedbackDetail,FeedbackItem} from '../../../src/lib/feedback';
export function feedbackFixture(options=new URLSearchParams()){
 const id='50000000-0000-4000-8000-000000000001';
 const original:FeedbackItem={id,kind:'bug',title:'Fictional layout feedback',description:'Expected: a stable page.\nActual: a fictional example issue for layout testing.',decision:'pending',progress:'new',revision:1,githubNumber:null,closedAt:null,createdAt:1793440000,updatedAt:1793440000,nickname:'Fictional Member',memberNumber:'11',unread:true};
 const items:FeedbackItem[]=options.get('feedback')==='empty'?[]:[original,
  {...original,id:'50000000-0000-4000-8000-000000000002',kind:'feature',title:'Fictional weekend suggestion',description:'A fictional feature proposal for the next event.',decision:'maybe',progress:'under_review',unread:false},
  {...original,id:'50000000-0000-4000-8000-000000000003',title:'Fictional completed report',progress:'completed',closedAt:Math.floor(Date.now()/1000),unread:false}];
 const events:Record<string,FeedbackDetail['events']>={};let sequence=0,memberUnread=1,adminUnread=1,lost=false;
 for(const item of items)events[item.id]=[{sequence:String(++sequence),actorKind:'member',anonymized:0,kind:'created',body:null,delta:null,occurredAt:1793440000},{sequence:String(++sequence),actorKind:'administrator',anonymized:0,kind:'reply',body:'Can you share the steps to reproduce it?',delta:null,occurredAt:1793440010}];
 const commands=new Map<string,string>();
 return async(url:URL,init?:RequestInit)=>{
  if(!url.pathname.startsWith('/api/feedback/')&&!url.pathname.startsWith('/api/manage/feedback'))return null;
  if(url.pathname==='/api/feedback/unread')return Response.json({memberUnread,adminUnread});
  const admin=url.pathname.startsWith('/api/manage/'),prefix=admin?'/api/manage/feedback':'/api/feedback/requests',parts=url.pathname.slice(prefix.length).split('/').filter(Boolean),body=init?.body?JSON.parse(String(init.body)):null;
  if(!parts.length){
   if(body){
    if(options.get('feedback')==='create-error')return Response.json({error:'Fictional submission was rejected. Your draft is unchanged.'},{status:400});
    if(commands.has(body.operationId))return Response.json({requestId:commands.get(body.operationId)});
    const next=crypto.randomUUID();commands.set(body.operationId,next);items.unshift({...original,id:next,kind:body.kind,title:body.title,description:body.description,unread:false});events[next]=[{sequence:String(++sequence),actorKind:'member',anonymized:0,kind:'created',body:null,delta:null,occurredAt:1793440020}];
    if(options.get('feedback')==='create-lost'&&!lost){lost=true;throw Error('Fictional lost response');}
    return Response.json({requestId:next});
   }
   const filtered=items.filter(item=>(!url.searchParams.get('kind')||item.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('decision')||item.decision===url.searchParams.get('decision'))&&(!url.searchParams.get('progress')||item.progress===url.searchParams.get('progress'))&&(!url.searchParams.get('search')||item.title.toLowerCase().includes(url.searchParams.get('search')!.toLowerCase())));
   return Response.json({requests:filtered,nextCursor:null});
  }
  const item=items.find(i=>i.id===parts[0]);if(!item)return Response.json({error:'Request not found'},{status:404});
  if(!body)return Response.json({request:item,events:events[item.id],nextBefore:null,through:events[item.id].at(-1)?.sequence??'0'});
  if(parts[1]==='read'){item.unread=false;if(admin)adminUnread=0;else memberUnread=0;return Response.json({requestId:item.id});}
  if(parts[1]==='replies'){events[item.id].push({sequence:String(++sequence),actorKind:admin?'administrator':'member',anonymized:0,kind:'reply',body:body.body,delta:null,occurredAt:1793440030});if(admin)memberUnread++;else adminUnread++;}
  if(parts[1]==='triage'){events[item.id].push({sequence:String(++sequence),actorKind:'administrator',anonymized:0,kind:'triage',body:null,delta:JSON.stringify({decision:{before:item.decision,after:body.decision},progress:{before:item.progress,after:body.progress}}),occurredAt:1793440040});item.decision=body.decision;item.progress=body.progress;item.closedAt=['closed','completed'].includes(body.progress)?Math.floor(Date.now()/1000):null;}
  if(parts[1]==='github-link')item.githubNumber=body.url?Number(body.url.split('/').at(-1)):null;
  item.revision++;return Response.json({requestId:item.id});
 };
}
