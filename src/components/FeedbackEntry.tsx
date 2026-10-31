import {Link} from 'react-router';
import Icon from './Icon';
import {useNavigationPrefetch} from '../lib/use-navigation-prefetch';
import {FEEDBACK_UI_AVAILABLE,useFeedback} from '../lib/feedback';
export default function FeedbackEntry(){const {memberUnread}=useFeedback(),prefetch=useNavigationPrefetch();return FEEDBACK_UI_AVAILABLE?<Link className="feedback-entry sign-out-button" to="/account/feedback" onPointerEnter={()=>prefetch('/account/feedback')} onFocus={()=>prefetch('/account/feedback')} aria-label={memberUnread?'Feedback, unread updates':'Feedback'} title="Feedback"><Icon name="bug"/>{memberUnread>0&&<span className="feedback-unread-dot" aria-hidden="true"/>}</Link>:null;}