import {useId} from 'react';
import {ACHIEVEMENTS} from '../lib/achievements';
import type {AchievementAward,AchievementTitleChoice} from '../lib/achievements';

export default function AchievementTitlePicker({awards,choice,available,busy,onChange}:{awards:AchievementAward[];choice:AchievementTitleChoice;available:boolean;busy:boolean;onChange:(choice:AchievementTitleChoice)=>void}){
 const id=useId(),help=id+'-help';
 return <div className="display-case-title-choice">
  <label htmlFor={id}>Achievement title</label>
  <select id={id} value={choice===null?'none':choice} disabled={busy||!available} aria-describedby={help} onChange={event=>onChange(event.target.value==='none'?null:event.target.value as AchievementTitleChoice)}>
   <option value="automatic">Automatic (highest unlocked title)</option>
   <option value="none">No title</option>
   {ACHIEVEMENTS.filter(def=>awards.some(a=>a.code===def.code&&a.unlocked)).map(def=><option key={def.code} value={def.code}>{def.suffix} · {def.name}</option>)}
  </select>
  <p id={help}>{available?'Choose your title separately from your showcased badge. If a chosen title is no longer unlocked, your highest unlocked title is used.':'Title selection is awaiting its database update. Your current automatic title is unchanged.'}</p>
 </div>;
}
