import {createContext, useContext, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import {useLocation} from 'react-router';
import {useAuth} from './auth';

type Section = 'users' | 'roles' | 'events';
interface Access {sections: Section[]; status: 'loading' | 'ready' | 'error'}
const Context = createContext<Access>({sections: [], status: 'loading'});
export function AdministrationProvider({children}: {children: ReactNode}) {
  const {session, status} = useAuth(), {pathname} = useLocation();
  const [result, setResult] = useState<{session: typeof session; path: string; access: Access} | null>(null);
  useEffect(() => {
    if (!session || status !== 'ready' || import.meta.env.VITE_AUTH_MODE === 'hosted-prod') return;
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/manage/capabilities', {credentials: 'same-origin', redirect: 'error',
          headers: {'X-LAN-Request': '1'}, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)])});
        let sections: Section[] = [];
        if (response.ok) {
          const body = await response.json();
          if (!Array.isArray(body.sections) || !body.sections.every((s: unknown) => ['users','roles','events'].includes(String(s)))) throw Error();
          sections = body.sections;
        } else if (![401,403,404].includes(response.status)) throw Error();
        if (!abort.signal.aborted) setResult({session, path: pathname, access: {sections, status: 'ready'}});
      } catch {
        if (!abort.signal.aborted) setResult({session, path: pathname, access: {sections: [], status: 'error'}});
      }
    }
    void load();
    return () => abort.abort();
  }, [session, status, pathname]);
  // Key results to both session snapshot and route so old grants cannot flash on navigation/logout.
  const access: Access = import.meta.env.VITE_AUTH_MODE === 'hosted-prod' ? {sections: [], status: 'ready'} : status === 'error' ? {sections: [], status: 'error'} : !session
    ? {sections: [], status: status === 'loading' ? 'loading' : 'ready'}
    : result?.session === session && result.path === pathname ? result.access : {sections: [], status: 'loading'};
  return <Context value={access}>{children}</Context>;
}
export const useAdministration = () => useContext(Context);
