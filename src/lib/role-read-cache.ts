import type {ValidationState, Section} from './session-validation';

export interface RoleReadResult {data: unknown; message: string; loading: boolean}
// Provider-owned memory only. Role reads can contain private membership and audit
// IDs; never persist them or carry them across session/authorization boundaries.
export class RoleReadCache {
 private context = '';
 private sections: Section[] = [];
 private generation = 0;
 private revision = 0;
 private entries = new Map<string, RoleReadResult>();
 private pending = new Map<string, AbortController>();
 private listeners = new Set<()=>void>();
 subscribe = (listener:()=>void) => {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 get = (href:string) => this.entries.get(href);
 private publish() {for(const listener of this.listeners)listener();}
 private cancel() {this.generation++;for(const abort of this.pending.values())abort.abort();this.pending.clear();}
 private clear() {this.cancel();this.entries.clear();}
 synchronize({session,status,access}:ValidationState) {
  const sections=access.sections.filter(s=>['roles','users','activity','userActivity'].includes(s)).sort();
  const context=session && status==='ready' && access.status==='ready' && sections.some(s=>s==='roles'||s==='activity'||s==='userActivity')
   ? session.account.userId+':'+session.csrfToken+':'+sections.join(',')+':'+(access.authorization??'') : '';
  this.sections=context?sections:[];
  if(context!==this.context || !context && this.entries.size) {this.context=context;this.clear();this.publish();}
  else if(context && this.revision!==(access.revision??0)) this.cancel();
  this.revision=access.revision??0;
 }
 read(href:string,section:'roles'|'activity'|'userActivity',load:(signal:AbortSignal)=>Promise<Omit<RoleReadResult,'loading'>>) {
  if(!this.context || !this.sections.includes(section) || href.startsWith('/api/manage/users/')&&!this.sections.includes('users') || this.pending.has(href))return;
  const generation=this.generation,abort=new AbortController();
  if(!this.entries.has(href) && this.entries.size>=8) {
   const oldest=this.entries.keys().next().value!;
   this.pending.get(oldest)?.abort();this.pending.delete(oldest);this.entries.delete(oldest);
  }
  this.pending.set(href,abort);
  this.entries.set(href,{data:this.entries.get(href)?.data??null,message:'',loading:true});this.publish();
  // Route validation may supersede this effect before transport starts.
  void Promise.resolve().then(async()=>{
   if(abort.signal.aborted)return null;
   try{return await load(abort.signal);}
   catch{return {data:null,message:'Role information is unavailable. Reload to check the current state.'};}
  }).then(result=>{
   if(!result || generation!==this.generation || abort.signal.aborted)return;
   this.pending.delete(href);
   if(!result.data)this.clear();
   this.entries.set(href,{...result,loading:false});this.publish();
  });
 }
}
