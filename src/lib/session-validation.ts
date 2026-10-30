import {isMemberNumber} from './member-number';

export interface Session {account: {userId: string; nickname: string; memberNumber: string}; csrfToken: string; emailVerified: boolean; recoveryCodesRemaining?: number}
export type Section = 'users' | 'roles' | 'events' | 'activity' | 'userActivity';
export interface AdministrationAccess {sections: Section[]; status: 'loading' | 'ready' | 'error'; revalidating?: boolean; revision?: number}
export interface ValidationState {session: Session | null; status: 'loading' | 'ready' | 'error'; access: AdministrationAccess}
const empty = (): AdministrationAccess => ({sections: [], status: 'loading'});

// One coordinator owns both reads. A generation fences responses even if a
// transport ignores cancellation. Only navigation hints survive same-user checks.
export class SessionValidation {
  state: ValidationState = {session: null, status: 'loading', access: empty()};
  private generation = 0;
  private pending: Promise<boolean> | null = null;
  private abort: AbortController | null = null;
  constructor(private readonly publish: (state: ValidationState) => void,
    private readonly transport: typeof fetch, private readonly administration: boolean) {}
  private set(state: ValidationState) {this.state = state; this.publish(state);}
  invalidate() {
    this.generation++; this.abort?.abort(); this.pending = null;
    this.set({session: null, status: 'loading', access: empty()});
  }
  signedOut() {
    this.invalidate(); this.set({session: null, status: 'ready', access: {sections: [], status: 'ready'}});
  }
  dispose() {this.generation++; this.abort?.abort(); this.pending = null;}
  refresh(force = false): Promise<boolean> {
    if (this.pending && !force) return this.pending;
    this.abort?.abort();
    const generation = ++this.generation, abort = new AbortController();
    this.abort = abort;
    const current = () => generation === this.generation;
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]);
    const read = (path: string, proof?: string) => this.transport(path, {credentials: 'same-origin', redirect: 'error', headers: {'X-LAN-Request': '1', ...(proof ? {'X-LAN-Session-Proof': proof} : {})}, signal});
    this.set({...this.state, access: {...this.state.access, revalidating: true, revision: generation}});
    const operation = async () => {
      let session: Session | null = null;
      try {
        const response = await read('/api/auth/session');
        if (!current()) return false;
        if ([401,403].includes(response.status)) {
          this.set({session: null, status: 'ready', access: {sections: [], status: 'ready'}}); return false;
        }
        if (!response.ok) throw Error('Session unavailable');
        const value: Session = await response.json();
        if (!current()) return false;
        if (typeof value.account?.userId !== 'string' || typeof value.account?.nickname !== 'string'
          || !isMemberNumber(value.account?.memberNumber) || typeof value.emailVerified !== 'boolean'
          || !/^[0-9a-f]{64}$/.test(value.csrfToken)) throw Error('Invalid session');
        if (value.recoveryCodesRemaining !== undefined && (!Number.isInteger(value.recoveryCodesRemaining) || value.recoveryCodesRemaining < 0 || value.recoveryCodesRemaining > 10)) delete value.recoveryCodesRemaining;
        session = value;
        const sameContext = this.state.session?.account.userId === value.account.userId && this.state.session.csrfToken === value.csrfToken;
        this.set({session, status: 'ready', access: sameContext ? {...this.state.access, revalidating: true} : empty()});
        if (!this.administration) {
          this.set({session, status: 'ready', access: {sections: [], status: 'ready'}}); return true;
        }
        const capabilities = await read('/api/manage/capabilities', session.csrfToken);
        if (!current()) return false;
        if (capabilities.status === 409) {session = null; throw Error('Session context changed');}
        if (capabilities.status === 401) {
          this.set({session: null, status: 'ready', access: {sections: [], status: 'ready'}}); return false;
        }
        if ([403,404].includes(capabilities.status)) {
          this.set({session, status: 'ready', access: {sections: [], status: 'ready'}}); return true;
        }
        if (!capabilities.ok) throw Error('Capabilities unavailable');
        const body = await capabilities.json();
        if (!current()) return false;
        if (!Array.isArray(body.sections) || !body.sections.every((s: unknown) => typeof s === 'string' && ['users','roles','events','activity','userActivity'].includes(s))) throw Error('Invalid capabilities');
        this.set({session, status: 'ready', access: {sections: [...new Set<Section>(body.sections)], status: 'ready', revision: generation}});
        return true;
      } catch {
        if (current()) this.set({session, status: session ? 'ready' : 'error', access: {sections: [], status: 'error'}});
        // A capabilities outage must not turn a verified sign-in/MFA refresh
        // into an authentication failure. Administration remains unavailable.
        return current() && session !== null;
      } finally {if (current()) this.pending = null;}
    };
    this.pending = operation();
    return this.pending;
  }
}
