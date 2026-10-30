import { manage } from './manage';
import { lifecycleHttp } from './auth/lifecycle-http';
import { registerAccount } from './auth/registration';
import { authentication } from './auth/http';
import type { AuthenticationEnvironment } from './auth/http';
import { verification } from './auth/verification';
import { passwordRecovery } from './auth/recovery';
import {accountSecurity} from './auth/account-security';
import {mfaAuthentication} from './auth/mfa-http';
import {purgeUserActivity} from './auth/user-activity';

interface Env extends AuthenticationEnvironment {
  ASSETS: Fetcher;
  DB: D1Database;
}

export default {
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext) {
    if(['dev','prod'].includes(env.AUTH_ENVIRONMENT??'')&&env.AUTH_LIFECYCLE_ADMIN_MODE==='enabled')ctx.waitUntil(purgeUserActivity(env.DB));
  },
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if(pathname.startsWith('/api/manage/'))return manage(request,env);
    if(pathname.startsWith('/api/auth/lifecycle/'))return lifecycleHttp(request,env);
    if(pathname.startsWith('/api/auth/mfa/'))return mfaAuthentication(request,env);
    if (pathname.startsWith('/api/auth/security/')) return accountSecurity(request,env);

    if (pathname === '/api/auth/register') return registerAccount(request, env);
    if (['/api/auth/login', '/api/auth/session', '/api/auth/logout'].includes(pathname)) return authentication(request, env);
    if (['/api/auth/verify-email', '/api/auth/resend-verification', '/api/auth/local-mail'].includes(pathname)) return verification(request, env);
    if (['/api/auth/forgot-password', '/api/auth/reset-password'].includes(pathname)) return passwordRecovery(request, env);

    if (pathname === '/api/health') {
      if (request.method !== 'GET') {
        return Response.json(
          { error: 'Method not allowed' },
          { status: 405, headers: { Allow: 'GET' } },
        );
      }

      // Liveness only: deliberately independent of database availability.
      return Response.json({ status: 'ok' });
    }

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
