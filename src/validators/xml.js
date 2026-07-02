import { SyntaxValidator } from 'fast-xml-validator';
import { XMLParser } from 'fast-xml-parser';

function extractText(val) {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') return val['#text'] || '';
  return String(val);
}

function isNonEmptyString(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

// ---------- detection ----------

function realRoot(doc) {
  return Object.keys(doc).find(k => k !== '?xml') || null;
}

function detectFeedType(doc) {
  const root = realRoot(doc);
  if (root === 'rss') return 'rss';
  if (root === 'feed') return 'atom';
  if (root === 'urlset') return 'sitemap';
  if (root === 'sitemapindex') return 'sitemap-index';
  return 'xml';
}

// ---------- RSS ----------

function validateRss(rss) {
  const checks = [];
  const channel = rss.channel;
  if (!channel) {
    checks.push({ check: 'rss-channel', passed: false, detail: 'missing <channel>' });
    return checks;
  }
  checks.push({ check: 'rss-channel', passed: true, detail: '<channel> found' });

  const title = extractText(channel.title);
  if (isNonEmptyString(title)) {
    checks.push({ check: 'rss-title', passed: true, detail: title.slice(0, 80) });
  } else {
    checks.push({ check: 'rss-title', passed: false, detail: 'missing or empty <title>' });
  }

  const link = extractText(channel.link);
  if (isNonEmptyString(link)) {
    checks.push({ check: 'rss-link', passed: true, detail: link });
  } else {
    checks.push({ check: 'rss-link', passed: false, detail: 'missing or empty <link>' });
  }

  const items = channel.item;
  if (!items || items.length === 0) {
    checks.push({ check: 'rss-items', passed: true, detail: '0 items' });
    return checks;
  }
  checks.push({ check: 'rss-items', passed: true, detail: `${items.length} items` });

  // validate dates if present
  for (const item of items) {
    if (item.pubDate) {
      const pubDate = extractText(item.pubDate);
      if (pubDate && isNaN(Date.parse(pubDate))) {
        checks.push({ check: 'rss-item-date', passed: false, detail: `invalid date: ${pubDate}` });
        break;
      }
    }
  }
  if (!checks.some(c => c.check === 'rss-item-date' && !c.passed)) {
    checks.push({ check: 'rss-item-date', passed: true, detail: 'dates parseable' });
  }

  return checks;
}

// ---------- Atom ----------

function validateAtom(feed) {
  const checks = [];

  if (!feed.title) {
    checks.push({ check: 'atom-title', passed: false, detail: 'missing <title>' });
  } else {
    const title = extractText(feed.title);
    checks.push({ check: 'atom-title', passed: isNonEmptyString(title), detail: title ? title.slice(0, 80) : 'empty' });
  }

  if (!feed.link) {
    checks.push({ check: 'atom-link', passed: false, detail: 'missing <link>' });
  } else {
    const href = feed.link['@_href'] || (Array.isArray(feed.link) ? feed.link[0]?.['@_href'] : null);
    checks.push({ check: 'atom-link', passed: !!href, detail: href || 'no href attribute' });
  }

  const entries = feed.entry;
  if (!entries || entries.length === 0) {
    checks.push({ check: 'atom-entries', passed: true, detail: '0 entries' });
    return checks;
  }
  checks.push({ check: 'atom-entries', passed: true, detail: `${entries.length} entries` });

  for (const entry of entries) {
    if (entry.updated) {
      const updated = extractText(entry.updated);
      if (updated && isNaN(Date.parse(updated))) {
        checks.push({ check: 'atom-entry-date', passed: false, detail: `invalid updated: ${updated}` });
        break;
      }
    }
    if (entry.published) {
      const published = extractText(entry.published);
      if (published && isNaN(Date.parse(published))) {
        checks.push({ check: 'atom-entry-date', passed: false, detail: `invalid published: ${published}` });
        break;
      }
    }
  }
  if (!checks.some(c => c.check === 'atom-entry-date' && !c.passed)) {
    checks.push({ check: 'atom-entry-date', passed: true, detail: 'dates parseable' });
  }

  return checks;
}

// ---------- Sitemap ----------

function validateSitemap(urlset) {
  const checks = [];

  const urls = urlset.url;
  if (!urls || urls.length === 0) {
    checks.push({ check: 'sitemap-urls', passed: true, detail: '0 urls' });
    return checks;
  }
  checks.push({ check: 'sitemap-urls', passed: true, detail: `${urls.length} urls` });

  const locs = [];
  for (const url of urls) {
    const loc = extractText(url.loc);

    if (!loc) {
      checks.push({ check: 'sitemap-loc-empty', passed: false, detail: 'found empty <loc>' });
    }

    if (loc && !loc.startsWith('http://') && !loc.startsWith('https://')) {
      checks.push({ check: 'sitemap-loc-url', passed: false, detail: `invalid URL: ${loc}` });
    }

    locs.push(loc);
  }

  if (!checks.some(c => c.check === 'sitemap-loc-empty' && !c.passed)) {
    checks.push({ check: 'sitemap-loc-empty', passed: true, detail: 'no empty loc' });
  }

  if (!checks.some(c => c.check === 'sitemap-loc-url' && !c.passed)) {
    checks.push({ check: 'sitemap-loc-url', passed: true, detail: 'all loc are valid URLs' });
  }

  // duplicates
  const seen = new Set();
  const duplicates = [];
  for (const loc of locs) {
    if (loc && seen.has(loc)) duplicates.push(loc);
    seen.add(loc);
  }
  if (duplicates.length > 0) {
    checks.push({ check: 'sitemap-loc-duplicate', passed: false, detail: `${duplicates.length} duplicate(s): ${duplicates.slice(0, 3).join(', ')}` });
  } else {
    checks.push({ check: 'sitemap-loc-duplicate', passed: true, detail: 'no duplicates' });
  }

  return checks;
}

// ---------- Sitemap Index ----------

function validateSitemapIndex(sitemapindex) {
  const checks = [];

  const sitemaps = sitemapindex.sitemap;
  if (!sitemaps || sitemaps.length === 0) {
    checks.push({ check: 'sitemap-index-sitemaps', passed: true, detail: '0 sitemaps' });
    return checks;
  }
  checks.push({ check: 'sitemap-index-sitemaps', passed: true, detail: `${sitemaps.length} sitemaps` });

  for (const sm of sitemaps) {
    const loc = extractText(sm.loc);
    if (!loc) {
      checks.push({ check: 'sitemap-index-loc-empty', passed: false, detail: 'found empty <loc>' });
    }
    if (loc && !loc.startsWith('http://') && !loc.startsWith('https://')) {
      checks.push({ check: 'sitemap-index-loc-url', passed: false, detail: `invalid URL: ${loc}` });
    }
  }

  if (!checks.some(c => c.check === 'sitemap-index-loc-empty' && !c.passed)) {
    checks.push({ check: 'sitemap-index-loc-empty', passed: true, detail: 'no empty loc' });
  }

  if (!checks.some(c => c.check === 'sitemap-index-loc-url' && !c.passed)) {
    checks.push({ check: 'sitemap-index-loc-url', passed: true, detail: 'all loc are valid URLs' });
  }

  return checks;
}

// ---------- main ----------

export function validateXml(body, options = {}) {
  const checks = [];

  // well-formed
  let valid;
  try {
    valid = SyntaxValidator.validate(body);
  } catch (err) {
    checks.push({ check: 'xml-well-formed', passed: false, detail: err.message });
    return checks;
  }
  if (valid !== true) {
    checks.push({ check: 'xml-well-formed', passed: false, detail: valid.err.msg });
    return checks;
  }
  checks.push({ check: 'xml-well-formed', passed: true, detail: '' });

  // parse
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['url', 'sitemap', 'item', 'entry'].includes(name),
  });

  let doc;
  try {
    doc = parser.parse(body);
  } catch (err) {
    checks.push({ check: 'xml-well-formed', passed: false, detail: `parse error: ${err.message}` });
    return checks;
  }

  // root tag
  const rootName = realRoot(doc);
  if (!rootName) {
    checks.push({ check: 'xml-root', passed: false, detail: 'empty document' });
    return checks;
  }
  const feedType = detectFeedType(doc);

  // if root is <html>, it's likely an error page, not a feed
  if (rootName.toLowerCase() === 'html') {
    checks.push({ check: 'xml-root', passed: false, detail: `<${rootName}> — looks like HTML, not XML feed` });
    return checks;
  }

  checks.push({ check: 'xml-root', passed: true, detail: `<${rootName}> (${feedType})` });

  // type-specific
  switch (feedType) {
    case 'rss':
      checks.push(...validateRss(doc.rss));
      break;
    case 'atom':
      checks.push(...validateAtom(doc.feed));
      break;
    case 'sitemap':
      checks.push(...validateSitemap(doc.urlset));
      break;
    case 'sitemap-index':
      checks.push(...validateSitemapIndex(doc.sitemapindex));
      break;
    default:
      checks.push({ check: 'xml-type', passed: true, detail: `plain XML (<${rootName}>)` });
  }

  return checks;
}
