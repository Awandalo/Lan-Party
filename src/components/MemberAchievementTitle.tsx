import {ACHIEVEMENTS} from '../lib/achievements';
import type {MemberAchievementTitle as Title} from '../lib/members';
import '../CSS/AchievementBadge.css';

export default function MemberAchievementTitle({title}:{title:Title}){
 if(!title.available)return <>Unavailable</>;
 const definition=ACHIEVEMENTS.find(def=>def.code===title.code);
 return definition?<span className={'achievement-suffix achievement-'+definition.rank}>{definition.suffix}</span>:<>No achievement title</>;
}
