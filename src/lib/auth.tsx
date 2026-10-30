import {AUTH_UI_AVAILABLE, authUIEnabled} from './auth-mode';
import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import {useLocation} from 'react-router';
import {SessionValidation} from './session-validation';
import {MemberReadCache} from './member-read-cache';
import {RoleReadCache} from './role-read-cache';
import type {Session, AdministrationAccess, ValidationState} from './session-validation';
interface Authentication {
  session: Session | null;
  status: 'loading' | 'ready' | 'error';
  administration?: AdministrationAccess;
  memberReads: MemberReadCache;
  roleReads: RoleReadCache;
  invalidateAdministration:()=>Promise<boolean>;
  roleFeedback:string;
  setRoleFeedback:(message:string)=>void;
  refresh: () => Promise<boolean>;
  logout: () => Promise<boolean>;
}
const Context = createContext<Authentication | null>(null);
export function AuthProvider({children}: {children: ReactNode}) {
  const enabled = AUTH_UI_AVAILABLE && authUIEnabled();
  const [state, setState] = useState<ValidationState>({session: null, status: enabled ? 'loading' : 'ready', access: {sections: [], status: enabled ? 'loading' : 'ready'}});
  const [memberReads] = useState(() => new MemberReadCache());
  const [roleReads] = useState(() => new RoleReadCache());
  const [roleFeedback,setRoleFeedback]=useState('');
  const [validation] = useState(() => new SessionValidation(next=>{memberReads.synchronize(next);roleReads.synchronize(next);setState(next);}, (...args) => fetch(...args), import.meta.env.VITE_AUTH_MODE !== 'hosted-prod'));
  const channel = useRef<BroadcastChannel | null>(null);
  const {pathname} = useLocation();
  const refresh = useCallback(() => enabled ? validation.refresh(true) : Promise.resolve(false), [enabled, validation]);
  const invalidateAdministration=useCallback(()=>{validation.invalidate();channel.current?.postMessage('invalidate');return enabled?validation.refresh():Promise.resolve(false);},[enabled,validation]);
  useEffect(() => {if (enabled) void validation.refresh();}, [enabled, validation, pathname]);
  useEffect(() => {
    if (!enabled) return;
    // Cross-tab messages carry invalidation only, never identities, grants or tokens.
    const bus = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lan-auth-invalidation') : null;
    channel.current = bus;
    if (bus) bus.onmessage = () => {validation.invalidate(); void validation.refresh();};
    const check = () => {if (document.visibilityState === 'visible') void validation.refresh();};
    const restored = (event: PageTransitionEvent) => {if (event.persisted) {validation.invalidate(); void validation.refresh();}};
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check); window.addEventListener('pageshow', restored);
    return () => {channel.current = null; bus?.close(); validation.dispose(); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); window.removeEventListener('pageshow', restored);};
  }, [enabled, validation]);
  const logout = async () => {
    const session = validation.state.session;
    if (!session || !enabled) return false;
    validation.invalidate();
    try {
      const response = await fetch('/api/auth/logout', {method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: {'Content-Type': 'application/json', 'X-LAN-Request': '1', 'X-CSRF-Token': session.csrfToken},
        body: '{}', signal: AbortSignal.timeout(15000)});
      if (response.ok || response.status === 401) {
        channel.current?.postMessage('invalidate');
        // Invalidate again: an overlapping route/focus read must not revive logout.
        validation.signedOut(); return true;
      }
      await refresh(); return false;
    } catch {await refresh(); return false;}
  };
  return <Context value={{session: state.session, status: state.status, administration: state.access, memberReads, roleReads, invalidateAdministration, roleFeedback,setRoleFeedback,refresh, logout}}>{children}</Context>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('Authentication provider missing');
  return value;
}
