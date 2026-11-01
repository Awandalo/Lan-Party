export default function LogPagination({label,page,hasNewer,hasOlder,loading,onNewer,onOlder}:{label:string;page:number;hasNewer:boolean;hasOlder:boolean;loading:boolean;onNewer:()=>void;onOlder:()=>void}){
 if(!hasNewer&&!hasOlder)return null;
 return <nav className="activity-pagination" aria-label={label+' pages'}><button className="button button-secondary" disabled={!hasNewer||loading} onClick={onNewer}>Newer activity</button><span>Page {page}</span><button className="button button-secondary" disabled={!hasOlder||loading} onClick={onOlder}>Older activity</button></nav>;
}
