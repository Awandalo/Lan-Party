import type {MemberDetail, MemberPage} from './members';
import type {ValidationState} from './session-validation';

export interface MemberReadResult {data: MemberPage | {member: MemberDetail} | null; message: string; loading: boolean}
// Memory only, bounded and owned by AuthProvider. Never shared across principals,
// persisted to storage, or restored after an authorization/read failure.
export class MemberReadCache {
 private context = '';
 private generation = 0;
 private revision = 0;
 private entries = new Map<string, MemberReadResult>();
 private pending = new Map<string, AbortController>();
 private listeners = new Set<()=>void>();
 subscribe = (listener:()=>void) => {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 get = (href:string) => this.entries.get(href);
 private publish() {for(const listener of this.listeners)listener();}
 private cancel() {
  this.generation++;
  for(const abort of this.pending.values())abort.abort();
  this.pending.clear();
 }
 private clear() {this.cancel();this.entries.clear();}
 synchronize({session,status,access}:ValidationState) {
  const context=session && status==='ready' && access.status==='ready' && access.sections.includes('users')
   ? session.account.userId+':'+session.csrfToken+':'+(access.authorization??'') : '';
  if(context!==this.context || !context && this.entries.size) {
   this.context=context;this.clear();this.publish();
  } else if(context && this.revision!==(access.revision??0)) {
   // Retain displayed data, but a response authorized before this check cannot
   // satisfy the new check. Cancel/fence it and let the hook start a fresh read.
   this.cancel();
  }
  this.revision=access.revision??0;
 }
 read(href:string, load:(signal:AbortSignal)=>Promise<Omit<MemberReadResult,'loading'>>) {
  if(!this.context || this.pending.has(href))return;
  const generation=this.generation,abort=new AbortController();
  // Evict oldest entries rather than accumulating a private directory in memory.
  if(!this.entries.has(href) && this.entries.size>=8) {
   const oldest=this.entries.keys().next().value!;
   this.pending.get(oldest)?.abort();this.pending.delete(oldest);this.entries.delete(oldest);
  }
  this.pending.set(href,abort);
  this.entries.set(href,{data:this.entries.get(href)?.data??null,message:'',loading:true});this.publish();
  // A route's auth effect can advance validation in this same React effect pass.
  // Let it cancel the superseded read before any network request starts.
  void Promise.resolve().then(async()=>{
   if(abort.signal.aborted)return null;
   try{return await load(abort.signal);}
   catch{return {data:null,message:'Members are temporarily unavailable. Please try again.'};}
  }).then(result=>{
   if(!result || generation!==this.generation || abort.signal.aborted)return;
   this.pending.delete(href);
   if(!result.data)this.clear();
   this.entries.set(href,{...result,loading:false});this.publish();
  });
 }
}
