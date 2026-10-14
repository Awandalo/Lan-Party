const reserved = new Set(['admin', 'moderator', 'system']);

export interface Nickname {
  display: string;
  lookupKey: string;
}

export function validateNickname(value: unknown): Nickname {
  if (typeof value !== 'string' || value.length < 3 || value.length > 24
    || !/^[A-Za-z0-9 _-]+$/.test(value) || value !== value.trim()
    || / {2}| [_-]|[_-] /.test(value)) {
    throw new Error('Nickname must contain 3–24 allowed ASCII characters with unambiguous spacing');
  }
  const lookupKey = value.toLowerCase();
  if (reserved.has(lookupKey.replace(/[ _-]/g, ''))) {
    throw new Error('Nickname is reserved');
  }
  return { display: value, lookupKey };
}
