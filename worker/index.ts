import { registerAccount } from './auth/registration';
import type { RegistrationEnvironment } from './auth/registration';

interface Env extends RegistrationEnvironment {
  ASSETS: Fetcher;
  DB: D1Database;
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/auth/register') return registerAccount(request, env);

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
