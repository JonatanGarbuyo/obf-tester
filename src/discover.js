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
    return { source: robotsUrl, sitemaps: [], crawlDelay: null, error: err.message };
  }

  if (response.status !== 200) {
    return { source: robotsUrl, sitemaps: [], crawlDelay: null, error: `${response.status} ${response.statusText}` };
  }

  const body = response.body;

  // Extract Crawl-Delay (value in seconds, convert to ms)
  let crawlDelay = null;
  const cdMatch = body.match(/^Crawl-Delay:[ \t]*(\d+(?:\.\d+)?)$/im);
  if (cdMatch) {
    crawlDelay = Math.round(parseFloat(cdMatch[1]) * 1000);
  }

  // Extract Sitemap entries
  const sitemaps = [];
  const regex = /^Sitemap:[ \t]*(.+)$/gim;
  let match;
  while ((match = regex.exec(body)) !== null) {
    const sitemapUrl = match[1].trim();
    if (sitemapUrl) {
      sitemaps.push(sitemapUrl);
    }
  }

  return { source: robotsUrl, sitemaps, crawlDelay };
}
