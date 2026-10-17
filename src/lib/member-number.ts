// Decimal strings preserve SQLite INTEGER precision across D1, JSON and browsers.
export function isMemberNumber(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
    && BigInt(value) <= 9223372036854775807n;
}

export function formatMemberNumber(value: string): string {
  if (!isMemberNumber(value)) throw new Error('Invalid member number');
  return `#${value.padStart(4, '0')}`;
}
