import {FEEDBACK_UI_AVAILABLE} from '../lib/feedback';
import { AUTH_UI_AVAILABLE, authUIEnabled } from '../lib/auth-mode';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import {useAuth} from '../lib/auth';

const titles: Record<string, string> = {
  '/': 'Home',
  '/events': 'Events',
  ...((import.meta.env.DEV||import.meta.env.VITE_AUTH_MODE==='hosted-dev')?{'/preview/registration':'Registration preview'}:{}),
  '/privacy': 'Privacy Policy',
  '/login': 'Login',
  ...((AUTH_UI_AVAILABLE && authUIEnabled()) ? { '/register': 'Create account', '/account': 'Account',
    '/verify-email': 'Verify email', '/local-mail': 'Local mailbox',
    '/forgot-password': 'Forgot password', '/reset-password': 'Reset password',
    '/account/security': 'Account security', '/mfa':'Verify sign-in', '/reactivate':'Reactivate account' } : {}),
};

export function administrationDocumentTitle(pathname:string,heading?:string){
  if(!/^\/manage(?:\/|$)/.test(pathname))return null;
  return /^\/manage\/users\/[^/]+$/.test(pathname)&&heading==='Members'?'Member details':heading??null;
}

export default function RouteFocus() {
  const { pathname } = useLocation();
  const {status,administration}=useAuth();
  const previousPath = useRef(pathname);

  useEffect(() => {
    const feedbackTitle=FEEDBACK_UI_AVAILABLE&&(/^\/account\/feedback(?:\/|$)/.test(pathname)||/^\/manage\/feedback(?:\/|$)/.test(pathname))?'Feedback':null;
    // Use the rendered, access-checked page rather than a separate environment
    // allowlist. Unknown or disabled routes keep their actual not-found heading.
    const heading=document.querySelector('#main-content h1')?.textContent?.trim();
    const administrationTitle=administrationDocumentTitle(pathname,heading);
    document.title = `LAN Party | ${administrationTitle ?? (/^\/events\/[^/]+$/.test(pathname)?heading:null) ?? feedbackTitle ?? titles[pathname] ?? 'Page not found'}`;
    if (previousPath.current !== pathname) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      previousPath.current = pathname;
    }
  }, [pathname,status,administration?.status,administration?.sections.join(',')]);

  return null;
}
