// Mutation feedback survives same-page validation, but never navigation or a
// confirmed session change. A setter captured before navigation cannot revive it.
export class RoleFeedback {
 private path='';
 private context='';
 private generation=0;
 private feedback:{generation:number;message:string}|null=null;
 enter(path:string,context:string|null,loading:boolean){
  if(this.path!==path||!loading&&this.context!==(context??'')){
   this.generation++;this.feedback=null;this.path=path;
  }
  if(!loading)this.context=context??'';
 }
 setter(){const generation=this.generation;return (message:string)=>{if(generation===this.generation)this.feedback={generation,message};};}
 get(context:string|null){return context&&context===this.context?this.feedback?.message??'':'';}
}
