export const AUTH_POLICY = Object.freeze({
  minimumPasswordCharacters: 12,
  maximumPasswordCharacters: 128,
  // Owner-approved development trade-off; public authentication still requires review.
  passwordIterations: 20_000,
  maximumPasswordIterations: 1_000_000,
  emailVerificationSeconds: 24 * 60 * 60,
  passwordResetSeconds: 30 * 60,
  nicknameCooldownSeconds: 14 * 24 * 60 * 60,
  sessionLifetimeSeconds: 7 * 24 * 60 * 60,
});

export interface AuthConfiguration {
  environment: 'dev' | 'prod';
  publicOrigin: string;
  sessionLifetimeSeconds: number;
}

export function defaultAuthConfiguration(environment: 'dev' | 'prod', publicOrigin: string): AuthConfiguration {
  return validateAuthConfiguration({ environment, publicOrigin,
    sessionLifetimeSeconds: AUTH_POLICY.sessionLifetimeSeconds });
}

// Explicit input: no implicit PROD fallback and no email/provider credentials here.
export function validateAuthConfiguration(input: AuthConfiguration): AuthConfiguration {
  if (input.environment !== 'dev' && input.environment !== 'prod') {
    throw new Error('Invalid authentication environment');
  }
  const url = new URL(input.publicOrigin);
  if (url.protocol !== 'https:' || url.origin !== input.publicOrigin) {
    throw new Error('Authentication requires a canonical HTTPS origin');
  }
  if (!Number.isSafeInteger(input.sessionLifetimeSeconds)
    || input.sessionLifetimeSeconds < 60 || input.sessionLifetimeSeconds > 30 * 24 * 60 * 60) {
    throw new Error('Session lifetime must be between one minute and thirty days');
  }
  return Object.freeze({ ...input });
}

export function expiresAt(now: number, lifetimeSeconds: number): number {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(lifetimeSeconds)
    || lifetimeSeconds <= 0 || !Number.isSafeInteger(now + lifetimeSeconds)) {
    throw new Error('Invalid authentication timestamp or lifetime');
  }
  return now + lifetimeSeconds;
}
