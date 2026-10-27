import type { EmailEnvironment } from './email';

export const PROD_AUTH_ORIGIN = 'https://www.lan-party.club';
export const PROD_AUTH_TARGET = 'lan-party:9fbe3402-c26b-45fd-be67-71775e5e6a3e';
// Supplied only by the explicit PROD build profile. Runtime variables and forwarded
// headers cannot opt a default or DEV bundle into production authentication.
declare const __LAN_MFA_TARGET__: string;
export function productionBuild(): boolean {
  return typeof __LAN_MFA_TARGET__ !== 'undefined' && __LAN_MFA_TARGET__ === PROD_AUTH_TARGET;
}
export function hostedProd(request: Request, env: EmailEnvironment): boolean {
  const url = new URL(request.url);
  return productionBuild()
    && env.AUTH_ENVIRONMENT === 'prod' && url.origin === PROD_AUTH_ORIGIN
    && !url.username && !url.password && env.AUTH_PUBLIC_ORIGIN === PROD_AUTH_ORIGIN
    && env.AUTH_EMAIL_TRANSPORT === 'resend';
}
