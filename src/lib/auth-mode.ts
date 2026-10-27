// Public presentation flag only. Backend authorization is always independent.
// No Worker/build configuration is changed by this local implementation.
export const AUTH_UI_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_AUTH_MODE === 'hosted-dev' || import.meta.env.VITE_AUTH_MODE === 'hosted-prod';
export function authUIEnabled(): boolean {
  return import.meta.env.DEV || AUTH_UI_AVAILABLE
    && typeof window !== 'undefined' && (import.meta.env.VITE_AUTH_MODE === 'hosted-dev' && window.location.origin === 'https://dev.lan-party.club'
      || import.meta.env.VITE_AUTH_MODE === 'hosted-prod' && window.location.origin === 'https://www.lan-party.club');
}
