import { AUTH_POLICY } from './config';
import { validateNickname } from './nicknames';

export type NicknameChangeResult = 'changed' | 'unchanged' | 'cooldown' | 'onboarding-required' | 'account-unavailable';

// userId must come from the authenticated session, never a client-supplied owner ID.
export async function changeParticipantNickname(db: D1Database, userId: string,
  submitted: unknown, now: number): Promise<NicknameChangeResult> {
  const nickname = validateNickname(submitted).display;
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid server timestamp');
  const updated = await db.prepare(`UPDATE user_nicknames
    SET nickname = ?, nickname_changed_at = ?, updated_at = ?
    WHERE user_id = ? AND nickname <> ? AND updated_at <= ?
      AND (nickname_changed_at IS NULL OR nickname_changed_at <= ?)
      AND EXISTS (SELECT 1 FROM users WHERE id = user_nicknames.user_id AND status = 'active')
    RETURNING user_id`).bind(nickname, now, now, userId, nickname, now,
      now - AUTH_POLICY.nicknameCooldownSeconds).first<{ user_id: string }>();
  if (updated) return 'changed';
  const record = await db.prepare(`SELECT users.status, user_nicknames.nickname FROM users
    LEFT JOIN user_nicknames ON users.id = user_nicknames.user_id WHERE users.id = ?`)
    .bind(userId).first<{ status: string; nickname: string | null }>();
  if (!record || record.status !== 'active') return 'account-unavailable';
  if (record.nickname === null) return 'onboarding-required';
  return record.nickname === nickname ? 'unchanged' : 'cooldown';
}

export function inspectLegacyNicknames(records: readonly { userId: string; nickname: unknown }[]) {
  const issues: { userId: string; reason: 'missing' | 'invalid' | 'duplicate' }[] = [];
  const keys = new Map<string, string[]>();
  for (const record of records) {
    if (record.nickname === null || record.nickname === undefined) {
      issues.push({ userId: record.userId, reason: 'missing' });
      continue;
    }
    try {
      const { lookupKey } = validateNickname(record.nickname);
      keys.set(lookupKey, [...(keys.get(lookupKey) ?? []), record.userId]);
    } catch { issues.push({ userId: record.userId, reason: 'invalid' }); }
  }
  for (const ids of keys.values()) if (ids.length > 1) {
    for (const userId of ids) issues.push({ userId, reason: 'duplicate' });
  }
  // No real names/email/nickname values in the report; remediation is owner-controlled.
  return issues;
}

export function hasApprovedNickname(nickname: unknown): boolean {
  try { validateNickname(nickname); return true; } catch { return false; }
}
