// Public presentation flag only. Backend authorization is always independent.
// No Worker/build configuration is changed by this local implementation.
export const AUTH_UI_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_AUTH_MODE === 'hosted-dev';
export function authUIEnabled(): boolean {
  return import.meta.env.DEV || AUTH_UI_AVAILABLE
    && typeof window !== 'undefined' && window.location.origin === 'https://dev.lan-party.club';
}
