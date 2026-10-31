import type {ValidationState} from './session-validation';

interface ReadResult {data:unknown;error:string;loading:boolean}
// Private, bounded provider memory. Neither a persistent cache nor proof of access.
export class FeedbackReadCache {
 private context='';
 private generation=0;
 private revision=0;
 private entries=new Map<string,ReadResult>();
 private completed=new Map<string,number>();
 private pending=new Map<string,AbortController>();
 private listeners=new Set<()=>void>();
 constructor(private readonly clock:()=>number=Date.now) {}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 get=(path:string)=>{
  const result=this.entries.get(path),data=result?.data as {request?:{closedAt:number|null};requests?:{closedAt:number|null}[]}|undefined;
  // A return visit must not resurrect a thread past its exact visibility cutoff.
  const items=data?.requests??(data?.request?[data.request]:[]);
  return items.some(i=>i.closedAt!==null&&this.clock()>=i.closedAt*1000+2592000000)?undefined:result;
 };
 private publish(){for(const listener of this.listeners)listener();}
 private cancel(){
  this.generation++;
  for(const [path,abort] of this.pending){abort.abort();const previous=this.entries.get(path);if(previous)this.entries.set(path,{...previous,loading:false,error:previous.data?'':'Feedback validation changed. Reload to check the current state.'});}
  this.pending.clear();this.completed.clear();
 }
 clear(){this.cancel();this.entries.clear();this.publish();}
 invalidate(){this.cancel();this.publish();}
 fail(path:string,error:string){this.clear();this.entries.set(path,{data:null,error,loading:false});this.publish();}
 expire(path:string){this.completed.delete(path);}
 expireLists(){for(const path of this.completed.keys())if(!/\/[a-f0-9-]{36}(?:\?|$)/.test(path))this.completed.delete(path);}
 synchronize({session,status,access}:ValidationState){
  const context=session&&status==='ready'&&access.status==='ready'?session.account.userId+':'+session.csrfToken+':'+(access.authorization??'')+':'+access.sections.join(','):'';
  if(context!==this.context){this.context=context;this.clear();}
  else if(this.revision!==(access.revision??0)){this.cancel();this.publish();}
  this.revision=access.revision??0;
 }
 read(path:string,load:(signal:AbortSignal)=>Promise<unknown>,maxAge=5000){
  if(!this.context||this.pending.has(path))return;
  if(maxAge>0&&this.get(path)?.data&&this.clock()-(this.completed.get(path)??-Infinity)<maxAge)return;
  const generation=this.generation,abort=new AbortController();
  if(!this.entries.has(path)&&this.entries.size>=8){const oldest=this.entries.keys().next().value!;this.pending.get(oldest)?.abort();this.pending.delete(oldest);this.entries.delete(oldest);this.completed.delete(oldest);}
  this.pending.set(path,abort);this.entries.set(path,{data:this.get(path)?.data??null,error:'',loading:true});this.publish();
  void Promise.resolve().then(()=>abort.signal.aborted?undefined:load(abort.signal)).then(data=>{
   if(data===undefined||abort.signal.aborted||generation!==this.generation)return;
   this.pending.delete(path);this.completed.set(path,this.clock());this.entries.set(path,{data,error:'',loading:false});this.publish();
  }).catch(error=>{
   if(abort.signal.aborted||generation!==this.generation)return;
   this.clear();this.entries.set(path,{data:null,error:error instanceof Error?error.message:'Feedback could not be loaded.',loading:false});this.publish();
  });
 }
}
