import { describe, it, expect } from 'vitest'
import { extractChildUrls } from '../src/parsers/sitemap.js'

describe('extractChildUrls', () => {
  it('extracts <loc> from sitemapindex', () => {
    const body = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
      <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
    </sitemapindex>`
    expect(extractChildUrls(body)).toEqual([
      'https://example.com/sitemap-1.xml',
      'https://example.com/sitemap-2.xml',
    ])
  })

  it('returns empty array for urlset body', () => {
    const body = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/page</loc></url>
    </urlset>`
    expect(extractChildUrls(body)).toEqual([])
  })

  it('returns empty array for non-XML body', () => {
    expect(extractChildUrls('just some text')).toEqual([])
  })

  it('returns empty array for empty body', () => {
    expect(extractChildUrls('')).toEqual([])
  })

  it('returns empty array for null body', () => {
    expect(extractChildUrls(null)).toEqual([])
  })

  it('returns empty array for undefined body', () => {
    expect(extractChildUrls(undefined)).toEqual([])
  })

  it('trims whitespace from extracted URLs', () => {
    const body = `<sitemapindex>
      <sitemap><loc>  https://example.com/sitemap.xml  </loc></sitemap>
    </sitemapindex>`
    expect(extractChildUrls(body)).toEqual(['https://example.com/sitemap.xml'])
  })
})
