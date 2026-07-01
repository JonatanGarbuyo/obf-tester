import { fetchUrl, FetchError } from './fetcher.js';

export async function discover(url) {
  const base = new URL(url);
  const robotsUrl = base.pathname.endsWith('/robots.txt')
    ? url
    : new URL('/robots.txt', base.origin).href;

  let response;
  try {
    response = await fetchUrl(robotsUrl);
  } catch (err) {
    return { source: robotsUrl, sitemaps: [], error: err.message };
  }

  if (response.status !== 200) {
    return { source: robotsUrl, sitemaps: [], error: `${response.status} ${response.statusText}` };
  }

  const sitemaps = [];
  const regex = /^Sitemap:\s*(.+)$/gim;
  let match;
  while ((match = regex.exec(response.body)) !== null) {
    const sitemapUrl = match[1].trim();
    if (sitemapUrl) {
      sitemaps.push(sitemapUrl);
    }
  }

  return { source: robotsUrl, sitemaps };
}
