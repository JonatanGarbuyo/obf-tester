import { describe, it, expect } from 'vitest'
import { validateXml } from '../src/validators/xml.js'

const validRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Channel</title>
    <link>https://example.com</link>
    <description>Test</description>
    <item>
      <title>Article 1</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article 2</title>
      <link>https://example.com/2</link>
      <pubDate>Tue, 02 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`

const validAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <link href="https://example.com/atom"/>
  <entry>
    <title>Entry 1</title>
    <link href="https://example.com/1"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
  <entry>
    <title>Entry 2</title>
    <link href="https://example.com/2"/>
    <updated>2024-01-02T00:00:00Z</updated>
  </entry>
</feed>`

const validSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/1</loc>
  </url>
  <url>
    <loc>https://example.com/2</loc>
  </url>
</urlset>`

const validSitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>`

// --------------- well-formed ---------------

describe('xml-well-formed', () => {
  it('passes for valid RSS', () => {
    const checks = validateXml(validRss)
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(true)
  })

  it('passes for valid Atom', () => {
    const checks = validateXml(validAtom)
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(true)
  })

  it('passes for valid sitemap', () => {
    const checks = validateXml(validSitemap)
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(true)
  })

  it('passes for valid sitemap-index', () => {
    const checks = validateXml(validSitemapIndex)
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(true)
  })

  it('fails for malformed XML', () => {
    const checks = validateXml('<?xml version="1.0"?><rss><channel></rss>')
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(false)
  })

  it('fails for completely invalid text', () => {
    const checks = validateXml('not xml at all')
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(false)
  })

  it('fails for empty string', () => {
    const checks = validateXml('')
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(false)
  })
})

// --------------- root tag detection ---------------

describe('xml-root', () => {
  it('rejects HTML as root', () => {
    const checks = validateXml('<html><body><h1>Error</h1></body></html>')
    const root = checks.find(c => c.check === 'xml-root')
    expect(root.passed).toBe(false)
    expect(root.detail).toMatch(/html/i)
  })

  it('rejects document with no root element as malformed', () => {
    const checks = validateXml('<?xml version="1.0"?>')
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(false)
  })
})

// --------------- RSS ---------------

