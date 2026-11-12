export const ACHIEVEMENTS=[
 {code:'first-lan',rank:'iron',name:'Worn Iron Shield',suffix:'the Initiate',symbol:'✦',description:'Attend at least one reviewed day at a completed qualifying LAN.',target:1},
 {code:'full-weekend',rank:'bronze',name:'Bronze',suffix:'the LANner',symbol:'◈',description:'Attend every day of one completed qualifying weekend.',target:1},
 {code:'silver',rank:'silver',name:'Silver',suffix:'the Dedicated',symbol:'◈',description:'Attend every day of four completed qualifying weekends.',target:4},
 {code:'lan-recruit',rank:'gold',name:'Gold',suffix:'the Veteran',symbol:'★',description:'Attend every day of ten completed qualifying weekends.',target:10},
 {code:'legendary',rank:'legendary',name:'Legendary',suffix:'the Legend',symbol:'♛',description:'Attend ten qualifying full weekends in a row. Missing a qualifying event returns your title to Gold.',target:10},
] as const;
export type AchievementCode=typeof ACHIEVEMENTS[number]['code'];
export interface AchievementFact {eventId:string;completedAt:number;startsAt?:number;days:string[];eventDays:string[]}
export interface AchievementAward {code:AchievementCode;unlocked:boolean;progress:number;target:number;earnedAt:number|null}
export function highestAchievement(awards:AchievementAward[]){return [...ACHIEVEMENTS].reverse().find(def=>awards.some(a=>a.code===def.code&&a.unlocked))??null;}
export function achievementAwards(facts:AchievementFact[]):AchievementAward[]{
 const events=[...new Map(facts.map(f=>[f.eventId,f])).values()].sort((a,b)=>(a.startsAt??a.completedAt)-(b.startsAt??b.completedAt)||a.eventId.localeCompare(b.eventId));
 const attended=events.filter(f=>f.days.length>0),isFull=(f:AchievementFact)=>f.eventDays.length>=2&&f.eventDays.every(day=>f.days.includes(day)),full=events.filter(isFull);
 // Every completed qualifying event is present, including missed events. A
 // partial visit or a one-day event cannot continue a full-weekend streak.
 let streak=0;for(const event of events)streak=isFull(event)?streak+1:0;
 return ACHIEVEMENTS.map(def=>{const matches=def.code==='first-lan'?attended:full,progress=def.code==='legendary'?streak:matches.length,unlocked=progress>=def.target,earned=def.code==='legendary'?events[events.length-streak+def.target-1]:matches[def.target-1];return {code:def.code,unlocked,progress:Math.min(progress,def.target),target:def.target,earnedAt:unlocked?earned.completedAt:null};});
}
export interface DisplayCaseData {awards:AchievementAward[];selectedCode:AchievementCode|null;revision:number}
