import { COMMENT_LIMIT, MODERATION_REASON_LIMIT } from '../src/lib/news-comments';
import { NewsError } from './news-data';

type Redaction = { note: string; digest: string; size: number };
export type StoredCommentPart = { text: string } | Redaction;

const encoder = new TextEncoder();
const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
const invalid = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const unpaired = /[\uD800-\uDFFF]/u;

function commentText(value: unknown, limit: number) {
  if (typeof value !== 'string' || value.length > limit || invalid.test(value) || unpaired.test(value)) {
    throw new NewsError(400, 'Check the comment text');
  }
  return value.replace(/\r\n?/g, '\n');
}

export function moderationReason(value: unknown) {
  const reason = commentText(value, MODERATION_REASON_LIMIT).trim();
  if (!reason) throw new NewsError(400, 'Enter a moderation reason');
  return reason;
}

export function newComment(value: unknown): StoredCommentPart[] {
  const text = commentText(value, COMMENT_LIMIT).trim();
  if (!text) throw new NewsError(400, 'Enter a comment');
  return [{ text }];
}

async function redactionKey(secret: string, commentId: string) {
  return crypto.subtle.importKey('raw', encoder.encode(`news-comment-redaction:${commentId}:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function fingerprint(key: CryptoKey, value: string) {
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function redactParts(parts: StoredCommentPart[], index: unknown, start: unknown, end: unknown,
  note: string, secret: string, commentId: string): Promise<StoredCommentPart[]> {
  if (parts.length >= 13 || !Number.isSafeInteger(index) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    throw new NewsError(400, 'Select a passage to redact');
  }
  const part = parts[Number(index)], from = Number(start), to = Number(end);
  if (!part || !('text' in part) || from < 0 || to <= from || to > part.text.length) {
    throw new NewsError(400, 'Select a passage to redact');
  }
  const before = part.text.slice(0, from), after = part.text.slice(to), passage = part.text.slice(from, to);
  const value = normalized(passage);
  if (!value || [before, after, passage].some(text => unpaired.test(text))) {
    throw new NewsError(400, 'Select a complete passage to redact');
  }
  const key = await redactionKey(secret, commentId);
  const marker = { note, digest: await fingerprint(key, value), size: value.length };
  return [...parts.slice(0, Number(index)), { text: before }, marker, { text: after }, ...parts.slice(Number(index) + 1)];
}

export async function editParts(parts: StoredCommentPart[], value: unknown, secret: string, commentId: string) {
  if (!Array.isArray(value) || value.length !== parts.filter(part => 'text' in part).length) {
    throw new NewsError(400, 'Edit the existing comment sections only');
  }
  const textParts = value.map(item => commentText(item, COMMENT_LIMIT));
  if (textParts.reduce((total, part) => total + part.length, 0) > COMMENT_LIMIT ||
      (parts.length === 1 && !textParts[0].trim())) throw new NewsError(400, 'Check the comment length');
  const redactions = parts.filter((part): part is Redaction => 'note' in part);
  if (redactions.length) {
    const key = await redactionKey(secret, commentId);
    const joined = normalized(textParts.join(''));
    const separated = normalized(textParts.join(' '));
    for (const size of new Set(redactions.map(redaction => redaction.size))) {
      const denied = new Set(redactions.filter(redaction => redaction.size === size).map(redaction => redaction.digest));
      const candidates = new Set<string>();
      for (const text of [joined, separated, ...textParts.map(normalized)]) {
        for (let i = 0; i + size <= text.length; i++) candidates.add(text.slice(i, i + size));
      }
      const values = [...candidates];
      for (let i = 0; i < values.length; i += 64) {
        const digests = await Promise.all(values.slice(i, i + 64).map(value => fingerprint(key, value)));
        if (digests.some(digest => denied.has(digest))) throw new NewsError(400, 'Removed text cannot be restored');
      }
    }
  }
  let cursor = 0;
  return parts.map(part => 'text' in part ? { text: textParts[cursor++] } : part);
}