describe('RSS', () => {
  it('passes all RSS checks for valid feed', () => {
    const checks = validateXml(validRss)
    const channels = checks.filter(c => c.check.startsWith('rss-'))
    expect(channels.every(c => c.passed)).toBe(true)
  })

  it('detects type as rss', () => {
    const checks = validateXml(validRss)
    const root = checks.find(c => c.check === 'xml-root')
    expect(root.detail).toMatch(/\(rss\)/)
  })

  it('fails rss-channel when <channel> is missing', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <notchannel>stuff</notchannel>
</rss>`
    const checks = validateXml(xml)
    const channel = checks.find(c => c.check === 'rss-channel')
    expect(channel.passed).toBe(false)
    expect(channel.detail).toMatch(/missing.*channel/i)
  })

  it('fails rss-title when <title> is empty', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title></title>
    <link>https://example.com</link>
    <item><title>A</title><link>https://x.com</link></item>
  </channel>
</rss>`
    const checks = validateXml(xml)
    const title = checks.find(c => c.check === 'rss-title')
    expect(title.passed).toBe(false)
  })

  it('fails rss-title when <title> is missing', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <link>https://example.com</link>
    <item><title>A</title><link>https://x.com</link></item>
  </channel>
</rss>`
    const checks = validateXml(xml)
    const title = checks.find(c => c.check === 'rss-title')
    expect(title.passed).toBe(false)
  })

  it('fails rss-link when <link> is empty', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link></link>
    <item><title>A</title><link>https://x.com</link></item>
  </channel>
</rss>`
    const checks = validateXml(xml)
    const link = checks.find(c => c.check === 'rss-link')
    expect(link.passed).toBe(false)
  })

  it('handles empty rss-items (0 items)', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
  </channel>
</rss>`
    const checks = validateXml(xml)
    const items = checks.find(c => c.check === 'rss-items')
    expect(items.passed).toBe(true)
  })

  it('fails rss-item-date when pubDate is unparseable', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>A</title>
      <link>https://x.com</link>
      <pubDate>not-a-date</pubDate>
    </item>
  </channel>
</rss>`
    const checks = validateXml(xml)
    const date = checks.find(c => c.check === 'rss-item-date')
    expect(date.passed).toBe(false)
    expect(date.detail).toMatch(/invalid date/i)
  })

  it('passes rss-item-date when items have no pubDate', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test</title>
    <link>https://example.com</link>
    <item>
      <title>A</title>
      <link>https://x.com</link>
    </item>
  </channel>
</rss>`
    const checks = validateXml(xml)
    const date = checks.find(c => c.check === 'rss-item-date')
    expect(date.passed).toBe(true)
  })
})

// --------------- Atom ---------------

describe('Atom', () => {
  it('passes all Atom checks for valid feed', () => {
    const checks = validateXml(validAtom)
    const atoms = checks.filter(c => c.check.startsWith('atom-'))
    expect(atoms.every(c => c.passed)).toBe(true)
  })

  it('detects type as atom', () => {
    const checks = validateXml(validAtom)
    const root = checks.find(c => c.check === 'xml-root')
    expect(root.detail).toMatch(/\(atom\)/)
  })

  it('fails atom-title when <title> is missing', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <link href="https://example.com"/>
  <entry><title>A</title><link href="https://x.com"/><updated>2024-01-01T00:00:00Z</updated></entry>
</feed>`
    const checks = validateXml(xml)
    const title = checks.find(c => c.check === 'atom-title')
    expect(title.passed).toBe(false)
  })

  it('fails atom-title when <title> is empty', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title></title>
  <link href="https://example.com"/>
  <entry><title>A</title><link href="https://x.com"/><updated>2024-01-01T00:00:00Z</updated></entry>
</feed>`
    const checks = validateXml(xml)
    const title = checks.find(c => c.check === 'atom-title')
    expect(title.passed).toBe(false)
  })

  it('handles empty atom-entries (0 entries)', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com"/>
</feed>`
    const checks = validateXml(xml)
    const entries = checks.find(c => c.check === 'atom-entries')
    expect(entries.passed).toBe(true)
  })

  it('fails atom-link when <link> has no href', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link/>
  <entry><title>A</title><link href="https://x.com"/><updated>2024-01-01T00:00:00Z</updated></entry>
</feed>`
    const checks = validateXml(xml)
    const link = checks.find(c => c.check === 'atom-link')
    expect(link.passed).toBe(false)
  })

  it('fails atom-link when <link> is missing', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <entry><title>A</title><link href="https://x.com"/><updated>2024-01-01T00:00:00Z</updated></entry>
</feed>`
    const checks = validateXml(xml)
    const link = checks.find(c => c.check === 'atom-link')
    expect(link.passed).toBe(false)
  })

  it('fails atom-entry-date when updated is unparseable', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com"/>
  <entry>
    <title>A</title>
    <link href="https://x.com"/>
    <updated>not-a-date</updated>
  </entry>
</feed>`
    const checks = validateXml(xml)
    const date = checks.find(c => c.check === 'atom-entry-date')
    expect(date.passed).toBe(false)
  })

  it('passes atom-entry-date when entries have no dates', () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test</title>
  <link href="https://example.com"/>
  <entry>
    <title>A</title>
    <link href="https://x.com"/>
  </entry>
</feed>`
    const checks = validateXml(xml)
    const date = checks.find(c => c.check === 'atom-entry-date')
    expect(date.passed).toBe(true)
  })
})

// --------------- Sitemap ---------------

