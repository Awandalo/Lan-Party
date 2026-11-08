import type {RegistrationData} from './event-registration-api';
import type {FinanceData} from './event-finance';

export interface EventPanelData {participants:RegistrationData;finance:FinanceData}
export type EventPanel=keyof EventPanelData;
type Entry={data?:EventPanelData[EventPanel];at:number;abort:AbortController;pending?:Promise<EventPanelData[EventPanel]>};

// Selected-event memory only; never persist staff participant/billing data.
export class EventPanelReads {
 private context='';
 private entries=new Map<EventPanel,Entry>();
 constructor(private readonly clock:()=>number=Date.now){}
 synchronize(context:string){if(context!==this.context){this.invalidate();this.context=context;}}
 invalidate(){for(const entry of this.entries.values())entry.abort.abort();this.entries.clear();}
 peek<K extends EventPanel>(panel:K):EventPanelData[K]|undefined{return this.entries.get(panel)?.data as EventPanelData[K]|undefined;}
 async read<K extends EventPanel>(panel:K,load:(signal:AbortSignal)=>Promise<EventPanelData[K]>):Promise<EventPanelData[K]>{
  if(!this.context)throw new DOMException('Event access changed','AbortError');
  const existing=this.entries.get(panel);
  if(existing?.pending)return existing.pending as Promise<EventPanelData[K]>;
  if(existing?.data&&this.clock()-existing.at<5000)return existing.data as EventPanelData[K];
  const entry:Entry={data:existing?.data,at:existing?.at??0,abort:new AbortController()};
  this.entries.set(panel,entry);
  const pending=Promise.resolve().then(()=>{
   if(entry.abort.signal.aborted)throw new DOMException('Event access changed','AbortError');
   return load(entry.abort.signal);
  }).then(data=>{
   if(entry.abort.signal.aborted||this.entries.get(panel)!==entry)throw new DOMException('Event access changed','AbortError');
   entry.data=data;entry.at=this.clock();entry.pending=undefined;return data;
  }).catch(error=>{
   // A late response must not invalidate newer reads after an event/session switch.
   if(this.entries.get(panel)===entry)this.invalidate();
   throw error;
  });
  entry.pending=pending;
  return pending;
 }
}
