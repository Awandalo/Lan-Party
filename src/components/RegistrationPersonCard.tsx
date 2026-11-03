import type {ReactNode} from 'react';
export default function RegistrationPersonCard({name,kind,children}:{name:string;kind:string;children:ReactNode}){
 return <article className="registration-member-card"><div className="registration-member-avatar" aria-hidden="true">{name.split(' ').map(p=>p[0]).slice(0,2).join('')}</div><div className="registration-member-info"><p className="eyebrow">{kind}</p><h3>{name}</h3><div className="registration-achievements"><span>Achievements</span><div aria-label="Achievement badge placeholders — coming later" className="registration-badge-placeholders"><span aria-hidden="true">☆</span><span aria-hidden="true">☆</span><span aria-hidden="true">☆</span></div><small>Coming later</small></div>{children}</div></article>;
}