describe('Sitemap', () => {
  it('passes all sitemap checks for valid sitemap', () => {
    const checks = validateXml(validSitemap)
    const sitemaps = checks.filter(c => c.check.startsWith('sitemap-') && !c.check.startsWith('sitemap-index-'))
    expect(sitemaps.every(c => c.passed)).toBe(true)
  })

  it('detects type as sitemap', () => {
    const checks = validateXml(validSitemap)
    const root = checks.find(c => c.check === 'xml-root')
    expect(root.detail).toMatch(/\(sitemap\)/)
  })

  it('handles empty sitemap-urls (0 urls)', () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`
    const checks = validateXml(xml)
    const urls = checks.find(c => c.check === 'sitemap-urls')
    expect(urls.passed).toBe(true)
  })

  it('fails sitemap-loc-empty when a <loc> is empty', () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc></loc></url>
</urlset>`
    const checks = validateXml(xml)
    const empty = checks.find(c => c.check === 'sitemap-loc-empty')
    expect(empty.passed).toBe(false)
  })

  it('fails sitemap-loc-url when a <loc> has no protocol', () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>example.com/page</loc></url>
</urlset>`
    const checks = validateXml(xml)
    const urlCheck = checks.find(c => c.check === 'sitemap-loc-url')
    expect(urlCheck.passed).toBe(false)
  })

  it('fails sitemap-loc-duplicate when same <loc> appears twice', () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/a</loc></url>
</urlset>`
    const checks = validateXml(xml)
    const dup = checks.find(c => c.check === 'sitemap-loc-duplicate')
    expect(dup.passed).toBe(false)
  })
})

// --------------- Sitemap Index ---------------

describe('Sitemap Index', () => {
  it('passes all sitemap-index checks for valid index', () => {
    const checks = validateXml(validSitemapIndex)
    const idxChecks = checks.filter(c => c.check.startsWith('sitemap-index-'))
    expect(idxChecks.every(c => c.passed)).toBe(true)
  })

  it('detects type as sitemap-index', () => {
    const checks = validateXml(validSitemapIndex)
    const root = checks.find(c => c.check === 'xml-root')
    expect(root.detail).toMatch(/\(sitemap-index\)/)
  })

  it('handles empty sitemap-index-sitemaps (0 sitemaps)', () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</sitemapindex>`
    const checks = validateXml(xml)
    const sitemaps = checks.find(c => c.check === 'sitemap-index-sitemaps')
    expect(sitemaps.passed).toBe(true)
  })

  it('fails sitemap-index-loc-empty when a <loc> is empty', () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc></loc></sitemap>
</sitemapindex>`
    const checks = validateXml(xml)
    const empty = checks.find(c => c.check === 'sitemap-index-loc-empty')
    expect(empty.passed).toBe(false)
  })

  it('fails sitemap-index-loc-url when a <loc> has no protocol', () => {
    const xml = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>example.com/sitemap.xml</loc></sitemap>
</sitemapindex>`
    const checks = validateXml(xml)
    const urlCheck = checks.find(c => c.check === 'sitemap-index-loc-url')
    expect(urlCheck.passed).toBe(false)
  })
})

// --------------- Plain XML ---------------

describe('Plain XML', () => {
  it('detects type as plain XML for unknown root tags', () => {
    const xml = `<?xml version="1.0"?>
<customRoot>
  <data>hello</data>
</customRoot>`
    const checks = validateXml(xml)
    const root = checks.find(c => c.check === 'xml-root')
    expect(root.detail).toMatch(/\(xml\)/)
  })

  it('does not run type-specific validators for plain XML', () => {
    const xml = `<?xml version="1.0"?>
<customRoot>
  <data>hello</data>
</customRoot>`
    const checks = validateXml(xml)
    const typeSpecific = checks.filter(c =>
      c.check.startsWith('rss-') || c.check.startsWith('atom-')
      || c.check.startsWith('sitemap-')
    )
    expect(typeSpecific).toHaveLength(0)
  })
})

// --------------- options.type override ---------------

describe('options.type', () => {
  it('forces XML validation when type is set even with non-XML body', () => {
    // body is not XML but we force type=xml — should fail well-formed
    const checks = validateXml('not xml at all', { type: 'xml' })
    const wf = checks.find(c => c.check === 'xml-well-formed')
    expect(wf.passed).toBe(false)
  })
})
