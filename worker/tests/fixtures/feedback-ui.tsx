import type {FeedbackDetail,FeedbackItem} from '../../../src/lib/feedback';
export function feedbackFixture(){
 const id='50000000-0000-4000-8000-000000000001';
 const items:FeedbackItem[]=[{id,kind:'bug',title:'Fictional layout feedback',description:'Expected: a stable page.\nActual: a fictional example issue for layout testing.',decision:'pending',progress:'new',revision:1,githubNumber:null,closedAt:null,createdAt:1793440000,updatedAt:1793440000,nickname:'Fictional Member',memberNumber:'11',unread:true}];
 const events:Record<string,FeedbackDetail['events']>={[id]:[{sequence:'1',actorKind:'member',anonymized:0,kind:'created',body:null,delta:null,occurredAt:1793440000},{sequence:'2',actorKind:'administrator',anonymized:0,kind:'reply',body:'Can you share the steps to reproduce it?',delta:null,occurredAt:1793440010}]};let sequence=2,memberUnread=1,adminUnread=1;
 return async(url:URL,init?:RequestInit)=>{
  if(!url.pathname.startsWith('/api/feedback/')&&!url.pathname.startsWith('/api/manage/feedback'))return null;
  if(url.pathname==='/api/feedback/unread')return Response.json({memberUnread,adminUnread});
  const admin=url.pathname.startsWith('/api/manage/'),prefix=admin?'/api/manage/feedback':'/api/feedback/requests',parts=url.pathname.slice(prefix.length).split('/').filter(Boolean),body=init?.body?JSON.parse(String(init.body)):null;
  if(!parts.length){if(body){const next=crypto.randomUUID();items.unshift({...items[0],id:next,kind:body.kind,title:body.title,description:body.description});events[next]=[{sequence:String(++sequence),actorKind:'member',anonymized:0,kind:'created',body:null,delta:null,occurredAt:1793440020}];return Response.json({requestId:next});}return Response.json({requests:items,nextCursor:null});}
  const item=items.find(i=>i.id===parts[0]);if(!item)return Response.json({error:'Request not found'},{status:404});
  if(!body)return Response.json({request:item,events:events[item.id],nextBefore:null,through:events[item.id].at(-1)?.sequence??'0'});
  if(parts[1]==='read'){if(admin)adminUnread=0;else memberUnread=0;return Response.json({requestId:item.id});}
  if(parts[1]==='replies'){events[item.id].push({sequence:String(++sequence),actorKind:admin?'administrator':'member',anonymized:0,kind:'reply',body:body.body,delta:null,occurredAt:1793440030});if(admin)memberUnread++;else adminUnread++;}
  if(parts[1]==='triage'){item.decision=body.decision;item.progress=body.progress;item.closedAt=['closed','completed'].includes(body.progress)?1793440030:null;}
  if(parts[1]==='github-link')item.githubNumber=body.url?Number(body.url.split('/').at(-1)):null;
  item.revision++;return Response.json({requestId:item.id});
 };
}