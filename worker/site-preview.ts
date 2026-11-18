import { EVENT_ARTWORK, EVENT_ARTWORK_ALT } from '../src/lib/event-artwork';

export const escapePreview = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

export function previewTags({
  title, description, canonical, type = 'website', language,
}: {
  title: string; description: string; canonical: string; type?: 'article' | 'website'; language?: 'en' | 'nl';
}) {
  const image = new URL(EVENT_ARTWORK, canonical).href;
  const tags = [
    `<title>${escapePreview('LAN Party | ' + title)}</title>`,
    `<meta name="description" content="${escapePreview(description)}">`,
    `<link rel="canonical" href="${escapePreview(canonical)}">`,
  ];
  for (const [key, value] of [
    ['og:type', type], ['og:site_name', 'LAN Party'], ['og:title', title], ['og:description', description],
    ['og:url', canonical], ['og:image', image], ['og:image:alt', EVENT_ARTWORK_ALT],
  ]) tags.push(`<meta property="${key}" content="${escapePreview(value)}">`);
  if (language) tags.push(`<meta property="og:locale" content="${language === 'nl' ? 'nl_NL' : 'en_GB'}">`);
  for (const [key, value] of [
    ['twitter:card', 'summary_large_image'], ['twitter:title', title], ['twitter:description', description],
    ['twitter:image', image], ['twitter:image:alt', EVENT_ARTWORK_ALT],
  ]) tags.push(`<meta name="${key}" content="${escapePreview(value)}">`);
  return tags.join('');
}

export function rewritePreview(source: Response, tags: string) {
  const headers = new Headers(source.headers);
  for (const name of ['Content-Length', 'ETag', 'Last-Modified', 'Content-Range', 'Accept-Ranges']) headers.delete(name);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new HTMLRewriter()
    .on('title, meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]', {
      element(element) { element.remove(); },
    })
    .on('head', { element(element) { element.append(tags, { html: true }); } })
    .transform(new Response(source.body, { status: source.status, headers }));
}
