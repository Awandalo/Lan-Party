import { authRouteEnabled, loopback } from './auth/environment';
import type { AuthenticationEnvironment } from './auth/http';
import { hostedProd, PROD_AUTH_ORIGIN } from './auth/production';
import { eventsReady } from './event-data';
import { eventEnvironmentEnabled } from './event-environment';
import { newsReady } from './news-data';
import { UUID } from './role-administration';
import { previewTags, rewritePreview } from './site-preview';

type SiteEnvironment = AuthenticationEnvironment & { ASSETS: Fetcher };
const publicPages = new Map([
  ['/', { title: 'Home', description: 'A place for friends to plan their next LAN party. Find events and catch up on the latest news.' }],
  ['/events', { title: 'Events', description: 'Browse upcoming and past LAN parties, with dates, venues and registration details.' }],
  ['/news', { title: 'News', description: 'Read announcements and practical updates, and see the latest polls from the LAN Party crew.' }],
  ['/privacy', { title: 'Privacy Policy', description: 'See how LAN Party Organizers handle account, event and guest data and how to make a privacy request.' }],
]);
const privatePages = new Set([
  '/login', '/mfa', '/register', '/verify-email', '/forgot-password', '/reset-password', '/reactivate',
  '/account', '/account/users', '/account/profile', '/account/profile/display-case', '/account/security',
  '/manage', '/manage/news', '/manage/users', '/manage/roles', '/manage/events', '/manage/activity',
  '/manage/user-activity', '/manage/locations', '/manage/logs', '/manage/event-activity', '/manage/location-activity',
]);
const articleSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const xml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[char]!);

export async function pageShell(request: Request, env: SiteEnvironment) {
  // Fetch the actual asset so application routing can distinguish missing URLs.
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), {
    headers: { Accept: 'text/html', 'Accept-Encoding': 'identity' },
  }));
}

export function pageResponse(request: Request, response: Response, indexable: boolean) {
  const headers = new Headers(response.headers);
  if (!indexable || !response.ok) headers.set('X-Robots-Tag', 'noindex');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status, statusText: response.statusText, headers,
  });
}

async function sitemap(request: Request, env: SiteEnvironment) {
  const paths = [...publicPages.keys()];
  const authEnabled = authRouteEnabled(request, env, env.AUTH_SESSION_MODE);
  if (authEnabled && eventEnvironmentEnabled(request, env)) {
    if (!await eventsReady(env.DB)) throw new Error('Events unavailable');
    const events = await env.DB.prepare(`SELECT e.id FROM events e JOIN event_management m ON m.event_id=e.id
      WHERE e.publication_status='published' AND m.is_listed=1 ORDER BY e.id LIMIT 24998`).all<{id: string}>();
    paths.push(...events.results.filter(({id}) => UUID.test(id)).map(({id}) => '/events/' + id));
  }
  if (authEnabled) {
    if (!await newsReady(env.DB)) throw new Error('News unavailable');
    const news = await env.DB.prepare(`SELECT slug FROM news_articles WHERE publication_status='published'
      ORDER BY slug LIMIT 24998`).all<{slug: string}>();
    paths.push(...news.results.filter(({slug}) => slug.length <= 120 && articleSlug.test(slug))
      .map(({slug}) => '/news/' + slug));
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + paths.map(path => '  <url><loc>' + xml(new URL(path, PROD_AUTH_ORIGIN).href) + '</loc></url>').join('\n')
    + '\n</urlset>\n';
}

export async function sitePage(request: Request, env: SiteEnvironment): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const prod = hostedProd(request, env);
  const read = request.method === 'GET' || request.method === 'HEAD';
  if (!read) return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (path === '/index.html') return pageResponse(request,
    new Response(null, { status: 308, headers: { Location: '/' + url.search } }), prod);
  if (path === '/robots.txt') {
    // Allow crawlers to read the noindex headers on non-production HTML.
    return pageResponse(request, new Response('User-agent: *\nAllow: /\n'
      + (prod ? 'Sitemap: ' + PROD_AUTH_ORIGIN + '/sitemap.xml\n' : ''), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    }), prod);
  }
  if (path === '/sitemap.xml') {
    if (!prod) return pageResponse(request, new Response(null, { status: 404 }), false);
    try {
      return pageResponse(request, new Response(await sitemap(request, env), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' },
      }), true);
    } catch {
      return pageResponse(request, new Response('Sitemap temporarily unavailable', {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      }), false);
    }
  }
  // Missing static assets keep their native 404 and never receive an HTML shell.
  if (/\.[^/]+$/.test(path) || /^\/(?:assets|images)(?:\/|$)/.test(path)) return env.ASSETS.fetch(request);
  const publicPage = publicPages.get(path);
  const privatePage = privatePages.has(path) || /^\/manage\/users\/[^/]+$/.test(path)
    || /^\/(?:account|manage)\/feedback(?:\/.*)?$/.test(path)
    || path === '/preview/registration' && (env.AUTH_ENVIRONMENT === 'dev' || loopback(url))
    || path === '/local-mail' && loopback(url);
  const shell = await pageShell(request, env);
  if (!shell.ok) return pageResponse(request, shell, false);
  if (publicPage) {
    const canonical = new URL(path, url.origin).href;
    return pageResponse(request, rewritePreview(shell, previewTags({ ...publicPage, canonical })), prod);
  }
  if (privatePage) return pageResponse(request, shell, false);
  return pageResponse(request, new Response(shell.body, { status: 404, headers: shell.headers }), false);
}
