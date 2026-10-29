import { AUTH_UI_AVAILABLE, authUIEnabled } from '../lib/auth-mode';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const titles: Record<string, string> = {
  '/': 'Home',
  '/events': 'Events',
  ...(import.meta.env.VITE_AUTH_MODE !== 'hosted-prod' ? {'/manage':'Administration','/manage/users':'Members','/manage/roles':'Roles & Permissions','/manage/events':'Event management'} : {}),
  '/privacy': 'Privacy Policy',
  ...(import.meta.env.VITE_AUTH_MODE !== 'hosted-prod'?{'/manage/activity':'Role Activity Log'}:{}),
  '/login': 'Login',
  ...((AUTH_UI_AVAILABLE && authUIEnabled()) ? { '/register': 'Create account', '/account': 'Account',
    '/verify-email': 'Verify email', '/local-mail': 'Local mailbox',
    '/forgot-password': 'Forgot password', '/reset-password': 'Reset password',
    '/account/security': 'Account security', '/mfa':'Verify sign-in' } : {}),
};

export default function RouteFocus() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    document.title = `LAN Party | ${titles[pathname] ?? (pathname.startsWith('/manage/users/') && import.meta.env.VITE_AUTH_MODE !== 'hosted-prod' ? 'Member details' : 'Page not found')}`;
    if (previousPath.current !== pathname) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      previousPath.current = pathname;
    }
  }, [pathname]);

  return null;
}
