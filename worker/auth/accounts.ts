import { validateNickname } from './nicknames';
import { isValidPassword } from './passwords';
import { isMemberNumber } from '../../src/lib/member-number';

export interface RegistrationInput {
  nickname: unknown;
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  password: unknown;
}

export function privateName(value: unknown): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length === 0
    || Array.from(value).length > 100 || /[\u0000-\u001f\u007f]/.test(value)
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    throw new Error('A nonblank first and last name are required');
  }
  return value;
}

export function emailAddress(value: unknown): string {
  if (typeof value !== 'string' || value.length > 254 || !/^[\x21-\x7e]+$/.test(value)) {
    throw new Error('Invalid email address');
  }
  const parts = value.split('@');
  if (parts.length !== 2) throw new Error('Invalid email address');
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !domain.includes('.') || domain.split('.').some((label) => label.length > 63
      || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) {
    throw new Error('Invalid email address');
  }
  return value;
}

// Private result: never serialize it as a public response or log it.
export function validateAccountProfile(input: Omit<RegistrationInput, 'password'>) {
  const nickname = validateNickname(input.nickname);
  const firstName = privateName(input.firstName);
  const lastName = privateName(input.lastName);
  const email = emailAddress(input.email);
  return { nickname: nickname.display, nicknameKey: nickname.lookupKey, firstName, lastName,
    email, emailNormalized: email.toLowerCase() };
}

export function validateRegistration(input: RegistrationInput) {
  const profile = validateAccountProfile(input);
  if (typeof input.password !== 'string' || !isValidPassword(input.password)) {
    throw new Error('Password does not satisfy length policy');
  }
  return { ...profile, password: input.password };
}

export function newAccountId(): string {
  return crypto.randomUUID();
}

// Explicit allowlist prevents private profile fields from leaking through object spreads.
export function publicAccount(account: { userId: string; nickname: string; memberNumber: string }) {
  if (!isMemberNumber(account.memberNumber)) throw new Error('Account member number unavailable');
  return { userId: account.userId, nickname: validateNickname(account.nickname).display, memberNumber: account.memberNumber };
}
