import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

const titles: Record<string, string> = {
  '/': 'Home',
  '/events': 'Events',
  '/login': 'Login',
  ...(import.meta.env.DEV ? { '/register': 'Create account', '/account': 'Account',
    '/verify-email': 'Verify email', '/local-mail': 'Local mailbox' } : {}),
};

export default function RouteFocus() {
  const { pathname } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    document.title = `LAN Party | ${titles[pathname] ?? 'Page not found'}`;
    if (previousPath.current !== pathname) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      previousPath.current = pathname;
    }
  }, [pathname]);

  return null;
}

