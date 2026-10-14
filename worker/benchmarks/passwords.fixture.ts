// Local benchmark only: never imported by the application Worker.
import { hashPassword, verifyPassword } from '../auth/passwords';
declare const BENCHMARK_RECORD: string;
export default {
  async fetch(request: Request): Promise<Response> {
    const operation = new URL(request.url).pathname;
    const start = performance.now();
    if (operation === '/hash') await hashPassword('fictional benchmark password');
    else if (operation === '/verify') {
      if (!await verifyPassword('fictional benchmark password', BENCHMARK_RECORD)) throw new Error('Verification failed');
    } else if (operation !== '/baseline') return new Response('Unknown local benchmark', { status: 404 });
    return Response.json({ elapsedMs: performance.now() - start });
  },
};
