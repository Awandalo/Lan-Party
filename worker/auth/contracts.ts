import type { TokenPurpose } from './tokens';
import { isTokenUsable } from './tokens';
import { hasApprovedNickname } from './nickname-state';

export interface AccountIdentity {
  userId: string;
  status: 'active' | 'disabled';
  emailVerifiedAt: number | null;
  authVersion: number;
}

export interface SessionRecord {
  tokenDigest: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  authVersion: number;
}

// Password and future OIDC login resolve to this same account/session store.
// Implementations must re-read account status; session snapshots are not authority.
export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  findByDigest(digest: string): Promise<SessionRecord | null>;
  revokeByDigest(digest: string, now: number): Promise<void>;
  revokeAllForUser(userId: string, now: number): Promise<void>;
}

export interface ActionTokenStore {
  // Must atomically consume exactly one unexpired token bound to user + purpose.
  // Reset completion must atomically change the credential and revoke all sessions;
  // merely consuming a token through this contract is not a reset implementation.
  consume(digest: string, userId: string, purpose: Exclude<TokenPurpose, 'session'>, now: number): Promise<boolean>;
}

export interface AuthenticationRateLimiter {
  // Shared enforcement is required before expensive crypto; isolate memory is insufficient.
  allow(key: string, action: 'login' | 'register' | 'verify-email' | 'reset-password'): Promise<boolean>;
}

export function isSessionUsable(session: SessionRecord, account: AccountIdentity, now: number): boolean {
  return session.userId === account.userId && account.status === 'active'
    && Number.isSafeInteger(account.authVersion) && account.authVersion >= 0
    && session.authVersion === account.authVersion
    && isTokenUsable({ ...session, consumedAt: session.revokedAt }, now);
}

// This account gate is only one requirement; event eligibility and ownership are separate.
export function isAccountVerifiedForRegistration(account: AccountIdentity, approvedNickname: unknown): boolean {
  return account.status === 'active' && account.emailVerifiedAt !== null
    && Number.isSafeInteger(account.emailVerifiedAt) && account.emailVerifiedAt >= 0
    && hasApprovedNickname(approvedNickname);
}
