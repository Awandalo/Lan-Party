import {useAuth} from './auth';
import {useFeedback} from './feedback';
import {loadMemberRead} from './use-member-read';
import {loadRoleRead} from './roles';

// Intent only: no background directory crawl, polling or mutations. Every GET
// carries the current session proof and is still authorized by the Worker.
export function useNavigationPrefetch(){
 const auth=useAuth(),feedback=useFeedback();
 return (href:string)=>{
  const proof=auth.session?.csrfToken,sections=auth.administration?.sections;
  if(!proof||auth.status!=='ready'||auth.administration?.status!=='ready')return;
  if(href==='/manage/users'&&sections?.includes('users')){
   auth.memberReads.read('/api/manage/users',signal=>loadMemberRead('/api/manage/users',false,proof,signal),5000);
  }else if(href==='/manage/roles'&&sections?.includes('roles')){
   auth.roleReads.read('/api/manage/roles','roles',signal=>loadRoleRead('/api/manage/roles','roles',proof,signal),5000);
  }else if(href==='/account/feedback'||href==='/manage/feedback'&&sections?.includes('feedback')){
   void import('../pages/Feedback').catch(()=>{/* Navigation can retry an unavailable chunk. */});
   feedback.prefetch(href.startsWith('/manage/')?'/api/manage/feedback':'/api/feedback/requests');
  }
 };
}
